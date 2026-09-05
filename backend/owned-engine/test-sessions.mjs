#!/usr/bin/env node
/**
 * Session refresh — proof.
 *
 * Uses a fake in-memory Redis (same get/set/del interface as ioredis) so no real
 * Redis is needed. Proves that an EXPIRED access token, paired with a valid
 * session, transparently mints a fresh token and keeps the user logged in — and
 * that a disabled/absent session does not.
 *
 * Run:  node backend/owned-engine/test-sessions.mjs
 */

import assert from "node:assert/strict";
import { compileMatcher } from "./lib/route-table.mjs";
import { signToken, verifyToken } from "./lib/auth.mjs";
import { createPipeline } from "./lib/pipeline.mjs";
import { createServer } from "./lib/http-server.mjs";
import { createSessionStore } from "./lib/sessions.mjs";

// --- a fake Redis (in-memory), ioredis-shaped -------------------------------
function fakeRedis() {
  const store = new Map();
  return {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async set(k, v) { store.set(k, v); },
    async del(k) { store.delete(k); },
    _seed(k, v) { store.set(k, v); },
  };
}

const SECRET = "session-test-secret";
const USERS = {
  "user-1": { id: "user-1", firstName: "Bob", roleId: 2 },
  "gone-1": null, // simulates a user who has since been disabled/deleted
};

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.log(`  ✗ ${name} -> ${e.message}`); fail++; }
}

const redis = fakeRedis();
redis._seed("sessionId:good-session", JSON.stringify({ userId: "user-1", csrfToken: "x" }));
redis._seed("sessionId:orphan-session", JSON.stringify({ userId: "gone-1" }));

/* The shape the REAL login handler writes, copied from a live Redis value.
   `user` is an object, not an id — the previous tests only used the flat
   `userId` form, which is why a refresh that never worked against a real
   session still passed here. */
redis._seed("sessionId:real-shape", JSON.stringify({
  refreshToken: "eyJhbGciOiJIUzI1NiJ9.stub.sig",
  csrfToken: "60d7c369f4b91dd4ab2f5f77032630423caf0aed23d5ab71",
  sessionId: "real-shape",
  user: { id: "user-1", role: 52 },
}));
redis._seed("sessionId:real-shape-gone", JSON.stringify({ user: { id: "gone-1", role: 52 } }));

const sessions = createSessionStore({
  redis,
  accessSecret: SECRET,
  loadUser: async (id) => USERS[id] || null,
  accessTtlSec: 900,
});

// --- direct checks ----------------------------------------------------------
console.log("\nSession store — direct checks\n");
await check("refresh with a valid session returns the user + fresh cookies", async () => {
  const r = await sessions.refreshSession("good-session");
  assert.equal(r.user.id, "user-1");
  // accessToken + sessionId + csrfToken — the session cookie is re-issued on
  // every refresh so it can never outlive the token it has to rescue.
  assert.deepEqual(
    r.setCookies.map((c) => c.split("=")[0]).sort(),
    ["accessToken", "csrfToken", "sessionId"]
  );
  const accessCookie = r.setCookies.find((c) => c.startsWith("accessToken="));
  const token = decodeURIComponent(accessCookie.split(";")[0].split("=")[1]);
  assert.equal(verifyToken(token, SECRET).valid, true); // the new token actually works
});
await check("refresh with an unknown session returns null", async () => {
  assert.equal(await sessions.refreshSession("nope"), null);
});
await check("refresh where the user no longer exists returns null", async () => {
  assert.equal(await sessions.refreshSession("orphan-session"), null);
});
await check("refresh works on a session in the REAL stored shape ({user:{id}})", async () => {
  const r = await sessions.refreshSession("real-shape");
  assert.ok(r, "a real-shaped session must refresh");
  assert.equal(r.user.id, "user-1");
  const accessCookie = r.setCookies.find((c) => c.startsWith("accessToken="));
  const token = decodeURIComponent(accessCookie.split(";")[0].split("=")[1]);
  assert.equal(verifyToken(token, SECRET).valid, true);
});
await check("real-shaped session for a deleted user still returns null", async () => {
  assert.equal(await sessions.refreshSession("real-shape-gone"), null);
});

