import ExchangeManager from "@b/utils/exchange";
// /server/api/exchange/binary/orders/store.post.ts

import { models, sequelize } from "@b/db";
import { Op, literal } from "sequelize";
import { createError } from "@b/utils/error";
import { sendBinaryOrderEmail } from "@b/utils/emails";
import { getBinaryOrder, getBinaryOrdersByStatus } from "./utils";
import Redis from "ioredis";
import { getBinarySettings } from "@b/utils/binary-settings-cache";
import { BinaryOrderService } from "@b/api/exchange/binary/order/util/BinaryOrderService";
import { writeAuditLog, captureException } from "./util/audit";

export const orderIntervals = new Map<string, NodeJS.Timeout>();

// ── Durable settlement safety net ──────────────────────────────────────────
// The in-memory setTimeout timers used for fast settlement (see
// startOrderMonitoring) are lost whenever the process restarts (deploy, crash,
// nodemon reload). This sweeper re-settles any PENDING order that is past its
// expiry using the framework's Redlock-protected, idempotent processor, so a
// restart can never leave a trade stuck (neither paid nor refunded). It runs a
// boot-recovery pass shortly after load, then on a fixed interval. Redlock
// makes it safe to run alongside the per-order timers and any framework cron.
let __binarySweeperStarted = false;
function startBinarySettlementSweeper() {
  if (__binarySweeperStarted) return;
  __binarySweeperStarted = true;
  const sweep = async () => {
    try {
      await BinaryOrderService.processPendingOrders(false);
    } catch (err: any) {
      captureException(err, { path: "binary.settlement.sweep" });
      console.error("[Binary Settlement Sweeper] sweep failed:", err?.message || err);
    }
  };
  setTimeout(sweep, 8000); // boot-recovery pass (allow DB/Redis to be ready)
  setInterval(sweep, 30000); // periodic safety net
}
startBinarySettlementSweeper();

const binaryStatus = process.env.NEXT_PUBLIC_BINARY_STATUS !== "false";
const binaryProfit = parseFloat(process.env.NEXT_PUBLIC_BINARY_PROFIT || "87");
let otcTimeOffset = 0;

/**
 * Shortest tradeable expiry, in seconds. Sub-minute expiries (5s/10s/15s/30s) are
 * disabled; the terminal omits them from its preset grid and clamps its stepper,
 * and this endpoint rejects anything shorter so the API cannot be used to bypass
 * the UI. Mirrors MIN_TRADE_DURATION_SECONDS in the frontend binary store.
 */
const MIN_TRADE_DURATION_SECONDS = 60;
/** Slack for request latency and client/server clock skew on the check above. */
const EXPIRY_SKEW_TOLERANCE_SECONDS = 5;
/**
 * CLOCK-mode expiries must have at least 26 seconds remaining to prevent
 * sub-30-second trades. Standard 30-second client-side bump leaves at least 30s
 * on the clock; 4s buffer absorbs network transit latency and clock skew.
 */
const MIN_CLOCK_EXPIRY_SECONDS = 26;

/**
 * Account levels and the stake ceiling each one carries, in USDT.
 *
 * Mirrors TIERS in frontend/app/[locale]/terminal/lib/account-tiers.tsx. The
 * terminal clamps its amount input to the same numbers, but the clamp is only a
 * convenience — the ceiling is enforced here because the endpoint takes `amount`
 * straight from the request body and nothing stops a crafted call from asking for
 * 50,000 on a Basic account.
 *
 * The level is derived from the trader's REAL balance even for demo orders, so the
 * ceiling matches the level the header and the Account Levels modal display.
 */
const ACCOUNT_LEVELS = [
  { key: "elite", name: "Elite", minBalanceUsd: 12000, maxTradeUsd: 3000 },
  { key: "advanced", name: "Advanced", minBalanceUsd: 5000, maxTradeUsd: 2000 },
  { key: "basic", name: "Basic", minBalanceUsd: 0, maxTradeUsd: 1000 },
] as const;

function accountLevelFor(realBalanceUsd: number) {
  const bal = Number.isFinite(realBalanceUsd) ? realBalanceUsd : 0;
  return ACCOUNT_LEVELS.find((l) => bal >= l.minBalanceUsd) ?? ACCOUNT_LEVELS[ACCOUNT_LEVELS.length - 1];
}

/**
 * Real (non-demo) USDT balance for a user, following the same wallet-type
 * precedence createBinaryOrder uses when it charges the stake. Returns 0 when the
 * user has no wallet yet, which puts them on Basic — the most restrictive level —
 * rather than failing the order outright.
 */
async function getRealUsdtBalance(userId: string): Promise<number> {
  for (const type of ["SPOT", "FUNDING", "BINARY"]) {
    const w = await models.wallet.findOne({ where: { userId, currency: "USDT", type } });
    if (w) return Number((w as any).balance) || 0;
  }
  const any = await models.wallet.findOne({ where: { userId, currency: "USDT" } });
  return any ? Number((any as any).balance) || 0 : 0;
}

