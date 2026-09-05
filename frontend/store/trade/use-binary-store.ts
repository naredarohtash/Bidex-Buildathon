
let isSyncingOrders = false;
let lastSyncedOrdersSig = "";

export function syncOrdersToChartEngine(orders: Order[]) {
  if (typeof window === "undefined") return;
  if (isSyncingOrders) return;
  isSyncingOrders = true;
  try {
    const chartStore = (window as any).__chartStore?.getState?.() || (window as any).__useChartStore?.getState?.();
    if (chartStore && typeof chartStore.setOrders === "function") {
      // Only feed the chart the orders for the symbol it is CURRENTLY showing.
      // Without this, a trade placed on one asset draws its (blinking) zone and
      // re-triggers the order/countdown sounds on every other chart you switch
      // to, because the engine renders and sounds whatever order set it's given.
      const chartSymbol = chartStore.state?.symbol ?? chartStore.symbol ?? null;
      const activePending = orders
        // Only "PENDING": the lowercase spelling that used to be tested here
        // alongside it is not a status this system produces.
        .filter((o) => o.status === "PENDING")
        .filter((o) => !chartSymbol || isSameSymbol(o.symbol, chartSymbol))
        .map((o) => ({
          id: o.id,
          symbol: o.symbol,
          side: o.side,
          direction: o.side,
          price: o.entryPrice || (o as any).price || 0,
          entryPrice: o.entryPrice || (o as any).price || 0,
          amount: o.amount,
          status: "PENDING",
          createdAt: o.createdAt || Date.now(),
          entryTime: o.createdAt || Date.now(),
          expiryTime: o.expiryTime,
        }));
      // The store subscription fires on every state change (incl. each price
      // tick). Only push to the chart when the visible order set actually
      // changed, so the engine doesn't re-render/replay sounds every tick.
      const sig = `${chartSymbol ?? ""}|` + activePending.map((o) => `${o.id}:${o.status}:${o.expiryTime}`).join(",");
      if (sig !== lastSyncedOrdersSig) {
        lastSyncedOrdersSig = sig;
        chartStore.setOrders(activePending);
      }
    }
  } finally {
    isSyncingOrders = false;
  }
}
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import {
  getChartSynchronizedTime,
  calculateNextExpiryTime,
} from "@/utils/time-sync";
import { $fetch } from "@/lib/api";
import { toast } from "sonner";
import { useUserStore } from "@/store/user";
import { isGuestNow, isGuestSessionExpired } from "@/lib/guest/guest-runtime";
import { settleGuestOrder } from "@/lib/guest/guest-settlement";
import type { BinaryOrderType, OrderSide as BinaryOrderSide } from "@/types/binary-trading";
import { ORDER_TYPE_CONFIGS, getProfitPercentageForType } from "@/types/binary-trading";

// Race condition prevention for symbol switching
let currentFetchId = 0;
let lastPlaceOrderTimestamp = 0;

// ─── Rapid-click order batching ──────────────────────────────────────────────
// Placing a trade is optimistic (the chart zone + position card appear on the
// same frame), and the network write fires in the background. To avoid sending
// one HTTP request per click — which trips the backend's 100-requests/minute
// per-user rate limit when you tap CALL/PUT dozens of times — we coalesce
// clicks that share the SAME spec into a single request carrying `batch: N`.
// The backend then creates all N orders in one atomic transaction.
//
// A short leading window bounds how stale the server-resolved entry price can
// get (all orders in a batch share one price resolved at flush time).
const BATCH_WINDOW_MS = 100;
const BATCH_MAX = 100;

type BatchedOrderItem = {
  tempOrderId: string;
  amount: number;
  tradingMode: "real" | "demo";
};

type OrderBatch = {
  body: any; // shared request body from the first click (server ignores per-click price)
  headers: Record<string, string>;
  items: BatchedOrderItem[];
  timer: ReturnType<typeof setTimeout> | null;
  set: (fn: any) => void;
  get: () => any;
};

const _orderBatches = new Map<string, OrderBatch>();

// Signature of everything that must match for two clicks to be the same trade.
// closedAt is intentionally excluded so clicks a few ms apart still coalesce;
// the batch uses the first click's closedAt for all its orders.
function batchSignatureOf(b: any): string {
  return [
    b.currency,
    b.pair,
    b.side,
    b.amount,
    b.type,
    b.durationId,
    b.isDemo ? "demo" : "real",
    b.barrier ?? "",
    b.strikePrice ?? "",
    b.payoutPerPoint ?? "",
  ].join("|");
}

/**
 * Turn whatever the order endpoint returned into something a trader can act on.
 *
 * The batch is optimistic, so a failure is not "an API call failed" — it is "the
 * position you can see was taken back off the chart", and the message has to say
 * that or the rollback looks like the terminal losing trades on its own.
 */
function describeBatchFailure(error: unknown, count: number): string {
  const raw = typeof error === "string" ? error : (error as any)?.message || "";
  const positions = count === 1 ? "position" : `${count} positions`;
  if (/rate limit|too many requests/i.test(raw)) {
    return `Too many orders too quickly — your ${positions} were not opened. Try again in a moment.`;
  }
  if (/balance|insufficient/i.test(raw)) {
    return `Not enough balance — your ${positions} were not opened.`;
  }
  if (raw) return `${raw} — your ${positions} were not opened.`;
  return `Your ${positions} could not be opened. Please try again.`;
}

function refundBatchItems(batch: OrderBatch, items: BatchedOrderItem[]) {
  const total = items.reduce((s, it) => s + it.amount, 0);
  const ids = new Set(items.map((it) => it.tempOrderId));
  const mode = items[0]?.tradingMode ?? "real";
  batch.set((state: any) => {
    const orders = state.orders.filter((o: any) => !ids.has(o.id));
    if (mode === "demo") {
      const bal = state.demoBalance + total;
      return { orders, demoBalance: bal, balance: bal };
    }
    const cur = state.realBalance ?? state.balance;
    const bal = cur + total;
    return { orders, realBalance: bal, balance: bal };
  });
  syncOrdersToChartEngine(batch.get().orders);
}

/**
 * Settle a guest's trade in the browser, at its expiry.
 *
 * A guest has no account, so the trade was never written anywhere and no
 * ORDER_COMPLETED will ever arrive for it — it would sit PENDING for ever.
 * This does what the server would have done, folding the result into exactly
 * the same state the live handler produces so positions, toasts and history
 * cannot tell the two apart.
 *
 * Deliberately absent: the debounced fetchDemoBalance() the live path fires to
 * reconcile against the server. There is no server-side balance for a guest,
 * and asking for one would 401 and overwrite a correct local figure with zero.
 */
function scheduleGuestSettlement(
  orderId: string,
  expiryMs: number,
  set: any,
  get: any
) {
  const delay = Math.max(0, expiryMs - getChartSynchronizedTime().getTime());

  setTimeout(() => {
    const order = get().orders.find((o: any) => o.id === orderId);
    if (!order || order.status !== "PENDING") return;

    /* Settle against the same price the chart is showing. If there is none —
       the feed dropped at exactly the wrong moment — leave it pending rather
       than inventing a result; a guess here is a fabricated win or loss. */
    const closePrice = get().currentPrice;
    if (!closePrice || !Number.isFinite(closePrice)) return;

    const outcome = settleGuestOrder(
      {
        side: order.side,
        price: order.entryPrice,
        amount: order.amount,
        profitPercentage: order.profitPercentage,
      },
      closePrice
    );

    const completedOrder: any = {
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      amount: order.amount,
      entryPrice: order.entryPrice,
      closePrice,
      entryTime: new Date(order.createdAt),
      expiryTime: new Date(order.expiryTime),
      status: outcome.status,
      profit: outcome.profit,
      profitPercentage: order.profitPercentage,
      type: order.type,
      barrier: order.barrier,
      strikePrice: order.strikePrice,
      payoutPerPoint: order.payoutPerPoint,
      isDemo: true,
      justSettled: true,
    };

    set((state: any) => {
      const newDemoBalance = state.demoBalance + outcome.balanceChange;
      return {
        orders: state.orders.filter((o: any) => o.id !== orderId),
        completedOrders: [completedOrder, ...state.completedOrders],
        demoBalance: newDemoBalance,
        ...(state.tradingMode === "demo" ? { balance: newDemoBalance } : {}),
        netPL: state.netPL + outcome.netPL,
        processedOrderIds: [...state.processedOrderIds, orderId],
      };
    });

    syncOrdersToChartEngine(get().orders);
  }, delay);
}

async function flushOrderBatch(signature: string) {
  const batch = _orderBatches.get(signature);
  if (!batch) return;
  _orderBatches.delete(signature);
  if (batch.timer) clearTimeout(batch.timer);

  const items = batch.items;
  const idempotencyKey = `${Date.now()}-${signature}-${Math.random().toString(36).substring(2, 9)}`;
  const requestBody = { ...batch.body, batch: items.length, idempotencyKey };

  try {
    const { data, error } = await $fetch({
      url: "/api/exchange/binary/order",
      method: "POST",
      body: requestBody,
      headers: { ...batch.headers, "idempotency-key": idempotencyKey },
      silentSuccess: true,
      // Optimistic UI already reflects the trade — never flash a spinner.
      silentLoading: true,
      // Errors are reported by the rollback below instead of by $fetch. The
      // framework's own copy is written for a generic API client and reads badly
      // here — a throttled batch surfaced "Rate Limit Exceeded, Try Again Later"
      // next to positions that looked placed, saying nothing about the trades that
      // were actually rolled back.
      silent: true,
    });

    const returned: any[] = Array.isArray(data?.orders)
      ? data.orders
      : data?.order
      ? [data.order]
      : [];

    if (!error && returned.length > 0) {
      // Reconcile each optimistic order with its server-created counterpart.
      batch.set((state: any) => {
        let orders = state.orders;
        items.forEach((it, i) => {
          const srv = returned[i];
          if (!srv) return;
          orders = orders.map((o: any) =>
            o.id === it.tempOrderId
              ? { ...o, id: srv.id, profitPercentage: srv.profit ?? o.profitPercentage }
              : o
          );
        });
        return { orders };
      });
      syncOrdersToChartEngine(batch.get().orders);

      // Any optimistic orders the server didn't return (shouldn't happen — the
      // batch is all-or-nothing) get rolled back so the UI can't drift.
      if (returned.length < items.length) {
        refundBatchItems(batch, items.slice(returned.length));
      }

      if (items.some((it) => it.tradingMode === "real")) {
        (async () => {
          await new Promise((r) => setTimeout(r, 500));
          // USDT is the funding wallet — see fetchWalletData. The cache key has
          // to name the same wallet that is fetched, or the stale figure stays.
          if (typeof window !== "undefined") sessionStorage.removeItem("wallet_USDT");
          await batch.get().fetchWalletData("USDT", true, true);
        })().catch((err) => console.warn("[BinaryStore] Batch wallet sync failed:", err));
      }
    } else {
      console.error("[BinaryStore] Batch order error, rolling back:", error);
      refundBatchItems(batch, items);
      toast.error(describeBatchFailure(error, items.length));
    }
  } catch (fetchErr) {
    console.error("[BinaryStore] Batch fetch failed, rolling back:", fetchErr);
    refundBatchItems(batch, items);
    toast.error(describeBatchFailure(fetchErr, items.length));
  }
}

function enqueueOrderForBatch(
  body: any,
  headers: Record<string, string>,
  item: BatchedOrderItem,
  set: (fn: any) => void,
  get: () => any
) {
  const signature = batchSignatureOf(body);
  let batch = _orderBatches.get(signature);
  if (!batch) {
    batch = { body, headers, items: [], timer: null, set, get };
    _orderBatches.set(signature, batch);
    batch.timer = setTimeout(() => flushOrderBatch(signature), BATCH_WINDOW_MS);
  }
  batch.items.push(item);
  // Cap batch size — flush immediately and let further clicks open a new window.
  if (batch.items.length >= BATCH_MAX) {
    flushOrderBatch(signature);
  }
}

/**
 * Shortest tradeable expiry, in seconds. Sub-minute expiries (5s/10s/15s/30s)
 * are disabled: the preset grid omits them, setCustomDurationSeconds clamps to
 * this floor, and the order endpoint rejects anything shorter server-side.
 */
export const MIN_TRADE_DURATION_SECONDS = 60;

