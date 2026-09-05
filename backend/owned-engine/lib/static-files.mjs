/**
 * Serving uploaded files.
 *
 * The frontend rewrites `/uploads/*` and `/img/logo/*` to the backend — the
 * comment beside those rules says "dev only" but they are not conditional, so
 * they apply in production too. The vendor server answered them; the owned
 * engine had no static handling at all, so every uploaded avatar 404'd. The
 * file was written and the URL was stored against the user; nothing could
 * fetch it, which is why a new profile photo never appeared even after a
 * reload.
 *
 * Files are written by the upload handler to `frontend/public/uploads`
 * (BASE_UPLOAD_DIR in api/upload/index.post.js), so that is what is served.
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join, normalize, extname, resolve } from "node:path";

const TYPES = {
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".avif": "image/avif", ".pdf": "application/pdf",
};

/** Route prefix -> directory on disk, resolved once at startup. */
export function buildStaticRoots(cwd = process.cwd()) {
  const isProduction = process.env.NODE_ENV === "production";
  // Mirrors BASE_UPLOAD_DIR: production runs from the repo root, dev from backend/.
  const publicDir = isProduction
    ? join(cwd, "frontend", "public")
    : join(cwd, "..", "frontend", "public");

  return [
    { prefix: "/uploads/", dir: resolve(join(publicDir, "uploads")) },
    { prefix: "/img/logo/", dir: resolve(join(publicDir, "img", "logo")) },
  ];
}

/**
 * Answer a static request, or return false so the caller falls through to the
 * API pipeline.
 */
export async function tryServeStatic(req, res, roots) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const pathname = decodeURIComponent((req.url || "").split("?")[0]);
  const root = roots.find((r) => pathname.startsWith(r.prefix));
  if (!root) return false;

  const relative = normalize(pathname.slice(root.prefix.length));

  /* Anything that climbs out of the directory is refused rather than clamped.
     `normalize` collapses `..`, so a request for ../../.env resolves outside
     `root.dir` and is caught by the prefix test below. */
  const filePath = resolve(join(root.dir, relative));
  if (!filePath.startsWith(root.dir + "/") && filePath !== root.dir) {
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "fail", error: "Forbidden" }));
    return true;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;

    res.writeHead(200, {
      "content-type": TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "content-length": info.size,
      // Uploaded files are content-addressed by timestamp, so they never change
      // under the same name.
      "cache-control": "public, max-age=31536000, immutable",
    });

    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    // Missing file: answer 404 here rather than letting it reach the router,
    // which would report "route not found" for what is plainly a missing image.
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "fail", error: "Not found" }));
    return true;
  }
}