// --- end-to-end through the engine ------------------------------------------
const routeTable = [
  { method: "GET", path: "/api/me", matcher: compileMatcher("/api/me"), requiresAuth: true, permission: null },
];
const pipeline = createPipeline({
  routeTable,
  accessSecret: SECRET,
  loadUser: async (id) => USERS[id] || null,
  loadPermissions: async () => [],
  refreshSession: sessions.refreshSession, // <-- real session store
  loadRouteModule: async () => ({ metadata: {}, default: async (h) => ({ id: h.user.id }) }),
});

const server = createServer(pipeline);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

console.log("\nEngine + session refresh — real HTTP\n");
await check("expired token + valid session -> 200 AND a fresh accessToken cookie is set", async () => {
  const expired = "Bearer " + signToken({ sub: "user-1" }, SECRET, { expiresInSec: -5 });
  const res = await fetch(`${base}/api/me`, { headers: { authorization: expired, cookie: "sessionId=good-session" } });
  assert.equal(res.status, 200);
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  assert.ok(setCookie.some((c) => c && c.startsWith("accessToken=")), "expected a fresh accessToken cookie");
});
await check("expired token + NO session -> 401", async () => {
  const expired = "Bearer " + signToken({ sub: "user-1" }, SECRET, { expiresInSec: -5 });
  const res = await fetch(`${base}/api/me`, { headers: { authorization: expired } });
  assert.equal(res.status, 401);
});

/* The case that actually signed people out mid-session.
   A browser DELETES a cookie once its Max-Age passes, so what arrives is not an
   expired token — it is no token at all. Every test above hands over an expired
   one, which is why this gap stayed invisible while the engine logged people
   out with a valid 14-day session sitting in Redis. */
await check("NO access token + valid session -> recovered, not 401", async () => {
  const res = await fetch(`${base}/api/me`, { headers: { cookie: "sessionId=good-session" } });
  assert.equal(res.status, 200);
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get("set-cookie")];
  assert.ok(setCookie.some((c) => c && c.startsWith("accessToken=")), "expected a fresh accessToken cookie");
});
await check("NO access token and NO session -> still 401", async () => {
  const res = await fetch(`${base}/api/me`);
  assert.equal(res.status, 401);
});
await check("NO access token + unknown session -> still 401", async () => {
  const res = await fetch(`${base}/api/me`, { headers: { cookie: "sessionId=nope" } });
  assert.equal(res.status, 401);
});
await check("NO access token + session for a deleted user -> still 401", async () => {
  const res = await fetch(`${base}/api/me`, { headers: { cookie: "sessionId=orphan-session" } });
  assert.equal(res.status, 401);
});

/* Being away from the screen must not sign a trader out; being away for two
   days should. That means the session's expiry has to move forward every time
   it is used, and the cookie that carries it has to be re-sent — it is the only
   thing that can recover a session once the access token is gone. */
await check("a refresh slides the idle window and re-issues the session cookie", async () => {
  const slid = [];
  const redisSpy = {
    ...redis,
    expire: async (key, ttl) => { slid.push([key, ttl]); return 1; },
  };
  const store = createSessionStore({
    redis: redisSpy,
    accessSecret: SECRET,
    loadUser: async (id) => USERS[id] || null,
    accessTtlSec: 900,
    idleTtlSec: 172800, // 48h
  });

  const r = await store.refreshSession("good-session");
  assert.ok(r, "the session must refresh");
  assert.deepEqual(slid, [["sessionId:good-session", 172800]], "expiry must be pushed back out to 48h");
  assert.ok(
    r.setCookies.some((c) => c.startsWith("sessionId=")),
    "the sessionId cookie must be re-issued, not just the access token"
  );
  const sessionCookie = r.setCookies.find((c) => c.startsWith("sessionId="));
  assert.match(sessionCookie, /Max-Age=172800/, "and carry the full idle window");
});

await check("with no idle window configured, the session's own expiry is left alone", async () => {
  let touched = false;
  const store = createSessionStore({
    redis: { ...redis, expire: async () => { touched = true; return 1; } },
    accessSecret: SECRET,
    loadUser: async (id) => USERS[id] || null,
    accessTtlSec: 900,
  });
  await store.refreshSession("good-session");
  assert.equal(touched, false);
});
await check("expired token + session for a disabled user -> 401", async () => {
  const expired = "Bearer " + signToken({ sub: "gone-1" }, SECRET, { expiresInSec: -5 });
  const res = await fetch(`${base}/api/me`, { headers: { authorization: expired, cookie: "sessionId=orphan-session" } });
  assert.equal(res.status, 401);
});

server.close();
console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