export function isSameSymbol(sym1: string | null | undefined, sym2: string | null | undefined): boolean {
  if (!sym1 || !sym2) return false;
  return sym1.replace(/[^A-Za-z0-9]/g, "").toUpperCase() === sym2.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

// Track fetch failures to prevent infinite retry loops
let marketsFetchFailed = false;
let durationsFetchFailed = false;

// Types
export type Symbol = string;
export type TimeFrame = "15s" | "30s" | "1m" | "2m" | "3m" | "5m" | "10m" | "15m" | "30m" | "1h" | "4h" | "1d";
export type TradingMode = "demo" | "real";
export type OrderSide = BinaryOrderSide;
/* The statuses the server actually sends, in the case it actually sends them.

   This read "PENDING" | "win" | "loss". Nothing ever produced those lowercase
   values — binary orders come back as PENDING, WIN, LOSS or DRAW — so every
   comparison against them was dead, and the three real outcomes were absent
   from the type that describes them. Code that needed to check for a win could
   not do so without casting its way out, and one place that did not cast
   silently classified every settled trade as a loss.

   Kept in step with OrderStatus in types/binary-trading.ts, minus the states
   this store does not model (CANCELLED, CLOSED_EARLY). */
export type OrderStatus = "PENDING" | "WIN" | "LOSS" | "DRAW";

export interface Market {
  symbol: Symbol;
  price: number;
  change: number;
  isPinned?: boolean;
}

export interface PriceMovement {
  direction: "up" | "down" | "neutral";
  percent: number;
  strength: "strong" | "medium" | "weak";
}

export interface Order {
  id: string;
  symbol: Symbol;
  side: OrderSide;
  amount: number;
  entryPrice: number;
  expiryTime: number;
  createdAt: number;
  status: OrderStatus;
  profit?: number;
  closePrice?: number;
  mode: TradingMode;
  profitPercentage?: number; // Profit percentage for this order's duration
  type?: BinaryOrderType; // Order type (RISE_FALL, HIGHER_LOWER, etc.)
  barrier?: number; // For HIGHER_LOWER, TOUCH_NO_TOUCH, TURBO
  strikePrice?: number; // For CALL_PUT
  payoutPerPoint?: number; // For TURBO
}

export interface CompletedOrder {
  id: string;
  symbol: Symbol;
  side: OrderSide;
  amount: number;
  entryPrice: number;
  closePrice: number;
  entryTime: Date;
  expiryTime: Date;
  status: "WIN" | "LOSS" | "DRAW";
  profit: number;
  profitPercentage?: number;
  // Type-specific fields for proper chart rendering
  type?: BinaryOrderType;
  barrier?: number;
  strikePrice?: number;
  payoutPerPoint?: number;
  // Trading mode indicator
  isDemo?: boolean;
  /* Settled by the trader pressing exit rather than by reaching expiry. The
     status stays WIN/LOSS because that is what the database records — its enum
     has no CLOSED_EARLY — so this is what preserves the distinction for the UI
     without making a closed trade report a different outcome after a refresh. */
  closedEarly?: boolean;
  /* Set ONLY by the live ORDER_COMPLETED handler, never by a fetch.
     A result is announced — toast and sound — because it just happened, not
     because it appeared in a list. Without this distinction any load of
     history reads as news: reloading the page replayed results, and so did
     switching market or flipping demo/live, because each swaps in orders this
     tab had not seen before. Deliberately not persisted, so it cannot survive
     a reload and re-announce itself. */
  justSettled?: boolean;
}

export interface BinaryMarket {
  id: string;
  currency: string;
  pair: string;
  symbol?: string;
  status: boolean;
  isHot?: boolean;
  metadata?: any;
  label?: string;
  isTrending?: boolean;
  category?: string;
  icon?: string;
  /** OTC terminal price precision (decimal places) */
  pricePrecision?: number;
  /** OTC terminal pip size */
  pipSize?: number;
  /** true when this market exists on the OTC terminal (has a live feed) */
  isOtc?: boolean;
}

export interface BinaryDuration {
  id: string;
  duration: number;

  // Type-specific profit percentages
  profitPercentageRiseFall: number;
  profitPercentageHigherLower: number;
  profitPercentageTouchNoTouch: number;
  profitPercentageCallPut: number;
  profitPercentageTurbo: number;

  // Deprecated - kept for backward compatibility
  profitPercentage?: number;
  /** @deprecated Use profitPercentage instead */
  percentage?: number;

  status: boolean;
}

// New settings-based types
export interface BarrierLevel {
  id: string;
  label: string;
  distancePercent: number;
  profitPercent: number;
  enabled: boolean;
}

export interface StrikeLevel {
  id: string;
  label: string;
  distancePercent: number;
  profitPercent: number;
  enabled: boolean;
}

export interface BinarySettingsState {
  global: {
    enabled: boolean;
    maxConcurrentOrders: number;
    maxDailyOrders: number;
    minOrderAmount: number;
    maxOrderAmount: number;
    cooldownSeconds: number;
  };
  orderTypes: {
    RISE_FALL: {
      enabled: boolean;
      minAmount?: number;
      maxAmount?: number;
      profitPercentage: number;
    };
    HIGHER_LOWER: {
      enabled: boolean;
      minAmount?: number;
      maxAmount?: number;
      profitPercentage: number;
      barrierLevels: BarrierLevel[];
    };
    TOUCH_NO_TOUCH: {
      enabled: boolean;
      minAmount?: number;
      maxAmount?: number;
      profitPercentage: number;
      barrierLevels: BarrierLevel[];
      touchProfitMultiplier: number;
      noTouchProfitMultiplier: number;
    };
    CALL_PUT: {
      enabled: boolean;
      minAmount?: number;
      maxAmount?: number;
      profitPercentage: number;
      strikeLevels: StrikeLevel[];
    };
    TURBO: {
      enabled: boolean;
      minAmount?: number;
      maxAmount?: number;
      profitPercentage: number;
      barrierLevels: BarrierLevel[];
      payoutPerPointRange: { min: number; max: number };
      maxDuration: number;
      allowTicksBased: boolean;
    };
  };
  durations: Array<{
    id: string;
    minutes: number;
    enabled: boolean;
    orderTypeOverrides?: {
      [orderType: string]: {
        enabled?: boolean;
        profitAdjustment?: number;
      };
    };
  }>;
  display: {
    showProfitPercentage?: boolean;
    showBarrierOnChart?: boolean;
    showCountdown?: boolean;
    defaultOrderType?: BinaryOrderType;
    chartType?: string; // Chart Engine is the only chart provider
  };
}

// Simple in-memory cache for market data
const marketDataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute cache for markets/durations
// Settings use same TTL - they're loaded once at startup and stay stable for the session

function getCachedData(key: string): any | null {
  const cached = marketDataCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedData(key: string, data: any): void {
  marketDataCache.set(key, { data, timestamp: Date.now() });
}

function clearMarketDataCache(): void {
  marketDataCache.clear();
}

// Global cleanup registry for intervals and subscriptions
class CleanupRegistry {
  private intervals = new Set<NodeJS.Timeout>();
  private subscriptions = new Set<() => void>();
  private isCleaningUp = false;

  addInterval(interval: NodeJS.Timeout) {
    this.intervals.add(interval);
  }

  addSubscription(unsubscribe: () => void) {
    this.subscriptions.add(unsubscribe);
  }

  cleanup() {
    if (this.isCleaningUp) return;
    this.isCleaningUp = true;

    // Clear all intervals
    this.intervals.forEach((interval) => {
      try {
        clearInterval(interval);
      } catch (error) {
        console.warn("Error clearing interval:", error);
      }
    });
    this.intervals.clear();

    // Call all unsubscribe functions
    this.subscriptions.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.warn("Error during unsubscribe:", error);
      }
    });
    this.subscriptions.clear();

    // Clear market data cache on cleanup (logout/unmount)
    clearMarketDataCache();

    this.isCleaningUp = false;
  }

  removeInterval(interval: NodeJS.Timeout) {
    this.intervals.delete(interval);
  }

  removeSubscription(unsubscribe: () => void) {
    this.subscriptions.delete(unsubscribe);
  }
}

const cleanupRegistry = new CleanupRegistry();

// Global initialization flag to prevent duplicate initializations
let isInitializing = false;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let updateInterval: NodeJS.Timeout | null = null;

const startUpdateInterval = () => {
  if (updateInterval) return;
  updateInterval = setInterval(() => {
    try {
      const currentStore = useBinaryStore.getState();
      // Always update if store is initialized to keep safe zone in sync
      if (isInitialized) {
        currentStore.updateOrders();
      }
    } catch (error) {
      console.warn("Error updating orders:", error);
    }
  }, 1000); // 1000ms for accurate 1-second countdown checks
  cleanupRegistry.addInterval(updateInterval);
};


// Utility functions that use actual market data instead of hardcoded parsing
export function getMarketFromSymbol(symbol: Symbol, markets: BinaryMarket[]): BinaryMarket | null {
  return markets.find(m =>
    isSameSymbol(m.symbol, symbol) ||
    isSameSymbol(m.label, symbol) ||
    isSameSymbol(`${m.currency}${m.pair}`, symbol) ||
    isSameSymbol(`${m.currency}/${m.pair}`, symbol)
  ) || null;
}

export function extractBaseCurrency(symbol: Symbol, markets: BinaryMarket[] = []): string {
  // First try to find the market and use its currency field
  const market = getMarketFromSymbol(symbol, markets);
  if (market?.currency) {
    return market.currency;
  }
  
  // Fallback to old parsing logic only if no market data available
  if (!symbol || typeof symbol !== 'string' || symbol.length < 2) {
    console.warn('Invalid symbol for base currency extraction:', symbol);
    return '';
  }
  
  // Simple parsing for fallback
  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    return parts[0] || '';
  }
  
  // Default fallback
  return symbol.slice(0, 3);
}

export function extractQuoteCurrency(symbol: Symbol, markets: BinaryMarket[] = []): string {
  // First try to find the market and use its pair field
  const market = getMarketFromSymbol(symbol, markets);
  if (market?.pair) {
    return market.pair;
  }
  
  // Fallback to old parsing logic only if no market data available
  if (!symbol || typeof symbol !== 'string' || symbol.length < 2) {
    console.warn('Invalid symbol for quote currency extraction:', symbol);
    return '';
  }
  
  // Simple parsing for fallback
  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    return parts[1] || '';
  }
  
  // Default fallback
  return 'USDT';
}

export function formatPairFromSymbol(symbol: Symbol, markets: BinaryMarket[] = []): string {
  const base = extractBaseCurrency(symbol, markets);
  const quote = extractQuoteCurrency(symbol, markets);
  return `${base}/${quote}`;
}

export function getSymbolFromPair(currency: string, pair: string): string {
  // Convert currency/pair format back to symbol format
  return `${currency}${pair}`;
}

// Smart market selection with performance optimization
function selectBestMarket(markets: BinaryMarket[]): BinaryMarket | null {
  if (markets.length === 0) return null;

  // First, find any active market (status: true)
  const activeMarket = markets.find(m => m.status);
  if (activeMarket) return activeMarket;

  // If no active markets, return the first available market
  return markets[0];
}

/** What happened to the last attempt to read the real (live) wallet. */
export type WalletStatus =
  | "idle"            // nothing asked for yet
  | "loading"         // in flight, and we have nothing to show meanwhile
  | "ready"           // realBalance is the server's answer
  | "unauthenticated" // the session is gone; signing in is the fix
  | "error";          // reachable but refused or unreadable

interface BinaryState {
  // Market data
  activeMarkets: Market[];
  currentSymbol: Symbol;
  currentPrice: number;
  priceMovements: Record<Symbol, PriceMovement>;
  timeFrame: TimeFrame;
  candleData: any[];

  // Binary markets data
  binaryMarkets: BinaryMarket[];
  isLoadingMarkets: boolean;
  isLoading: boolean;

  // Wallet data
  balance: number;
  realBalance: number | null;
  demoBalance: number;
  netPL: number;
  isLoadingWallet: boolean;
  /* Why the real balance is not on screen, when it is not.

     `realBalance === null` used to carry two unrelated meanings — "the request
     is still in flight" and "the request finished and we have no answer" — and
     the interface could only render the first of them. Every failure path here
     set isLoadingWallet false and left realBalance null, so the balance sat
     under a loading shimmer that could never resolve: the account panel pulsed
     for ever while the tier line beside it, reading the same null as `?? 0`,
     showed a confident 0. The commonest cause is an expired session, where the
     honest answer is "sign in again" rather than an animation. */
  walletStatus: WalletStatus;

  // Orders
  orders: Order[];
  completedOrders: CompletedOrder[];
  isLoadingOrders: boolean;
  positionMarkers: any[];

  // Pagination for completed orders
  completedOrdersPagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  hasLoadedCompletedOrders: boolean;
  processedOrderIds: string[];

  // Trading settings
  tradingMode: TradingMode;
  selectedExpiryMinutes: number;
  selectedAmount: number;
  isInSafeZone: boolean;
  binaryDurations: BinaryDuration[];
  isLoadingDurations: boolean;

  // New settings-based configuration
  binarySettings: BinarySettingsState | null;
  isLoadingSettings: boolean;
  selectedBarrierLevel: BarrierLevel | null;
  selectedStrikeLevel: StrikeLevel | null;

  // Order type settings
  selectedOrderType: BinaryOrderType;
  barrier: number | null;
  strikePrice: number | null;
  payoutPerPoint: number | null;
  durationType: "TIME" | "TICKS";
  durationMode: "CLOCK" | "DURATION";
  customDurationSeconds: number;

  // UI state
  isMarketSwitching: boolean;

  // Actions
  setCurrentSymbol: (symbol: Symbol) => void;
  setTimeFrame: (timeFrame: TimeFrame) => void;
  setTradingMode: (mode: TradingMode) => void;
  setSelectedExpiryMinutes: (minutes: number) => void;
  setSelectedAmount: (amount: number) => void;
  setOrderType: (type: BinaryOrderType) => void;
  setBarrier: (barrier: number | null) => void;
  setStrikePrice: (price: number | null) => void;
  setPayoutPerPoint: (payout: number | null) => void;
  setDurationType: (type: "TIME" | "TICKS") => void;
  setDurationMode: (mode: "CLOCK" | "DURATION") => void;
  setCustomDurationSeconds: (seconds: number) => void;
  addMarket: (symbol: Symbol) => void;
  removeMarket: (symbol: Symbol) => void;
  togglePinMarket: (symbol: Symbol) => void;
  placeOrder: (
    side: BinaryOrderSide,
    amount: number,
    expiryMinutes: number
  ) => Promise<boolean>;
  fetchWalletData: (currency?: string, forceRefresh?: boolean, silent?: boolean) => Promise<void>;
  fetchBinarySettings: () => Promise<void>;
  forceRefreshSettings: () => Promise<void>;
  fetchBinaryDurations: (symbol?: string) => Promise<void>;
  forceRefreshDurations: () => Promise<void>;
  fetchBinaryMarkets: () => Promise<void>;
  setSelectedBarrierLevel: (level: BarrierLevel | null) => void;
  setSelectedStrikeLevel: (level: StrikeLevel | null) => void;
  getEnabledOrderTypes: () => BinaryOrderType[];
  getEnabledBarrierLevels: (orderType: BinaryOrderType) => BarrierLevel[];
  getEnabledStrikeLevels: () => StrikeLevel[];
  getProfitForSelectedLevel: () => number;
  fetchCompletedOrders: (loadMore?: boolean) => Promise<void>;
  /** Deep history for the analytics overlay — see the implementation. */
  loadCompletedHistory: (limit?: number) => Promise<void>;
  loadMoreCompletedOrders: () => Promise<void>;
  resetCompletedOrdersPagination: () => void;
  fetchActiveOrders: () => Promise<void>;
  updateOrders: () => void;
  cancelOrder: (orderId: string) => Promise<{ success: boolean; refundAmount?: number; error?: string }>;
  closeOrderEarly: (orderId: string) => Promise<{ success: boolean; cashoutAmount?: number; penalty?: number; error?: string }>;
  symbolPrices: Record<string, number>;
  getSymbolPrice: (symbol: string) => number;
  setCurrentPrice: (price: number) => void;
  setCandleData: (data: any[]) => void;
  initOrderWebSocket: () => void;
  cleanup: () => void; // Add cleanup method
  setIsLoading: (loading: boolean) => void; // Add setIsLoading
  // user property removed - use useUserStore instead
  updateMarketData: (symbol: Symbol, price: number, change: number) => void;
  updateActiveMarketsFromTicker: (tickerData: Record<string, any>) => void;
  resetDemoBalance: () => Promise<void>;
  /** Start practice again from a figure of your own. True when it took. */
  setDemoBalance: (amount: number) => Promise<boolean>;
  fetchDemoBalance: () => Promise<void>;
}

/**
 * One settled order, as the store keeps it.
 *
 * Shared by the paged fetch and the deep history load below, because they read
 * the same endpoint and any difference between the two is a difference between
 * the orders the terminal shows and the ones the analytics page counts.
 */
function toCompletedOrder(order: any): CompletedOrder {
  return {
    id: order.id,
    symbol: order.symbol,
    side: order.side,
    amount: order.amount,
    entryPrice: order.price,
    closePrice: order.closePrice || order.price,
    entryTime: new Date(order.createdAt),
    expiryTime: new Date(order.closedAt),
    status: order.status as "WIN" | "LOSS" | "DRAW",
    profit: order.profit ?? 0,
    profitPercentage: order.profitPercentage,
    type: order.type,
    barrier: order.barrier,
    strikePrice: order.strikePrice,
    payoutPerPoint: order.payoutPerPoint,
    isDemo: !!order.isDemo,
  };
}

