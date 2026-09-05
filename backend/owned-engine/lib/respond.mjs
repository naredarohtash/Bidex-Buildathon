/**
 * Response shaping — matches the app's actual wire format so the owned engine is
 * a drop-in replacement (verified against the live vendor engine):
 *   success -> the handler's result, returned directly (no wrapper)
 *   error   -> { message, statusCode }
 */

export const okBody = (data) => data ?? {};
export const errBody = (statusCode, message) => ({ message, statusCode });

/** An error carrying an HTTP status code, as route handlers throw. */
export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
export const createError = ({ statusCode = 500, message = "Server error" }) =>
  new HttpError(statusCode, message);

/**
 * Serialise one Set-Cookie header value.
 * accessToken / sessionId are httpOnly; csrfToken is readable by the client.
 */
export function buildSetCookie(name, value, { httpOnly = true, secure = false, maxAgeSec, sameSite = "Lax", path = "/" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (httpOnly) parts.push("HttpOnly");
  if (secure) parts.push("Secure");
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  return parts.join("; ");
}