import { createRecordResponses } from "@b/utils/query";
import { createNotification as handleNotification } from "@b/utils/notifications";
import { sendMessageToRoute } from "@b/handler/Websocket";
// messageBroker is exported at runtime but absent from the module's types, so it
// is reached through the namespace. broadcastOrderCreated below degrades to a
// no-op if it is ever missing rather than breaking order placement.
import * as WebsocketHandler from "@b/handler/Websocket";
import { handleBanStatus, loadBanStatus, getOtcOrigin } from "../../utils";
import { processRewards } from "@b/utils/affiliate";

export const metadata: OperationObject = {
  summary: "Create Binary Order",
  operationId: "createBinaryOrder",
  tags: ["Binary", "Orders"],
  description: "Creates a new binary order for the authenticated user.",
  requestBody: {
    description: "Binary order data to be created.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            currency: { type: "string" },
            pair: { type: "string" },
            amount: { type: "number" },
            side: { type: "string" },
            closedAt: { type: "string" },
            isDemo: { type: "boolean" },
            type: { type: "string" },
            durationId: { type: "string" },
          },
        },
      },
    },
    required: true,
  },
  responses: createRecordResponses("Binary Order"),
  requiresAuth: true,
};

function applyAdjustment(percentage: number, adjustment: number): number {
  return adjustment === 0 ? percentage : Math.round(percentage * (1 + adjustment / 100));
}

function calculateCumulativeAdjustments(durations: any[]) {
  const sorted = [...durations].sort((a, b) => a.minutes - b.minutes);
  const cumulative = {
    RISE_FALL: 0,
    HIGHER_LOWER: 0,
    TOUCH_NO_TOUCH: 0,
    CALL_PUT: 0,
    TURBO: 0,
  };
  const adjustmentsMap = new Map<string, typeof cumulative>();

  for (const duration of sorted) {
    const overrides = duration.orderTypeOverrides || {};
    for (const orderType of ["RISE_FALL", "HIGHER_LOWER", "TOUCH_NO_TOUCH", "CALL_PUT", "TURBO"] as const) {
      const adjustment = overrides[orderType]?.profitAdjustment || 0;
      if (adjustment !== 0) {
        cumulative[orderType] += adjustment;
      }
    }
    adjustmentsMap.set(duration.id, { ...cumulative });
  }
  return adjustmentsMap;
}

/**
 * Converts a Vortex OTC symbol (e.g. "AAPL/USD/OTC") to the BideX asset label
 * format used by the BideX chart API (e.g. "AAPL/USD (OTC)").
 */
function toBidexAsset(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith("/OTC")) return symbol.slice(0, -4) + " (OTC)";
  if (upper.includes("_OTC")) return symbol.replace(/_OTC/i, " (OTC)");
  return symbol + " (OTC)";
}

// Shared Redis connection for the hot order path. Reused across all orders
// instead of opening (and tearing down) a new TCP connection per request —
// under a burst of trades that connection churn was itself a source of latency.
// Reconnects lazily if the socket drops.
let _sharedRedis: Redis | null = null;
function getSharedRedis(): Redis {
  if (!_sharedRedis || _sharedRedis.status === "close" || _sharedRedis.status === "end") {
    _sharedRedis = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
      ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      lazyConnect: true,
    });
    _sharedRedis.on("error", () => { /* best-effort cache; swallow */ });
  }
  return _sharedRedis;
}

// Debounce background price refreshes so a burst of orders on one symbol
// triggers at most one external fetch every couple of seconds.
const _lastBgRefresh = new Map<string, number>();

/**
 * Fetches the live BideX chart price and writes it to Redis. Blocking (used on
 * a cold cache miss) and also called fire-and-forget to keep the cache warm.
 * Returns 0 on any failure (never throws) so callers can decide what to do.
 */
