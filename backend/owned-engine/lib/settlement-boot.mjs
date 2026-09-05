/**
 * Settlement boot adapter — wires real dependencies into createSettlementService.
 *
 * Called by boot.mjs / serve.mjs when USE_OWNED_SETTLEMENT=1.
 * Gathers all I/O deps (Sequelize, walletService, Redis, CCXT, etc.) via
 * compat.require() and builds the adapter functions (fetchClosePrice,
 * fetchOHLCV, acquireLock) the settlement engine expects.
 */

import { createSettlementService } from "./settlement-engine.mjs";

const OTC_REDIS_CONNECT_TIMEOUT = 1000;
const OTC_REDIS_MAX_RETRIES = 1;

function isOTC(symbol) {
  return symbol.toUpperCase().includes("OTC");
}

function cleanOTCSymbol(symbol) {
  return symbol
    .replace(/\s*\(OTC\)/gi, "")
    .replace(/_OTC/gi, "")
    .replace(/\/OTC/gi, "")
    .trim();
}

/**
 * Build a fetchClosePrice(symbol, closedAt) adapter.
 *
 * OTC path:  tries 3 Redis key patterns for last_price, then falls back to
 *            Redis sorted-set candle history, then to CCXT ticker.
 * Non-OTC:   CCXT fetchTicker → ticker.last.
 */
function buildFetchClosePrice({ Redis, logger, getExchange }) {
  return async function fetchClosePrice(symbol, closedAt) {
    // OTC symbols — try Redis last_price keys first
    if (isOTC(symbol)) {
      let otcRedis;
      try {
        otcRedis = new Redis({
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
          maxRetriesPerRequest: OTC_REDIS_MAX_RETRIES,
          connectTimeout: OTC_REDIS_CONNECT_TIMEOUT,
        });
        const cleanSym = cleanOTCSymbol(symbol);
        const pStr1 = await otcRedis.get("otc:" + cleanSym + " (OTC):last_price");
        const pStr2 = await otcRedis.get("otc:" + cleanSym + ":last_price");
        const pStr3 = await otcRedis.get("otc:" + symbol + ":last_price");
        const pStr = pStr1 || pStr2 || pStr3;
        if (pStr) {
          const p = parseFloat(pStr);
          if (!isNaN(p) && p > 0) return p;
        }
      } catch (err) {
        logger.error("BINARY", "Error fetching OTC price: " + err.message);
      } finally {
        if (otcRedis) await otcRedis.quit().catch(() => {});
      }
    }

    // Non-OTC or OTC fallback — CCXT ticker
    try {
      const exchange = await getExchange();
      if (exchange) {
        const ticker = await exchange.fetchTicker(symbol);
        if (ticker?.last != null && ticker.last > 0) return ticker.last;
      }
    } catch (err) {
      logger.error("BINARY", `Error fetching ticker for ${symbol}: ${err.message}`);
    }

    return null;
  };
}

/**
 * Build a fetchOHLCV(symbol, since, until) adapter.
 *
 * OTC path:  Redis sorted set `otc:history:<SYMBOL_NO_SLASH>` with zrangebyscore.
 * Non-OTC:   CCXT exchange.fetchOHLCV(symbol, "1m", since, limit).
 *
 * Returns standard OHLCV arrays: [timestamp, open, high, low, close, volume].
 */
function buildFetchOHLCV({ Redis, logger, getExchange }) {
  return async function fetchOHLCV(symbol, since, until) {
    const sinceMs = since instanceof Date ? since.getTime() : Number(since);
    const untilMs = until instanceof Date ? until.getTime() : Number(until);

    if (isOTC(symbol)) {
      let otcRedis;
      try {
        otcRedis = new Redis({
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
          maxRetriesPerRequest: OTC_REDIS_MAX_RETRIES,
          connectTimeout: OTC_REDIS_CONNECT_TIMEOUT,
        });
        const redisSymbol = symbol.replace("/", "").toUpperCase();
        const rawCandles = await otcRedis.zrangebyscore(
          `otc:history:${redisSymbol}`,
          sinceMs,
          untilMs,
        );
        if (rawCandles?.length) {
          return rawCandles.map((raw) => {
            const c = JSON.parse(raw);
            return [
              Number(c.timestamp),
              parseFloat(c.open),
              parseFloat(c.high),
              parseFloat(c.low),
              parseFloat(c.close),
              parseFloat(c.volume || 0),
            ];
          });
        }
      } catch (err) {
        logger.error("BINARY", "Error fetching OTC OHLCV from Redis: " + err.message);
      } finally {
        if (otcRedis) await otcRedis.quit().catch(() => {});
      }
      return [];
    }

    // Non-OTC — CCXT
    try {
      const exchange = await getExchange();
      if (exchange) {
        const candles = await exchange.fetchOHLCV(symbol, "1m", sinceMs, 1000);
        if (candles?.length) {
          return candles.filter((c) => c[0] >= sinceMs && c[0] <= untilMs);
        }
      }
    } catch (err) {
      logger.error("BINARY", `Error fetching OHLCV for ${symbol}: ${err.message}`);
    }
    return [];
  };
}

