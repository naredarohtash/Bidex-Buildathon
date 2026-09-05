/**
 * Request parsing — cookies, query, body. Pure functions, easy to test.
 */

/** "a=1; b=2" -> { a: "1", b: "2" } */
export function parseCookies(cookieHeader = "") {
  const out = {};
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    /* First occurrence wins.
       A browser can hold two cookies of the same name set for different paths
       or domain scopes — `accessToken` for terminal.web-bytes.in and another
       for .web-bytes.in — and sends both on one header. RFC 6265 orders them
       most-specific first, so the first is the one that belongs to this site;
       overwriting meant the broader, staler one won and the request was
       authenticated with a token the site had already replaced. */
    if (k && !(k in out)) out[k] = decodeURIComponent(v);
  }
  return out;
}

/** "?a=1&b=2" (or "a=1&b=2") -> { a: "1", b: "2" } */
export function parseQuery(search = "") {
  const out = {};
  const usp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of usp) out[k] = v;
  return out;
}

/** Parse a raw request body string by content type. JSON by default. */
export function parseBody(raw, contentType = "") {
  if (!raw) return {};
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return parseQuery(raw);
  }
  // default: JSON
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: "Invalid JSON body" };
  }
}

/** Bytes a request body may occupy. Override with MAX_REQUEST_BODY_BYTES.
 *
 * This was 2 MB, which is below what the app actually sends. Uploads go up as
 * base64 JSON — `utils/upload.ts` posts the WHOLE original file and passes the
 * target width/height alongside for the server to resize afterwards — and
 * base64 adds about a third. A photo straight off a phone is several megabytes
 * before encoding, so every avatar upload was refused at the transport layer,
 * before any handler ran. The vendor's uWebSockets server allowed far more,
 * which is why this only broke once the owned engine was serving.
 */
export const MAX_BODY_BYTES = Number(process.env.MAX_REQUEST_BODY_BYTES || 32_000_000);

/** Read a Node http.IncomingMessage body to a string (bounded). */
export function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        // Tagged so the transport can answer 413 rather than a blanket 400.
        const err = new Error(
          `Request body exceeds the ${Math.round(maxBytes / 1_000_000)}MB limit`
        );
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