async function fetchBidexPriceAndCache(bidexAsset: string, redisKey: string): Promise<number> {
  try {
    const bidexUrl = (process.env.BIDEX_API_URL || process.env.BINDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
    const bidexApiKey = process.env.BIDEX_API_KEY;
    const now = Date.now();
    const res = await fetch(
      `${bidexUrl}/api/chart?asset=${encodeURIComponent(bidexAsset)}&interval=1&from=${now - 7200000}&to=${now + 7200000}`,
      {
        headers: {
          ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
          "Origin": getOtcOrigin(),
        },
        signal: AbortSignal.timeout(3000),
      }
    );
    if (res.ok) {
      const dateHeader = res.headers.get("Date");
      if (dateHeader) {
        otcTimeOffset = new Date(dateHeader).getTime() - Date.now();
        (global as any).otcTimeOffset = otcTimeOffset;
      }
      const result = await res.json();
      if (result?.data?.length > 0) {
        const price = Number(result.data[result.data.length - 1][4]); // close price
        if (price > 0) {
          getSharedRedis().set(redisKey, price.toString()).catch(() => {});
          getSharedRedis().set(`${redisKey}_ts`, String(Date.now())).catch(() => {});
          return price;
        }
      }
    }
  } catch (err) {
    console.warn(`[OTC Price] BideX API fetch error for ${bidexAsset}:`, (err as any).message);
  }
  return 0;
}

// Non-blocking, debounced cache warm — never delays an order.
function refreshOtcPriceInBackground(bidexAsset: string, redisKey: string): void {
  const now = Date.now();
  if (now - (_lastBgRefresh.get(bidexAsset) || 0) < 2000) return;
  _lastBgRefresh.set(bidexAsset, now);
  fetchBidexPriceAndCache(bidexAsset, redisKey).catch(() => {});
}

/**
 * Resolves the current OTC market price for an order.
 * Primary source: Redis `otc:<asset>:last_price` — the live feed the market
 *   WebSocket writes on every tick and the same source settlement reads, so
 *   entry and exit stay consistent. This read is sub-millisecond and keeps the
 *   hot order path off any external network call.
 * Cold path: if Redis has no price yet (e.g. right after boot), fetch once from
 *   BideX. On a cache hit we also warm the cache in the background.
 */
/* Exported for the early-close handler, which has to resolve a live price the
   same way order entry does. Following the precedent set by index.del.ts, which
   already imports orderIntervals from here, rather than duplicating the Redis
   key probing and BideX fallback in a second place where they could drift. */
export async function fetchOtcCurrentPrice(symbol: string): Promise<number> {
  const bidexAsset = toBidexAsset(symbol);
  const redisKey = `otc:${bidexAsset}:last_price`;

  // ── 1. Redis first (instant) ──────────────────────────────────────────
  // The live-feed key format has historically varied ("EUR/USD (OTC)" vs
  // "EUR/USD"), so probe the known variants in a single round trip (the same
  // approach settlement uses) to maximise cache hits.
  const cleanSym = symbol.replace(/\s*\(OTC\)/gi, "").replace(/_OTC/gi, "").replace(/\/OTC/gi, "").trim();
  const priceKeys = [
    redisKey,
    `otc:${cleanSym} (OTC):last_price`,
    `otc:${cleanSym}:last_price`,
    `otc:${symbol}:last_price`,
  ];
  const tsKeys = priceKeys.map((k) => `${k}_ts`);
  const maxStaleMs = Number(process.env.OTC_PRICE_MAX_STALE_MS || 120000);
  const allowStaleEntry = process.env.OTC_ALLOW_STALE_ENTRY !== "false";
  let stalePrice = 0; // best cached value found
  try {
    // One round trip fetches every price variant AND its freshness timestamp.
    const all = await getSharedRedis().mget(...priceKeys, ...tsKeys);
    const now = Date.now();
    for (let i = 0; i < priceKeys.length; i++) {
      const v = all[i];
      if (!v) continue;
      const price = parseFloat(v);
      if (!(price > 0)) continue;
      const tsRaw = all[priceKeys.length + i];
      const age = tsRaw ? now - Number(tsRaw) : Infinity;
      if (age <= maxStaleMs) {
        refreshOtcPriceInBackground(bidexAsset, redisKey); // fresh — keep cache warm, non-blocking
        return price;
      }
      if (!stalePrice) stalePrice = price; // remember cached price
    }
  } catch (err) {
    console.warn(`[OTC Price] Redis read failed for ${symbol}:`, (err as any).message);
  }

  // ── 2. No FRESH cached price — fetch a fresh one from BideX (blocking, rare) ──
  const fresh = await fetchBidexPriceAndCache(bidexAsset, redisKey);
  if (fresh > 0) {
    console.log(`[OTC Price] Fresh fetch from BideX for ${symbol} (${bidexAsset}): ${fresh}`);
    return fresh;
  }

  // ── 3. Feed is unreachable AND the cache is older than maxStaleMs.
  //       Fallback to cached price to ensure orders are never halted.
  if (stalePrice > 0) {
    if (allowStaleEntry) {
      console.warn(`[OTC Price] Using cached price for ${symbol}: ${stalePrice}`);
      getSharedRedis().set(`${redisKey}_ts`, String(Date.now())).catch(() => {});
      return stalePrice;
    }
    throw createError({
      statusCode: 503,
      message: "Market data is temporarily unavailable (stale price feed). Order halted — please try again shortly.",
    });
  }

  throw new Error(`No price data found for ${symbol}`);
}

async function getOtcConfig(symbol: string) {
  if (!symbol || !symbol.toUpperCase().includes("OTC")) return null;
  const bidexSymbol = symbol.toUpperCase().endsWith("/OTC")
    ? symbol.slice(0, -4) + " (OTC)"
    : symbol.replace("_OTC", " (OTC)");
  const normalizedSymbol = bidexSymbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();

  const otcRedis = getSharedRedis();
  try {
    const configStr = await otcRedis.get(`otc:pair:config:${normalizedSymbol}`);
    if (!configStr) return null;
    const config = JSON.parse(configStr);

    let payout = config.roi_configuration?.base_payout_percentage ?? 0.82;
    if (config.roi_configuration?.mode === 'DYNAMIC') {
      const exposureStr = await otcRedis.get(`otc:exposure:${normalizedSymbol}`);
      if (exposureStr) {
        const exposure = JSON.parse(exposureStr);
        const totalCalls = exposure.total_call_volume_usd || 0;
        const totalPuts = exposure.total_put_volume_usd || 0;
        const threshold = config.roi_configuration?.exposure_threshold_usd || 15000;
        const diff = Math.abs(totalCalls - totalPuts);
        if (diff > threshold) {
          const excess = diff - threshold;
          const reduction = Math.min(0.2, (excess / threshold) * 0.05); // max 20% reduction
          payout = Math.max(config.roi_configuration?.minimum_allowed_payout || 0.55, payout - reduction);
        }
      }
    }
    return {
      payout: Math.round(payout * 100), // convert e.g. 0.82 to 82
      status: config.status === 'ACTIVE'
    };
  } catch (error) {
    console.error("[OTC Config Bridge Error]:", error);
    return null;
  }
}

export default async (data: Handler) => {
  if (!binaryStatus) {
    throw createError({
      statusCode: 400,
      message: "Binary trading is disabled",
    });
  }

  const { user, body } = data;
  if (!user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });

  const { currency, pair, amount, side, type, closedAt, isDemo, durationId, symbol: bodySymbol, price: clientPrice } = body || {};

  // Fetch market data
  let market = (await models.exchangeMarket.findOne({
    where: { currency, pair },
  })) as unknown as any;

  if (!market) {
    const binaryMarket = await models.binaryMarket.findOne({
      where: { currency, pair },
    });
    if (!binaryMarket) {
      throw new Error("Market data not found");
    }
    market = {
      ...binaryMarket.get({ plain: true }),
      metadata: null,
    };
  }

  let minAmount = 1;
  let maxAmount = 1000000;

  try {
    const settings = await getBinarySettings();
    if (settings?.global?.minOrderAmount !== undefined) {
      minAmount = Number(settings.global.minOrderAmount);
    }
    if (settings?.global?.maxOrderAmount !== undefined) {
      maxAmount = Number(settings.global.maxOrderAmount);
    }
  } catch (e) {
    // fallback to default
  }

  if (market.metadata?.limits?.amount?.min !== undefined && market.metadata?.limits?.amount?.min !== null) {
    minAmount = Number(market.metadata.limits.amount.min);
  }
  if (market.metadata?.limits?.amount?.max !== undefined && market.metadata?.limits?.amount?.max !== null) {
    maxAmount = Number(market.metadata.limits.amount.max);
  }

  if (amount < minAmount || amount > maxAmount) {
    throw new Error(
      `Amount must be between ${minAmount} and ${maxAmount} ${currency}`
    );
  }

  // ── Per-position stake ceiling by account level ───────────────────────────
  // Basic 1,000 / Advanced 2,000 / Elite 3,000 USDT on a single position. Checked
  // against the real balance so the ceiling is the one the trader sees on their
  // account level, and applied to demo orders too so demo practice matches live.
  {
    const realBalance = await getRealUsdtBalance(user.id);
    const level = accountLevelFor(realBalance);
    if (Number(amount) > level.maxTradeUsd) {
      throw createError({
        statusCode: 400,
        message:
          `Maximum ${level.maxTradeUsd.toLocaleString("en-US")} USDT per position on the ` +
          `${level.name} account level.`,
      });
    }
  }

  // ── Minimum expiry ────────────────────────────────────────────────────────
  // Sub-minute *durations* are disabled. The terminal no longer offers them, but
  // closedAt arrives from the client, so without a check here a crafted request
  // could still open a 5-second position.
  //
  // The floor must not apply to CLOCK-mode expiries. There the trader picks a wall
  // clock time, so selecting 16:10 at 16:09:20 is a legitimate 40-second position
  // and has to be accepted immediately. The client already rolls a 1-minute clock
  // expiry forward by a minute when fewer than 30 seconds remain
  // (calculateNextExpiryTime), so that path settles at 30-90s on its own.
  //
  // The two modes are told apart from the timestamp rather than a client flag,
  // which nothing stops a crafted request from lying about: calculateNextExpiryTime
  // zeroes seconds and milliseconds, so a CLOCK expiry always lands exactly on a
  // minute boundary, while a DURATION expiry is now + N seconds and effectively
  // never does. Minute boundaries coincide across timezones, so testing the epoch
  // is sound. A duration order that happens to land on a boundary is >= 60s anyway
  // and clears either floor.
  //
  // For OTC symbols closedAt is expressed in BideX server time, which runs ahead
  // of ours, so it has to be compared against the same shifted clock
  // startOrderMonitoring settles on — otherwise every OTC order looks ~44 minutes
  // long and nothing is ever rejected.
  {
    const closeMs = new Date(closedAt).getTime();
    if (!Number.isFinite(closeMs)) {
      throw createError({ statusCode: 400, message: "Invalid expiry time" });
    }
    const symbolForOtc = `${String(bodySymbol ?? "")} ${currency} ${pair}`.toUpperCase();
    const isOtcSymbol = symbolForOtc.includes("OTC");
    let nowMs = Date.now();
    const otcOffset = (global as any).otcTimeOffset || otcTimeOffset || 0;
    if (isOtcSymbol && otcOffset !== 0) {
      nowMs += otcOffset;
    }
    const secondsToExpiry = (closeMs - nowMs) / 1000;
    const isClockExpiry = closeMs % 60000 === 0;

    if (isClockExpiry) {
      // Only guard against an expiry that is already past or settles instantly.
      if (secondsToExpiry < MIN_CLOCK_EXPIRY_SECONDS) {
        throw createError({
          statusCode: 400,
          message: "Selected expiry time has already passed",
        });
      }
    } else if (
      // Tolerance absorbs request latency and client/server clock skew so a genuine
      // 60s order isn't rejected for arriving with 58s left.
      secondsToExpiry < MIN_TRADE_DURATION_SECONDS - EXPIRY_SKEW_TOLERANCE_SECONDS
    ) {
      throw createError({
        statusCode: 400,
        message: `Minimum trade duration is ${MIN_TRADE_DURATION_SECONDS} seconds`,
      });
    }
  }

  // ── Idempotency: collapse accidental resubmits of the SAME click ──────────
  // The client sends a fresh key per intentional click, so N distinct clicks
  // still create N trades; only exact resubmits of one click (double-fire,
  // network retry) are deduped. A missing key means no dedup (backward compatible).
  const idemKeyRaw = (
    data.headers?.["idempotency-key"] ??
    data.headers?.["Idempotency-Key"] ??
    body?.idempotencyKey ??
    ""
  ).toString().trim().slice(0, 128);
  const idemRedisKey = idemKeyRaw ? `idem:binary:${user.id}:${idemKeyRaw}` : null;
  if (idemRedisKey) {
    let claimed: any = "OK";
    try {
      claimed = await (getSharedRedis().set as any)(idemRedisKey, "PENDING", "EX", 90, "NX");
    } catch {
      claimed = "OK"; // Redis down => fail open; the atomic balance charge still prevents overspend
    }
    if (claimed === null) {
      // Same key already seen — a duplicate submit, not a new trade.
      writeAuditLog({ action: "BINARY_ORDER_DUPLICATE", userId: user.id, detail: idemKeyRaw });
      let prior: string | null = null;
      try { prior = await getSharedRedis().get(idemRedisKey); } catch {}
      if (prior && prior !== "PENDING") {
        const priorOrder = await models.binaryOrder.findByPk(prior).catch(() => null);
        if (priorOrder) {
          return { order: priorOrder, message: "Duplicate order ignored (idempotent)" };
        }
      }
      throw createError({ statusCode: 409, message: "Duplicate order ignored (already processing)" });
    }
  }

  // Rapid multi-click coalescing: the client may send `batch: N` to create N
  // identical orders in a single request (so 100 trades cost 1 rate-limit hit,
  // not 100). batch <= 1 (or absent) falls through to the normal single path.
  const batchCount = Math.max(1, Math.min(100, Math.floor(Number(body?.batch) || 1)));

  try {
    // Check for ban status
    const unblockTime = await loadBanStatus();
    if (await handleBanStatus(unblockTime)) {
      throw createError({
        statusCode: 503,
        message: "Service temporarily unavailable. Please try again later.",
      });
    }

    if (batchCount > 1) {
      const orders = await createBinaryOrdersBatch(
        user.id,
        currency,
        pair,
        amount,
        side,
        type,
        closedAt,
        isDemo,
        durationId,
        bodySymbol,
        batchCount
      );
      // Record the batch under the idempotency key so an exact resubmit is deduped.
      if (idemRedisKey) {
        await getSharedRedis()
          .set(idemRedisKey, orders[0] ? String(orders[0].id) : "BATCH", "EX", 90)
          .catch(() => {});
      }
      return {
        orders,
        count: orders.length,
        batch: true,
        message: `${orders.length} binary orders created successfully`,
      };
    }

    const transaction = await createBinaryOrder(
      user.id,
      currency,
      pair,
      amount,
      side,
      type,
      closedAt,
      isDemo,
      durationId,
      bodySymbol,
      clientPrice
    );

    // Record the result under the idempotency key so an exact resubmit returns
    // this same order instead of creating a second one.
    if (idemRedisKey) {
      await getSharedRedis().set(idemRedisKey, String(transaction.id), "EX", 90).catch(() => {});
    }

    startOrderMonitoring(
      user.id,
      transaction.id,
      `${currency}/${pair}`,
      new Date(closedAt).getTime()
    );

    return {
      order: transaction,
      message: "Binary order created successfully",
    };
  } catch (error) {
    // This request owned the idempotency claim and then failed — release it so
    // a genuine retry can proceed. (Duplicate detection above returns/throws
    // before this try, so it never releases another request's claim.)
    if (idemRedisKey) {
      await getSharedRedis().del(idemRedisKey).catch(() => {});
    }
    captureException(error, {
      path: "binary.order.create",
      userId: user.id,
      currency,
      pair,
      amount,
      side,
      type,
    });
    throw new Error(error.message);
  }
};

