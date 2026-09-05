/**
 * Sessions — the owned version of the Redis-backed session refresh.
 *
 * Mirrors the current scheme (dist/src/utils/token.js):
 *   - sessions live in Redis under the key `sessionId:<id>`
 *   - the value is JSON holding the user (as `userId` or `user`) and tokens
 *   - a "refresh" mints a fresh short-lived access token for that session's user
 *
 * The Redis client is injected, so this is testable against a fake in-memory
 * store with the same get/set/del interface — no real Redis needed to prove it.
 */

import { randomBytes } from "node:crypto";
import { signToken } from "./auth.mjs";
import { buildSetCookie } from "./respond.mjs";

const sessionKey = (sessionId) => `sessionId:${sessionId}`;

/**
 * @param {object} deps
 * @param {{ get, set, del }} deps.redis      injected client (ioredis-shaped)
 * @param {string} deps.accessSecret          APP_ACCESS_TOKEN_SECRET
 * @param {Function} deps.loadUser            async (userId) => user | null
 * @param {number} [deps.accessTtlSec=900]    access-token lifetime (15m default)
 * @param {number} [deps.idleTtlSec]          sliding idle window; omit to leave
 *                                            the session's own expiry untouched
 * @param {boolean} [deps.secure=false]       Secure flag on cookies (prod: true)
 */
export function createSessionStore({
  redis, accessSecret, loadUser, accessTtlSec = 900, idleTtlSec = 0, secure = false,
}) {
  async function getSession(sessionId) {
    if (!sessionId) return null;
    const raw = await redis.get(sessionKey(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Given a sessionId, if the session exists and its user is still valid, mint a
   * new access token (and rotate the CSRF token) and return the fresh user plus
   * the cookies to set. Returns null if there is no usable session.
   */
  async function refreshSession(sessionId) {
    const session = await getSession(sessionId);
    if (!session) return null;

    /* The stored session is written by the real login handler and its `user` is
       an OBJECT — {"user":{"id":"…","role":52}} — not an id. Reading it as an
       id handed loadUser an object, which never resolves, so a refresh could
       never succeed against a real session. Accept both shapes. */
    const userId = session.userId ?? session.user?.id ?? session.user;
    if (!userId || typeof userId !== "string") return null;

    // Re-load the user so a since-disabled account cannot be refreshed back in.
    const user = await loadUser(userId);
    if (!user) return null;

    const accessToken = signToken({ sub: userId }, accessSecret, { expiresInSec: accessTtlSec });
    const csrfToken = randomBytes(32).toString("hex");

    /* Slide the idle window. Every successful use pushes the session's expiry
       back out to the full window, so "logged out" means "idle for that long"
       rather than "logged in that long ago". Without this the session dies on a
       fixed schedule and an active trader gets thrown out mid-session. */
    if (idleTtlSec > 0) {
      try { await redis.expire(sessionKey(sessionId), idleTtlSec); } catch { /* non-fatal */ }
    }

    /* The sessionId cookie is re-issued on every refresh, not just at login.
       It is the only thing that can recover a session once the access token is
       gone, so it must not be the shorter-lived of the two — if the browser
       drops it there is no way back and the trader is signed out with a
       perfectly good session sitting in Redis. Re-sending it also slides its
       browser-side expiry in step with the one above. */
    const sessionCookieTtl = idleTtlSec > 0 ? idleTtlSec : 1209600; // 14d fallback

    return {
      user,
      setCookies: [
        buildSetCookie("accessToken", accessToken, { httpOnly: true, secure, maxAgeSec: sessionCookieTtl }),
        buildSetCookie("sessionId", sessionId, { httpOnly: true, secure, maxAgeSec: sessionCookieTtl }),
        buildSetCookie("csrfToken", csrfToken, { httpOnly: false, secure, maxAgeSec: sessionCookieTtl }),
      ],
    };
  }

  return { getSession, refreshSession };
}
