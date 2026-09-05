#!/usr/bin/env node
/**
 * Run the OWNED engine as a real API server.
 *
 * This is the "connect it and turn it on" step: the owned engine (routing, auth,
 * permissions, the Handler object) serving your REAL compiled handlers, backed by
 * a real database and real sessions. It's the same code path a production cutover
 * would use — but pointed at the local throwaway `v4_parity`, so it's completely
 * safe to poke at.
 *
 * Run from backend/:  node owned-engine/serve.mjs      (defaults to :5000, v4_parity)
 * Then open http://127.0.0.1:5000/api/... or use the printed token for admin routes.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const envText = readFileSync(join(REPO, ".env"), "utf8");
const readEnv = (k) => (envText.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m")) || [])[1];
const SECRET = readEnv("APP_ACCESS_TOKEN_SECRET");

process.env.DB_HOST ||= "127.0.0.1"; process.env.DB_PORT ||= "3306";
process.env.DB_USER ||= "root"; process.env.DB_PASSWORD ||= "";
process.env.DB_NAME ||= "v4_parity";
for (const k of [
  "APP_ACCESS_TOKEN_SECRET", "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD",
  // OTC price-feed config (needed for OTC symbols' live charts)
  "BIDEX_API_URL", "BINDEX_API_URL", "BIDEX_API_KEY", "OTC_REDIS_PORT",
]) {
  const v = readEnv(k); if (v && !process.env[k]) process.env[k] = v;
}

const PORT = Number(process.env.PORT || 5000);
const SUPERADMIN_ID = "f96eebda-658f-4535-b7a1-55249c6e4e84";

const { setupCompat } = await import("./lib/compat.mjs");
const { compileMatcher } = await import("./lib/route-table.mjs");
const { signToken } = await import("./lib/auth.mjs");
const { createPipeline } = await import("./lib/pipeline.mjs");
const { createServer } = await import("./lib/http-server.mjs");
const { createRateLimiter } = await import("./lib/rate-limit.mjs");
const { createAccessAdapter, createMysqlQuery } = await import("./lib/db-access.mjs");
const { createSessionStore } = await import("./lib/sessions.mjs");
const { sendSignInAlert } = await import("./lib/signin-alert.mjs");
const mysql = (await import("mysql2/promise")).default;

/** "30m" / "15m" / "3600" -> seconds. Matches JWT_EXPIRY in .env. */
function parseTtlSec(value, fallback) {
  if (!value) return fallback;
  const m = String(value).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[(m[2] || "s").toLowerCase()]);
}

const compat = setupCompat();
console.log(`[owned-engine] loaded ${Object.keys(compat.models).length} real models`);

// Point the real WS handlers at our owned WebSocket registry (@b/handler/Websocket).
const wsRegistryPath = join(HERE, "lib", "ws-registry.cjs");
compat.require("module-alias").addAlias("@b/handler/Websocket", wsRegistryPath);
const wsRegistry = compat.require(wsRegistryPath);

const pool = mysql.createPool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 10,
});
const access = createAccessAdapter({ query: createMysqlQuery(pool) });

const manifest = JSON.parse(readFileSync(join(HERE, "route-manifest.json"), "utf8"));
const routeTable = manifest.routes
  .filter((r) => r.method !== "WS")
  .map((r) => ({ ...r, matcher: compileMatcher(r.path) }));
console.log(`[owned-engine] serving ${routeTable.length} real routes`);

/* Session refresh. Without this the pipeline has no `refreshSession`, so its
   expired-token branch is dead code and a 30-minute-old access token is a hard
   401 with no way back — you are logged out and must sign in again, which is
   what a server restart looks like from the browser (the reload is when the
   check happens). The sessions live in Redis for 14 days and are written by the
   real login handler, so the recovery data was always there; nothing read it. */
const Redis = compat.require("ioredis");
const sessionRedis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
  maxRetriesPerRequest: 2,
});
sessionRedis.on("error", (err) =>
  console.warn(`[owned-engine] session redis error: ${err.message}`)
);

const accessTtlSec = parseTtlSec(readEnv("JWT_EXPIRY"), 1800);
/* How long a session survives with NO activity. Slid forward on every use, so
   this is an idle timeout, not a hard cap on how long you may stay signed in. */
const idleTtlSec = parseTtlSec(process.env.SESSION_IDLE_TTL || readEnv("SESSION_IDLE_TTL"), 172800); // 48h
const sessions = createSessionStore({
  redis: sessionRedis,
  accessSecret: SECRET,
  loadUser: access.loadUser,
  accessTtlSec,
  idleTtlSec,
  secure: false, // local http
});
console.log(
  `[owned-engine] session refresh ACTIVE (access token ${accessTtlSec}s, idle logout ${Math.round(idleTtlSec / 3600)}h)`
);