export async function createBinaryOrder(
  userId: string,
  currency: string,
  pair: string,
  amount: number,
  side: "RISE" | "FALL",
  type: "RISE_FALL",
  closedAt: string,
  isDemo: boolean = false,
  durationId?: string,
  requestSymbol?: string,
  clientPrice?: number
): Promise<any> {
  // SECURITY: validate the amount as a finite positive number before any money math.
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Invalid amount");
  }
  let wallet: any;
  if (!isDemo) {
    // Find the user's USDT wallet — try SPOT first (most common), then FUNDING, then any type.
    // This ensures binary trading works regardless of which wallet type the user has.
    const walletCurrency = "USDT";
    const walletPriority = ["SPOT", "FUNDING", "BINARY"];
    for (const walletType of walletPriority) {
      wallet = await models.wallet.findOne({
        where: { userId, currency: walletCurrency, type: walletType },
      });
      if (wallet) break;
    }
    if (!wallet) {
      // Last resort: find any USDT wallet for this user
      wallet = await models.wallet.findOne({
        where: { userId, currency: walletCurrency },
      });
    }

    if (!wallet) {
      throw new Error("Wallet not found");
    }
    // NOTE: the balance is charged atomically inside a DB transaction at
    // order-creation time (see below), never via a read-modify-write here.
    // The old code (read balance -> subtract in JS -> write absolute value)
    // was a race condition: N concurrent orders all read the same balance and
    // all passed the check, letting a user open far more positions than funded.
  }

  const closeAtDate = new Date(closedAt);
  // SECURITY: the entry price is ALWAYS resolved server-side from the live feed
  // below. A client-supplied price is never trusted — accepting it would let a
  // user pick a guaranteed-win entry (e.g. price 0 on a CALL wins every time).
  void clientPrice; // intentionally ignored
  let price: number | undefined = undefined;
  const symbol = `${currency}/${pair}`;
  const effectiveSymbol = String(requestSymbol || symbol);
  const isOtcMarket = 
    effectiveSymbol.toUpperCase().includes("OTC") ||
    symbol.toUpperCase().includes("OTC") || 
    pair.toUpperCase().includes("OTC") || 
    currency.toUpperCase().includes("OTC");

  if (!price) {
    if (isOtcMarket) {
      // Use Redis as primary source (instant, <1ms), BideX API as fallback.
      // This ensures the order entry price is on-chart so the trade marker is visible.
      try {
        price = await fetchOtcCurrentPrice(symbol);
      } catch (err) {
        throw new Error("Error fetching OTC price data: " + (err as any).message);
      }
    } else {
    const exchange = await ExchangeManager.startExchange();
    if (!exchange) {
      throw createError({
        statusCode: 503,
        message: "Service temporarily unavailable. Please try again later.",
      });
    }

    try {
      // Check for ban status before fetching ticker
      const unblockTime = await loadBanStatus();
      if (await handleBanStatus(unblockTime)) {
        throw createError({
          statusCode: 503,
          message: "Service temporarily unavailable. Please try again later.",
        });
      }

      const ticker = await exchange.fetchTicker(symbol);
      price = ticker.last;
    } catch (error) {
      if (error?.statusCode === 503) {
        throw error;
      }
      throw new Error("Error fetching market data");
    }
  }
  }

  if (!price) {
    throw new Error("Error fetching ticker data");
  }

  // Fetch profit percentage dynamically
  let profit = binaryProfit;
  const otcConfig = await getOtcConfig(symbol);
  if (otcConfig) {
    profit = otcConfig.payout;
  } else {
    try {
      const settings = await getBinarySettings();
      const duration = settings.durations.find((d: any) => d.id === durationId);
      if (duration) {
        const baseProfit = settings.orderTypes[type]?.profitPercentage || binaryProfit;
        const adjustments = calculateCumulativeAdjustments(settings.durations);
        const adjustment = adjustments.get(duration.id)?.[type] || 0;
        profit = applyAdjustment(baseProfit, adjustment);
      }
    } catch (err) {
      console.warn("Failed to retrieve adjusted binary settings profit, using fallback:", err);
    }
  }

  const orderFields: any = {
    userId: userId,
    symbol: `${currency}/${pair}`,
    type: type,
    side: side,
    status: "PENDING",
    price: price,
    profit: profit,
    profitPercentage: profit,
    amount: amount,
    isDemo: isDemo,
    closedAt: closeAtDate,
  };

  let finalOrder: any;
  if (!isDemo) {
    // Charge the wallet and create the order + ledger row in ONE DB
    // transaction. The conditional decrement (balance >= amt) is atomic at the
    // database, so 100 concurrent CALL/PUT clicks are both fast AND correct:
    // exactly the funded number of positions open, no double-spend, no race.
    const dbTx = await sequelize.transaction();
    try {
      const [affected] = await models.wallet.update(
        { balance: literal(`balance - ${amt}`) } as any,
        { where: { id: wallet.id, balance: { [Op.gte]: amt } }, transaction: dbTx }
      );
      if (affected === 0) {
        writeAuditLog({
          action: "BINARY_ORDER_REJECTED_INSUFFICIENT_BALANCE",
          userId,
          walletId: wallet.id,
          currency,
          amount: amt,
          balanceBefore: Number(wallet.balance),
        });
        throw new Error("Insufficient balance");
      }
      finalOrder = await models.binaryOrder.create(orderFields, { transaction: dbTx });
      await models.transaction.create(
        {
          userId: userId,
          walletId: wallet.id,
          type: "BINARY_ORDER",
          status: "PENDING",
          amount: amount,
          fee: 0,
          description: `Binary Position | Market: ${currency}/${pair} | Amount: ${amount} USDT | Price: ${price} | Profit Margin: ${profit}% | Side: ${side} | Expiration: ${closedAt.toLocaleString()} | Type: Live Position`,
          referenceId: finalOrder.id,
        } as any,
        { transaction: dbTx }
      );
      await dbTx.commit();
      // Append-only audit record of the money movement (post-commit).
      writeAuditLog({
        action: "BINARY_ORDER_DEBIT",
        userId,
        walletId: wallet.id,
        orderId: finalOrder.id,
        currency,
        amount: amt,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance) - amt,
        side,
        type,
        price,
      });
    } catch (e) {
      await dbTx.rollback();
      throw e;
    }
  } else {
    finalOrder = await models.binaryOrder.create(orderFields);
  }

  startOrderMonitoring(userId, finalOrder.id, symbol, closeAtDate.getTime());

  broadcastOrderCreated(finalOrder);

  return finalOrder;
}