export const useBinaryStore = create<BinaryState>()(
  devtools(
    persist(
      (set, get) => ({
        // Market data - initialized with empty values
        activeMarkets: [],
        currentSymbol: "",
        currentPrice: 0,
        priceMovements: {},
        timeFrame: "1m",
        candleData: [],

              // Binary markets data
      binaryMarkets: [],
      isLoadingMarkets: false,
      isLoading: false,

        // Wallet data
        //
        // realBalance starts null, not 50000. It is the user's actual money, and
        // seeding it with a number invented on the client meant that until the
        // wallet request came back — or at all, if it failed — the interface
        // displayed $50,000 of real funds to an account whose wallet holds zero.
        // The guard further down explicitly reads null as "still loading" and
        // was never able to fire, because the initial value was never null.
        //
        // Nothing may claim to be a real balance until the server has said so.
        balance: 0,
        realBalance: null,
        demoBalance: 50000, // Default demo balance
        netPL: 0,
        isLoadingWallet: false,
        walletStatus: "idle" as WalletStatus,

        // Orders
        orders: [],
        completedOrders: [],
        isLoadingOrders: false,
        positionMarkers: [],

        // Pagination for completed orders
        completedOrdersPagination: {
          total: 0,
          limit: 50,
          offset: 0,
          hasMore: false,
        },
        hasLoadedCompletedOrders: false,
        processedOrderIds: [],

        // Trading settings
        tradingMode: "demo",
        selectedExpiryMinutes: 1,
        selectedAmount: 1000,
        isInSafeZone: false,
        binaryDurations: [],
        isLoadingDurations: false,

        // New settings-based configuration
        binarySettings: null,
        isLoadingSettings: false,
        selectedBarrierLevel: null,
        selectedStrikeLevel: null,

        // Order type settings
        selectedOrderType: "RISE_FALL",
        barrier: null,
        strikePrice: null,
        payoutPerPoint: null,
        durationType: "TIME",
        durationMode: "CLOCK",
        customDurationSeconds: 60,

        // UI state
        isMarketSwitching: false,

        // Actions
        setCurrentSymbol: (symbol) => {
          const { currentSymbol: prevSymbol, activeMarkets } = get();

          // Only update if symbol actually changed
          if (prevSymbol === symbol) return;

          // Clear market data cache on symbol change to prevent stale data
          clearMarketDataCache();

          // Increment fetch ID to invalidate any in-flight requests
          const fetchId = ++currentFetchId;

          // Check if market already exists in activeMarkets
          const marketExists = activeMarkets.some(m => m.symbol === symbol);

          set({
            currentSymbol: symbol,
            activeMarkets: marketExists
              ? activeMarkets
              : [...activeMarkets, { symbol, price: 0, change: 0 }],
            isMarketSwitching: true,
          });

          // Fetch wallet data for the new symbol
          const { binaryMarkets } = get();
          const quoteCurrency = extractQuoteCurrency(symbol, binaryMarkets);
          get().fetchWalletData(quoteCurrency, false, true);

          // Fetch durations for the new symbol
          get().fetchBinaryDurations(symbol);

          // Fetch orders for the new symbol if user is authenticated
          const { user } = useUserStore.getState();
          if (user?.id) {
            // Ensure order WebSocket is initialized/resubscribed
            get().initOrderWebSocket();
          }

          // Reset market switching flag after a short delay
          setTimeout(() => {
            // Only reset if this is still the current symbol
            if (fetchId === currentFetchId) {
              set({ isMarketSwitching: false });
            }
          }, 500);
        },

        setTimeFrame: (timeFrame) => set({ timeFrame }),

        setTradingMode: (mode) => {
          /* A guest has no wallet, so "real" is not a mode they can be in. The
             switch is hidden for them anyway; this is the backstop, and it
             matters because the balance line below would otherwise show them a
             real balance of zero as though it were theirs. */
          if (mode === "real" && isGuestNow()) return;
          // BUG FIX: Don't snap to 0 while realBalance is still loading (null).
          // Keep the existing displayed balance until fetchWalletData resolves.
          const newBalance = mode === "demo"
            ? get().demoBalance
            : (get().realBalance !== null ? get().realBalance! : get().balance);
          set({ tradingMode: mode, balance: newBalance });

          /* Re-read the order lists for the mode we just switched into.

             Both lists are filtered by mode at the moment they are fetched —
             `!!order.isDemo === (tradingMode === "demo")` — and nothing here
             re-ran that filter, so switching from demo to real left the demo
             trades on screen and no real ones. Only a full page reload fixed it,
             because a reload is the one path that fetches again.

             A refetch is enough and needs no new endpoint: the route returns the
             user's whole history and the filtering is done on the client, and
             the merge that follows drops any held order belonging to the other
             mode. The offset is reset first so the fetch replaces the list
             rather than appending a page to it. */
          set((state) => ({
            completedOrdersPagination: { ...state.completedOrdersPagination, offset: 0 },
          }));
          get().fetchCompletedOrders();
          get().fetchActiveOrders();

          // Always force-refresh wallet data when switching to real mode
          requestAnimationFrame(() => {
            if (get().currentSymbol) {
              const { binaryMarkets } = get();
              const quoteCurrency = extractQuoteCurrency(get().currentSymbol, binaryMarkets);
              // forceRefresh=true to bypass 30s cache and get accurate real balance
              get().fetchWalletData(quoteCurrency, mode === "real");
            }
          });
        },

        setSelectedExpiryMinutes: (minutes) => {
          set({ selectedExpiryMinutes: minutes });
          get().updateOrders();
        },

        setSelectedAmount: (amount) =>
          set({ selectedAmount: amount }),

        setOrderType: (type) => {
          const prevType = get().selectedOrderType;
          // Reset barrier/strike levels when switching order types to prevent stale data
          if (prevType !== type) {
            set({
              selectedOrderType: type,
              selectedBarrierLevel: null,
              selectedStrikeLevel: null,
              barrier: null,
              strikePrice: null,
            });
          } else {
            set({ selectedOrderType: type });
          }
        },

        setBarrier: (barrier) => set({ barrier }),

        setStrikePrice: (price) => set({ strikePrice: price }),

        setPayoutPerPoint: (payout) => set({ payoutPerPoint: payout }),

        setDurationType: (type) => set({ durationType: type }),
        setDurationMode: (mode) => {
          if (mode === "CLOCK") {
            set({ durationMode: mode, selectedExpiryMinutes: 1 });
          } else {
            set({ durationMode: mode });
          }
        },
        // Sub-minute expiries are disabled. Clamping here rather than at each
        // caller means the stepper, the manual time input and the preset grid all
        // inherit the floor, and a stale persisted value below it is corrected on
        // first write. MIN_TRADE_DURATION_SECONDS is enforced again server-side.
        setCustomDurationSeconds: (seconds) =>
          set({
            customDurationSeconds: Math.max(
              MIN_TRADE_DURATION_SECONDS,
              Number.isFinite(seconds) ? seconds : MIN_TRADE_DURATION_SECONDS
            ),
          }),

        addMarket: (symbol) => {
          const { activeMarkets } = get();
          if (!activeMarkets.find((m) => m.symbol === symbol)) {
            set({
              activeMarkets: [
                ...activeMarkets,
                { symbol, price: 0, change: 0 },
              ],
            });
          }
        },

        // Add method to update market data with real-time prices
        updateMarketData: (symbol: Symbol, price: number, change: number) => {
          const { activeMarkets } = get();
          const updatedMarkets = activeMarkets.map((market) =>
            market.symbol === symbol
              ? { ...market, price, change }
              : market
          );
          set({ activeMarkets: updatedMarkets });
        },

        // Update all active markets with ticker data
        updateActiveMarketsFromTicker: (tickerData: Record<string, any>) => {
          const { activeMarkets, binaryMarkets } = get();
          const updatedMarkets = activeMarkets.map((market) => {
            // Find the corresponding binary market to get currency and pair
            const binaryMarket = binaryMarkets.find(m => 
              m.symbol === market.symbol || 
              `${m.currency}${m.pair}` === market.symbol ||
              `${m.currency}/${m.pair}` === market.symbol
            );
            
            if (!binaryMarket) {
              return market; // No matching binary market found
            }
            
            // Try different ticker data key formats using the actual market data
            let marketData: any = null;
            
            // Format 1: Use the label from binary market (e.g., "TRX/USDT")
            if (binaryMarket.label) {
              marketData = tickerData[binaryMarket.label];
            }
            
            // Format 2: Use symbol from binary market
            if (!marketData && binaryMarket.symbol) {
              marketData = tickerData[binaryMarket.symbol];
            }
            
            // Format 3: Construct from currency/pair (e.g., "TRX/USDT")
            if (!marketData) {
              const symbolKey = `${binaryMarket.currency}/${binaryMarket.pair}`;
              marketData = tickerData[symbolKey];
            }
            
            // Format 4: Try without slash (e.g., "TRXUSDT")
            if (!marketData) {
              const noSlashSymbol = `${binaryMarket.currency}${binaryMarket.pair}`;
              marketData = tickerData[noSlashSymbol];
            }
            
            // Update market with new data if found
            if (marketData) {
              return {
                ...market,
                price: marketData.last || market.price,
                change: marketData.percentage || marketData.change || market.change,
              };
            }
            
            return market;
          });
          
          set({ activeMarkets: updatedMarkets });
        },

        /* Reads the demo balance back from the server.

           It used to be arithmetic done here and saved to this browser's
           localStorage — the server records demo orders but never debited
           anything for them — so two devices on one account each kept their own
           figure and drifted apart with every trade, with nothing correct to
           refresh from. The server now derives it from those recorded orders,
           which is why both screens can finally agree.

           The optimistic local adjustment on placing a trade is kept: it is what
           makes the balance move the instant a button is pressed. This just
           settles it afterwards against the only figure that counts. */
        fetchDemoBalance: async () => {
          try {
            const { data, error } = await $fetch({
              url: `/api/exchange/binary/order/demo-balance?t=${Date.now()}`,
              silent: true,
            });
            if (error || typeof data?.balance !== "number") return;

            set((state: any) => ({
              demoBalance: data.balance,
              ...(state.tradingMode === "demo" ? { balance: data.balance } : {}),
            }));
          } catch {
            // Leave the current figure alone; a later refresh will settle it.
          }
        },

        // Resets on the account, not in this browser, so the reset is seen
        // everywhere the user is signed in.
        resetDemoBalance: async () => {
          const { data, error } = await $fetch({
            url: `/api/exchange/binary/order/demo-balance`,
            method: "POST",
            silent: true,
          });
          if (error || typeof data?.balance !== "number") return;

          set((state: any) => ({
            demoBalance: data.balance,
            ...(state.tradingMode === "demo" ? { balance: data.balance } : {}),
          }));
        },

        /* The same endpoint, with a figure. Practice is only useful at the size
           somebody actually trades: on a fixed 50,000 every position is either
           trivial or impossible for an account that holds 500. */
        setDemoBalance: async (amount: number) => {
          const { data, error } = await $fetch({
            url: `/api/exchange/binary/order/demo-balance`,
            method: "POST",
            body: { amount },
            silent: true,
          });
          if (error || typeof data?.balance !== "number") return false;

          set((state: any) => ({
            demoBalance: data.balance,
            ...(state.tradingMode === "demo" ? { balance: data.balance } : {}),
          }));
          return true;
        },

        removeMarket: (symbol) => {
          const { activeMarkets, currentSymbol } = get();
          if (activeMarkets.length > 1) {
            set({
              activeMarkets: activeMarkets.filter((m) => m.symbol !== symbol),
            });

            // If removing the current symbol, switch to another one
            if (symbol === currentSymbol) {
              const newSymbol =
                activeMarkets.find((m) => m.symbol !== symbol)?.symbol || "";
              if (newSymbol) {
                get().setCurrentSymbol(newSymbol);
              }
            }
          }
        },

        togglePinMarket: (symbol) => {
          const { activeMarkets } = get();
          set({
            activeMarkets: activeMarkets.map((m) =>
              m.symbol === symbol ? { ...m, isPinned: !m.isPinned } : m
            ),
          });
        },

        placeOrder: async (side, amount, expiryMinutes) => {
          const {
            currentSymbol,
            currentPrice,
            balance,
            tradingMode,
            binaryMarkets,
            binaryDurations,
            selectedOrderType,
            barrier,
            selectedBarrierLevel,
            strikePrice,
            selectedStrikeLevel,
            payoutPerPoint,
            durationType,
            durationMode,
            customDurationSeconds,
          } = get();

          // Check if we have enough balance.
          // BUG FIX: In real mode, if realBalance is still null (wallet loading),
          // don't block the trade — the server will validate the actual balance.
          const effectiveBalance = (tradingMode === "real" && get().realBalance === null)
            ? Infinity // wallet hasn't loaded yet; let server-side validate
            : balance;
          if (amount <= 0 || amount > effectiveBalance) {
            console.error("Insufficient balance or invalid amount");
            return false;
          }

          // Check if we're in the safe zone
          if (get().isInSafeZone) {
            console.error("Cannot place orders in safe zone");
            return false;
          }

          /* What a guest may trade.
             Demo only, because there is no wallet to charge — and Rise/Fall
             only, because every other type needs its own payout rules repeated
             in the browser to settle, and a second copy of a money rule is a
             place for the demo and the real platform to disagree. The caller
             raises the sign-up prompt; this is the backstop. */
          if (isGuestNow()) {
            /* The clock has run out. The redirect to sign-up is an effect in a
               component and cannot be the only thing standing between an ended
               session and a live order, so the refusal lives here too. */
            if (isGuestSessionExpired()) {
              console.warn("[guest] demo session has ended");
              return false;
            }
            if (tradingMode !== "demo") {
              console.warn("[guest] live trading needs an account");
              return false;
            }
            if (selectedOrderType !== "RISE_FALL") {
              console.warn(`[guest] ${selectedOrderType} needs an account`);
              return false;
            }
          }

          // Type-specific validation
          const orderTypeConfig = ORDER_TYPE_CONFIGS[selectedOrderType];

          // Validate barrier for HIGHER_LOWER, TOUCH_NO_TOUCH, TURBO
          if (orderTypeConfig.requiresBarrier) {
            if (!barrier || barrier <= 0) {
              console.error(`${selectedOrderType} requires a valid barrier price`);
              return false;
            }
            if (barrier === currentPrice) {
              console.error(`${selectedOrderType} barrier price must be different from current price`);
              return false;
            }
          }

          // Validate strike price for CALL_PUT
          if (orderTypeConfig.requiresStrikePrice) {
            if (!strikePrice || strikePrice <= 0) {
              console.error(`${selectedOrderType} requires a valid strike price`);
              return false;
            }
            if (strikePrice === currentPrice) {
              console.error(`${selectedOrderType} strike price must be different from current price`);
              return false;
            }
          }

          // Validate payout per point for TURBO
          if (orderTypeConfig.requiresPayoutPerPoint) {
            if (!payoutPerPoint || payoutPerPoint <= 0) {
              console.error(`${selectedOrderType} requires a valid payout per point (must be positive)`);
              return false;
            }
          }

          // Validate side is allowed for this order type
          if (!orderTypeConfig.allowedSides.includes(side as any)) {
            console.error(`Side ${side} is not valid for ${selectedOrderType}`);
            return false;
          }

          try {
            // Extract currency and pair from symbol using actual market data
            const currency = extractBaseCurrency(currentSymbol, binaryMarkets);
            const pair = extractQuoteCurrency(currentSymbol, binaryMarkets);

            // Find the duration for this expiry time
            const duration = binaryDurations.find(d => d.duration === expiryMinutes);

            if (!duration && durationMode === "DURATION") {
              const availableDurations = binaryDurations
                .filter(d => d.status === true)
                .map(d => `${d.duration}m`)
                .join(', ');
              console.error(
                `Invalid expiry duration: ${expiryMinutes} minutes is not available. ` +
                `Available durations: ${availableDurations || 'none'}. ` +
                `Please select a valid duration from the dropdown.`
              );
              return false;
            }

            // Additional validation: ensure the duration is active
            if (duration && duration.status !== true && durationMode === "DURATION") {
              const activeDurations = binaryDurations
                .filter(d => d.status === true)
                .map(d => `${d.duration}m`)
                .join(', ');
              console.error(
                `Duration ${expiryMinutes} minutes is currently inactive. ` +
                `Available active durations: ${activeDurations || 'none'}`
              );
              return false;
            }

            // Resolve duration for profit calculations
            const resolvedDuration = duration || binaryDurations.find(d => d.status === true) || binaryDurations[0];
            const durationIdToSend = resolvedDuration?.id;

            // Get type-specific profit percentage
            const profitPercentage = resolvedDuration
              ? getProfitPercentageForType(resolvedDuration, selectedOrderType)
              : 85;

            // 1. Capture exact current price from the live chart engine store at the moment of button press (0ms execution)
            let liveChartPrice = 0;
            if (typeof window !== "undefined") {
              const chartStore = (window as any).__chartStore?.getState?.() || (window as any).__useChartStore?.getState?.();
              if (chartStore) {
                if (typeof chartStore.currentPrice === "number" && chartStore.currentPrice > 0) {
                  liveChartPrice = chartStore.currentPrice;
                } else if (Array.isArray(chartStore.candles) && chartStore.candles.length > 0) {
                  liveChartPrice = chartStore.candles[chartStore.candles.length - 1].close;
                }
              }
            }
            let finalPrice = liveChartPrice > 0 ? liveChartPrice : (currentPrice > 0 ? currentPrice : (get().currentPrice > 0 ? get().currentPrice : 0));
            if (finalPrice <= 0 && typeof window !== "undefined") {
              const cs = (window as any).__useChartStore?.getState?.();
              if (cs?.candles?.length > 0) {
                finalPrice = cs.candles[cs.candles.length - 1].close;
              }
            }
            const exactEntryPrice = finalPrice;
            const tempOrderId = `opt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            // Calculate closedAt timestamp from expiryMinutes - aligned to next expiry boundary for CLOCK, exact countdown for DURATION
            const now = getChartSynchronizedTime();
            let closedAtDate: Date;
            if (durationMode === "DURATION") {
              let effectiveDuration = customDurationSeconds;
              if (customDurationSeconds === 60 && now.getSeconds() >= 30) {
                effectiveDuration = 120;
              }
              closedAtDate = new Date(now.getTime() + effectiveDuration * 1000);
            } else {
              closedAtDate = calculateNextExpiryTime(expiryMinutes);
            }
            const closedAt = closedAtDate.toISOString();

            // 2. Create optimistic order object immediately
            const optimisticOrder: Order = {
              id: tempOrderId,
              symbol: currentSymbol,
              side: side,
              amount: amount,
              entryPrice: exactEntryPrice,
              expiryTime: closedAtDate.getTime(),
              createdAt: getChartSynchronizedTime().getTime(),
              status: "PENDING",
              mode: tradingMode,
              profitPercentage: profitPercentage,
              type: selectedOrderType,
              /* `?? undefined` because these arrive as number | null while Order
                 marks them optional, i.e. absent is undefined. Two spellings of
                 "no value" for one field is how a null reaches code that only
                 guards for undefined. */
              barrier: orderTypeConfig.requiresBarrier ? barrier ?? undefined : undefined,
              strikePrice: orderTypeConfig.requiresStrikePrice ? strikePrice ?? undefined : undefined,
              payoutPerPoint: orderTypeConfig.requiresPayoutPerPoint ? payoutPerPoint ?? undefined : undefined,
            };

            // 3. INSTANTLY push order to state & update balance (0ms latency!)
            set((state) => {
              if (tradingMode === "demo") {
                const newDemoBalance = Math.max(0, state.demoBalance - amount);
                return {
                  orders: [...state.orders, optimisticOrder],
                  demoBalance: newDemoBalance,
                  balance: newDemoBalance,
                };
              } else {
                const currentBal = state.realBalance ?? state.balance;
                const newRealBalance = Math.max(0, currentBal - amount);
                return {
                  orders: [...state.orders, optimisticOrder],
                  realBalance: newRealBalance,
                  balance: newRealBalance,
                };
              }
            });
            syncOrdersToChartEngine(get().orders);

            // 4. RETURN TRUE IMMEDIATELY — trade is live on UI. The network write
            // is coalesced with any other rapid clicks of the same trade and fires
            // in the background as ONE batched request, so tapping CALL/PUT many
            // times never trips the per-user request rate limit. Reconciliation
            // and rollback are handled by the batch flush.
            const requestBody: any = {
              currency,
              pair,
              symbol: currentSymbol,
              amount,
              side,
              price: exactEntryPrice, // click price (server resolves its own authoritative price)
              closedAt,
              durationId: durationIdToSend,
              type: selectedOrderType,
              durationType,
              isDemo: tradingMode === "demo",
            };

            // Add type-specific fields only if required
            if (orderTypeConfig.requiresBarrier) {
              requestBody.barrier = barrier;
              if (selectedBarrierLevel) {
                requestBody.barrierLevelId = selectedBarrierLevel.id;
              }
            }

            if (orderTypeConfig.requiresStrikePrice) {
              requestBody.strikePrice = strikePrice;
              if (selectedStrikeLevel) {
                requestBody.strikeLevelId = selectedStrikeLevel.id;
              }
            }

            if (orderTypeConfig.requiresPayoutPerPoint) {
              requestBody.payoutPerPoint = payoutPerPoint;
            }

            /* A guest's trade stops here. The optimistic order above is the
               whole trade: nothing is posted, so no order row, no wallet
               movement and no user record is ever created for someone who has
               not signed up. What the server would have done at expiry is done
               in the browser instead. */
            if (isGuestNow()) {
              scheduleGuestSettlement(tempOrderId, closedAtDate.getTime(), set, get);
              return true;
            }

            enqueueOrderForBatch(
              requestBody,
              {},
              { tempOrderId, amount, tradingMode: tradingMode === "demo" ? "demo" : "real" },
              set,
              get
            );

            return true; // Instantly return — optimistic order is already on chart
          } catch (error) {
            console.error("Error placing order:", error);
            return false;
          }
        },

        fetchWalletData: async (currency, forceRefresh = false, silent = false) => {
          try {
            // Check if user is authenticated
            const { user } = useUserStore.getState();
            if (!user) {
              set({ isLoadingWallet: false, walletStatus: "unauthenticated" });
              return;
            }

            // Extract the currency from the symbol if not provided
            const currentSymbol = get().currentSymbol;
            if (!currentSymbol) {
              // Nothing was asked for yet; that is not a failed read.
              set({ isLoadingWallet: false, walletStatus: get().realBalance === null ? "idle" : "ready" });
              return;
            }

            /* Which wallet's balance this is.
               This read `let currencyToFetch = "USDT"` — a constant. The
               parameter every caller carefully works out (the pair's quote
               currency) was accepted and then discarded, so the terminal always
               fetched the USDT wallet and always labelled the balance USDT, no
               matter which currency the trader had chosen in the header. That
               is the "it keeps changing back to USDT" report: it never changed
               back, it was never anything else.

               Order of preference: what the caller asked for, then the
               trader's own choice from the header, then the quote currency of
               the pair on screen, and only then USDT as a last resort. */
            /* The funding wallet, which is USDT — deliberately not the currency
               the trader picked in the header.

               Those are two different things and conflating them emptied the
               terminal. Every funded wallet on this platform is USDT/SPOT; the
               header picker chooses how a balance is DISPLAYED, and the fiat
               codes it offers (INR, AED, NGN…) either have no wallet at all or
               have one holding zero. Making this follow that preference, or the
               quote currency of the pair on screen, fetched an empty wallet and
               showed real, funded accounts as 0.00.

               So this stays USDT until the platform genuinely holds balances in
               more than one currency, at which point the wallet to read must
               come from the account's wallets — never from a display setting. */
            let currencyToFetch = "USDT";

            // Validate currency
            if (!currencyToFetch || currencyToFetch.length < 2) {
              set({ isLoadingWallet: false, walletStatus: "error" });
              return;
            }

            // Prevent duplicate calls - check if we're already loading this currency (only if not silent)
            const currentState = get();
            if (!silent && currentState.isLoadingWallet) {
              return;
            }

            // Create cache key for this currency
            const cacheKey = `wallet_${currencyToFetch}`;
            const now = Date.now();

            // Clear cache if force refresh is requested (e.g., after placing an order)
            if (forceRefresh && typeof window !== 'undefined') {
              sessionStorage.removeItem(cacheKey);
            }

            // Check if we have recent cached data (within 30 seconds)
            if (!forceRefresh && typeof window !== 'undefined') {
              const cached = sessionStorage.getItem(cacheKey);
              if (cached) {
                try {
                  const { data: cachedData, timestamp } = JSON.parse(cached);
                  if (now - timestamp < 30000 && cachedData?.balance !== undefined) { // 30 seconds cache
                    set({
                      realBalance: cachedData.balance,
                      isLoadingWallet: false,
                      walletStatus: "ready",
                      ...(get().tradingMode === "real"
                        ? { balance: cachedData.balance }
                        : {}),
                    });
                    return;
                  }
                } catch {
                  sessionStorage.removeItem(cacheKey);
                }
              }
            }

            if (!silent) {
              set({ isLoadingWallet: true });
            }
            /* Only shimmer when there is nothing to shimmer over. A background
               refresh of a balance already on screen must not blank it. */
            if (get().realBalance === null) {
              set({ walletStatus: "loading" });
            }

            /* Whichever USDT wallet the money is actually in.

               This asked for SPOT and only SPOT, while the order flow that
               charges the trade looks for a USDT wallet of type SPOT, then
               FUNDING, then BINARY, then any type at all. So the two halves of
               the platform disagreed about where a trader's money lives: credit
               a USDT wallet of any other type — which is exactly what happens
               when a balance is set from the admin panel without matching the
               type — and the terminal reported zero while the engine would
               happily have spent it.

               The fallback resolves it the same way the server does, and in the
               same order. Order matters and is not cosmetic: the balance on
               screen has to be the balance that gets charged, so this picks the
               one the engine would pick rather than summing across wallets. A
               total that includes money the engine cannot reach is a promise the
               platform will not keep. */
            let { data, error } = await $fetch({
              url: `/api/finance/wallet/SPOT/${currencyToFetch}?t=${Date.now()}`,
              silent: true, // Don't show loading toast for background wallet refresh
            });

            if (error || data?.balance === undefined) {
              const { data: list } = await $fetch({
                url: `/api/finance/wallet?limit=100&t=${Date.now()}`,
                silent: true,
              });
              const wallets: any[] = Array.isArray(list) ? list : (list?.items ?? list?.data ?? []);
              const candidates = wallets.filter(
                (w) => String(w?.currency).toUpperCase() === currencyToFetch && w?.balance !== undefined
              );
              const byType = (t: string) => candidates.find((w) => String(w?.type).toUpperCase() === t);
              const resolved = byType("SPOT") ?? byType("FUNDING") ?? byType("BINARY") ?? candidates[0];
              if (resolved) {
                data = resolved;
                error = undefined as any;
              }
            }

            if (!error && data?.balance !== undefined) {
              // Cache the successful response
              if (typeof window !== 'undefined') {
                sessionStorage.setItem(cacheKey, JSON.stringify({
                  data,
                  timestamp: now
                }));
              }

              // Update real balance
              set({
                realBalance: data.balance,
                isLoadingWallet: false,
                walletStatus: "ready",
                // If in real mode, update the displayed balance
                ...(get().tradingMode === "real"
                  ? { balance: data.balance }
                  : {}),
              });
            } else {
              /* An expired session and a genuinely missing wallet look identical
                 from here — both arrive as "no balance" — but they need opposite
                 things from the trader, so they are told apart by the message.
                 Note the API answers HTTP 200 with the refusal in the body, so
                 the status code cannot be used for this. */
              const reason = String(error ?? "");
              const unauthenticated = /authentication|unauthor|session|token|login/i.test(reason);
              console.warn(
                `Wallet unavailable for ${currencyToFetch} (${unauthenticated ? "not signed in" : reason || "no wallet"})`
              );
              set({
                isLoadingWallet: false,
                walletStatus: unauthenticated ? "unauthenticated" : "error",
                // Don't update balance if wallet not found - keep existing balance
              });
            }
          } catch (error) {
            console.warn("Error fetching wallet data:", error);
            set({ isLoadingWallet: false, walletStatus: "error" });
          }
        },

        // Fetch binary settings from the global config store (no separate API call needed)
        // The binarySettings are already included in the main /api/settings response
        fetchBinarySettings: async () => {
          try {
            // Prevent duplicate calls if already loading
            if (get().isLoadingSettings) {
              return;
            }

            // Check cache first - respects TTL so settings refresh periodically
            const cached = getCachedData('binary_settings');
            if (cached) {
              // Only update state if the cached value is actually different
              // This prevents unnecessary re-renders when the same cached data is returned
              const currentSettings = get().binarySettings;
              if (currentSettings !== cached) {
                set({
                  binarySettings: cached,
                  selectedOrderType: cached.display?.defaultOrderType || "RISE_FALL",
                });
              }
              return;
            }

            set({ isLoadingSettings: true });

            // Get binary settings from the global config store instead of making a separate API call
            // The main /api/settings endpoint includes binarySettings as a JSON string
            const { useConfigStore } = await import('@/store/config');

            // Wait for the config store settings to be fetched
            // Poll for settings with a timeout to avoid infinite waiting
            let mainSettings = useConfigStore.getState().settings;
            let settingsFetched = useConfigStore.getState().settingsFetched;
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max wait (50 * 100ms)

            // Wait until settings are fetched OR we have binarySettings available
            while ((!settingsFetched || !mainSettings?.binarySettings) && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 100));
              const state = useConfigStore.getState();
              mainSettings = state.settings;
              settingsFetched = state.settingsFetched;
              attempts++;
            }

            if (mainSettings?.binarySettings) {
              let settings: any;

              // Parse the binarySettings if it's a JSON string
              if (typeof mainSettings.binarySettings === 'string') {
                try {
                  settings = JSON.parse(mainSettings.binarySettings);
                } catch (e) {
                  console.warn("Failed to parse binarySettings from config store:", e);
                  set({ isLoadingSettings: false });
                  return;
                }
              } else {
                settings = mainSettings.binarySettings;
              }

              // Cache the result
              setCachedData('binary_settings', settings);

              // Only update state if settings actually changed
              // This prevents unnecessary re-renders when polling returns identical settings
              const currentSettings = get().binarySettings;
              const settingsChanged = !currentSettings ||
                JSON.stringify(currentSettings) !== JSON.stringify(settings);

              if (settingsChanged) {
                set({
                  binarySettings: settings,
                  isLoadingSettings: false,
                  selectedOrderType: settings.display?.defaultOrderType || "RISE_FALL",
                });
              } else {
                // Settings unchanged, just update loading state
                set({ isLoadingSettings: false });
              }

              // Note: Do NOT set binaryDurations here from settings.
              // The durations with correctly calculated cumulative profit adjustments
              // come from the /api/exchange/binary/duration endpoint.
              // fetchBinaryDurations() should be called separately to get accurate profits.
            } else {
              console.warn("binarySettings not found in config store after waiting, using fallback binary settings");
              const fallbackSettings = {
                global: {
                  enabled: true,
                  practiceEnabled: true,
                  maxConcurrentOrders: 10,
                  maxDailyOrders: 100,
                  cooldownSeconds: 0,
                  orderExpirationBuffer: 30,
                  cancelExpirationBuffer: 60,
                  minOrderAmount: 1,
                  maxOrderAmount: 1000,
                },
                display: {
                  chartType: "CHART_ENGINE",
                },
                orderTypes: {
                  RISE_FALL: {
                    enabled: true,
                    profitPercentage: 85,
                    tradingModes: { demo: true, live: true },
                  },
                  HIGHER_LOWER: {
                    enabled: true,
                    profitPercentage: 80,
                    barrierLevels: [
                      { id: "hl_close", label: "Close (0.1%)", distancePercent: 0.1, profitPercent: 85, enabled: true },
                      { id: "hl_near", label: "Near (0.25%)", distancePercent: 0.25, profitPercent: 75, enabled: true },
                      { id: "hl_medium", label: "Medium (0.5%)", distancePercent: 0.5, profitPercent: 65, enabled: true },
                    ],
                    tradingModes: { demo: true, live: true },
                  },
                  TOUCH_NO_TOUCH: {
                    enabled: true,
                    profitPercentage: 200,
                    barrierLevels: [
                      { id: "tn_close", label: "Close (0.2%)", distancePercent: 0.2, profitPercent: 150, enabled: true },
                      { id: "tn_near", label: "Near (0.5%)", distancePercent: 0.5, profitPercent: 200, enabled: true },
                      { id: "tn_medium", label: "Medium (1%)", distancePercent: 1.0, profitPercent: 300, enabled: true },
                    ],
                    touchProfitMultiplier: 1.0,
                    noTouchProfitMultiplier: 0.8,
                    tradingModes: { demo: true, live: true },
                  },
                  CALL_PUT: {
                    enabled: true,
                    profitPercentage: 85,
                    strikeLevels: [
                      { id: "cp_atm", label: "At The Money (0.1%)", distancePercent: 0.1, profitPercent: 85, enabled: true },
                      { id: "cp_near", label: "Near (0.5%)", distancePercent: 0.5, profitPercent: 75, enabled: true },
                      { id: "cp_otm", label: "Out of Money (1%)", distancePercent: 1.0, profitPercent: 60, enabled: true },
                    ],
                    tradingModes: { demo: true, live: true },
                  },
                  TURBO: {
                    enabled: true,
                    profitPercentage: 70,
                    barrierLevels: [
                      { id: "turbo_tight", label: "Tight (0.05%)", distancePercent: 0.05, profitPercent: 70, enabled: true },
                      { id: "turbo_normal", label: "Normal (0.1%)", distancePercent: 0.1, profitPercent: 60, enabled: true },
                      { id: "turbo_wide", label: "Wide (0.2%)", distancePercent: 0.2, profitPercent: 50, enabled: true },
                    ],
                    payoutPerPointRange: { min: 0.1, max: 10 },
                    maxDuration: 5,
                    allowTicksBased: true,
                    tradingModes: { demo: true, live: true },
                  },
                },
                durations: [
                  { id: "d_1m", minutes: 1, enabled: true },
                  { id: "d_3m", minutes: 3, enabled: true },
                  { id: "d_5m", minutes: 5, enabled: true },
                  { id: "d_15m", minutes: 15, enabled: true },
                  { id: "d_30m", minutes: 30, enabled: true },
                  { id: "d_1h", minutes: 60, enabled: true },
                ],
                riskManagement: {
                  dailyLossLimit: 0,
                  winRateAlert: 70,
                },
              };

              set({
                binarySettings: fallbackSettings,
                isLoadingSettings: false,
                selectedOrderType: "RISE_FALL",
              });
            }
          } catch (error) {
            console.warn("Error fetching binary settings, using fallback settings:", error);
            const fallbackSettings = {
              global: {
                enabled: true,
                practiceEnabled: true,
                maxConcurrentOrders: 10,
                maxDailyOrders: 100,
                cooldownSeconds: 0,
                orderExpirationBuffer: 30,
                cancelExpirationBuffer: 60,
                minOrderAmount: 1,
                maxOrderAmount: 1000,
              },
              display: {
                chartType: "CHART_ENGINE",
              },
              orderTypes: {
                RISE_FALL: {
                  enabled: true,
                  profitPercentage: 85,
                  tradingModes: { demo: true, live: true },
                },
                HIGHER_LOWER: {
                  enabled: true,
                  profitPercentage: 80,
                  barrierLevels: [
                    { id: "hl_close", label: "Close (0.1%)", distancePercent: 0.1, profitPercent: 85, enabled: true },
                    { id: "hl_near", label: "Near (0.25%)", distancePercent: 0.25, profitPercent: 75, enabled: true },
                    { id: "hl_medium", label: "Medium (0.5%)", distancePercent: 0.5, profitPercent: 65, enabled: true },
                  ],
                  tradingModes: { demo: true, live: true },
                },
                TOUCH_NO_TOUCH: {
                  enabled: true,
                  profitPercentage: 200,
                  barrierLevels: [
                    { id: "tn_close", label: "Close (0.2%)", distancePercent: 0.2, profitPercent: 150, enabled: true },
                    { id: "tn_near", label: "Near (0.5%)", distancePercent: 0.5, profitPercent: 200, enabled: true },
                    { id: "tn_medium", label: "Medium (1%)", distancePercent: 1.0, profitPercent: 300, enabled: true },
                  ],
                  touchProfitMultiplier: 1.0,
                  noTouchProfitMultiplier: 0.8,
                  tradingModes: { demo: true, live: true },
                },
                CALL_PUT: {
                  enabled: true,
                  profitPercentage: 85,
                  strikeLevels: [
                    { id: "cp_atm", label: "At The Money (0.1%)", distancePercent: 0.1, profitPercent: 85, enabled: true },
                    { id: "cp_near", label: "Near (0.5%)", distancePercent: 0.5, profitPercent: 75, enabled: true },
                    { id: "cp_otm", label: "Out of Money (1%)", distancePercent: 1.0, profitPercent: 60, enabled: true },
                  ],
                  tradingModes: { demo: true, live: true },
                },
                TURBO: {
                  enabled: true,
                  profitPercentage: 70,
                  barrierLevels: [
                    { id: "turbo_tight", label: "Tight (0.05%)", distancePercent: 0.05, profitPercent: 70, enabled: true },
                    { id: "turbo_normal", label: "Normal (0.1%)", distancePercent: 0.1, profitPercent: 60, enabled: true },
                    { id: "turbo_wide", label: "Wide (0.2%)", distancePercent: 0.2, profitPercent: 50, enabled: true },
                  ],
                  payoutPerPointRange: { min: 0.1, max: 10 },
                  maxDuration: 5,
                  allowTicksBased: true,
                  tradingModes: { demo: true, live: true },
                },
              },
              durations: [
                { id: "d_1m", minutes: 1, enabled: true },
                { id: "d_3m", minutes: 3, enabled: true },
                { id: "d_5m", minutes: 5, enabled: true },
                { id: "d_15m", minutes: 15, enabled: true },
                { id: "d_30m", minutes: 30, enabled: true },
                { id: "d_1h", minutes: 60, enabled: true },
              ],
              riskManagement: {
                dailyLossLimit: 0,
                winRateAlert: 70,
              },
            };

            set({
              binarySettings: fallbackSettings,
              isLoadingSettings: false,
              selectedOrderType: "RISE_FALL",
            });
          }
        },

        // Force refresh settings (clears cache and refetches)
        forceRefreshSettings: async () => {
          // Clear the cache
          marketDataCache.delete('binary_settings');
          // Reset the settings to allow refetch
          set({ binarySettings: null, isLoadingSettings: false });
          // Fetch fresh data
          await get().fetchBinarySettings();
        },

        // Set selected barrier level
        setSelectedBarrierLevel: (level) => {
          set({ selectedBarrierLevel: level });
          // Also update the barrier price if we have current price
          if (level && get().currentPrice > 0) {
            const { selectedOrderType, currentPrice } = get();
            // Calculate barrier based on distance from current price
            // For HIGHER side, barrier is above current price
            // For LOWER side, barrier is below current price
            const isHigherSide = ["HIGHER", "TOUCH", "UP"].includes(get().orders[0]?.side || "HIGHER");
            const distance = currentPrice * (level.distancePercent / 100);
            const barrierPrice = isHigherSide ? currentPrice + distance : currentPrice - distance;
            set({ barrier: barrierPrice });
          }
        },

        // Set selected strike level
        setSelectedStrikeLevel: (level) => {
          set({ selectedStrikeLevel: level });
          if (level && get().currentPrice > 0) {
            const { currentPrice } = get();
            // For CALL, strike is typically above current price
            // For PUT, strike is typically below current price
            const distance = currentPrice * (level.distancePercent / 100);
            set({ strikePrice: currentPrice + distance }); // Default to CALL direction
          }
        },

        // Get enabled order types from settings
        getEnabledOrderTypes: () => {
          const { binarySettings } = get();
          if (!binarySettings || !binarySettings.global.enabled) return [];

          return (Object.entries(binarySettings.orderTypes) as [BinaryOrderType, any][])
            .filter(([_, config]) => config.enabled)
            .map(([type]) => type);
        },

        // Get enabled barrier levels for an order type
        getEnabledBarrierLevels: (orderType: BinaryOrderType) => {
          const { binarySettings } = get();
          if (!binarySettings) return [];

          const config = binarySettings.orderTypes[orderType];
          if (!config || !('barrierLevels' in config)) return [];

          return (config as any).barrierLevels.filter((l: BarrierLevel) => l.enabled);
        },

        // Get enabled strike levels for CALL_PUT
        getEnabledStrikeLevels: () => {
          const { binarySettings } = get();
          if (!binarySettings) return [];

          const config = binarySettings.orderTypes.CALL_PUT;
          if (!config.strikeLevels) return [];

          return config.strikeLevels.filter((l: StrikeLevel) => l.enabled);
        },

        // Get profit percentage for currently selected level
        getProfitForSelectedLevel: () => {
          const { binarySettings, selectedOrderType, selectedBarrierLevel, selectedStrikeLevel } = get();
          if (!binarySettings) return 85; // Default

          const orderConfig = binarySettings.orderTypes[selectedOrderType];
          if (!orderConfig) return 85;

          // For barrier-based types, use selected barrier level profit
          if (selectedBarrierLevel && ['HIGHER_LOWER', 'TOUCH_NO_TOUCH', 'TURBO'].includes(selectedOrderType)) {
            return selectedBarrierLevel.profitPercent;
          }

          // For CALL_PUT, use selected strike level profit
          if (selectedStrikeLevel && selectedOrderType === 'CALL_PUT') {
            return selectedStrikeLevel.profitPercent;
          }

          // Default to base profit percentage
          return orderConfig.profitPercentage;
        },

        // Fetch binary durations with caching
        fetchBinaryDurations: async (symbol?: string) => {
          try {
            const activeSymbol = symbol || get().currentSymbol;
            const cacheKey = activeSymbol ? `binary_durations_${activeSymbol}` : 'binary_durations';

            // Prevent duplicate calls if already loading
            if (get().isLoadingDurations) {
              return;
            }

            // Check cache first
            const cached = getCachedData(cacheKey);
            if (cached) {
              // Only set selectedExpiryMinutes if not already persisted from localStorage
              const currentExpiry = get().selectedExpiryMinutes;
              const hasValidPersistedExpiry = currentExpiry > 0 && cached.some((d: BinaryDuration) => d.duration === currentExpiry);
              set({
                binaryDurations: cached,
                // Keep persisted expiry if it's valid, otherwise use first active duration
                ...(hasValidPersistedExpiry ? {} : {
                  selectedExpiryMinutes: cached.find((d: BinaryDuration) => d.status)?.duration || cached[0].duration,
                }),
              });
              return;
            }

            set({ isLoadingDurations: true });

            const url = activeSymbol
              ? `/api/exchange/binary/duration?symbol=${encodeURIComponent(activeSymbol)}`
              : "/api/exchange/binary/duration";

            const { data, error } = await $fetch({
              url,
              silent: true, // Don't show loading toast for background data fetch
            });

            if (!error && Array.isArray(data)) {
              // Cache the result
              setCachedData(cacheKey, data);

              // Reset failure flag on success
              durationsFetchFailed = false;

              // Only set selectedExpiryMinutes if not already persisted from localStorage
              const currentExpiry = get().selectedExpiryMinutes;
              const hasValidPersistedExpiry = currentExpiry > 0 && data.some((d: BinaryDuration) => d.duration === currentExpiry);

              set({
                binaryDurations: data,
                isLoadingDurations: false,
                // Keep persisted expiry if it's valid, otherwise use first active duration
                ...(data.length > 0 && !hasValidPersistedExpiry
                  ? {
                      selectedExpiryMinutes:
                        data.find((d: BinaryDuration) => d.status)?.duration ||
                        data[0].duration,
                    }
                  : {}),
              });
            } else {
              durationsFetchFailed = true;
              set({ isLoadingDurations: false });
            }
          } catch (error) {
            durationsFetchFailed = true;
            set({ isLoadingDurations: false });
          }
        },

        // Force refresh durations (clears cache and refetches)
        forceRefreshDurations: async () => {
          // Clear the cache
          marketDataCache.delete('binary_durations');
          // Reset the durations array to allow refetch
          set({ binaryDurations: [], isLoadingDurations: false });
          // Reset failure flag
          durationsFetchFailed = false;
          // Fetch fresh data
          await get().fetchBinaryDurations();
        },

        // Fetch binary markets with caching
        fetchBinaryMarkets: async () => {
          try {
            // Prevent duplicate calls if already loading or if previous fetch failed
            if (get().isLoadingMarkets || marketsFetchFailed) {
              return;
            }

            const hasPersistedMarkets = get().binaryMarkets.length > 0;

            if (!hasPersistedMarkets) {
              // Check cache first
              const cached = getCachedData('binary_markets');
              if (cached) {
                // Filter activeMarkets to only include valid markets from the cached data
                const { activeMarkets } = get();
                const validActiveMarkets = activeMarkets.length > 0
                  ? activeMarkets
                  : activeMarkets.filter((m) =>
                      cached.some((bm) =>
                        isSameSymbol(bm.symbol, m.symbol) ||
                        isSameSymbol(bm.label, m.symbol) ||
                        isSameSymbol(`${bm.currency}${bm.pair}`, m.symbol) ||
                        isSameSymbol(`${bm.currency}/${bm.pair}`, m.symbol)
                      )
                    );

                set({ 
                  binaryMarkets: cached,
                  activeMarkets: validActiveMarkets
                });

                // Still set current symbol if needed
                requestAnimationFrame(() => {
                  const { activeMarkets: currentActive, currentSymbol } = get();
                  
                  // Ensure currentSymbol is valid
                  const isCurrentSymbolValid = cached.some((bm) =>
                    isSameSymbol(bm.symbol, currentSymbol) ||
                    isSameSymbol(bm.label, currentSymbol) ||
                    isSameSymbol(`${bm.currency}${bm.pair}`, currentSymbol) ||
                    isSameSymbol(`${bm.currency}/${bm.pair}`, currentSymbol)
                  );

                  if (cached.length > 0 && (currentActive.length === 0 || !currentSymbol || !isCurrentSymbolValid)) {
                    const bestMarket = selectBestMarket(cached);
                    if (bestMarket) {
                      const symbol = bestMarket.symbol || `${bestMarket.currency}/${bestMarket.pair}`;
                      get().setCurrentSymbol(symbol);
                    }
                  }
                });
                return;
              }
            }

            // Only set loading state if we do not already have persisted data
            if (!hasPersistedMarkets) {
              set({ isLoadingMarkets: true });
            }

            const { data, error } = await $fetch({
              url: "/api/exchange/binary/market",
              silent: true, // Don't show loading toast for background data fetch
            });

            if (!error && Array.isArray(data)) {
              const markets = data;

              // Cache the result
              setCachedData('binary_markets', markets);

              // Reset failure flag on success
              marketsFetchFailed = false;

              // Filter activeMarkets to only include valid markets from the API response.
              // IMPORTANT: only prune on a genuine fresh load. On a refresh where we
              // already had persisted markets, keep every user-added market as-is —
              // pruning here was silently dropping selected assets from the nav tabs
              // after a page reload (a transient/format mismatch removed them).
              const { activeMarkets, currentSymbol } = get();
              const validActiveMarkets = hasPersistedMarkets
                ? activeMarkets
                : activeMarkets.filter((m) =>
                    markets.some((bm) =>
                      isSameSymbol(bm.symbol, m.symbol) ||
                      isSameSymbol(bm.label, m.symbol) ||
                      isSameSymbol(`${bm.currency}${bm.pair}`, m.symbol) ||
                      isSameSymbol(`${bm.currency}/${bm.pair}`, m.symbol)
                    )
                  );

              set({ 
                binaryMarkets: markets, 
                isLoadingMarkets: false,
                activeMarkets: validActiveMarkets
              });

              // Use requestAnimationFrame to defer additional state updates
              requestAnimationFrame(() => {
                const { activeMarkets: currentActive, currentSymbol } = get();

                // Ensure currentSymbol is valid
                const isCurrentSymbolValid = markets.some((bm) =>
                  isSameSymbol(bm.symbol, currentSymbol) ||
                  isSameSymbol(bm.label, currentSymbol) ||
                  isSameSymbol(`${bm.currency}${bm.pair}`, currentSymbol) ||
                  isSameSymbol(`${bm.currency}/${bm.pair}`, currentSymbol)
                );

                // Only auto-select if no symbol is currently set or current symbol is invalid
                if (
                  markets.length > 0 &&
                  (currentActive.length === 0 || !currentSymbol || !isCurrentSymbolValid)
                ) {
                  // Use smart selection to pick the best market
                  const bestMarket = selectBestMarket(markets);

                  if (bestMarket) {
                    const symbol =
                      bestMarket.symbol ||
                      `${bestMarket.currency}/${bestMarket.pair}`;

                    // Use setCurrentSymbol to trigger order fetching
                    get().setCurrentSymbol(symbol);
                  }
                } else {
                  // Even if we don't auto-select a market, we should fetch wallet data if we have a current symbol
                  if (currentSymbol) {
                    const quoteCurrency = extractQuoteCurrency(currentSymbol, data);
                    get().fetchWalletData(quoteCurrency, false, true);
                  }
                }
              });
            } else {
              console.warn("Failed to fetch binary markets:", error);
              // Mark as failed to prevent infinite retry loops (e.g., license validation errors)
              marketsFetchFailed = true;
              set({ isLoadingMarkets: false });
            }
          } catch (error) {
            console.warn("Failed to fetch binary markets:", error);
            // Mark as failed to prevent infinite retry loops
            marketsFetchFailed = true;
            set({ isLoadingMarkets: false });
          }
        },

        fetchCompletedOrders: async (loadMore = false) => {
          try {
            const { tradingMode, completedOrdersPagination, hasLoadedCompletedOrders, processedOrderIds } = get();

            // Determine offset based on loadMore flag
            const offset = loadMore ? completedOrdersPagination.offset + completedOrdersPagination.limit : 0;
            const limit = completedOrdersPagination.limit;

            const { data, error } = await $fetch({
              url: `/api/exchange/binary/order?type=CLOSED&limit=${limit}&offset=${offset}`,
              method: "GET",
              silent: true, // Don't show loading toast for background data fetch
            });

            console.log("fetchCompletedOrders API result:", { data, error });

            if (!error && data) {
              const ordersArray = Array.isArray(data) ? data : (data.orders || []);
              const paginationData = data.pagination || {
                total: ordersArray.length,
                limit: limit,
                offset: offset,
                hasMore: false,
              };

              // Filter completed orders and match trading mode
              const filteredOrders = ordersArray.filter((order: any) =>
                order.status !== "PENDING" &&
                !!order.isDemo === (tradingMode === "demo")
              );

              // Transform the API response to match our CompletedOrder interface
              const newCompletedOrders: CompletedOrder[] = filteredOrders.map(toCompletedOrder);

              // Merge API results with existing local completed orders (deduplicated by ID)
              const existingLocalOrders = get().completedOrders || [];
              const orderMap = new Map<string, CompletedOrder>();
              newCompletedOrders.forEach(o => orderMap.set(o.id, o));
              existingLocalOrders.forEach(o => {
                if (!!o.isDemo === (tradingMode === "demo") && !orderMap.has(o.id)) {
                  orderMap.set(o.id, o);
                }
              });
              const updatedOrders = Array.from(orderMap.values());

              // If not loading more, handle demo balance syncing
              if (!loadMore && tradingMode === "demo") {
                if (!hasLoadedCompletedOrders) {
                  // Initial load: mark all existing completed orders as processed without crediting them
                  const initialProcessedIds = newCompletedOrders.map(o => o.id);
                  set({
                    processedOrderIds: initialProcessedIds,
                    hasLoadedCompletedOrders: true,
                  });
                } else {
                  // Subsequent loads: reconcile balance for newly completed orders
                  let demoBalanceAdjustment = 0;
                  let netPLAdjustment = 0;
                  const newProcessedIds: string[] = [];

                  for (const completedOrder of newCompletedOrders) {
                    if (!processedOrderIds.includes(completedOrder.id)) {
                      const balanceChange = (() => {
                        if (completedOrder.status === 'WIN') {
                          return completedOrder.amount + completedOrder.profit;
                        } else if (completedOrder.status === 'DRAW') {
                          return completedOrder.amount;
                        } else if (completedOrder.status === 'LOSS') {
                          return completedOrder.profit > 0 ? completedOrder.profit : 0;
                        }
                        return 0;
                      })();

                      const profitForPL = (() => {
                        if (completedOrder.status === 'WIN') {
                          return completedOrder.profit;
                        } else if (completedOrder.status === 'DRAW') {
                          return 0;
                        } else if (completedOrder.status === 'LOSS') {
                          return completedOrder.profit > 0 ? completedOrder.profit : -completedOrder.amount;
                        }
                        return 0;
                      })();

                      demoBalanceAdjustment += balanceChange;
                      netPLAdjustment += profitForPL;
                      newProcessedIds.push(completedOrder.id);
                    }
                  }

                  if (demoBalanceAdjustment > 0 || netPLAdjustment !== 0 || newProcessedIds.length > 0) {
                    set((state) => {
                      const newDemoBalance = state.demoBalance + demoBalanceAdjustment;
                      return {
                        demoBalance: newDemoBalance,
                        ...(state.tradingMode === 'demo' ? { balance: newDemoBalance } : {}),
                        netPL: state.netPL + netPLAdjustment,
                        processedOrderIds: [...state.processedOrderIds, ...newProcessedIds],
                      };
                    });
                  }
                }
              }

              set({
                completedOrders: updatedOrders,
                completedOrdersPagination: paginationData,
              });

              // Fetch wallet data to sync balance after orders complete (only on initial load)
              if (!loadMore) {
                get().fetchWalletData(undefined, false, true);
              }
            } else {
              console.warn("Failed to fetch completed orders:", error);
            }
          } catch (error) {
            console.warn("Error fetching completed orders:", error);
          }
        },

        /**
         * The whole book, for the pages that are about the whole book.
         *
         * `fetchCompletedOrders` reads fifty. That is right for the terminal —
         * a positions list nobody scrolls past the first screen of — and wrong
         * for everything the analytics overlay draws, all of which asks
         * questions about history:
         *
         *   · the dashboard opens on the month once the account is two months
         *     old, and could never tell, because the oldest of fifty trades is
         *     rarely sixty days back;
         *   · the journal's calendar covers six months and had a fortnight of
         *     colour in it;
         *   · the week-against-week bars compared this week with a blank one;
         *   · and picking any date outside those fifty showed an empty page.
         *
         * All four were read as separate bugs. They were one number.
         *
         * Merge-only on purpose: it never touches balances or the processed-id
         * ledger. Those belong to the paged fetch, which is the one that knows
         * which settlements are new — a second path crediting the demo balance
         * for a year of history would be a fortune arriving on page load.
         */
        loadCompletedHistory: async (limit = 1000) => {
          try {
            const { tradingMode } = get();
            const { data, error } = await $fetch({
              url: `/api/exchange/binary/order?type=CLOSED&limit=${limit}&offset=0`,
              method: "GET",
              silent: true,
            });
            if (error || !data) return;

            const ordersArray = Array.isArray(data) ? data : data.orders || [];
            const history = ordersArray
              .filter(
                (order: any) =>
                  order.status !== "PENDING" && !!order.isDemo === (tradingMode === "demo")
              )
              .map(toCompletedOrder);
            if (history.length === 0) return;

            set((state) => {
              const byId = new Map<string, CompletedOrder>();
              /* Existing first, history second: an order already in the store
                 may carry a local settlement this response predates. */
              state.completedOrders.forEach((o) => byId.set(o.id, o));
              history.forEach((o: CompletedOrder) => {
                if (!byId.has(o.id)) byId.set(o.id, o);
              });
              return { completedOrders: Array.from(byId.values()) };
            });
          } catch {
            /* Silent: the pages that call this already render from whatever
               the paged fetch left in the store. */
          }
        },

        loadMoreCompletedOrders: async () => {
          const { completedOrdersPagination } = get();
          if (completedOrdersPagination.hasMore) {
            await get().fetchCompletedOrders(true);
          }
        },

        resetCompletedOrdersPagination: () => {
          set({
            completedOrdersPagination: {
              total: 0,
              limit: 50,
              offset: 0,
              hasMore: false,
            },
          });
        },

        fetchActiveOrders: async () => {
          try {
            const { tradingMode, binaryMarkets, binaryDurations } = get();

            const { data, error } = await $fetch({
              url: `/api/exchange/binary/order?type=OPEN`,
              method: "GET",
              silent: true, // Don't show loading toast for background data fetch
            });

            console.log("fetchActiveOrders API result:", { data, error });

            if (!error && data) {
              // API returns { orders: [...], pagination: {...} } format
              const ordersArray = Array.isArray(data) ? data : (data.orders || []);

              // Transform the API response to match our Order interface
              const activeOrders: Order[] = ordersArray.map((order: any) => {
                // Calculate duration in minutes
                const expiryTime = new Date(order.closedAt).getTime();
                const createdTime = new Date(order.createdAt).getTime();
                const durationMinutes = Math.round((expiryTime - createdTime) / (60 * 1000));

                // Find matching duration and get type-specific profit percentage
                const orderType: BinaryOrderType = order.type || 'RISE_FALL';
                const duration = binaryDurations.find(d => d.duration === durationMinutes);
                const profitPercentage = duration
                  ? getProfitPercentageForType(duration, orderType)
                  : 85; // Default to 85% if not found

                return {
                  id: order.id,
                  symbol: order.symbol,
                  side: order.side,
                  amount: order.amount,
                  entryPrice: order.price,
                  expiryTime,
                  createdAt: createdTime,
                  status: "PENDING", // All fetched orders should be pending
                  mode: !!order.isDemo ? "demo" : "real",
                  profitPercentage, // Include profit percentage
                  // Include type-specific fields for proper chart rendering
                  type: orderType,
                  barrier: order.barrier,
                  strikePrice: order.strikePrice,
                  payoutPerPoint: order.payoutPerPoint,
                };
              });

              // Update the orders in state (replace existing ones to avoid duplicates)
              set((state) => ({
                orders: [
                  // Keep orders that are not pending
                  ...state.orders.filter(
                    (order) => order.status !== "PENDING"
                  ),
                  // Add the fetched active orders
                  ...activeOrders,
                ],
              }));

              // Fetch wallet data to sync balance after fetching orders
              get().fetchWalletData(undefined, false, true);
            } else {
              console.warn("Failed to fetch active orders:", error);
            }
          } catch (error) {
            console.warn("Error fetching active orders:", error);
          }
        },

        updateOrders: () => {
          const { orders, currentPrice, currentSymbol, activeMarkets } = get();

          // Check if we're in the safe zone (15 seconds before expiry)
          const nextExpiry = get().durationMode === "DURATION"
            ? new Date(getChartSynchronizedTime().getTime() + get().customDurationSeconds * 1000)
            : calculateNextExpiryTime(get().selectedExpiryMinutes);
          const timeToExpiry =
            nextExpiry.getTime() - getChartSynchronizedTime().getTime();
          const inSafeZone = false;

          // If no orders, just update safe zone and return
          if (orders.length === 0) {
            if (get().isInSafeZone !== inSafeZone) {
              set({ isInSafeZone: inSafeZone });
            }
            return;
          }

          // Get current time
          const now = getChartSynchronizedTime().getTime();

          // Remove expired orders from active list - backend will handle resolution via WebSocket
          const activeOrders = orders.filter(
            order => order.status === "PENDING" && order.expiryTime > now
          );

          // Check if any orders expired since last update
          const hadExpiredOrders = activeOrders.length < orders.length;

          // Update profit for active (not expired) orders
          const updatedOrders = activeOrders.map((order) => {
            // Find current price for this specific order's symbol
            let orderPrice = currentPrice;
            if (!isSameSymbol(order.symbol, currentSymbol)) {
              const activeMarket = activeMarkets.find(m => isSameSymbol(m.symbol, order.symbol));
              if (activeMarket && activeMarket.price > 0) {
                orderPrice = activeMarket.price;
              } else {
                orderPrice = order.entryPrice; // default fallback (0 profit)
              }
            }

            // Calculate current profit/loss for active orders
            const isUpDirection = ["RISE", "CALL", "HIGHER", "UP", "TOUCH"].includes(String(order.side).toUpperCase());
            const currentProfit = isUpDirection
              ? orderPrice > order.entryPrice
                ? ((orderPrice - order.entryPrice) / (order.entryPrice || 1)) * order.amount
                : -(((order.entryPrice - orderPrice) / (order.entryPrice || 1)) * order.amount)
              : orderPrice < order.entryPrice
                ? ((order.entryPrice - orderPrice) / (order.entryPrice || 1)) * order.amount
                : -(((orderPrice - order.entryPrice) / (order.entryPrice || 1)) * order.amount);

            return {
              ...order,
              profit: currentProfit,
            };
          });

          set({
            orders: updatedOrders,
            isInSafeZone: inSafeZone,
          });

          // If orders expired, fetch completed orders from backend to get actual results
          if (hadExpiredOrders) {
            get().fetchCompletedOrders();
          }
        },

        // Cancel an active order and refund the amount
        cancelOrder: async (orderId: string) => {
          const { orders, tradingMode } = get();

          // Find the order
          const order = orders.find(o => o.id === orderId);
          if (!order) {
            return { success: false, error: "Order not found" };
          }

          // Validate order is pending
          if (order.status !== "PENDING") {
            return { success: false, error: "Order is not pending" };
          }

          // Validate not too close to expiry (10 seconds minimum)
          const timeUntilExpiry = order.expiryTime - Date.now();
          if (timeUntilExpiry < 10000) {
            return { success: false, error: "Too close to expiry to cancel" };
          }

          try {
            // Call the API to cancel the order
            const { data, error } = await $fetch({
              url: `/api/exchange/binary/order/${orderId}/cancel`,
              method: "POST",
              body: {
                isDemo: tradingMode === "demo",
              },
            });

            if (error) {
              return { success: false, error: typeof error === 'string' ? error : (error as Error).message || "Failed to cancel order" };
            }

            // Calculate refund (full amount for now, can add cancellation fee later)
            const refundAmount = data?.refundAmount ?? order.amount;
            const cancellationFee = data?.cancellationFee ?? 0;

            // Update local state
            set((state) => ({
              // Remove from active orders
              orders: state.orders.filter(o => o.id !== orderId),
              // Refund to balance
              balance: state.balance + refundAmount,
              ...(tradingMode === "demo"
                ? { demoBalance: state.demoBalance + refundAmount }
                : { realBalance: (state.realBalance ?? 0) + refundAmount }),
              // Add to completed orders as CANCELLED
              completedOrders: [
                {
                  id: order.id,
                  symbol: order.symbol,
                  side: order.side,
                  amount: order.amount,
                  entryPrice: order.entryPrice,
                  closePrice: order.entryPrice, // No price change for cancelled
                  entryTime: new Date(order.createdAt),
                  expiryTime: new Date(order.expiryTime),
                  status: "CANCELLED" as any, // Cast to any since type expects WIN/LOSS
                  profit: -cancellationFee, // Fee as negative profit
                  isDemo: tradingMode === "demo", // Include trading mode for filtering
                },
                ...state.completedOrders,
              ],
            }));

            return { success: true, refundAmount };
          } catch (error: any) {
            console.error("Error cancelling order:", error);
            return { success: false, error: error.message || "Failed to cancel order" };
          }
        },

        // Close an order early at current market value
        closeOrderEarly: async (orderId: string) => {
          const { orders, tradingMode } = get();

          // Find the order
          const order = orders.find(o => o.id === orderId);
          if (!order) {
            return { success: false, error: "Order not found" };
          }

          // Validate order is pending
          if (order.status !== "PENDING") {
            return { success: false, error: "Order is not pending" };
          }

          // Validate minimum time from entry (30 seconds)
          const timeFromEntry = Date.now() - order.createdAt;
          if (timeFromEntry < 30000) {
            return { success: false, error: "Must wait 30 seconds after entry" };
          }

          // Validate not too close to expiry (10 seconds minimum)
          const timeUntilExpiry = order.expiryTime - Date.now();
          if (timeUntilExpiry < 10000) {
            return { success: false, error: "Too close to expiry" };
          }

          try {
            /* No price is sent. The server resolves the close price from the
               live feed itself, which is both the only trustworthy source — a
               client-supplied price on a PUT wins at any value below entry, and
               0 is below every entry — and the only reliable one: this store's
               currentPrice belongs to the chart's symbol, so a position on any
               other instrument was closing at a price that was not its own, and
               at 0 whenever the chart had not priced it at all. */
            const { data, error } = await $fetch({
              url: `/api/exchange/binary/order/${orderId}/close`,
              method: "POST",
              body: { isDemo: tradingMode === "demo" },
            });

            if (error) {
              /* Passed through verbatim. The server distinguishes "wait 9s
                 more", "too close to expiry", "already settled" and "no live
                 price", and flattening them into one message is what left the
                 panel showing an unexplained "Cash Out Failed" for every cause. */
              return {
                success: false,
                error:
                  typeof error === "string"
                    ? error
                    : (error as Error)?.message || "Failed to close position",
              };
            }

            /* The server's figures are the ones that moved the wallet, so they
               are the ones recorded here. This used to recompute the payout from
               the chart price and fall back to that when the response lacked a
               field, which meant the balance shown could disagree with the
               balance actually credited. */
            const cashoutAmount = Number(data?.cashoutAmount) || 0;
            const actualPenalty = Number(data?.penalty) || 0;
            const actualProfit = Number(data?.profit) || 0;
            const closedAtPrice = Number(data?.closePrice) || order.entryPrice;
            const closedAsWin = data?.status === "WIN";

            // Update local state
            set((state) => ({
              // Remove from active orders
              orders: state.orders.filter(o => o.id !== orderId),
              // Update balance with cashout amount
              balance: state.balance + cashoutAmount,
              // Update net P/L
              netPL: state.netPL + actualProfit,
              ...(tradingMode === "demo"
                ? { demoBalance: state.demoBalance + cashoutAmount }
                : { realBalance: (state.realBalance ?? 0) + cashoutAmount }),
              // Add to completed orders as CLOSED_EARLY
              completedOrders: [
                {
                  id: order.id,
                  symbol: order.symbol,
                  side: order.side,
                  amount: order.amount,
                  entryPrice: order.entryPrice,
                  closePrice: closedAtPrice,
                  entryTime: new Date(order.createdAt),
                  expiryTime: new Date(order.expiryTime),
                  /* The status the server recorded, not a local label. The
                     column is an enum without CLOSED_EARLY, so the row comes
                     back as WIN or LOSS on the next fetch — writing anything
                     else here makes the trade change its own outcome on
                     refresh. closedEarly carries the distinction instead. */
                  status: (closedAsWin ? "WIN" : "LOSS") as any,
                  closedEarly: true,
                  profit: actualProfit,
                  isDemo: tradingMode === "demo", // Include trading mode for filtering
                  // Resolved here and now by the trader pressing exit, so it is
                  // news and gets announced like any other live settlement.
                  justSettled: true,
                },
                ...state.completedOrders,
              ],
            }));

            return {
              success: true,
              cashoutAmount,
              penalty: actualPenalty,
            };
          } catch (error: any) {
            console.error("Error closing order early:", error);
            return { success: false, error: error.message || "Failed to close order" };
          }
        },

        symbolPrices: {},

        getSymbolPrice: (symbol) => {
          if (!symbol) return get().currentPrice || 0;
          const symbolPrices = get().symbolPrices || {};
          if (symbolPrices[symbol] && symbolPrices[symbol] > 0) return symbolPrices[symbol];
          const withSlash = symbol.includes("/") ? symbol : symbol.replace("_OTC", "/OTC");
          if (symbolPrices[withSlash] && symbolPrices[withSlash] > 0) return symbolPrices[withSlash];
          const noSlash = symbol.replace("/", "").replace("_OTC", "OTC");
          if (symbolPrices[noSlash] && symbolPrices[noSlash] > 0) return symbolPrices[noSlash];
          if (isSameSymbol(symbol, get().currentSymbol)) return get().currentPrice || 0;
          return 0;
        },

        // Set current price (used by components that read from WebSocket or chart engine)
        setCurrentPrice: (price) => {
          const prevPrice = get().currentPrice;
          if (prevPrice === price) return;
          const currentSymbol = get().currentSymbol;
          const existingPrices = get().symbolPrices || {};
          const nextPrices = { ...existingPrices };
          if (currentSymbol) {
            nextPrices[currentSymbol] = price;
            const withSlash = currentSymbol.includes("/") ? currentSymbol : currentSymbol.replace("_OTC", "/OTC");
            nextPrices[withSlash] = price;
          }
          set({ currentPrice: price, symbolPrices: nextPrices });
          if (get().orders.length > 0) {
            get().updateOrders();
          }
        },

        // Set candle data (used by components that read from WebSocket)
        setCandleData: (data) => {
          set({ candleData: data });
        },

        // Initialize order WebSocket subscription
        initOrderWebSocket: () => {
          const { user } = useUserStore.getState();
          if (!user?.id) return;

          // Start the order update interval for active countdowns
          startUpdateInterval();

          // Import WebSocket store dynamically to avoid circular dependencies
          import('@/store/websocket-store').then(({ useWebSocketStore }) => {
            const wsStore = useWebSocketStore.getState();
            const connectionKey = 'binary-orders';

            // Debounce timer: ONE wallet fetch fires 1s after the LAST ORDER_COMPLETED
            let walletFetchTimer: ReturnType<typeof setTimeout> | null = null;
            let demoBalanceTimer: ReturnType<typeof setTimeout> | null = null;

            // Helper to subscribe to all open markets
            const subscribeToAllMarkets = () => {
              const { activeMarkets, currentSymbol } = get();
              if (currentSymbol) {
                wsStore.subscribe(connectionKey, 'order', {
                  symbol: currentSymbol,
                  userId: user.id,
                });
              }
              activeMarkets.forEach((market) => {
                if (market.symbol && market.symbol !== currentSymbol) {
                  wsStore.subscribe(connectionKey, 'order', {
                    symbol: market.symbol,
                    userId: user.id,
                  });
                }
              });
            };

            // Check if connection is already created. If so, just subscribe to all active symbols.
            const hasConnection = !!wsStore.connections[connectionKey];
            if (hasConnection) {
              subscribeToAllMarkets();
              return;
            }

            // In development the backend port is reachable directly. In production
            // it is not exposed publicly — nginx serves 443 and proxies /api/,
            // including WebSocket upgrades, to the backend. Hardcoding :4000 here
            // meant this socket never connected on a real deployment, so
            // ORDER_COMPLETED never arrived: settled trades only appeared after a
            // manual refresh and no result toast ever fired. Mirrors the pattern in
            // services/market-data-ws.ts and utils/ws.ts.
            const isDev = process.env.NODE_ENV === 'development';
            const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || '4000';
            const wsBase =
              process.env.NEXT_PUBLIC_WS_URL ||
              (typeof window !== 'undefined'
                ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${
                    isDev ? `${window.location.hostname}:${backendPort}` : window.location.host
                  }`
                : `ws://localhost:${backendPort}`);
            const wsUrl = `${wsBase}/api/exchange/binary/order`;

            // Create WebSocket connection
            wsStore.createConnection(connectionKey, wsUrl, {
              onOpen: () => {
                console.log('Binary orders WebSocket connected');
                subscribeToAllMarkets();
              },
              onClose: () => {
                console.log('Binary orders WebSocket disconnected');
              },
              onError: (error) => {
                console.warn('Binary orders WebSocket error:', error);
              },
            });

            // Add message handler for ORDER_COMPLETED events
            wsStore.addMessageHandler(
              connectionKey,
              (message: any) => {
                const { type, order } = message;

                /* A trade placed on one device, appearing on the others.
                   Previously only completion was broadcast, so a second screen
                   showed nothing at all until it was reloaded — the trade was
                   live and the money committed, and that screen had no idea.

                   Deduped three ways because this message also comes back to
                   the device that placed the trade, which already added the
                   order optimistically. Its temporary `opt_` id is swapped for
                   the server's when the POST returns, so an id check covers it
                   once that has happened; the pending-match below covers the
                   window before it, where the order is present but still under
                   its temporary id. Getting this wrong would show the trader a
                   phantom second trade they never placed. */
                if (type === 'ORDER_CREATED' && order?.id) {
                  const { orders, completedOrders, processedOrderIds } = get();

                  if (orders.some((o: any) => o.id === order.id)) return;
                  if (completedOrders.some((o: any) => o.id === order.id)) return;
                  if (processedOrderIds.includes(order.id)) return;

                  const createdAt = new Date(order.createdAt).getTime();
                  const awaitingReconcile = orders.some(
                    (o: any) =>
                      typeof o.id === "string" &&
                      o.id.startsWith("opt_") &&
                      o.symbol === order.symbol &&
                      o.side === order.side &&
                      Number(o.amount) === Number(order.amount) &&
                      Math.abs(Number(o.createdAt) - createdAt) < 15000
                  );
                  if (awaitingReconcile) return;

                  const remoteOrder: any = {
                    id: order.id,
                    symbol: order.symbol,
                    side: order.side,
                    amount: Number(order.amount),
                    entryPrice: Number(order.price ?? order.entryPrice),
                    expiryTime: new Date(order.closedAt).getTime(),
                    createdAt,
                    status: "PENDING",
                    mode: order.isDemo ? "demo" : "real",
                    profitPercentage: Number(order.profit ?? 85),
                    type: order.type,
                    barrier: order.barrier ?? undefined,
                    strikePrice: order.strikePrice ?? undefined,
                    payoutPerPoint: order.payoutPerPoint ?? undefined,
                  };

                  set((state: any) => ({ orders: [...state.orders, remoteOrder] }));
                  syncOrdersToChartEngine(get().orders);

                  // Settle the demo figure against the server too, so a trade
                  // placed elsewhere moves this screen's balance as well.
                  get().fetchDemoBalance();

                  // Balance is not adjusted here. The server has already taken
                  // the stake and is the only thing that knows the true figure;
                  // subtracting locally as well would drift this screen away
                  // from it. Refetching keeps every device on the same number.
                  get().fetchWalletData(undefined, true, true);
                  return;
                }

                if (type === 'ORDER_COMPLETED' && order) {
                  const { binaryDurations, completedOrders } = get();

                  // Prevent duplicate processing if already completed/processed
                  const { processedOrderIds } = get();
                  if (processedOrderIds.includes(order.id)) return;

                  // Calculate duration for profit percentage lookup
                  const expiryTime = new Date(order.closedAt).getTime();
                  const createdTime = new Date(order.createdAt).getTime();
                  const durationMinutes = Math.round((expiryTime - createdTime) / (60 * 1000));

                  // Find matching duration and get type-specific profit percentage
                  const duration = binaryDurations.find(d => d.duration === durationMinutes);
                  const profitPercentage = duration
                    ? (() => {
                        switch (order.type) {
                          case 'RISE_FALL': return duration.profitPercentageRiseFall;
                          case 'HIGHER_LOWER': return duration.profitPercentageHigherLower;
                          case 'TOUCH_NO_TOUCH': return duration.profitPercentageTouchNoTouch;
                          case 'CALL_PUT': return duration.profitPercentageCallPut;
                          case 'TURBO': return duration.profitPercentageTurbo;
                          default: return duration.profitPercentage || 85;
                        }
                      })()
                    : 85;

                  // Add to completed orders
                  const completedOrder: CompletedOrder = {
                    id: order.id,
                    symbol: order.symbol,
                    side: order.side,
                    amount: order.amount,
                    entryPrice: order.price,
                    closePrice: order.closePrice,
                    entryTime: new Date(order.createdAt),
                    expiryTime: new Date(order.closedAt),
                    status: order.status,
                    profit: order.profit,
                    profitPercentage,
                    // Include type-specific fields for proper chart rendering
                    type: order.type,
                    barrier: order.barrier,
                    strikePrice: order.strikePrice,
                    payoutPerPoint: order.payoutPerPoint,
                    // Include trading mode for filtering
                    isDemo: !!order.isDemo,
                    // This one just resolved on the wire — it is news, so it
                    // may be announced. Orders arriving from a fetch are
                    // history and carry no such mark.
                    justSettled: true,
                  };

                  // Update state based on demo/real mode
                  if (!!order.isDemo) {
                    // For demo mode, update demo balance:
                    // - WIN: Add back investment + profit
                    // - DRAW: Add back investment
                    // - LOSS: Return any rebate (profit > 0), else 0 (already deducted)
                    const balanceChange = (() => {
                      if (order.status === 'WIN') {
                        return order.amount + (order.profit || 0);
                      } else if (order.status === 'DRAW') {
                        return order.amount;
                      } else if (order.status === 'LOSS') {
                        return (order.profit || 0) > 0 ? order.profit : 0;
                      }
                      return 0;
                    })();

                    // Calculate profit for netPL tracking
                    const profitForPL = (() => {
                      if (order.status === 'WIN') {
                        return order.profit || 0;
                      } else if (order.status === 'DRAW') {
                        return 0;
                      } else if (order.status === 'LOSS') {
                        return (order.profit || 0) > 0 ? order.profit : -order.amount;
                      }
                      return 0;
                    })();

                    set((state) => {
                      const newDemoBalance = state.demoBalance + balanceChange;
                      return {
                        orders: state.orders.filter((o) => o.id !== order.id),
                        completedOrders: [completedOrder, ...state.completedOrders],
                        demoBalance: newDemoBalance,
                        ...(state.tradingMode === 'demo' ? { balance: newDemoBalance } : {}),
                        netPL: state.netPL + profitForPL,
                        processedOrderIds: [...state.processedOrderIds, order.id],
                      };
                    });

                    /* Settle the demo figure against the server.
                       The line above is a local guess so the balance moves the
                       instant a trade resolves. On its own it is exactly the
                       arithmetic that let two devices drift apart, because each
                       browser only ever counted the trades it happened to hear
                       about. The refresh that fixes this previously sat only in
                       the real-money branch below, so demo — which is what is
                       actually being traded — never reached it.
                       Debounced, so a burst of settlements costs one request. */
                    if (demoBalanceTimer) clearTimeout(demoBalanceTimer);
                    demoBalanceTimer = setTimeout(() => {
                      demoBalanceTimer = null;
                      get().fetchDemoBalance();
                    }, 1000);
                  } else {
                    // For real mode: update the state immediately on the frontend
                    // to avoid lag, then fetch the authoritative balance from the DB.
                    const profitForPL = (() => {
                      if (order.status === 'WIN') return order.profit || 0;
                      if (order.status === 'DRAW') return 0;
                      if (order.status === 'LOSS') return (order.profit || 0) > 0 ? order.profit : -order.amount;
                      return 0;
                    })();

                    set((state) => {
                      const balanceChange = (() => {
                        if (order.status === 'WIN') {
                          return order.amount + (order.profit || 0);
                        } else if (order.status === 'DRAW') {
                          return order.amount;
                        } else if (order.status === 'LOSS') {
                          return (order.profit || 0) > 0 ? order.profit : 0;
                        }
                        return 0;
                      })();
                      
                      const currentBal = state.realBalance ?? state.balance;
                      const newRealBalance = currentBal + balanceChange;

                      return {
                        orders: state.orders.filter((o) => o.id !== order.id),
                        completedOrders: [completedOrder, ...state.completedOrders],
                        netPL: state.netPL + profitForPL,
                        processedOrderIds: [...state.processedOrderIds, order.id],
                        realBalance: newRealBalance,
                        balance: newRealBalance,
                      };
                    });

                    // Debounced wallet fetch — resets on each ORDER_COMPLETED so
                    // only ONE fetch fires after the last order settles (1s after).
                    if (walletFetchTimer) clearTimeout(walletFetchTimer);
                    walletFetchTimer = setTimeout(async () => {
                      walletFetchTimer = null;
                      // Clear sessionStorage cache so we always get the live DB
                      // value. USDT is the funding wallet — see fetchWalletData.
                      if (typeof window !== 'undefined') {
                        sessionStorage.removeItem('wallet_USDT');
                      }
                      get().fetchWalletData('USDT', true, true);
                      // The demo figure is settled from the server on the same
                      // beat, so a trade that wins on one device shows the same
                      // balance on every other one.
                      get().fetchDemoBalance();
                    }, 1000);
                  }
                }
              },
              // ORDER_CREATED has to pass this filter too, or the handler above
              // never sees it and trades stay invisible on the account's other
              // devices — which is the whole point of broadcasting them.
              (message: any) =>
                message.type === 'ORDER_COMPLETED' ||
                message.type === 'ORDER_CREATED'
            );

            // Subscribe to order updates for this user
            subscribeToAllMarkets();
          });
        },

        // Cleanup method to prevent memory leaks
        cleanup: () => {
          cleanupRegistry.cleanup();
        },
        setIsLoading: (loading) => set({ isLoading: loading }), // Add setIsLoading
        user: useUserStore.getState().user, // Add user property
      }),
      {
        name: "binary-trading-store",
        version: 1,
        // v0 -> v1: repair symbols mangled by the old unguarded dash->slash rewrite
        // in handleSymbolChange, which stored BAJAJ-AUTO/OTC as BAJAJ/AUTO/OTC.
        // currentSymbol and activeMarkets are persisted, so that corruption outlives
        // the code fix and would otherwise keep the chart blank forever.
        // Every real market symbol carries exactly one slash, so a stored symbol with
        // two slashes and a trailing OTC segment is unambiguously corrupted.
        migrate: (persisted: any, version: number) => {
          if (!persisted || version >= 1) return persisted;

          const key = (s: any) =>
            String(s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

          // Prefer the canonical symbol from the cached market list.
          const canonical = new Map<string, string>();
          for (const m of persisted.binaryMarkets ?? []) {
            if (m?.symbol) canonical.set(key(m.symbol), m.symbol);
          }

          // Fallback when the cached list is empty: invert the rewrite structurally.
          const restoreHyphen = (s: string) => {
            const parts = s.split("/");
            return parts.length === 3 && /^OTC$/i.test(parts[2])
              ? `${parts[0]}-${parts[1]}/${parts[2]}`
              : s;
          };

          const repair = (s: any) =>
            typeof s === "string" ? canonical.get(key(s)) ?? restoreHyphen(s) : s;

          return {
            ...persisted,
            currentSymbol: repair(persisted.currentSymbol),
            activeMarkets: Array.isArray(persisted.activeMarkets)
              ? persisted.activeMarkets.map((m: any) =>
                  m?.symbol ? { ...m, symbol: repair(m.symbol) } : m
                )
              : persisted.activeMarkets,
          };
        },
        /* Preferences are persisted. Server data is not.

           This also carried binaryMarkets — every instrument on the platform,
           roughly two hundred objects — and the hundred most recent settled
           orders. Both are refetched on every load, so neither was ever read for
           longer than it took the network to answer; what they did buy was a
           large JSON blob serialised on every state change and parsed back
           synchronously during hydration, on the main thread, before the first
           paint.

           They also went stale. A persisted market list is a snapshot of what
           the platform offered on some earlier visit, and pairing it with a
           persisted currentSymbol is how a browser came to keep asking for an
           instrument that no longer exists — the "no chart data available on
           that one machine" report.

           What stays is what the server cannot tell us: which markets this
           person has open, what they were looking at, and their trade settings.
           Open orders stay too — they are few, they are already filtered to the
           unexpired, and showing a live position immediately is worth it. */
        partialize: (state) => ({
          activeMarkets: state.activeMarkets,
          currentSymbol: state.currentSymbol,
          timeFrame: state.timeFrame,
          tradingMode: state.tradingMode,
          selectedExpiryMinutes: state.selectedExpiryMinutes,
          selectedOrderType: state.selectedOrderType,
          durationMode: state.durationMode,
          customDurationSeconds: state.customDurationSeconds,
          orders: state.orders.filter(o => o.status === "PENDING" && o.expiryTime > Date.now()),
        }),
      }
    )
  )
);

