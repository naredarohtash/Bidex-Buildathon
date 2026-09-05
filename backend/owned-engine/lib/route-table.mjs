/**
 * Route table — discovery + matching.
 *
 * Turns the file-based routing convention into an explicit, matchable table.
 * Pure logic, no DB. The discovery half mirrors build-route-manifest.mjs; this
 * module additionally compiles each path into a matcher so the pipeline can
 * resolve an incoming request to a route and extract its :params.
 */

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const METHOD_BY_SUFFIX = { get: "GET", post: "POST", put: "PUT", del: "DELETE", ws: "WS" };

const isGroupSegment = (seg) => /^\(.*\)$/.test(seg);
const toPathSegment = (seg) => (/^\[.+\]$/.test(seg) ? ":" + seg.slice(1, -1) : seg);

/** Recursively list every file under a directory. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** File path (relative to api root) -> { method, path } or null if not a route. */
export function deriveRoute(relPath) {
  const parts = relPath.split(/[\\/]/);
  const filename = parts.pop();
  const m = filename.match(/\.(get|post|put|del|ws)\.js$/);
  if (!m) return null;

  const base = filename.slice(0, m.index);
  const segments = parts.filter((s) => !isGroupSegment(s)).map(toPathSegment);
  if (base !== "index") segments.push(toPathSegment(base));

  const path = ("/api/" + segments.join("/")).replace(/\/+$/, "") || "/api";
  return { method: METHOD_BY_SUFFIX[m[1]], path };
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compile "/api/x/:id/y" into a regex + ordered param names. */
export function compileMatcher(path) {
  const paramNames = [];
  const pattern = path
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) {
        paramNames.push(seg.slice(1));
        return "([^/]+)";
      }
      return escapeRegex(seg);
    })
    .join("/");
  return { regex: new RegExp("^" + pattern + "$"), paramNames };
}

/** Read the enforcement fields out of a compiled route's minified metadata. */
export function readEnforcement(source) {
  const authMatch = source.match(/requiresAuth\s*:\s*(!0|!1|true|false)/);
  const requiresAuth = authMatch ? authMatch[1] === "!0" || authMatch[1] === "true" : null;
  const permMatch = source.match(/permission\s*:\s*["']([^"']+)["']/);
  return { requiresAuth, permission: permMatch ? permMatch[1] : null };
}

/** Build the full route table from an api root directory. */
export function buildRouteTable(apiRoot, repoRoot = apiRoot) {
  const table = [];
  for (const file of walk(apiRoot)) {
    const rel = relative(apiRoot, file);
    const route = deriveRoute(rel);
    if (!route) continue;
    const { requiresAuth, permission } = readEnforcement(readFileSync(file, "utf8"));
    table.push({
      method: route.method,
      path: route.path,
      matcher: compileMatcher(route.path),
      requiresAuth,
      permission,
      source: relative(repoRoot, file),
    });
  }
  return table;
}

/**
 * Find the route serving `method pathname`, returning the route and its
 * extracted params, or null. Static paths win over parameterised ones.
 */
export function matchRoute(table, method, pathname) {
  const candidates = table.filter((r) => r.method === method);
  candidates.sort((a, b) => a.matcher.paramNames.length - b.matcher.paramNames.length);
  for (const route of candidates) {
    const m = route.matcher.regex.exec(pathname);
    if (!m) continue;
    const params = {};
    route.matcher.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
    return { route, params };
  }
  return null;
}