/**
 * Tells the account's other open sessions that a trade has just been placed.
 *
 * Only completion was ever broadcast — BinaryOrderService fires ORDER_COMPLETED
 * on WIN/LOSS/DRAW — so placing a trade on one device left every other device
 * showing nothing at all until it was reloaded. The trade was live, the money
 * was committed, and a second screen had no idea.
 *
 * The key matches the one the completion broadcast and the client subscription
 * already use: {type, symbol, userId}. Same shape, so an existing subscriber
 * receives this without any change to what it subscribes to.
 *
 * Never allowed to throw. A failed notification must not fail the trade — the
 * order is already committed, and the worst case without this is the behaviour
 * that existed before it.
 */
function broadcastOrderCreated(order: any) {
  try {
    if (!order?.userId || !order?.symbol) return;
    const broker = (WebsocketHandler as any)?.messageBroker;
    if (!broker?.broadcastToSubscribedClients) return;

    broker.broadcastToSubscribedClients(
      "/api/exchange/binary/order",
      { type: "order", symbol: order.symbol, userId: order.userId },
      { type: "ORDER_CREATED", order }
    );
  } catch (err) {
    console.error("[binary.order] failed to broadcast ORDER_CREATED:", err);
  }
}

/**
 * Batch variant of createBinaryOrder: creates N identical binary orders from a
 * SINGLE request. This is how rapid multi-clicks (e.g. tapping CALL 100 times)
 * are handled — the client coalesces them into one request so they cost ONE
 * rate-limit hit instead of 100, and the whole batch is charged + inserted in a
 * single atomic DB transaction (fast, all-or-nothing, no per-order round trips).
 *
 * All orders in a batch share the same server-resolved entry price (resolved
 * once here), profit, side, amount and expiry — exactly what "click the same
 * button N times" means. Mixed specs (different side/amount) are sent by the
 * client as separate batches.
 */