/**
 * Build an acquireLock(key, ttl, fn) adapter wrapping Redlock.
 *
 * Redlock.acquire([key], ttl) returns a lock object; we run `fn`, then release.
 * If acquisition fails (another process holds it), we log and skip silently
 * (matches vendor behaviour — order already being processed elsewhere).
 */
function buildAcquireLock({ redlock, logger }) {
  return async function acquireLock(key, ttl, fn) {
    let lock;
    try {
      lock = await redlock.acquire([key], ttl);
    } catch (err) {
      logger.warn("BINARY", `Could not acquire lock for ${key}. Another process is handling it.`);
      return;
    }
    try {
      return await fn();
    } finally {
      try { await lock.release(); } catch { /* already released or expired */ }
    }
  };
}

/**
 * Wire all real dependencies and return a ready-to-use settlement service.
 *
 * @param {object} compat — from setupCompat()
 * @returns {{ service, initializePendingOrders, processPendingOrders, startCron, stopCron }}
 */
export function wireSettlement(compat) {
  const db = compat.require("@b/db");
  const { sequelize, models } = db;
  const { walletService } = compat.require("@b/services/wallet");
  const { redlock } = compat.require("@b/utils/redis");
  const { sendBinaryOrderEmail } = compat.require("@b/utils/emails");
  const { createNotification } = compat.require("@b/utils/notifications");
  const { createError } = compat.require("@b/utils/error");
  const { getBinarySettings } = compat.require("@b/utils/binary-settings-cache");
  const exchangeManager = compat.require("@b/utils/exchange").default || compat.require("@b/utils/exchange");

  const consoleModule = compat.require("@b/utils/console");

  // Build a logger matching the { info, warn, error } interface settlement expects
  const logger = {
    info: consoleModule.logInfo || consoleModule.logger?.info || console.log,
    warn: consoleModule.logWarn || consoleModule.logger?.warn || console.warn,
    error: consoleModule.logError || consoleModule.logger?.error || console.error,
  };

  // ws-registry is already aliased to @b/handler/Websocket by boot.mjs
  const messageBroker = compat.require("@b/handler/Websocket");

  // This file is an ES module — bare `require` is not defined here, which
  // crashed the boot the first time settlement was actually switched on.
  // compat.require is a real CJS require (createRequire), so it resolves
  // npm packages as well as the @b/* aliases used above.
  const Redis = compat.require("ioredis");

  let exchangeInstance = null;
  async function getExchange() {
    if (exchangeInstance) return exchangeInstance;
    try {
      exchangeInstance = await exchangeManager.startExchange();
    } catch (err) {
      logger.error("BINARY", `Failed to start exchange: ${err.message}`);
    }
    return exchangeInstance;
  }

  const fetchClosePrice = buildFetchClosePrice({ Redis, logger, getExchange });
  const fetchOHLCV = buildFetchOHLCV({ Redis, logger, getExchange });
  const acquireLock = buildAcquireLock({ redlock, logger });

  const service = createSettlementService({
    models,
    sequelize,
    walletService,
    messageBroker,
    sendBinaryOrderEmail,
    createNotification,
    createError,
    logger,
    getSettings: getBinarySettings,
    fetchClosePrice,
    fetchOHLCV,
    acquireLock,
  });

  let cronInterval = null;

  return {
    service,
    initializePendingOrders: () => service.initializePendingOrders(),
    processPendingOrders: () => service.processPendingOrders(),
    startCron(intervalMs = 60_000) {
      if (cronInterval) return;
      cronInterval = setInterval(() => {
        service.processPendingOrders().catch((err) => {
          logger.error("BINARY", `Cron processPendingOrders error: ${err.message}`);
        });
      }, intervalMs);
      if (cronInterval.unref) cronInterval.unref();
      logger.info("BINARY", `Settlement cron started (every ${intervalMs / 1000}s)`);
    },
    stopCron() {
      if (cronInterval) {
        clearInterval(cronInterval);
        cronInterval = null;
        logger.info("BINARY", "Settlement cron stopped");
      }
    },
  };
}
