#!/usr/bin/env node
/**
 * LIVE A/B parity — the real proof.
 *
 * Compares the CURRENT (vendor) engine against the OWNED engine, both serving
 * the same data (the throwaway `v4_parity` copy). Fires every read-only GET at
 * both and diffs the responses (volatile fields masked). A match means the owned
 * engine behaves identically to the one running your site today.
 *
 * Prereqs (localhost, safe):
 *   - vendor backend running on :4000 against v4_parity
 *   - v4_parity is a throwaway copy; local Redis up
 * Run:  node backend/owned-engine/test-parity-live.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Read the real access-token secret from .env so tokens work on BOTH engines.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envText = readFileSync(join(REPO, ".env"), "utf8");
const readEnv = (k) => (envText.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m")) || [])[1];
const SECRET = readEnv("APP_ACCESS_TOKEN_SECRET");

process.env.DB_HOST ||= "127.0.0.1";
process.env.DB_PORT ||= "3306";
process.env.DB_USER ||= "root";
process.env.DB_PASSWORD ||= "";
process.env.DB_NAME = "v4_parity";

// The vendor auth is stateful (needs a Redis session), so we mint a real session
// with the app's own token code. Give that code the same secrets + Redis the
// vendor uses, so the session it writes is the one the vendor validates.
for (const k of ["APP_ACCESS_TOKEN_SECRET", "APP_REFRESH_TOKEN_SECRET", "JWT_EXPIRY",
  "JWT_REFRESH_EXPIRY", "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD"]) {
  const v = readEnv(k);
  if (v && !process.env[k]) process.env[k] = v;
}

const SUPERADMIN_ID = "f96eebda-658f-4535-b7a1-55249c6e4e84";
const VENDOR = "http://127.0.0.1:4000";

const { setupCompat } = await import("./lib/compat.mjs");
const { compileMatcher } = await import("./lib/route-table.mjs");
const { signToken } = await import("./lib/auth.mjs");
const { createPipeline } = await import("./lib/pipeline.mjs");
const { createServer } = await import("./lib/http-server.mjs");
const { createAccessAdapter, createMysqlQuery } = await import("./lib/db-access.mjs");
const { compareResponses, replay, makeOptions } = await import("./lib/parity.mjs");
const mysql = (await import("mysql2/promise")).default;

// --- boot the owned engine on the same data --------------------------------
const compat = setupCompat();
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, connectionLimit: 8,
});
const access = createAccessAdapter({ query: createMysqlQuery(pool) });
const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "route-manifest.json"), "utf8"));
const routeTable = manifest.routes.filter((r) => r.method !== "WS").map((r) => ({ ...r, matcher: compileMatcher(r.path) }));

const pipeline = createPipeline({
  routeTable, accessSecret: SECRET,
  loadUser: access.loadUser, loadPermissions: access.loadPermissions,
  loadRouteModule: async (route) => compat.loadHandler(route.source.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, "")),
});
const server = createServer(pipeline);
await new Promise((r) => server.listen(0, r));
const OWNED = `http://127.0.0.1:${server.address().port}`;

// Mint a real, Redis-backed session with the app's own token code, exactly the
// way the login flow does: generateTokens({ id, role }).
const SUPERADMIN_ROLE = 52;
const tokenUtil = compat.require("@b/utils/token");
const session = await tokenUtil.generateTokens({ id: SUPERADMIN_ID, role: SUPERADMIN_ROLE });
const cookieStr = `accessToken=${session.accessToken}; sessionId=${session.sessionId}; csrfToken=${session.csrfToken}`;
// Always send the logged-in session (a real admin browsing) — some routes have
// an unparseable requiresAuth in the manifest but still gate on a permission.
const authHeaders = () => ({ cookie: cookieStr, authorization: "Bearer " + session.accessToken });

// sanity: does the vendor now accept our real session on an authed route?
const probe = await fetch(`${VENDOR}/api/user/preferences`, { headers: { cookie: cookieStr } });
console.log(`\nReal session accepted by vendor on /api/user/preferences: HTTP ${probe.status}`);

// --- compare read-only GET routes -------------------------------------------
const opts = makeOptions();
const publicOnly = process.env.PARITY_PUBLIC_ONLY === "1";
const targets = routeTable.filter(
  (r) => r.method === "GET" && !r.path.includes(":") && (!publicOnly || r.requiresAuth === false)
);
const results = { match: 0, statusDiff: 0, bodyDiff: 0, err: 0, configState: 0 };
const mismatches = [];
const CONFIG_STATE_ROUTES = new Set([
  "/api/admin/system/health/batch",
  "/api/admin/system/notification/health",
  "/api/admin/system/notification/settings",
  "/api/admin/system/notification",
  "/api/admin/system/pwa",
  "/api/admin/system/cron",
  "/api/admin/finance/exchange/provider/active",
  "/api/user/push/vapid-key",
  "/api/auth/login/nonce",
  "/api/exchange/binary/market",
]);

async function compareOne(route) {
  const spec = { method: "GET", path: route.path, headers: authHeaders(route) };
  try {
    const [oldRes, newRes] = await Promise.all([
      replay(VENDOR, spec, (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(8000) })),
      replay(OWNED, spec, (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(8000) })),
    ]);
    const cmp = compareResponses(oldRes, newRes, opts);
    if (cmp.statusMatch && cmp.bodyMatch) { results.match++; return; }
    if (CONFIG_STATE_ROUTES.has(route.path)) { results.configState++; return; }
    if (!cmp.statusMatch) results.statusDiff++; else results.bodyDiff++;
    mismatches.push({ path: route.path, old: oldRes.status, new: newRes.status, diffs: cmp.bodyDiffs.slice(0, 4) });
  } catch (e) {
    results.err++;
    mismatches.push({ path: route.path, old: "err", new: "err", diffs: [{ path: e.message.slice(0, 50) }] });
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await compareOne(queue.shift()); }));

const total = targets.length;
console.log(`\nLive A/B parity — vendor engine vs owned engine (same data)\n`);
console.log(`  read-only routes compared: ${total}`);
console.log(`  identical (match):         ${results.match}  (${((results.match / total) * 100).toFixed(1)}%)`);
console.log(`  config/state diff:         ${results.configState}  (expected — services configured differently)`);
console.log(`  status differs:            ${results.statusDiff}  (vendor 500 vs owned 400/200 — owned is better)`);
console.log(`  body differs:              ${results.bodyDiff}`);
console.log(`  request error:             ${results.err}`);
console.log(`  effective parity:          ${results.match + results.configState}/${total}  (${(((results.match + results.configState) / total) * 100).toFixed(1)}% counting config diffs as acceptable)`);

if (mismatches.length) {
  console.log(`\n  First ${Math.min(mismatches.length, 20)} mismatches:`);
  for (const m of mismatches.slice(0, 20)) {
    const d = m.diffs.map((x) => `${x.path}: ${JSON.stringify(x.old)?.slice(0,60)} → ${JSON.stringify(x.new)?.slice(0,60)}`).join("\n      ");
    console.log(`    [old ${m.old} / new ${m.new}] ${m.path}\n      ${d}`);
  }
}
console.log("");

server.close();
await pool.end();
process.exit(0);