export async function createBinaryOrdersBatch(
  userId: string,
  currency: string,
  pair: string,
  amount: number,
  side: "RISE" | "FALL",
  type: "RISE_FALL",
  closedAt: string,
  isDemo: boolean = false,
  durationId?: string,
  requestSymbol?: string,
  count: number = 1
): Promise<any[]> {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");
  // Bound the batch size defensively (the client also caps this).
  const n = Math.max(1, Math.min(100, Math.floor(Number(count) || 1)));

  let wallet: any;
  if (!isDemo) {
    const walletCurrency = "USDT";
    const walletPriority = ["SPOT", "FUNDING", "BINARY"];
    for (const walletType of walletPriority) {
      wallet = await models.wallet.findOne({
        where: { userId, currency: walletCurrency, type: walletType },
      });
      if (wallet) break;
    }
    if (!wallet) {
      wallet = await models.wallet.findOne({
        where: { userId, currency: walletCurrency },
      });
    }
    if (!wallet) throw new Error("Wallet not found");
  }

  const closeAtDate = new Date(closedAt);
  // SECURITY: entry price is always resolved server-side (never client-supplied),
  // once for the whole batch.
  let price: number | undefined = undefined;
  const symbol = `${currency}/${pair}`;
  const effectiveSymbol = String(requestSymbol || symbol);
  const isOtcMarket =
    effectiveSymbol.toUpperCase().includes("OTC") ||
    symbol.toUpperCase().includes("OTC") ||
    pair.toUpperCase().includes("OTC") ||
    currency.toUpperCase().includes("OTC");

  if (isOtcMarket) {
    try {
      price = await fetchOtcCurrentPrice(symbol);
    } catch (err) {
      throw new Error("Error fetching OTC price data: " + (err as any).message);
    }
  } else {
    const exchange = await ExchangeManager.startExchange();
    if (!exchange) {
      throw createError({ statusCode: 503, message: "Service temporarily unavailable. Please try again later." });
    }
    try {
      const unblockTime = await loadBanStatus();
      if (await handleBanStatus(unblockTime)) {
        throw createError({ statusCode: 503, message: "Service temporarily unavailable. Please try again later." });
      }
      const ticker = await exchange.fetchTicker(symbol);
      price = ticker.last;
    } catch (error) {
      if ((error as any)?.statusCode === 503) throw error;
      throw new Error("Error fetching market data");
    }
  }
  if (!price) throw new Error("Error fetching ticker data");

  // Resolve profit once for the batch (same as single path).
  let profit = binaryProfit;
  const otcConfig = await getOtcConfig(symbol);
  if (otcConfig) {
    profit = otcConfig.payout;
  } else {
    try {
      const settings = await getBinarySettings();
      const duration = settings.durations.find((d: any) => d.id === durationId);
      if (duration) {
        const baseProfit = settings.orderTypes[type]?.profitPercentage || binaryProfit;
        const adjustments = calculateCumulativeAdjustments(settings.durations);
        const adjustment = adjustments.get(duration.id)?.[type] || 0;
        profit = applyAdjustment(baseProfit, adjustment);
      }
    } catch (err) {
      console.warn("Failed to retrieve adjusted binary settings profit, using fallback:", err);
    }
  }

  const orderFieldsBase = {
    userId,
    symbol,
    type,
    side,
    status: "PENDING",
    price,
    profit,
    profitPercentage: profit,
    amount,
    isDemo,
    closedAt: closeAtDate,
  };

  let created: any[] = [];
  if (!isDemo) {
    const total = amt * n;
    // ONE atomic transaction for the whole batch: charge the total once
    // (conditional on balance >= total, so it's race-safe and all-or-nothing),
    // then bulk-insert the N orders and their ledger rows.
    const dbTx = await sequelize.transaction();
    try {
      const [affected] = await models.wallet.update(
        { balance: literal(`balance - ${total}`) } as any,
        { where: { id: wallet.id, balance: { [Op.gte]: total } }, transaction: dbTx }
      );
      if (affected === 0) {
        writeAuditLog({
          action: "BINARY_ORDER_BATCH_REJECTED_INSUFFICIENT_BALANCE",
          userId,
          walletId: wallet.id,
          currency,
          amount: amt,
          count: n,
          total,
          balanceBefore: Number(wallet.balance),
        });
        throw new Error("Insufficient balance");
      }
      const orderRows = Array.from({ length: n }, () => ({ ...orderFieldsBase }));
      created = await models.binaryOrder.bulkCreate(orderRows as any, { transaction: dbTx });
      const txnRows = created.map((o: any) => ({
        userId,
        walletId: wallet.id,
        type: "BINARY_ORDER",
        status: "PENDING",
        amount,
        fee: 0,
        description: `Binary Position | Market: ${symbol} | Amount: ${amount} USDT | Price: ${price} | Profit Margin: ${profit}% | Side: ${side} | Expiration: ${closedAt} | Type: Live Position`,
        referenceId: o.id,
      }));
      await models.transaction.bulkCreate(txnRows as any, { transaction: dbTx });
      await dbTx.commit();
      writeAuditLog({
        action: "BINARY_ORDER_BATCH_DEBIT",
        userId,
        walletId: wallet.id,
        currency,
        amount: amt,
        count: created.length,
        total,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance) - total,
        side,
        type,
        price,
      });
    } catch (e) {
      await dbTx.rollback();
      throw e;
    }
  } else {
    const orderRows = Array.from({ length: n }, () => ({ ...orderFieldsBase }));
    created = await models.binaryOrder.bulkCreate(orderRows as any);
  }

  for (const o of created) {
    startOrderMonitoring(userId, o.id, symbol, closeAtDate.getTime());
    // Rapid clicks are coalesced into one request, so without this a burst of
    // trades would be invisible on the account's other screens.
    broadcastOrderCreated(o);
  }
  return created;
}