const pipeline = createPipeline({
  routeTable,
  accessSecret: SECRET,
  loadUser: access.loadUser,
  loadPermissions: access.loadPermissions,
  loadRouteModule: async (route) => compat.loadHandler(route.source.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, "")),
  rateLimiter: createRateLimiter({ limit: 5000, windowMs: 60_000 }),
  refreshSession: sessions.refreshSession,
  onSignIn: (u, meta) => sendSignInAlert(compat, u, meta),
});

/* Create tables for models that have none yet. Additive only — see
   lib/ensure-tables.mjs for why this deliberately does not alter. */
try {
  const { ensureTables } = await import("./lib/ensure-tables.mjs");
  await ensureTables(compat);
} catch (err) {
  console.error(`[owned-engine] table check failed: ${err.message}`);
}

const server = createServer(pipeline);

// --- WebSocket serving (live charts / order updates) ---
const wsHandlers = {};
for (const r of manifest.routes.filter((x) => x.method === "WS")) {
  try {
    wsHandlers[r.path] = compat.loadHandler(r.source.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, ""));
  } catch { /* skip WS routes that can't load standalone */ }
}
const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => {
  const route = (req.url || "").split("?")[0];
  const mod = wsHandlers[route];
  if (!mod?.default) { ws.close(); return; }
  const id = randomUUID();
  wsRegistry.addClient(route, id, ws);
  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const rec = wsRegistry.clients.get(route)?.get(id);
    if (rec && msg?.payload) {
      if (msg.action === "SUBSCRIBE") rec.subscriptions.add(JSON.stringify(msg.payload));
      else if (msg.action === "UNSUBSCRIBE") rec.subscriptions.delete(JSON.stringify(msg.payload));
    }
    try { await mod.default({}, msg); } catch (e) { console.error(`[ws ${route}]`, e.message); }
  });
  ws.on("close", () => wsRegistry.removeClient(route, id));
});
console.log(`[owned-engine] WebSocket routes served: ${Object.keys(wsHandlers).join(", ") || "none"}`);

server.listen(PORT, async () => {
  const token = signToken({ sub: SUPERADMIN_ID }, SECRET, { expiresInSec: 3600 });
  console.log(`\n[owned-engine] YOUR ENGINE IS LIVE at http://127.0.0.1:${PORT}  (db: ${process.env.DB_NAME})\n`);
  console.log(`  public:  curl http://127.0.0.1:${PORT}/api/blog/category`);
  console.log(`  admin:   curl -H "Authorization: Bearer ${token}" http://127.0.0.1:${PORT}/api/user/profile`);
  if (process.env.PRINT_TOKEN) console.log(`\nADMIN_TOKEN=${token}`);

  // Settlement engine (opt-in: USE_OWNED_SETTLEMENT=1)
  if (process.env.USE_OWNED_SETTLEMENT === "1") {
    const { wireSettlement } = await import("./lib/settlement-boot.mjs");
    const settlement = wireSettlement(compat);
    await settlement.initializePendingOrders();
    settlement.startCron();
    console.log("[owned-engine] Settlement engine ACTIVE (owned)");
  }

  // Scheduled jobs (opt-in: USE_OWNED_CRON=1). The vendor server starts these
  // itself; the owned engine never did, so every background job stopped.
  if (process.env.USE_OWNED_CRON === "1") {
    try {
      const { wireCron } = await import("./lib/cron-boot.mjs");
      // The owned settlement engine already settles binary orders — letting the
      // vendor cron do it too would settle every order twice.
      const skip = process.env.USE_OWNED_SETTLEMENT === "1" ? ["processPendingOrders"] : [];
      const { started, skipped, failed } = await wireCron(compat, { skip });
      console.log(
        `[owned-engine] Cron ACTIVE — ${started.length} started` +
        `${skipped.length ? `, skipped: ${skipped.join(", ")}` : ""}` +
        `${failed.length ? `, FAILED: ${failed.join(", ")}` : ""}`
      );
    } catch (err) {
      console.error(`[owned-engine] Cron failed to start: ${err.message}`);
    }
  }

  // Deposit confirmation — always on. See boot.mjs for why this is not optional.
  try {
    const { wireDepositSweeper } = await import("./lib/deposit-sweeper.mjs");
    wireDepositSweeper(compat).start();
  } catch (err) {
    console.error(`[owned-engine] Deposit sweeper failed to start: ${err.message}`);
  }

  console.log(`\n  Ctrl+C to stop.\n`);
});
