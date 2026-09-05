#!/usr/bin/env node
/**
 * Owned Engine — Step 1: Route table generator.
 *
 * Walks the route tree and turns the file-based routing convention into an
 * explicit table of { method, path, requiresAuth, permission, source }.
 * This is the data the real (scrambled) engine builds internally and dispatches
 * on; producing it ourselves, in readable form, is the first brick of an owned
 * replacement — and doubles as a full inventory of the API surface.
 *
 * Read-only. Touches nothing the running server uses. Needs only Node built-ins.
 *
 * Usage:  node backend/owned-engine/build-route-manifest.mjs [apiRoot]
 * Default apiRoot: backend/dist/src/api  (the compiled tree the server runs)
 */

import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_API_ROOT = join(HERE, "..", "dist", "src", "api");
const API_ROOT = process.argv[2] ? join(process.cwd(), process.argv[2]) : DEFAULT_API_ROOT;
const OUT_FILE = join(HERE, "route-manifest.json");

// Filename suffix -> HTTP method. These are the only suffixes that mark a route
// file; everything else (utils.js, helper index.js, *.d.ts) is not a route.
const METHOD_BY_SUFFIX = { get: "GET", post: "POST", put: "PUT", del: "DELETE", ws: "WS" };

/** Recursively collect every file under a directory. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** `(group)` folders are organisational and never appear in the URL. */
const isGroupSegment = (seg) => /^\(.*\)$/.test(seg);

/** `[param]` folder -> `:param` path segment. */
const toPathSegment = (seg) => (/^\[.+\]$/.test(seg) ? ":" + seg.slice(1, -1) : seg);

/**
 * Turn a route file's path (relative to api root) into { method, path }, or
 * null if the file is not a route (no recognised method suffix).
 */
function routeFromFile(relPath) {
  const parts = relPath.split(/[\\/]/);
  const filename = parts.pop();

  const m = filename.match(/\.(get|post|put|del|ws)\.js$/);
  if (!m) return null; // not a route file
  const method = METHOD_BY_SUFFIX[m[1]];

  // Base name of the file, minus the `.<method>.js` suffix.
  const base = filename.slice(0, m.index);

  const segments = parts
    .filter((s) => !isGroupSegment(s))
    .map(toPathSegment);

  // `index` files add no segment; a named file adds its name as the last segment.
  if (base !== "index") segments.push(toPathSegment(base));

  const path = "/api/" + segments.join("/");
  return { method, path: path.replace(/\/+$/, "") || "/api" };
}

/**
 * Pull the enforcement fields out of a compiled route's `metadata`.
 * The compiled form is minified (`requiresAuth:!0`, `permission:"access.admin"`).
 * Anything we can't read as a literal is reported as null (unknown), never guessed.
 */
function readEnforcement(source) {
  const authMatch = source.match(/requiresAuth\s*:\s*(!0|!1|true|false)/);
  let requiresAuth = null;
  if (authMatch) requiresAuth = authMatch[1] === "!0" || authMatch[1] === "true";

  const permMatch = source.match(/permission\s*:\s*["']([^"']+)["']/);
  const permission = permMatch ? permMatch[1] : null;

  return { requiresAuth, permission };
}

// --- build ------------------------------------------------------------------

let files;
try {
  files = walk(API_ROOT);
} catch (err) {
  console.error(`Could not read API root: ${API_ROOT}\n${err.message}`);
  process.exit(1);
}

const routes = [];
for (const file of files) {
  const rel = relative(API_ROOT, file);
  const route = routeFromFile(rel);
  if (!route) continue;
  const { requiresAuth, permission } = readEnforcement(readFileSync(file, "utf8"));
  routes.push({
    method: route.method,
    path: route.path,
    requiresAuth,
    permission,
    source: relative(join(HERE, "..", ".."), file),
  });
}

routes.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));

// --- summary ----------------------------------------------------------------

const byMethod = {};
for (const r of routes) byMethod[r.method] = (byMethod[r.method] || 0) + 1;

const authTrue = routes.filter((r) => r.requiresAuth === true).length;
const authFalse = routes.filter((r) => r.requiresAuth === false).length;
const authUnknown = routes.filter((r) => r.requiresAuth === null).length;
const withPermission = routes.filter((r) => r.permission).length;
const distinctPermissions = [...new Set(routes.map((r) => r.permission).filter(Boolean))].sort();

const manifest = {
  generatedAt: new Date().toISOString(),
  apiRoot: relative(join(HERE, "..", ".."), API_ROOT),
  totals: {
    routes: routes.length,
    byMethod,
    requiresAuth: { true: authTrue, false: authFalse, unknown: authUnknown },
    withPermission,
    distinctPermissions: distinctPermissions.length,
  },
  distinctPermissions,
  routes,
};

writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2) + "\n");

// --- report -----------------------------------------------------------------

console.log(`\nOwned Engine — route table`);
console.log(`  api root:            ${manifest.apiRoot}`);
console.log(`  routes discovered:   ${routes.length}`);
console.log(`  by method:           ${Object.entries(byMethod).map(([m, n]) => `${m} ${n}`).join("  ")}`);
console.log(`  requires login:      ${authTrue} yes / ${authFalse} no / ${authUnknown} unknown`);
console.log(`  needs a permission:  ${withPermission}`);
console.log(`  distinct permissions:${" "}${distinctPermissions.length}`);
console.log(`  written to:          ${relative(join(HERE, "..", ".."), OUT_FILE)}\n`);