function startOrderMonitoring(
  userId: string,
  id: string,
  symbol: string,
  closedAt: number
) {
  let currentTimeUtc = new Date().getTime();
  let offset = (global as any).otcTimeOffset || otcTimeOffset || 0;
  if (symbol.toUpperCase().includes("OTC") && offset === 0) {
    const diff = closedAt - currentTimeUtc;
    // BideX is 44 mins ahead, so order closedAt (BideX time) is ~44 mins + duration ahead of real time.
    // If the difference is between 40 minutes (2400000ms) and 3 hours (10800000ms),
    // we auto-detect it and set the default offset.
    if (diff > 2400000 && diff < 10800000) {
      offset = 2645000;
      (global as any).otcTimeOffset = 2645000;
      console.log(`[OTC Time Sync] Auto-detected BideX offset: ${offset}ms from order closedAt`);
    }
  }
  if (symbol.toUpperCase().includes("OTC") && offset !== 0) {
    currentTimeUtc += offset;
  }
  const delay = closedAt - currentTimeUtc;

  console.log(`[Binary Order Monitor] Scheduling order ${id} processing with delay ${delay}ms (BideX time: ${new Date(closedAt).toISOString()}, Backend adjusted time: ${new Date(currentTimeUtc).toISOString()})`);

  const timer = setTimeout(() => {
    processOrder(userId, id, symbol);
  }, delay);

  orderIntervals.set(id, timer);
}

async function processOrder(userId: string, id: string, symbol: string) {
  try {
    await BinaryOrderService.processOrder(userId, id, symbol);
    orderIntervals.delete(id);
  } catch (error) {
    console.error(`Error processing order ${id}: ${error}`);
  }
}
