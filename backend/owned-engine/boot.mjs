/**
 * Boot entry point — called from backend/index.ts when USE_OWNED_ENGINE=1.
 *
 * Assumes dotenv and module-alias are already configured by the caller.
 * Starts the owned engine (pipeline + WebSocket serving) on the given port.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";

const HERE = dirname(fileURLToPath(import.meta.url));

import { setupCompat } from "./lib/compat.mjs";
import { compileMatcher } from "./lib/route-table.mjs";
import { signToken } from "./lib/auth.mjs";
import { createPipeline } from "./lib/pipeline.mjs";
import { createServer } from "./lib/http-server.mjs";
import { createRateLimiter } from "./lib/rate-limit.mjs";
import { createAccessAdapter, createMysqlQuery } from "./lib/db-access.mjs";
import { createSessionStore } from "./lib/sessions.mjs";
import { sendSignInAlert } from "./lib/signin-alert.mjs";

const mysql = (await import("mysql2/promise")).default;

/** "30m" / "15m" / "3600" -> seconds. Matches JWT_EXPIRY in .env. */
function parseTtlSec(value, fallback) {
  if (!value) return fallback;
  const m = String(value).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  return n * ({ s: 1, m: 60, h: 3600, d: 86400 }[(m[2] || "s").toLowerCase()]);
}

export async function boot(port) {
  const SECRET = process.env.APP_ACCESS_TOKEN_SECRET;
  if (!SECRET) throw new Error("APP_ACCESS_TOKEN_SECRET is required");

  const compat = setupCompat();
  console.log(`[owned-engine] loaded ${Object.keys(compat.models).length} real models`);

  const wsRegistryPath = join(HERE, "lib", "ws-registry.cjs");
  compat.require("module-alias").addAlias("@b/handler/Websocket", wsRegistryPath);
  const wsRegistry = compat.require(wsRegistryPath);

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "v4",
    connectionLimit: 10,
  });
  const access = createAccessAdapter({ query: createMysqlQuery(pool) });

  const manifest = JSON.parse(readFileSync(join(HERE, "route-manifest.json"), "utf8"));
  const routeTable = manifest.routes
    .filter((r) => r.method !== "WS")
    .map((r) => ({ ...r, matcher: compileMatcher(r.path) }));
  console.log(`[owned-engine] serving ${routeTable.length} real routes`);

  /* Session refresh — see the same block in serve.mjs. Without it the
     pipeline's expired-token branch never runs and a 30-minute-old access
     token logs the user out for good. */
  const Redis = compat.require("ioredis");
  const sessionRedis = new Redis({
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 2,
  });
  sessionRedis.on("error", (err) =>
    console.warn(`[owned-engine] session redis error: ${err.message}`)
  );

  const accessTtlSec = parseTtlSec(process.env.JWT_EXPIRY, 1800);
  /* Idle timeout, slid forward on every use — see lib/sessions.mjs. Being away
     from the screen must not sign a trader out; being away for two days should. */
  const idleTtlSec = parseTtlSec(process.env.SESSION_IDLE_TTL, 172800); // 48h
  const sessions = createSessionStore({
    redis: sessionRedis,
    accessSecret: SECRET,
    loadUser: access.loadUser,
    accessTtlSec,
    idleTtlSec,
    secure: process.env.NODE_ENV === "production",
  });
  console.log(
    `[owned-engine] session refresh ACTIVE (access token ${accessTtlSec}s, idle logout ${Math.round(idleTtlSec / 3600)}h)`
  );

  const pipeline = createPipeline({
    routeTable,
    accessSecret: SECRET,
    loadUser: access.loadUser,
    loadPermissions: access.loadPermissions,
    loadRouteModule: async (route) =>
      compat.loadHandler(route.source.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, "")),
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

  const wsHandlers = {};
  for (const r of manifest.routes.filter((x) => x.method === "WS")) {
    try {
      wsHandlers[r.path] = compat.loadHandler(
        r.source.replace(/^backend\/dist\/src\//, "").replace(/\.js$/, "")
      );
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
  console.log(`[owned-engine] WebSocket routes: ${Object.keys(wsHandlers).join(", ") || "none"}`);

  await new Promise((resolve) => {
    server.listen(port, () => {
      console.log(
        `\n[owned-engine] LIVE at http://127.0.0.1:${port}  (db: ${process.env.DB_NAME || "v4"})\n`
      );
      resolve(undefined);
    });
  });

  // Settlement engine (opt-in: USE_OWNED_SETTLEMENT=1)
  if (process.env.USE_OWNED_SETTLEMENT === "1") {
    const { wireSettlement } = await import("./lib/settlement-boot.mjs");
    const settlement = wireSettlement(compat);
    await settlement.initializePendingOrders();
    settlement.startCron();
    console.log("[owned-engine] Settlement engine ACTIVE (owned)");
  }

  // Scheduled jobs (opt-in: USE_OWNED_CRON=1) — see lib/cron-boot.mjs. Without
  // this the vendor's 33 background jobs never start under the owned engine.
  if (process.env.USE_OWNED_CRON === "1") {
    try {
      const { wireCron } = await import("./lib/cron-boot.mjs");
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

  /* Deposit confirmation. Always on: a trader who has already paid is owed
     their balance, and there is no configuration under which we would rather
     leave that money uncredited. With no exchange keys configured the sweep is
     harmless — every check returns "unknown" and the deposits wait for an
     operator, which is where they would have waited anyway. */
  try {
    const { wireDepositSweeper } = await import("./lib/deposit-sweeper.mjs");
    wireDepositSweeper(compat).start();
  } catch (err) {
    console.error(`[owned-engine] Deposit sweeper failed to start: ${err.message}`);
  }

  return server;
}
