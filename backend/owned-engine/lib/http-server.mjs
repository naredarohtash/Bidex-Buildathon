/**
 * HTTP listener — binds the transport-agnostic pipeline to Node's built-in
 * `http` module, so the owned engine can serve real requests. No dependencies.
 *
 * (Production may later swap this adapter for uWebSockets.js for throughput; the
 * pipeline itself does not change — only this thin transport layer does.)
 */

import { createServer as createHttpServer } from "node:http";
import { readRawBody } from "./http-parse.mjs";
import { buildStaticRoots, tryServeStatic } from "./static-files.mjs";

/** Best-effort caller IP, honouring a reverse proxy's X-Forwarded-For. */
function callerIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

/**
 * @param {(incoming) => Promise<{statusCode, body, setCookies?}>} handle  the pipeline
 * @returns {import("node:http").Server}
 */
export function createServer(handle) {
  // Resolved once: the frontend rewrites /uploads and /img/logo here.
  const staticRoots = buildStaticRoots();

  return createHttpServer(async (req, res) => {
    // CORS: allow the local frontend (a different port) to call the engine
    // directly (some frontend code uses absolute URLs / raw fetch).
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        req.headers["access-control-request-headers"] || "content-type,authorization,x-csrf-token,x-requested-with"
      );
    }
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // Uploaded files first — they are not API routes and must not be parsed
    // as one. Returns false for anything that is not a static path.
    try {
      if (await tryServeStatic(req, res, staticRoots)) return;
    } catch { /* fall through to the pipeline */ }

    try {
      const rawBody =
        req.method === "GET" || req.method === "HEAD" ? "" : await readRawBody(req);

      const result = await handle({
        method: req.method,
        url: req.url,
        headers: req.headers,
        rawBody,
        remoteAddress: callerIp(req),
      });

      const headers = { "content-type": "application/json" };
      if (result.setCookies?.length) headers["set-cookie"] = result.setCookies;

      res.writeHead(result.statusCode, headers);
      res.end(JSON.stringify(result.body));
    } catch (err) {
      /* The pipeline handles route-level errors; this only catches transport
         failures so a bad request never crashes the server. An oversized body
         carries its own status: answering 413 with the actual limit tells the
         caller what happened, where a blanket 400 read as "malformed" and sent
         everyone looking in the wrong place. */
      const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 400;
      res.writeHead(statusCode, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "fail", error: err?.message || "Bad request" }));
    }
  });
}
