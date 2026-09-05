/**
 * The request pipeline — the owned replacement for the scrambled gate
 * (handler/Middleware.js). Runs the stages in the same order the Phase 1 map
 * documented, and hands the route handler the documented `Handler` object.
 *
 * Order: match route -> rate limit -> auth -> permission -> validate -> handler.
 *
 * Every dependency (user lookup, permission lookup, session refresh) is injected,
 * so the pipeline is pure logic and fully testable without a database.
 */

import { matchRoute } from "./route-table.mjs";
import { parseCookies, parseQuery, parseBody } from "./http-parse.mjs";
import { verifyToken } from "./auth.mjs";
import { hasPermission } from "./permissions.mjs";
import { validateBody } from "./validate.mjs";
import { okBody, errBody, HttpError, buildSetCookie } from "./respond.mjs";

/**
 * @param {object} deps
 * @param {Array}  deps.routeTable
 * @param {string} deps.accessSecret         APP_ACCESS_TOKEN_SECRET
 * @param {Function} deps.loadUser           async (userId) => user | null
 * @param {Function} deps.loadPermissions    async (user) => string[]
 * @param {Function} [deps.refreshSession]   async (sessionId) => { accessToken, user } | null
 * @param {object} [deps.rateLimiter]        { check(key) }
 * @param {Function} [deps.loadRouteModule]  async (route) => { default, metadata }
 */
