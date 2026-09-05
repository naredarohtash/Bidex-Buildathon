#!/usr/bin/env node
/**
 * Owned engine on the REAL schema — proof.
 *
 * Connects to a local MySQL database that was created from the project's own
 * initial.sql (all 160 real tables) and seeded with a few test accounts, using
 * the SAME MySQL driver (mysql2) the production app uses. Boots the owned engine
 * against it and proves auth/permission decisions come from the real tables.
 *
 * 100% local and safe: points at `bidex_owned_dev` on 127.0.0.1, never
 * production. Run:  node backend/owned-engine/test-db-mysql.mjs
 */

import mysql from "mysql2/promise";
import assert from "node:assert/strict";
import { compileMatcher } from "./lib/route-table.mjs";
import { signToken } from "./lib/auth.mjs";
import { createPipeline } from "./lib/pipeline.mjs";
import { createServer } from "./lib/http-server.mjs";
import { createAccessAdapter, createMysqlQuery } from "./lib/db-access.mjs";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "bidex_owned_dev",
  connectionLimit: 4,
});

const access = createAccessAdapter({ query: createMysqlQuery(pool) });

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} -> ${e.message}`); fail++; }
}

console.log("\nOwned engine on REAL schema (mysql2) — adapter checks\n");
await check("loadUser reads an ACTIVE user from the real `user` table", async () => {
  const u = await access.loadUser("admin-uuid");
  assert.equal(u.firstName, "Alice");
  assert.equal(u.roleId, 1);
});
await check("loadUser returns null for a BANNED account", async () => {
  assert.equal(await access.loadUser("banned-uuid"), null);
});
await check("loadPermissions resolves via role_permission JOIN permission", async () => {
  assert.deepEqual(await access.loadPermissions({ roleId: 1 }), ["access.admin"]);
});
await check("loadPermissions returns [] for a role with none", async () => {
  assert.deepEqual(await access.loadPermissions({ roleId: 2 }), []);
});

// boot the engine on the real DB
const SECRET = "mysql-test-secret";
const routeTable = [
  { method: "GET", path: "/api/admin/stats", matcher: compileMatcher("/api/admin/stats"), requiresAuth: true, permission: "access.admin" },
];
const pipeline = createPipeline({
  routeTable,
  accessSecret: SECRET,
  loadUser: access.loadUser,
  loadPermissions: access.loadPermissions,
  loadRouteModule: async () => ({ metadata: {}, default: async (h) => ({ servedTo: h.user.firstName }) }),
});
const server = createServer(pipeline);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const tok = (sub) => "Bearer " + signToken({ sub }, SECRET, { expiresInSec: 60 });
const hit = async (t) => {
  const res = await fetch(`${base}/api/admin/stats`, t ? { headers: { authorization: t } } : {});
  return { code: res.status, body: await res.json() };
};

console.log("\nOwned engine on REAL schema — real HTTP\n");
await check("admin (from real DB) -> 200 with their name", async () => {
  const r = await hit(tok("admin-uuid"));
  assert.equal(r.code, 200);
  assert.equal(r.body.servedTo, "Alice");
});
await check("regular user (from real DB) -> 403", async () => {
  assert.equal((await hit(tok("user-uuid"))).code, 403);
});
await check("BANNED user (from real DB) -> 401 even with a valid token", async () => {
  assert.equal((await hit(tok("banned-uuid"))).code, 401);
});
await check("no token -> 401", async () => {
  assert.equal((await hit(null)).code, 401);
});

server.close();
await pool.end();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
