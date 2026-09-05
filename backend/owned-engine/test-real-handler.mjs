#!/usr/bin/env node
/**
 * REAL feature on the owned engine — proof.
 *
 * Serves an ACTUAL business-logic handler from the codebase
 * (api/user/preferences) over real HTTP, fronted by the owned engine's own
 * security gate (routing + auth + the Handler object). The handler is unchanged
 * production code; only the engine around it is ours.
 *
 * Safe: runs against the local `bidex_owned_dev` database. Requires the dev DB
 * (run dev-db-setup.sh first) and a local Redis.
 *   node backend/owned-engine/test-real-handler.mjs
 */

// DB env must be set before the compat layer loads the models.
process.env.DB_HOST ||= "127.0.0.1";
process.env.DB_PORT ||= "3306";
process.env.DB_USER ||= "root";
process.env.DB_PASSWORD ||= "";
process.env.DB_NAME ||= "bidex_owned_dev";

import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { setupCompat } from "./lib/compat.mjs";
import { compileMatcher } from "./lib/route-table.mjs";
import { signToken } from "./lib/auth.mjs";
import { createPipeline } from "./lib/pipeline.mjs";
import { createServer } from "./lib/http-server.mjs";
import { createAccessAdapter, createMysqlQuery } from "./lib/db-access.mjs";

const SECRET = "real-handler-secret";

// 1. wire up the real backend primitives (loads 140 real models)
const compat = setupCompat();

// 2. auth lookups against the same dev DB
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, connectionLimit: 4,
});
const access = createAccessAdapter({ query: createMysqlQuery(pool) });

// 3. the owned engine, serving a REAL handler
const routeTable = [{
  method: "GET", path: "/api/user/preferences",
  matcher: compileMatcher("/api/user/preferences"),
  requiresAuth: true, permission: null,
}];
const pipeline = createPipeline({
  routeTable,
  accessSecret: SECRET,
  loadUser: access.loadUser,
  loadPermissions: access.loadPermissions,
  loadRouteModule: async () => compat.loadHandler("api/user/preferences/index.get"),
});

const server = createServer(pipeline);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} -> ${e.message}`); fail++; }
}

console.log("\nReal feature (api/user/preferences) on the owned engine — real HTTP\n");
await check("models loaded via compat layer", () => {
  assert.ok(compat.models.user, "expected the real user model");
  assert.ok(Object.keys(compat.models).length > 100, "expected 100+ real models");
});
await check("logged-in request -> 200 and the real handler's data shape", async () => {
  const token = "Bearer " + signToken({ sub: "admin-uuid" }, SECRET, { expiresInSec: 60 });
  const res = await fetch(`${base}/api/user/preferences`, { headers: { authorization: token } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok("preferences" in body, "expected the handler's `preferences` field, returned directly");
});
await check("no login -> 401 (our gate blocks it before the handler runs)", async () => {
  const res = await fetch(`${base}/api/user/preferences`);
  assert.equal(res.status, 401);
});
await check("banned user -> 401 (gate rejects, real handler never runs)", async () => {
  const token = "Bearer " + signToken({ sub: "banned-uuid" }, SECRET, { expiresInSec: 60 });
  const res = await fetch(`${base}/api/user/preferences`, { headers: { authorization: token } });
  assert.equal(res.status, 401);
});

server.close();
await pool.end();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