export function createPipeline(deps) {
  const {
    routeTable,
    accessSecret,
    loadUser,
    loadPermissions,
    refreshSession,
    /** Called after a successful sign-in. Best-effort; never awaited. */
    onSignIn,
    rateLimiter,
    loadRouteModule,
  } = deps;

  /**
   * Handle one request.
   * @param {{ method, url, headers, rawBody, remoteAddress }} incoming
   * @returns {Promise<{ statusCode, body, setCookies?: string[] }>}
   */
  return async function handle(incoming) {
    const { method, url, headers = {}, rawBody = "", remoteAddress = "" } = incoming;
    const qIndex = url.indexOf("?");
    const pathname = qIndex === -1 ? url : url.slice(0, qIndex);
    const search = qIndex === -1 ? "" : url.slice(qIndex);
    const setCookies = [];

    // 1) Route match
    const matched = matchRoute(routeTable, method, pathname);
    if (!matched) return { statusCode: 404, body: errBody(404, "Not found") };
    const { route, params } = matched;

    // 2) Rate limit (keyed by caller IP, as the current engine does)
    if (rateLimiter) {
      const rl = rateLimiter.check(remoteAddress || "unknown");
      if (!rl.allowed) return { statusCode: 429, body: errBody(429, "Too many requests") };
    }

    // 3) Auth
    const cookies = parseCookies(headers.cookie || "");
    let user = null;
    let sessionId = cookies.sessionId || null;

    const bearer = (headers.authorization || "").startsWith("Bearer ")
      ? headers.authorization.slice(7)
      : null;
    const accessToken = cookies.accessToken || bearer;

    /* Recover the login from the server-side session. */
    const recoverFromSession = async () => {
      if (!sessionId || !refreshSession) return null;
      const refreshed = await refreshSession(sessionId);
      if (!refreshed) return null;
      if (refreshed.setCookie) setCookies.push(refreshed.setCookie);
      if (Array.isArray(refreshed.setCookies)) setCookies.push(...refreshed.setCookies);
      return refreshed.user;
    };

    if (accessToken) {
      const result = verifyToken(accessToken, accessSecret);
      if (result.valid) {
        // The app signs `sub` as the user id OR as { id, role }; accept both.
        const sub = result.payload.sub;
        const userId = sub && typeof sub === "object" ? sub.id : sub;
        user = await loadUser(userId);
      }

      /* Any access token we could not turn into a user falls back to the
         session — not just an expired one.

         Only `reason === "expired"` recovered before, so a token that was
         invalid in any OTHER way (bad signature, malformed, truncated, or a
         valid one naming a user that no longer loads) went straight to the 401
         below while a good session sat unread in Redis. A trader who left the
         terminal open came back, placed a trade and got "Unauthorized — your
         position was not opened", with no way out but a manual re-login.
         Duplicate `accessToken` cookies reach here the same way: the browser
         sends both, one of them is stale, and whichever the parser keeps
         decided whether trading worked.

         The token is only a cache of the login; the session is the login. A
         bad cache entry must never outrank it. This grants nothing extra — the
         recovered user comes from the session, never from the rejected token,
         so a forged token still gets exactly what an absent one gets. */
      if (!user) user = await recoverFromSession();
    } else {
      /* No access token at all — and this is the common case, not an edge one.
         A browser deletes a cookie the instant its Max-Age passes, so from the
         user's side "my token expired" arrives as "no token sent". Only the
         expired branch above was handled, so the request fell straight through
         to the 401 below while a valid 14-day session sat unread in Redis, and
         the trader was signed out mid-session. */
      user = await recoverFromSession();
    }

    if (route.requiresAuth && !user) {
      return { statusCode: 401, body: errBody(401, "Unauthorized") };
    }

    // 4) Permission
    if (route.permission) {
      const granted = user ? await loadPermissions(user) : [];
      if (!hasPermission(granted, route.permission)) {
        return { statusCode: 403, body: errBody(403, "Forbidden") };
      }
    }

    // 5) Parse + validate input
    const query = parseQuery(search);
    const body = parseBody(rawBody, headers["content-type"] || "");
    if (body && body.__parseError) {
      return { statusCode: 400, body: errBody(400, body.__parseError) };
    }

    let mod = null;
    if (loadRouteModule) {
      mod = await loadRouteModule(route);
      const schema =
        mod?.metadata?.requestBody?.content?.["application/json"]?.schema || null;
      if (schema) {
        const { valid, errors } = validateBody(schema, body);
        if (!valid) {
          return {
            statusCode: 400,
            body: errBody(400, "Invalid request body: " + errors.map((e) => e.message).join("; ")),
          };
        }
      }
    }

    // 6) Run the route handler with the documented Handler object
    const handlerFn = mod?.default;
    if (typeof handlerFn !== "function") {
      return { statusCode: 501, body: errBody(501, "Handler not implemented") };
    }

    const ctx = {
      step: () => {}, success: () => {}, fail: () => {}, warn: () => {}, debug: () => {},
    };

    try {
      const data = await handlerFn({
        params, query, body, user: user || undefined,
        headers, cookies, sessionId: sessionId || undefined,
        remoteAddress, ctx,
        /* Detaches the caller from this request. Only logout uses it, and the
           owned pipeline never supplied it — so `e.setUser(null)` threw
           TypeError, logout answered 500, and it never reached the `return`
           carrying the instruction to clear the cookies. The session in Redis
           was already gone by then, so the failure was invisible from the
           outside: the page navigated home and looked signed out. */
        setUser: (next) => { user = next || null; },
      });
      // Framework convention: a handler that returns { cookies: {...} } (login,
      // refresh, logout) has those set as real browser cookies.
      if (data && typeof data === "object" && data.cookies && typeof data.cookies === "object") {
        const secure = process.env.NODE_ENV === "production";
        const c = data.cookies;
        /* The access cookie is a container; the token inside is what expires
           (JWT_EXPIRY, 30m by default). Giving the cookie a SHORTER life than
           the token — it was 900s, half the token's life — meant the browser
           threw it away while it was still valid, and the request then looked
           like an anonymous one. Let it live as long as the session it belongs
           to, so an expired token is presented and can be rotated. */
        /* An empty string means CLEAR this cookie, not "skip it".
           Logout returns { accessToken: "", refreshToken: "", sessionId: "",
           csrfToken: "" } — the framework's way of saying delete all four. Every
           one of them was tested for truthiness, so every one was skipped and
           logout cleared nothing at all: the browser kept a sessionId with two
           weeks left on it, and the very next request authenticated with it and
           put the user straight back into the account they had just left. The
           page went to the home screen, which made it look like it had worked.

           Three states now, not two: absent means the handler said nothing about
           this cookie and it is left alone; empty means expire it; anything else
           is a value to set. */
        const writeCookie = (name, value, httpOnly) => {
          if (value === undefined || value === null) return;
          // A clear must beat anything queued earlier in this same response —
          // the auth step above may have just rotated these cookies while
          // recovering the session that is now being destroyed.
          const prefix = `${name}=`;
          for (let i = setCookies.length - 1; i >= 0; i--) {
            if (setCookies[i].startsWith(prefix)) setCookies.splice(i, 1);
          }
          setCookies.push(
            buildSetCookie(name, value, {
              httpOnly,
              secure,
              maxAgeSec: value === "" ? 0 : 1209600,
            })
          );
        };
        writeCookie("accessToken", c.accessToken, true);
        writeCookie("sessionId", c.sessionId, true);
        writeCookie("refreshToken", c.refreshToken, true);
        writeCookie("csrfToken", c.csrfToken, false);
      }
      /* Tell someone their account was just signed in to.
         Done here rather than inside the login handler, which is part of the
         vendor's compiled core — hand-patching obfuscated output is how a
         rebuild silently reverts a security feature. Everything the alert needs
         is already in scope: the route, the outcome, the caller's address and
         their browser.

         Deliberately not awaited. The sign-in must not wait on an SMTP server,
         and it must not fail because one is down. */
      if (onSignIn && route.path === "/api/auth/login" && data && !data.twoFactorRequired) {
        const who = data.user || user;
        if (who?.id) {
          /* try/catch AND .catch: `void` only swallows a rejected promise, so a
             synchronous throw inside the alert propagated and turned a
             successful sign-in into a 500. Nobody should be locked out because
             an SMTP server is down. */
          try {
            const sent = onSignIn(who, {
              ip: remoteAddress,
              userAgent: headers["user-agent"] || headers["User-Agent"],
            });
            if (sent && typeof sent.catch === "function") {
              sent.catch((e) => console.error(`[SIGNIN-ALERT] ${e?.message || e}`));
            }
          } catch (e) {
            console.error(`[SIGNIN-ALERT] ${e?.message || e}`);
          }
        }
      }

      return { statusCode: 200, body: okBody(data), setCookies };
    } catch (err) {
      // Honour a statusCode set by the handler's error, whichever error class it
      // uses — our HttpError and the app's CustomError both expose `.statusCode`.
      const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
      return {
        statusCode,
        body: errBody(statusCode, err?.message || "Server error"),
      };
    }
  };
}
