#!/usr/bin/env node
/**
 * Execution coverage — how many real GET features actually RUN on the owned
 * engine (not just load)?
 *
 * Boots the owned engine with the FULL route table, each route wired to its real
 * compiled handler via the compat layer, then fires every read-only (GET, no
 * :param) route — public ones anonymously, protected ones as a seeded admin —
 * and classifies the response:
 *   2xx/3xx = ran and returned data
 *   4xx     = ran and correctly rejected (auth/permission/validation)
 *   5xx     = crashed (a real bug to look at)
 *   timeout = handler hung or called a slow external service
 *
 * Safe/local: dev DB + local Redis, GET only (no writes). Run:
 *   node backend/owned-engine/test-execution.mjs
 */

process.env.DB_HOST ||= "127.0.0.1";
process.env.DB_PORT ||= "3306";
process.env.DB_USER ||= "root";
process.env.DB_PASSWORD ||= "";
process.env.DB_NAME ||= "bidex_owned_dev";

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { setupCompat } from "./lib/compat.mjs";
import { compileMatcher } from "./lib/route-table.mjs";
import { signToken } from "./lib/auth.mjs";
import { createPipeline } from "./lib/pipeline.mjs";
import { createServer } from "./lib/http-server.mjs";
import { createAccessAdapter, createMysqlQuery } from "./lib/db-access.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = "exec-secret";
const toRel = (s) => s.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, "");

const compat = setupCompat();
const manifest = JSON.parse(readFileSync(join(HERE, "route-manifest.json"), "utf8"));

const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, connectionLimit: 8,
});
const access = createAccessAdapter({ query: createMysqlQuery(pool) });

// Full route table, each route carrying its source so we can load its handler.
const routeTable = manifest.routes
  .filter((r) => r.method !== "WS")
  .map((r) => ({ ...r, matcher: compileMatcher(r.path) }));

const pipeline = createPipeline({
  routeTable,
  accessSecret: SECRET,
  loadUser: access.loadUser,
  loadPermissions: access.loadPermissions,
  loadRouteModule: async (route) => compat.loadHandler(toRel(route.source)),
});

const server = createServer(pipeline);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const TEST_USER_ID = process.env.TEST_USER_ID || "admin-uuid";
const adminToken = "Bearer " + signToken({ sub: TEST_USER_ID }, SECRET, { expiresInSec: 300 });

// Read-only, no-param GET routes only (safe to replay; params need fixtures).
const targets = routeTable.filter((r) => r.method === "GET" && !r.path.includes(":"));

const buckets = { ran2xx: 0, rejected4xx: 0, crashed5xx: 0, timeout: 0 };
const crashes = [];

async function fire(route) {
  const headers = route.requiresAuth ? { authorization: adminToken } : {};
  try {
    const res = await fetch(base + route.path, { headers, signal: AbortSignal.timeout(6000) });
    if (res.status >= 500) {
      buckets.crashed5xx++;
      let msg = "";
      try { msg = (await res.json())?.error || ""; } catch {}
      crashes.push({ path: route.path, status: res.status, error: String(msg).slice(0, 80) });
    } else if (res.status >= 400) buckets.rejected4xx++;
    else buckets.ran2xx++;
  } catch {
    buckets.timeout++;
    crashes.push({ path: route.path, status: "timeout", error: "no response in 6s" });
  }
}

// modest concurrency
const queue = [...targets];
async function worker() { while (queue.length) await fire(queue.shift()); }
await Promise.all(Array.from({ length: 10 }, worker));

const total = targets.length;
const healthy = buckets.ran2xx + buckets.rejected4xx;
console.log(`\nExecution coverage — real GET features run on the owned engine\n`);
console.log(`  read-only routes fired:  ${total}`);
console.log(`  ran & returned (2xx/3xx): ${buckets.ran2xx}`);
console.log(`  ran & rejected (4xx):     ${buckets.rejected4xx}`);
console.log(`  crashed (5xx):            ${buckets.crashed5xx}`);
console.log(`  timed out / no response:  ${buckets.timeout}`);
console.log(`\n  ran without crashing: ${healthy}/${total} (${((healthy / total) * 100).toFixed(1)}%)`);

if (crashes.length) {
  console.log(`\n  First ${Math.min(crashes.length, 15)} non-healthy routes:`);
  for (const c of crashes.slice(0, 15)) console.log(`    [${c.status}] ${c.path}  ${c.error}`);
}
console.log("");

server.close();
await pool.end();
process.exit(0);
