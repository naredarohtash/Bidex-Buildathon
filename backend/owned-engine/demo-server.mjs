#!/usr/bin/env node
/**
 * Demo server — boots the owned engine as a REAL running HTTP server so you can
 * see it answer real requests.
 *
 * This uses MOCK data (three demo routes, two demo users) — it does NOT touch
 * the real database, the real site, or any live data. It exists purely to prove
 * the engine runs end-to-end over real HTTP. Start it, curl it, stop it.
 *
 * Run:  node backend/owned-engine/demo-server.mjs
 *       (it prints ready-to-paste curl commands, then waits)
 */

import { compileMatcher } from "./lib/route-table.mjs";
import { signToken } from "./lib/auth.mjs";
import { createPipeline } from "./lib/pipeline.mjs";
import { createRateLimiter } from "./lib/rate-limit.mjs";
import { createServer } from "./lib/http-server.mjs";

const SECRET = "demo-secret";
const PORT = Number(process.env.PORT || 4999);

// --- mock world (stands in for the real DB) --------------------------------
const USERS = {
  "user-1": { id: "user-1", firstName: "Regular", role: "USER" },
  "admin-1": { id: "admin-1", firstName: "Admin", role: "ADMIN" },
};
const PERMISSIONS = { USER: [], ADMIN: ["access.admin"] };

// --- demo route table with real handlers -----------------------------------
const routeTable = [
  { method: "GET", path: "/api/health", matcher: compileMatcher("/api/health"), requiresAuth: false, permission: null },
  { method: "GET", path: "/api/me", matcher: compileMatcher("/api/me"), requiresAuth: true, permission: null },
  { method: "GET", path: "/api/admin/stats", matcher: compileMatcher("/api/admin/stats"), requiresAuth: true, permission: "access.admin" },
];

const handlers = {
  "/api/health": async () => ({ ok: true, engine: "owned", time: new Date().toISOString() }),
  "/api/me": async (h) => ({ id: h.user.id, name: h.user.firstName, role: h.user.role }),
  "/api/admin/stats": async () => ({ users: 2, note: "admin-only data" }),
};

const pipeline = createPipeline({
  routeTable,
  accessSecret: SECRET,
  loadUser: async (id) => USERS[id] || null,
  loadPermissions: async (user) => PERMISSIONS[user.role] || [],
  loadRouteModule: async (route) => ({ metadata: {}, default: handlers[route.path] }),
  rateLimiter: createRateLimiter({ limit: 1000, windowMs: 60_000 }),
});

// --- start ------------------------------------------------------------------
const server = createServer(pipeline);
server.listen(PORT, () => {
  const userToken = signToken({ sub: "user-1" }, SECRET, { expiresInSec: 3600 });
  const adminToken = signToken({ sub: "admin-1" }, SECRET, { expiresInSec: 3600 });
  const base = `http://127.0.0.1:${PORT}`;

  console.log(`\nOwned engine demo server listening on ${base}\n`);
  console.log(`Try these (in another terminal):\n`);
  console.log(`  # public route — works with no login`);
  console.log(`  curl ${base}/api/health\n`);
  console.log(`  # protected route with NO login  -> 401`);
  console.log(`  curl -i ${base}/api/me\n`);
  console.log(`  # protected route as a normal user -> 200`);
  console.log(`  curl -H "Authorization: Bearer ${userToken}" ${base}/api/me\n`);
  console.log(`  # admin route as a normal user -> 403 (forbidden)`);
  console.log(`  curl -i -H "Authorization: Bearer ${userToken}" ${base}/api/admin/stats\n`);
  console.log(`  # admin route as an admin -> 200`);
  console.log(`  curl -H "Authorization: Bearer ${adminToken}" ${base}/api/admin/stats\n`);
  console.log(`Press Ctrl+C to stop.\n`);

  // Expose the tokens for the automated smoke test.
  if (process.env.PRINT_TOKENS) {
    console.log(`USER_TOKEN=${userToken}`);
    console.log(`ADMIN_TOKEN=${adminToken}`);
  }
});
