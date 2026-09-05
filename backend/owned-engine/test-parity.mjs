#!/usr/bin/env node
/**
 * Parity harness — self-test.
 *
 * Stands up two mock engines ("old" and "new") that AGREE on most routes but
 * (a) differ in harmless volatile ways (timestamps, tokens) and (b) genuinely
 * disagree on one route. Proves the harness ignores (a) and catches (b), and
 * that the production guard works. No real engines or staging needed.
 *
 * Run:  node backend/owned-engine/test-parity.mjs
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { runParity, assertSafeTarget, maskVolatile, diff } from "./lib/parity.mjs";

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} -> ${e.message}`); fail++; }
}

// Two mock engines. Responses are identical in MEANING; they differ only in
// volatile fields — except /api/balance, where they genuinely disagree.
function mockEngine(variant) {
  return createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    const now = new Date().toISOString();
    const token = `${variant}head.${variant}body.${variant}sig${"x".repeat(10)}`;
    const routes = {
      "/api/profile": { status: "success", data: { name: "Alice", role: "USER", createdAt: now, token } },
      "/api/markets": { status: "success", data: { pairs: ["BTC/USDT", "ETH/USDT"], count: 2 } },
      // The real difference: old says balance 100, new says 999.
      "/api/balance": { status: "success", data: { balance: variant === "old" ? 100 : 999, updatedAt: now } },
    };
    const body = routes[req.url] || { status: "fail", error: "Not found" };
    res.writeHead(routes[req.url] ? 200 : 404);
    res.end(JSON.stringify(body));
  });
}

// --- unit checks on the masking/diff core -----------------------------------
console.log("\nParity core — masking & diff\n");
await check("masking hides timestamps and tokens but keeps real values", async () => {
  const masked = maskVolatile({ name: "Alice", createdAt: "2026-01-01T00:00:00Z", n: 5 });
  assert.equal(masked.name, "Alice");
  assert.equal(masked.n, 5);
  assert.equal(masked.createdAt, "<volatile>");
});
await check("diff finds a changed leaf and its path", async () => {
  const d = diff({ a: { b: 1 } }, { a: { b: 2 } });
  assert.equal(d.length, 1);
  assert.equal(d[0].path, "a.b");
  assert.deepEqual([d[0].old, d[0].new], [1, 2]);
});
await check("production guard refuses the live host", async () => {
  assert.throws(() => assertSafeTarget("https://terminal.web-bytes.in/api/x"));
});
await check("guard allows a staging host", async () => {
  assertSafeTarget("http://staging.internal:4000/api/x"); // should not throw
});

// --- end-to-end against the two mock engines --------------------------------
const oldSrv = mockEngine("old");
const newSrv = mockEngine("new");
await new Promise((r) => oldSrv.listen(0, r));
await new Promise((r) => newSrv.listen(0, r));
const oldBase = `http://127.0.0.1:${oldSrv.address().port}`;
const newBase = `http://127.0.0.1:${newSrv.address().port}`;

console.log("\nParity run — two mock engines\n");
const report = await runParity({
  oldBase,
  newBase,
  specs: [{ path: "/api/profile" }, { path: "/api/markets" }, { path: "/api/balance" }],
});

await check("identical routes (bar volatile fields) are reported as MATCH", async () => {
  const profile = report.results.find((r) => r.spec.path === "/api/profile");
  const markets = report.results.find((r) => r.spec.path === "/api/markets");
  assert.equal(profile.match, true, "profile should match despite differing timestamp/token");
  assert.equal(markets.match, true);
});
await check("the genuinely different route is caught as MISMATCH", async () => {
  const balance = report.results.find((r) => r.spec.path === "/api/balance");
  assert.equal(balance.match, false);
  const balDiff = balance.bodyDiffs.find((d) => d.path === "data.balance");
  assert.ok(balDiff, "expected data.balance to be flagged");
  assert.deepEqual([balDiff.old, balDiff.new], [100, 999]);
});
await check("summary counts are correct (2 matched, 1 mismatched)", async () => {
  assert.equal(report.total, 3);
  assert.equal(report.matched, 2);
  assert.equal(report.mismatched, 1);
});

oldSrv.close();
newSrv.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