// Enhanced initialization function with proper error handling and deduplication
export const initializeBinaryStore = async (): Promise<void> => {
  // If already initialized, return immediately
  if (isInitialized) {
    return;
  }

  // If currently initializing, return the existing promise
  if (isInitializing && initializationPromise) {
    return initializationPromise;
  }

  // Set initializing flag and create promise
  isInitializing = true;

  initializationPromise = (async () => {
    try {
      const store = useBinaryStore.getState();
      // Get user from useUserStore instead of binary store
      const { user } = await import('@/store/user').then(m => m.useUserStore.getState());
      const isAuthenticated = !!user?.id;

      // Set loading state
      store.setIsLoading(true);

      // Parallel fetch of essential data
      // Fetch markets, settings, AND durations (durations have calculated profit adjustments)
      await Promise.all([
        store.fetchBinaryMarkets(),
        store.fetchBinarySettings().catch(() => {
          // Settings API failed, but continue - durations will still work
          console.warn("Binary settings API not available");
        }),
        store.fetchBinaryDurations(), // Always fetch durations for accurate profit calculations
        // Pull the demo balance from the account rather than trusting whatever
        // this browser last wrote down. It is no longer persisted locally, so
        // without this a fresh tab would show the 50000 default until a trade
        // settled — and two devices would still disagree, which is the whole
        // problem this replaces.
        store.fetchDemoBalance().catch(() => {
          console.warn("Demo balance unavailable at startup");
        }),
      ]);

      // NOTE: Settings are loaded once at startup and used consistently.
      // No periodic refresh needed - settings are stable during the session.
      // Admin changes will be picked up on next page load/refresh.

      // Start the update interval for active countdowns/safe-zone for everyone
      startUpdateInterval();

      // Only fetch user-specific data if authenticated
      if (isAuthenticated) {
        // Initialize/ensure order WebSocket is connected
        store.initOrderWebSocket();

        // Fetch wallet data immediately to get the initial balance
        // This avoids starting at $0.00 on refresh
        const quoteCurrency = store.currentSymbol 
          ? extractQuoteCurrency(store.currentSymbol, store.binaryMarkets)
          : "USDT";
        store.fetchWalletData(quoteCurrency).catch((err) =>
          console.warn("Initial wallet fetch failed:", err)
        );
      }

      // Mark as initialized
      isInitialized = true;
      store.setIsLoading(false);

    } catch (error) {
      console.warn("Error initializing binary store:", error);
      const store = useBinaryStore.getState();
      store.setIsLoading(false);
      throw error; // Re-throw to allow caller to handle
    } finally {
      isInitializing = false;
    }
  })();

  return initializationPromise;
};

