#!/usr/bin/env node
/**
 * Money-route parity — SAFE first pass.
 *
 * Compares the vendor engine and the owned engine on mutating routes
 * (POST/PUT/DELETE) by firing them with an EMPTY body. Both engines should
 * REJECT such requests (auth / permission / validation), and a rejected request
 * changes no data — so this proves the gate + validation match on money routes
 * without moving anything.
 *
 * Any route that returns 2xx (i.e. actually mutated) is flagged separately as
 * "needs fixture-based comparison", not trusted here. Runs against the throwaway
 * v4_parity copy, so even an accidental mutation is contained.
 *
 * Prereq: vendor backend on :4000 against v4_parity; local Redis.
 * Run from backend/:  node owned-engine/test-parity-mutating.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const envText = readFileSync(join(REPO, ".env"), "utf8");
const readEnv = (k) => (envText.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m")) || [])[1];
const SECRET = readEnv("APP_ACCESS_TOKEN_SECRET");

process.env.DB_HOST ||= "127.0.0.1";
process.env.DB_PORT ||= "3306";
process.env.DB_USER ||= "root";
process.env.DB_PASSWORD ||= "";
process.env.DB_NAME = "v4_parity";
for (const k of ["APP_ACCESS_TOKEN_SECRET", "APP_REFRESH_TOKEN_SECRET", "JWT_EXPIRY",
  "JWT_REFRESH_EXPIRY", "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD"]) {
  const v = readEnv(k);
  if (v && !process.env[k]) process.env[k] = v;
}

const SUPERADMIN_ID = "f96eebda-658f-4535-b7a1-55249c6e4e84";
const SUPERADMIN_ROLE = 52;
const VENDOR = "http://127.0.0.1:4000";

const { setupCompat } = await import("./lib/compat.mjs");
const { compileMatcher } = await import("./lib/route-table.mjs");
const { createPipeline } = await import("./lib/pipeline.mjs");
const { createServer } = await import("./lib/http-server.mjs");
const { createAccessAdapter, createMysqlQuery } = await import("./lib/db-access.mjs");
const { compareResponses, replay, makeOptions } = await import("./lib/parity.mjs");
const mysql = (await import("mysql2/promise")).default;

const compat = setupCompat();
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, connectionLimit: 8,
});
const access = createAccessAdapter({ query: createMysqlQuery(pool) });
const manifest = JSON.parse(readFileSync(join(HERE, "route-manifest.json"), "utf8"));
const routeTable = manifest.routes.filter((r) => r.method !== "WS").map((r) => ({ ...r, matcher: compileMatcher(r.path) }));

const pipeline = createPipeline({
  routeTable, accessSecret: SECRET,
  loadUser: access.loadUser, loadPermissions: access.loadPermissions,
  loadRouteModule: async (route) => compat.loadHandler(route.source.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, "")),
});
const server = createServer(pipeline);
await new Promise((r) => server.listen(0, r));
const OWNED = `http://127.0.0.1:${server.address().port}`;

const tokenUtil = compat.require("@b/utils/token");
const session = await tokenUtil.generateTokens({ id: SUPERADMIN_ID, role: SUPERADMIN_ROLE });
const cookieStr = `accessToken=${session.accessToken}; sessionId=${session.sessionId}; csrfToken=${session.csrfToken}`;
const headers = { cookie: cookieStr, authorization: "Bearer " + session.accessToken, "content-type": "application/json" };

const opts = makeOptions();
// Mutating routes with a concrete path (no :param — those need real ids/fixtures).
const targets = routeTable.filter((r) => ["POST", "PUT", "DELETE"].includes(r.method) && !r.path.includes(":"));

const res = { match: 0, mismatch: 0, mutated2xx: 0, statusMatch: 0, statusDiff: 0 };
const mismatches = [];
const statusDiffs = [];
const mutated = [];

async function compareOne(route) {
  const spec = { method: route.method, path: route.path, headers, body: {} };
  const fetchImpl = (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(8000) });
  try {
    // vendor first, owned second; empty body => rejected => no state change
    const oldRes = await replay(VENDOR, spec, fetchImpl);
    const newRes = await replay(OWNED, spec, fetchImpl);
    // Flag any route that actually succeeded (would have mutated) for fixture testing.
    if (oldRes.status < 300 || newRes.status < 300) {
      res.mutated2xx++;
      mutated.push(`${route.method} ${route.path}  [old ${oldRes.status} / new ${newRes.status}]`);
      return;
    }
    const cmp = compareResponses(oldRes, newRes, opts);
    if (cmp.statusMatch) res.statusMatch++;
    else { res.statusDiff++; statusDiffs.push(`${route.method} ${route.path}  [old ${oldRes.status} / new ${newRes.status}]`); }
    if (cmp.statusMatch && cmp.bodyMatch) { res.match++; return; }
    res.mismatch++;
    mismatches.push(`${route.method} ${route.path}  [old ${oldRes.status} / new ${newRes.status}]  (${cmp.bodyDiffs.slice(0, 2).map((d) => d.path).join(", ")})`);
  } catch (e) {
    res.mismatch++;
    mismatches.push(`${route.method} ${route.path}  ERROR ${e.message.slice(0, 40)}`);
  }
}

// sequential (mutating — avoid interleaving state)
for (const r of targets) await compareOne(r);

const total = targets.length;
const compared = res.match + res.mismatch;
console.log(`\nMoney-route parity — rejection behaviour on mutating routes (empty body)\n`);
console.log(`  mutating routes fired:    ${total}`);
console.log(`  rejected identically:     ${res.match}`);
console.log(`  rejected differently:     ${res.mismatch}`);
console.log(`  returned 2xx (mutated):   ${res.mutated2xx}  -> need fixture-based comparison`);
if (compared) {
  console.log(`\n  STATUS parity (the safety-critical measure): ${res.statusMatch}/${compared} (${((res.statusMatch / compared) * 100).toFixed(1)}%)`);
  console.log(`  full parity (status + message text):         ${res.match}/${compared} (${((res.match / compared) * 100).toFixed(1)}%)`);
  console.log(`  (message-only differences = our validator vs the app's AJV wording)`);
}
if (statusDiffs.length) {
  console.log(`\n  STATUS-level differences (the ones that matter):`);
  for (const s of statusDiffs.slice(0, 20)) console.log(`    ${s}`);
}

if (mismatches.length) {
  console.log(`\n  Rejection mismatches (first 20):`);
  for (const m of mismatches.slice(0, 20)) console.log(`    ${m}`);
}
if (mutated.length) {
  console.log(`\n  Routes that returned 2xx on an empty body (first 15) — review individually:`);
  for (const m of mutated.slice(0, 15)) console.log(`    ${m}`);
}
console.log("");

server.close();
await pool.end();
process.exit(0);
