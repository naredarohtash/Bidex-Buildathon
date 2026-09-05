/**
 * Auth — JWT (HS256) sign + verify, implemented on Node's built-in crypto so it
 * is fully owned and dependency-free. This mirrors the scheme the current system
 * uses (jose, HS256, secret APP_ACCESS_TOKEN_SECRET). Production can swap in jose
 * for full RFC edge-case coverage; the token format here is identical.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const base64urlEncode = (input) =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

export const base64urlDecode = (input) =>
  Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();

function sign(data, secret) {
  return createHmac("sha256", secret).update(data).digest("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Sign a JWT. Used by tests and, later, the login route. */
export function signToken(payload, secret, { expiresInSec } = {}) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload };
  if (expiresInSec != null) body.exp = Math.floor(Date.now() / 1000) + expiresInSec;
  const encHeader = base64urlEncode(JSON.stringify(header));
  const encBody = base64urlEncode(JSON.stringify(body));
  const signature = sign(`${encHeader}.${encBody}`, secret);
  return `${encHeader}.${encBody}.${signature}`;
}

/**
 * Verify a JWT. Returns { valid, payload?, reason? }.
 * Checks: three parts, HS256 alg, signature (timing-safe), and exp if present.
 */
export function verifyToken(token, secret) {
  if (typeof token !== "string") return { valid: false, reason: "missing" };
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };

  const [encHeader, encBody, signature] = parts;

  let header;
  try {
    header = JSON.parse(base64urlDecode(encHeader));
  } catch {
    return { valid: false, reason: "malformed_header" };
  }
  if (header.alg !== "HS256") return { valid: false, reason: "wrong_alg" };

  const expected = sign(`${encHeader}.${encBody}`, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(encBody));
  } catch {
    return { valid: false, reason: "malformed_payload" };
  }
  if (payload.exp != null && Math.floor(Date.now() / 1000) >= payload.exp) {
    return { valid: false, reason: "expired", payload };
  }
  return { valid: true, payload };
}