// Global cleanup function for page navigation
export const cleanupBinaryStore = () => {
  cleanupRegistry.cleanup();

  // Reset store state if needed
  const store = useBinaryStore.getState();
  store.cleanup();

  // CRITICAL: Reset initialization flags AND promise to allow re-initialization
  isInitializing = false;
  isInitialized = false;
  initializationPromise = null;
  updateInterval = null;

  // Reset fetch failure flags to allow retry on next visit
  marketsFetchFailed = false;
  durationsFetchFailed = false;

  // Clear cache on cleanup to ensure fresh data on next visit
  marketDataCache.clear();
};

// Export cleanup registry for external cleanup management
export { cleanupRegistry };

if (typeof window !== "undefined") {
  /* A dead man's switch on isMarketSwitching.

     The chart's data hook is gated on it — enabled: !!symbol && !isMarketSwitching
     — so for as long as this flag is true the chart fetches nothing and renders
     "No chart data available" with a Retry button.

     Two separate places set it, and each clears it under its own condition.
     trading-interface schedules a reset behind nested 100ms and 300ms timeouts,
     both gated on the component still being mounted; the store's
     setCurrentSymbol schedules its own at 500ms, gated on the symbol not having
     changed again since. Interleave a remount with a second symbol change and
     neither condition holds: nothing clears the flag, and the chart stays dark
     until the page is reloaded — which matches this failing on roughly half of
     refreshes.

     Rather than make two owners agree, this makes the flag unable to stick. A
     switch that has not finished within 2s (the real resets fire at 300 and
     500ms) is over as far as the chart is concerned. Worst case it re-enables
     fetching slightly early, which costs one request. The alternative is a
     terminal that shows no prices. */
  let switchGuard: ReturnType<typeof setTimeout> | null = null;
  let wasSwitching = false;

  useBinaryStore.subscribe((state) => {
    syncOrdersToChartEngine(state.orders);

    const switching = state.isMarketSwitching;
    if (switching === wasSwitching) return;
    wasSwitching = switching;

    if (switchGuard) {
      clearTimeout(switchGuard);
      switchGuard = null;
    }
    if (!switching) return;

    switchGuard = setTimeout(() => {
      switchGuard = null;
      if (useBinaryStore.getState().isMarketSwitching) {
        console.warn(
          "[binary] market switch never cleared after 2s — re-enabling the chart"
        );
        useBinaryStore.setState({ isMarketSwitching: false });
      }
    }, 2000);
  });
}
