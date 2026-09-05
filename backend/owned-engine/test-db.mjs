#!/usr/bin/env node
/**
 * Database wiring — proof.
 *
 * Creates a throwaway in-memory database with the SAME table shapes as the real
 * one (user / role / permission / role_permission), seeds a few accounts, then
 * boots the owned engine using the REAL database adapter (not mock functions)
 * and proves over real HTTP that login and permission decisions now come from
 * the database.
 *
 * 100% safe: in-memory SQLite, disappears when the process exits. Never touches
 * the production database. Run:
 *   node --experimental-sqlite backend/owned-engine/test-db.mjs
 */

import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import { compileMatcher } from "./lib/route-table.mjs";
import { signToken } from "./lib/auth.mjs";
import { createPipeline } from "./lib/pipeline.mjs";
import { createServer } from "./lib/http-server.mjs";
import { createAccessAdapter, createSqliteQuery } from "./lib/db-access.mjs";

// --- 1. a throwaway database mirroring the real access-control tables --------
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE role (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE permission (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE role_permission (id INTEGER PRIMARY KEY, roleId INTEGER, permissionId INTEGER);
  CREATE TABLE user (
    id TEXT PRIMARY KEY, email TEXT, firstName TEXT, lastName TEXT,
    roleId INTEGER, status TEXT DEFAULT 'ACTIVE'
  );

  INSERT INTO role (id, name) VALUES (1, 'Admin'), (2, 'User');
  INSERT INTO permission (id, name) VALUES (1, 'access.admin');
  INSERT INTO role_permission (id, roleId, permissionId) VALUES (1, 1, 1);

  INSERT INTO user (id, email, firstName, roleId, status) VALUES
    ('admin-uuid',  'admin@site.com',  'Alice', 1, 'ACTIVE'),
    ('user-uuid',   'user@site.com',   'Bob',   2, 'ACTIVE'),
    ('banned-uuid', 'banned@site.com', 'Mallory', 1, 'BANNED');
`);

// --- 2. wire the REAL adapter to this database ------------------------------
const access = createAccessAdapter({ query: createSqliteQuery(db) });

// --- 3. direct adapter checks -----------------------------------------------
let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} -> ${e.message}`); fail++; }
}

console.log("\nDatabase adapter — direct checks\n");
await check("loadUser returns an ACTIVE user from the DB", async () => {
  const u = await access.loadUser("admin-uuid");
  assert.equal(u.firstName, "Alice");
  assert.equal(u.roleId, 1);
});
await check("loadUser returns null for a BANNED account", async () => {
  assert.equal(await access.loadUser("banned-uuid"), null);
});
await check("loadUser returns null for an unknown id", async () => {
  assert.equal(await access.loadUser("does-not-exist"), null);
});
await check("loadPermissions resolves admin's permissions via role", async () => {
  const perms = await access.loadPermissions({ roleId: 1 });
  assert.deepEqual(perms, ["access.admin"]);
});
await check("loadPermissions returns [] for a role with none", async () => {
  assert.deepEqual(await access.loadPermissions({ roleId: 2 }), []);
});

// --- 4. boot the engine on this database and prove over real HTTP -----------
const SECRET = "db-test-secret";
const routeTable = [
  { method: "GET", path: "/api/admin/stats", matcher: compileMatcher("/api/admin/stats"), requiresAuth: true, permission: "access.admin" },
];
const pipeline = createPipeline({
  routeTable,
  accessSecret: SECRET,
  loadUser: access.loadUser,          // <-- real DB lookup
  loadPermissions: access.loadPermissions, // <-- real DB lookup
  loadRouteModule: async () => ({ metadata: {}, default: async (h) => ({ servedTo: h.user.firstName }) }),
});

const server = createServer(pipeline);
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
const tok = (sub) => "Bearer " + signToken({ sub }, SECRET, { expiresInSec: 60 });

async function hit(token) {
  const res = await fetch(`${base}/api/admin/stats`, token ? { headers: { authorization: token } } : {});
  return { code: res.status, body: await res.json() };
}

console.log("\nEngine on the database — real HTTP\n");
await check("admin user (from DB) -> 200 with their name", async () => {
  const r = await hit(tok("admin-uuid"));
  assert.equal(r.code, 200);
  assert.equal(r.body.servedTo, "Alice");
});
await check("regular user (from DB) -> 403 on admin route", async () => {
  assert.equal((await hit(tok("user-uuid"))).code, 403);
});
await check("BANNED user (from DB) -> 401 even with a valid token", async () => {
  assert.equal((await hit(tok("banned-uuid"))).code, 401);
});
await check("no token -> 401", async () => {
  assert.equal((await hit(null)).code, 401);
});

server.close();
db.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
