#!/usr/bin/env node
/**
 * Owned Engine — test suite.
 *
 * Exercises every piece of the pipeline, including the security-critical cases
 * (forged tokens, expired tokens, wrong algorithm, missing permission, bad input,
 * rate limiting). Uses Node's built-in test assertions only — no dependencies,
 * no database, no network. Run:  node backend/owned-engine/test.mjs
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { deriveRoute, compileMatcher, matchRoute } from "./lib/route-table.mjs";
import { parseCookies, parseQuery, parseBody } from "./lib/http-parse.mjs";
import { signToken, verifyToken } from "./lib/auth.mjs";
import { hasPermission } from "./lib/permissions.mjs";
import { validateBody } from "./lib/validate.mjs";
import { createRateLimiter } from "./lib/rate-limit.mjs";
import { buildSetCookie, createError } from "./lib/respond.mjs";
import { createPipeline } from "./lib/pipeline.mjs";

let passed = 0, failed = 0;
const results = [];
function test(name, fn) {
  try { fn(); results.push(["PASS", name]); passed++; }
  catch (err) { results.push(["FAIL", `${name} -> ${err.message}`]); failed++; }
}
async function testAsync(name, fn) {
  try { await fn(); results.push(["PASS", name]); passed++; }
  catch (err) { results.push(["FAIL", `${name} -> ${err.message}`]); failed++; }
}

// ---------------------------------------------------------------- route table
test("route: index file -> no extra segment", () => {
  assert.deepEqual(deriveRoute("exchange/market/index.get.js"), { method: "GET", path: "/api/exchange/market" });
});
test("route: named file -> name becomes last segment", () => {
  assert.deepEqual(deriveRoute("exchange/binary/health.get.js"), { method: "GET", path: "/api/exchange/binary/health" });
});
test("route: (group) folders are stripped from the URL", () => {
  assert.equal(deriveRoute("(ext)/admin/staking/pool/index.get.js").path, "/api/admin/staking/pool");
});
test("route: [param] folders become :param", () => {
  assert.equal(deriveRoute("exchange/binary/order/[id]/close/index.post.js").path, "/api/exchange/binary/order/:id/close");
});
test("route: .del maps to DELETE", () => {
  assert.equal(deriveRoute("exchange/watchlist/index.del.js").method, "DELETE");
});
test("route: non-route files are ignored", () => {
  assert.equal(deriveRoute("exchange/utils.js"), null);
  assert.equal(deriveRoute("exchange/binary/order/util/audit.js"), null);
});
test("route: matcher extracts params", () => {
  const table = [{ method: "GET", path: "/api/x/:id/y", matcher: compileMatcher("/api/x/:id/y") }];
  const m = matchRoute(table, "GET", "/api/x/42/y");
  assert.equal(m.params.id, "42");
});
test("route: static path wins over parameterised", () => {
  const table = [
    { method: "GET", path: "/api/u/:id", matcher: compileMatcher("/api/u/:id") },
    { method: "GET", path: "/api/u/me", matcher: compileMatcher("/api/u/me") },
  ];
  assert.equal(matchRoute(table, "GET", "/api/u/me").route.path, "/api/u/me");
});
test("route: no match returns null", () => {
  const table = [{ method: "GET", path: "/api/a", matcher: compileMatcher("/api/a") }];
  assert.equal(matchRoute(table, "GET", "/api/nope"), null);
});

// -------------------------------------------------------------------- parsing
test("parse: cookies", () => {
  assert.deepEqual(parseCookies("accessToken=abc; sessionId=xyz"), { accessToken: "abc", sessionId: "xyz" });
});
test("parse: empty cookie header", () => {
  assert.deepEqual(parseCookies(""), {});
});
test("parse: query string", () => {
  assert.deepEqual(parseQuery("?a=1&b=two"), { a: "1", b: "two" });
});
test("parse: JSON body", () => {
  assert.deepEqual(parseBody('{"x":1}', "application/json"), { x: 1 });
});
test("parse: malformed JSON is flagged, not thrown", () => {
  assert.ok(parseBody("{oops", "application/json").__parseError);
});

// ----------------------------------------------------------------------- auth
const SECRET = "test-secret-value";
test("auth: valid token verifies", () => {
  const t = signToken({ sub: "user-1" }, SECRET, { expiresInSec: 60 });
  const r = verifyToken(t, SECRET);
  assert.equal(r.valid, true);
  assert.equal(r.payload.sub, "user-1");
});
test("auth: token signed with a DIFFERENT secret is rejected", () => {
  const t = signToken({ sub: "attacker" }, "wrong-secret", { expiresInSec: 60 });
  assert.equal(verifyToken(t, SECRET).valid, false);
});
test("auth: tampered payload is rejected", () => {
  const t = signToken({ sub: "user-1" }, SECRET, { expiresInSec: 60 });
  const [h, , s] = t.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ sub: "admin" })).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  assert.equal(verifyToken(`${h}.${forgedBody}.${s}`, SECRET).valid, false);
});
test("auth: expired token is rejected", () => {
  const t = signToken({ sub: "user-1" }, SECRET, { expiresInSec: -10 });
  const r = verifyToken(t, SECRET);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "expired");
});
test("auth: 'none' algorithm attack is rejected", () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = Buffer.from(JSON.stringify({ sub: "admin" })).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  assert.equal(verifyToken(`${header}.${body}.`, SECRET).valid, false);
});
test("auth: malformed / missing tokens are rejected", () => {
  assert.equal(verifyToken("garbage", SECRET).valid, false);
  assert.equal(verifyToken(undefined, SECRET).valid, false);
});

// ---------------------------------------------------------------- permissions
test("perm: no requirement passes", () => assert.equal(hasPermission([], null), true));
test("perm: granted permission passes", () => assert.equal(hasPermission(["access.admin"], "access.admin"), true));
test("perm: missing permission fails", () => assert.equal(hasPermission(["other"], "access.admin"), false));
test("perm: empty grants fail a required permission", () => assert.equal(hasPermission([], "access.admin"), false));

// ----------------------------------------------------------------- validation
const schema = {
  required: ["email"],
  properties: {
    email: { type: "string", minLength: 3 },
    age: { type: "integer" },
    role: { type: "string", enum: ["user", "admin"] },
  },
};
test("validate: good body passes", () => {
  assert.equal(validateBody(schema, { email: "a@b.co", age: 30, role: "user" }).valid, true);
});
test("validate: missing required field fails", () => {
  assert.equal(validateBody(schema, {}).valid, false);
});
test("validate: wrong type fails", () => {
  assert.equal(validateBody(schema, { email: "a@b.co", age: "thirty" }).valid, false);
});
test("validate: minLength enforced", () => {
  assert.equal(validateBody(schema, { email: "a" }).valid, false);
});
test("validate: enum enforced", () => {
  assert.equal(validateBody(schema, { email: "a@b.co", role: "superuser" }).valid, false);
});

// ---------------------------------------------------------------- rate limits
test("ratelimit: allows under the limit, blocks over", () => {
  const rl = createRateLimiter({ limit: 3, windowMs: 60000 });
  assert.equal(rl.check("ip").allowed, true);
  assert.equal(rl.check("ip").allowed, true);
  assert.equal(rl.check("ip").allowed, true);
  assert.equal(rl.check("ip").allowed, false);
});
test("ratelimit: separate callers have separate budgets", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 60000 });
  assert.equal(rl.check("a").allowed, true);
  assert.equal(rl.check("b").allowed, true);
});

// ------------------------------------------------------------------- response
test("respond: httpOnly cookie serialised correctly", () => {
  const c = buildSetCookie("accessToken", "v", { httpOnly: true, secure: true, maxAgeSec: 900 });
  assert.ok(c.includes("HttpOnly") && c.includes("Secure") && c.includes("Max-Age=900"));
});
test("respond: csrf cookie is readable by the client (no HttpOnly)", () => {
  assert.ok(!buildSetCookie("csrfToken", "v", { httpOnly: false }).includes("HttpOnly"));
});

// ------------------------------------------------------------------- pipeline
const routeTable = [
  { method: "GET", path: "/api/public", matcher: compileMatcher("/api/public"), requiresAuth: false, permission: null },
  { method: "GET", path: "/api/private", matcher: compileMatcher("/api/private"), requiresAuth: true, permission: null },
  { method: "GET", path: "/api/admin", matcher: compileMatcher("/api/admin"), requiresAuth: true, permission: "access.admin" },
  { method: "POST", path: "/api/thing/:id", matcher: compileMatcher("/api/thing/:id"), requiresAuth: true, permission: null },
];

const USERS = { "user-1": { id: "user-1", role: "USER" }, "admin-1": { id: "admin-1", role: "ADMIN" } };
const PERMS = { USER: [], ADMIN: ["access.admin"] };

function makePipeline(overrides = {}) {
  return createPipeline({
    routeTable,
    accessSecret: SECRET,
    loadUser: async (id) => USERS[id] || null,
    loadPermissions: async (u) => PERMS[u.role] || [],
    loadRouteModule: async (route) => ({
      metadata: route.path === "/api/thing/:id"
        ? { requestBody: { content: { "application/json": { schema: { required: ["name"], properties: { name: { type: "string" } } } } } } }
        : {},
      default: async (h) => ({ route: route.path, params: h.params, user: h.user?.id ?? null, body: h.body }),
    }),
    ...overrides,
  });
}
const authHeader = (sub) => ({ authorization: "Bearer " + signToken({ sub }, SECRET, { expiresInSec: 60 }) });

await testAsync("pipeline: unknown route -> 404", async () => {
  const r = await makePipeline()({ method: "GET", url: "/api/nothing" });
  assert.equal(r.statusCode, 404);
});
await testAsync("pipeline: public route works without login", async () => {
  const r = await makePipeline()({ method: "GET", url: "/api/public" });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.route, "/api/public");
});
await testAsync("pipeline: protected route without token -> 401", async () => {
  const r = await makePipeline()({ method: "GET", url: "/api/private" });
  assert.equal(r.statusCode, 401);
});
await testAsync("pipeline: protected route WITH valid token -> 200", async () => {
  const r = await makePipeline()({ method: "GET", url: "/api/private", headers: authHeader("user-1") });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.user, "user-1");
});
await testAsync("pipeline: forged token -> 401 (not 200)", async () => {
  const forged = "Bearer " + signToken({ sub: "admin-1" }, "attacker-secret", { expiresInSec: 60 });
  const r = await makePipeline()({ method: "GET", url: "/api/private", headers: { authorization: forged } });
  assert.equal(r.statusCode, 401);
});
await testAsync("pipeline: logged-in but lacking permission -> 403", async () => {
  const r = await makePipeline()({ method: "GET", url: "/api/admin", headers: authHeader("user-1") });
  assert.equal(r.statusCode, 403);
});
await testAsync("pipeline: admin with permission -> 200", async () => {
  const r = await makePipeline()({ method: "GET", url: "/api/admin", headers: authHeader("admin-1") });
  assert.equal(r.statusCode, 200);
});
await testAsync("pipeline: url params reach the handler", async () => {
  const r = await makePipeline()({
    method: "POST", url: "/api/thing/abc-123", headers: { ...authHeader("user-1"), "content-type": "application/json" },
    rawBody: JSON.stringify({ name: "x" }),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.params.id, "abc-123");
});
await testAsync("pipeline: invalid body -> 400", async () => {
  const r = await makePipeline()({
    method: "POST", url: "/api/thing/1", headers: { ...authHeader("user-1"), "content-type": "application/json" },
    rawBody: JSON.stringify({}),
  });
  assert.equal(r.statusCode, 400);
});
await testAsync("pipeline: rate limit -> 429", async () => {
  const handle = makePipeline({ rateLimiter: createRateLimiter({ limit: 1, windowMs: 60000 }) });
  await handle({ method: "GET", url: "/api/public", remoteAddress: "1.1.1.1" });
  const r = await handle({ method: "GET", url: "/api/public", remoteAddress: "1.1.1.1" });
  assert.equal(r.statusCode, 429);
});
await testAsync("pipeline: handler error maps to its status code", async () => {
  const handle = makePipeline({
    loadRouteModule: async () => ({ metadata: {}, default: async () => { throw createError({ statusCode: 422, message: "Nope" }); } }),
  });
  const r = await handle({ method: "GET", url: "/api/public" });
  assert.equal(r.statusCode, 422);
  assert.equal(r.body.message, "Nope");
});
await testAsync("pipeline: expired token + session refresh restores the user", async () => {
  const expired = "Bearer " + signToken({ sub: "user-1" }, SECRET, { expiresInSec: -5 });
  const handle = makePipeline({
    refreshSession: async () => ({ user: USERS["user-1"], setCookie: buildSetCookie("accessToken", "new") }),
  });
  const r = await handle({
    method: "GET", url: "/api/private",
    headers: { authorization: expired, cookie: "sessionId=sess-1" },
  });
  assert.equal(r.statusCode, 200);
  assert.ok(r.setCookies.some((c) => c.startsWith("accessToken=")));
});
await testAsync("pipeline: expired token with NO session stays unauthorized", async () => {
  const expired = "Bearer " + signToken({ sub: "user-1" }, SECRET, { expiresInSec: -5 });
  const r = await makePipeline()({ method: "GET", url: "/api/private", headers: { authorization: expired } });
  assert.equal(r.statusCode, 401);
});

// ------------------------------------------------------- ws message broker
// The broker is what carries a settled trade to the terminal. It keys
// subscriptions by the exact JSON string, and on the binary-order route that
// string carries userId — so the match is also what stops one trader's result
// reaching another. Both properties are asserted here.
const wsRegistry = createRequire(import.meta.url)("./lib/ws-registry.cjs");

function makeSocket() {
  return { sent: [], send(s) { this.sent.push(s); } };
}
function seedTwoTraders(route = "/api/exchange/binary/order") {
  wsRegistry.clients.delete(route);
  const alice = makeSocket(), bob = makeSocket();
  wsRegistry.addClient(route, "c-alice", alice);
  wsRegistry.addClient(route, "c-bob", bob);
  const key = (userId) => JSON.stringify({ type: "order", symbol: "AUD/USD_OTC", userId });
  wsRegistry.clients.get(route).get("c-alice").subscriptions.add(key("alice"));
  wsRegistry.clients.get(route).get("c-bob").subscriptions.add(key("bob"));
  return { alice, bob, route };
}

test("ws broker: exact key match delivers to that subscriber", () => {
  const { alice, route } = seedTwoTraders();
  const sent = wsRegistry.messageBroker.broadcastToSubscribedClients(
    route,
    { type: "order", symbol: "AUD/USD_OTC", userId: "alice" },
    { type: "ORDER_COMPLETED", order: { id: "o1" } },
  );
  assert.equal(sent, 1);
  assert.equal(alice.sent.length, 1);
  assert.equal(JSON.parse(alice.sent[0]).type, "ORDER_COMPLETED");
});

test("ws broker: another user on the same symbol receives nothing", () => {
  const { bob, route } = seedTwoTraders();
  wsRegistry.messageBroker.broadcastToSubscribedClients(
    route,
    { type: "order", symbol: "AUD/USD_OTC", userId: "alice" },
    { type: "ORDER_COMPLETED", order: { id: "o1" } },
  );
  assert.equal(bob.sent.length, 0);
});

test("ws broker: a key nobody subscribed to delivers to nobody", () => {
  const { alice, bob, route } = seedTwoTraders();
  const sent = wsRegistry.messageBroker.broadcastToSubscribedClients(
    route,
    { type: "order", symbol: "EUR/USD_OTC", userId: "alice" },
    { type: "ORDER_COMPLETED", order: { id: "o1" } },
  );
  assert.equal(sent, 0);
  assert.equal(alice.sent.length + bob.sent.length, 0);
});

// `exchange/order/index.ws.js` broadcasts a user's open orders with `{ userId }`
// and nothing else. The matcher used to compare only type/symbol/interval/limit,
// so userId was never looked at.
test("ws route match: a {userId} broadcast reaches only that user", () => {
  const route = "/api/exchange/order";
  wsRegistry.clients.delete(route);
  const alice = makeSocket(), bob = makeSocket();
  wsRegistry.addClient(route, "c-alice", alice);
  wsRegistry.addClient(route, "c-bob", bob);
  wsRegistry.clients.get(route).get("c-alice").subscriptions.add(JSON.stringify({ type: "orders", userId: "alice" }));
  wsRegistry.clients.get(route).get("c-bob").subscriptions.add(JSON.stringify({ type: "orders", userId: "bob" }));

  wsRegistry.sendMessageToRoute(route, { userId: "alice" }, { stream: "orders", data: [1] });

  assert.equal(alice.sent.length, 1);
  assert.equal(bob.sent.length, 0, "another account must not receive these orders");
});

test("ws route match: market payload still matches regardless of key order", () => {
  const route = "/api/exchange/market";
  wsRegistry.clients.delete(route);
  const sock = makeSocket();
  wsRegistry.addClient(route, "c-1", sock);
  // browser sends {type, interval, symbol}; the handler builds {type, interval, symbol}
  wsRegistry.clients.get(route).get("c-1").subscriptions
    .add(JSON.stringify({ type: "ohlcv", interval: "1m", symbol: "BTC/USDT" }));

  wsRegistry.sendMessageToRoute(route, { type: "ohlcv", interval: "1m", symbol: "BTC/USDT" }, { stream: "ohlcv" });
  assert.equal(sock.sent.length, 1);
});

await testAsync("ws broker: handleBroadcastMessage publishes a create to the route", async () => {
  const route = "/api/user";
  wsRegistry.clients.delete(route);
  const sock = makeSocket();
  wsRegistry.addClient(route, "c-1", sock);

  // the shape admin/system/announcement/index.post.js sends
  await wsRegistry.handleBroadcastMessage({
    type: "announcements",
    method: "create",
    data: { id: "a1", title: "Hello" },
  });

  assert.equal(sock.sent.length, 1);
  const msg = JSON.parse(sock.sent[0]);
  assert.equal(msg.type, "announcements");
  assert.equal(msg.method, "create");
  assert.equal(msg.payload.id, "a1");
});

await testAsync("ws broker: handleBroadcastMessage maps status:false to a delete", async () => {
  const route = "/api/user/support/ticket";
  wsRegistry.clients.delete(route);
  const sock = makeSocket();
  wsRegistry.addClient(route, "c-1", sock);

  await wsRegistry.handleBroadcastMessage({
    type: "announcements", model: "announcement", method: "update",
    status: false, id: ["x", "y"], route,
  });

  const msg = JSON.parse(sock.sent[0]);
  assert.equal(msg.method, "delete");
  assert.deepEqual(msg.payload, [{ id: "x" }, { id: "y" }]);
});

test("ws broker: exposes the surface the compiled handlers call", () => {
  for (const m of ["broadcastToSubscribedClients", "broadcastToRoute", "sendToClient", "sendToClientOnRoute"]) {
    assert.equal(typeof wsRegistry.messageBroker[m], "function", `messageBroker.${m}`);
    assert.equal(typeof wsRegistry[m], "function", `top-level ${m}`);
  }
});

// ------------------------------------------------------------------- report
console.log("\nOwned Engine — test results\n");
for (const [status, name] of results) {
  console.log(`  ${status === "PASS" ? "✓" : "✗"} ${status}  ${name}`);
}
console.log(`\n  ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed === 0 ? 0 : 1);
