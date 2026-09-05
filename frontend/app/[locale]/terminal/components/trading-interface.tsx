"use client";

import dynamic from "next/dynamic";
import { useTradingMobile } from "../hooks/use-trading-mobile";
import MobileLayout from "./layout/mobile-layout";
import DesktopLayout from "./layout/desktop-layout";
import { useTheme } from "next-themes";
import {
  useBinaryStore,
  type TimeFrame,
  type OrderSide,
  extractBaseCurrency,
  extractQuoteCurrency,
  isSameSymbol,
} from "@/store/trade/use-binary-store";
import { getChartSynchronizedTime } from "@/utils/time-sync";
/* setTimeFrame below reaches into the chart's own store, which was never
   imported here — so every timeframe change threw ReferenceError: useChartStore
   is not defined, after the binary store had already been updated but before
   the chart was told. The two then disagreed about which timeframe was showing,
   and the engine gates its render on storeState.timeFrame matching its own. */
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import { useShallow } from "zustand/react/shallow";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { EXCHANGE_RATES } from "./header/header";
import { marketDataWs, type OHLCVData } from "@/services/market-data-ws";
import { tickersWs } from "@/services/tickers-ws";
/* Loaded when the tutorial is first opened.
 *
 * MobileLayout and DesktopLayout above are deliberately left as static imports.
 * They are the screen itself, and which one is needed depends on a media query
 * that cannot be answered until JavaScript runs — so making them dynamic would
 * add a second round trip in front of the main UI to save loading the other
 * one, which is 16KB. That trade is the wrong way round. */
import { useTradingSettingsStore } from "@/store/trade/use-trading-settings-store";
import { notifyTradeWin, notifyTradeLoss, notifyTradeRefund, ToastContainer } from "@/components/binary/notifications";
import { AudioFeedback, type IAudioFeedback } from "@/components/binary/audio-feedback";
import { useGuestGate } from "@/lib/guest/use-guest-gate";

/** Shared across every mounted TradingInterface — see the note at its use. */
/* Which settlements this tab has already announced.
 *
 * Module scope survives a re-mount but NOT a reload, and that is what made a
 * refresh replay results the trader had already seen: on load the set is empty,
 * the "already notified" snapshot below is taken while the completed-orders
 * fetch is still in flight so it captures nothing, and every trade that settled
 * within the last 45 seconds then looks brand new and toasts a second time.
 * Settle several trades on a one-minute expiry, refresh, and they all pile up
 * at once.
 *
 * sessionStorage is the right lifetime: it survives the reload, stays per-tab,
 * and is gone when the tab closes — so a genuinely new session still announces
 * fresh results. */
const NOTIFIED_IDS_KEY = "binary_notified_order_ids";

function loadNotifiedOrderIds(): Set<string> {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = sessionStorage.getItem(NOTIFIED_IDS_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function persistNotifiedOrderIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(NOTIFIED_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    /* private mode / quota — dedupe just falls back to in-memory */
  }
}

const NOTIFIED_ORDER_IDS = loadNotifiedOrderIds();

export default function TradingInterface({
  currentSymbol: propCurrentSymbol,
  onSymbolChange,
}: {
  currentSymbol: string;
  onSymbolChange: (symbol: string) => void;
}) {
  const { isMobile } = useTradingMobile();
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Track preferred display currency from localStorage (same pattern as order-panel.tsx)
  const [preferredCurrency, setPreferredCurrency] = useState<string>("USDT");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPreferredCurrency(localStorage.getItem("preferred_currency") || "USDT");
      const handleCurrencyChange = () => {
        setPreferredCurrency(localStorage.getItem("preferred_currency") || "USDT");
      };
      window.addEventListener("currency-changed", handleCurrencyChange);
      window.addEventListener("storage", handleCurrencyChange);
      return () => {
        window.removeEventListener("currency-changed", handleCurrencyChange);
        window.removeEventListener("storage", handleCurrencyChange);
      };
    }
  }, []);

  // Derived values from preferred currency
  const preferredCurrencyRate = EXCHANGE_RATES[preferredCurrency] || 1.0;

  // Only update theme after mounting to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    // On load, if we are in CLOCK mode, reset selectedExpiryMinutes to 1
    // to instantly correct any old snapping-bug pollution in the user's localStorage.
    const store = useBinaryStore.getState();
    if (store.durationMode === "CLOCK") {
      useBinaryStore.setState({ selectedExpiryMinutes: 1 });
    }
  }, []);

  // Use resolvedTheme which gives the actual theme (respects system preference)
  // Default to dark during SSR/hydration to match server render
  const currentTheme = mounted ? (resolvedTheme || theme || "dark") : "dark";

  // Get state values from binary store using shallow selector to prevent unnecessary re-renders
  // IMPORTANT: Using useShallow prevents the component from re-rendering when unrelated store values change
  const {
    currentSymbol: storeCurrentSymbol,
    balance,
    realBalance,
    demoBalance,
    netPL,
    orders,
    completedOrders,
    tradingMode,
    selectedExpiryMinutes,
    isInSafeZone,
    timeFrame,
    isMarketSwitching,
    isLoadingWallet,
    candleData,
    binaryMarkets,
  } = useBinaryStore(
    useShallow((state) => ({
      currentSymbol: state.currentSymbol,
      balance: state.balance,
      realBalance: state.realBalance,
      demoBalance: state.demoBalance,
      netPL: state.netPL,
      orders: state.orders,
      completedOrders: state.completedOrders,
      tradingMode: state.tradingMode,
      selectedExpiryMinutes: state.selectedExpiryMinutes,
      isInSafeZone: state.isInSafeZone,
      timeFrame: state.timeFrame,
      isMarketSwitching: state.isMarketSwitching,
      isLoadingWallet: state.isLoadingWallet,
      candleData: state.candleData,
      binaryMarkets: state.binaryMarkets,
    }))
  );

  // Filter completed orders by current trading mode
  const filteredCompletedOrders = useMemo(() => {
    return completedOrders.filter(order => order.isDemo === (tradingMode === "demo"));
  }, [completedOrders, tradingMode]);

  // Get stable action references from the store - these don't change between renders
  // Access actions via getState() to avoid creating subscriptions
  const setStoreCurrentSymbol = useCallback((symbol: string) => {
    useBinaryStore.getState().setCurrentSymbol(symbol);
  }, []);
  const addMarket = useCallback((symbol: string) => {
    useBinaryStore.getState().addMarket(symbol);
  }, []);
  const removeMarket = useCallback((symbol: string) => {
    useBinaryStore.getState().removeMarket(symbol);
  }, []);
  const setTradingMode = useCallback((mode: "demo" | "real") => {
    useBinaryStore.getState().setTradingMode(mode);
  }, []);
  const setSelectedExpiryMinutes = useCallback((minutes: number) => {
    useBinaryStore.getState().setSelectedExpiryMinutes(minutes);
  }, []);
  const setTimeFrame = useCallback((tf: TimeFrame) => {
    useBinaryStore.getState().setTimeFrame(tf);
    const store = useChartStore.getState();
    if (store.setTimeFrame) {
      store.setTimeFrame(tf);
    }
  }, []);
  /* Every trade from either layout comes through here, which makes it the one
     place a demo session can be turned away without four panels each learning
     how.

     The store refuses these too, but a refusal alone reaches the trader as
     "Order placement failed - check your balance or try again" — advice that is
     wrong twice over, since the balance is fine and trying again will never
     work. What they actually need is the account, so they are sent to it.

     Returning true is not a claim that an order was placed. It says there is no
     error for the panel to report, because the person is already on their way
     to sign up; returning false would put that misleading toast back on screen
     on the way out. */
  const { isGuest, expired: guestExpired, requireAccount } = useGuestGate();
  const placeOrder = useCallback(async (side: OrderSide, amount: number, expiryMinutes: number) => {
    if (isGuest) {
      if (guestExpired) {
        requireAccount("more demo time");
        return true;
      }
      const orderType = useBinaryStore.getState().selectedOrderType;
      if (orderType !== "RISE_FALL") {
        requireAccount(String(orderType).toLowerCase().replace(/_/g, "/") + " trades");
        return true;
      }

      /* Anything else the store turns down — a spent demo balance, a rule added
         later — is still a demo session hitting the edge of what it can do, and
         "check your balance or try again" is the wrong thing to say to someone
         who has not got an account yet. Whatever the reason, the answer is the
         same, so a guest never reaches that message. */
      const placed = await useBinaryStore.getState().placeOrder(side, amount, expiryMinutes);
      if (!placed) {
        requireAccount("a full account");
        return true;
      }
      return true;
    }
    return useBinaryStore.getState().placeOrder(side, amount, expiryMinutes);
  }, [isGuest, guestExpired, requireAccount]);
  const setCurrentPrice = useCallback((price: number) => {
    useBinaryStore.getState().setCurrentPrice(price);
  }, []);
  const setCandleData = useCallback((data: any[]) => {
    useBinaryStore.getState().setCandleData(data);
  }, []);

  // Use the prop currentSymbol instead of store currentSymbol
  const currentSymbol = propCurrentSymbol;

  // Memoize timeframe durations to prevent recreation
  const timeframeDurations = useMemo(() => [
    { value: "1m" as TimeFrame, label: "1m" },
    { value: "2m" as TimeFrame, label: "2m" },
    { value: "3m" as TimeFrame, label: "3m" },
    { value: "5m" as TimeFrame, label: "5m" },
    { value: "10m" as TimeFrame, label: "10m" },
    { value: "15m" as TimeFrame, label: "15m" },
    { value: "30m" as TimeFrame, label: "30m" },
    { value: "1h" as TimeFrame, label: "1h" },
    { value: "4h" as TimeFrame, label: "4h" },
    { value: "1d" as TimeFrame, label: "1d" },
  ], []);

  // Chart context ref for chart interactions
  const chartContextRef = useRef(null);
  const setChartContextRef = useCallback((ref: any) => {
    chartContextRef.current = ref;
  }, []);

  // WebSocket subscription cleanup refs
  const unsubscribeTickerRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mobile-specific state with proper initialization
  const [mobileState, setMobileState] = useState(() => ({
    activePanel: "chart" as "chart" | "order" | "positions",
    showMobileOrderPanel: false,
    showMobilePositions: false,
    showQuickTradeButtons: true,
  }));

  // Memoized mobile state handlers to prevent recreation
  const mobileHandlers = useMemo(() => ({
    setActivePanel: (panel: "chart" | "order" | "positions") =>
      setMobileState(prev => ({ ...prev, activePanel: panel })),
    toggleMobileOrderPanel: () =>
      setMobileState(prev => ({ ...prev, showMobileOrderPanel: !prev.showMobileOrderPanel })),
    toggleMobilePositions: () =>
      setMobileState(prev => ({ ...prev, showMobilePositions: !prev.showMobilePositions })),
    toggleQuickTradeButtons: () =>
      setMobileState(prev => ({ ...prev, showQuickTradeButtons: !prev.showQuickTradeButtons })),
    setShowMobileOrderPanel: (show: boolean) =>
      setMobileState(prev => ({ ...prev, showMobileOrderPanel: show })),
    setShowMobilePositions: (show: boolean) =>
      setMobileState(prev => ({ ...prev, showMobilePositions: show })),
  }), []);

  /* No first-run tutorial.
  
     A seven-step overlay opened itself two seconds after a first-time visitor
     reached the terminal, on top of the chart they had come to look at, and it
     was the only way the tutorial could ever be opened — the "tutorial" entry
     in the header menu is a link to /support and never called into it. So it
     was not an aid you could return to; it was an interruption you got once.
     Removed rather than made optional, because nothing was asking for it. */

  // Audio feedback for trade results - uses global settings store
  const audioConfig = useTradingSettingsStore((state) => state.audio);
  const audioFeedbackRef = useRef<IAudioFeedback | null>(null);
  // Track order IDs we've already sent notifications for (persists across re-renders)
  /* Module-scoped, not per-instance.
     
     This guard is what stops a settled trade being announced twice, and as a
     useRef each mounted copy of this component had its own — so it only ever
     deduplicated against itself. The terminal mounts this component twice at
     runtime (two ToastContainers appear in the DOM against one in the source),
     and the result is every settlement firing its sound and its card twice,
     milliseconds apart. Two identical tones that close together do not read as
     two sounds; they read as one louder, harder-edged one, which is exactly the
     "sharp" sound that survived silencing every other source.
     
     One set shared by every instance means the first to see an order claims it
     and the rest skip it, whatever causes the double mount. */
  const notifiedOrderIdsRef = useRef<Set<string>>(NOTIFIED_ORDER_IDS);
  // Track if initial data has loaded (to avoid notifying for historical orders)
  const isInitializedRef = useRef<boolean>(false);
  // Track the last symbol we were initialized for
  const lastInitializedSymbolRef = useRef<string | null>(null);

  // Initialize audio feedback
  useEffect(() => {
    audioFeedbackRef.current = new AudioFeedback(audioConfig);
    return () => {
      audioFeedbackRef.current?.dispose();
    };
  }, []);

  // Sync audio config when it changes
  useEffect(() => {
    if (audioFeedbackRef.current) {
      audioFeedbackRef.current.setConfig(audioConfig);
    }
  }, [audioConfig]);

  // Play sounds and show notifications when trades complete
  useEffect(() => {
    // If symbol changed, reset the initialization state
    // This prevents notifications for existing orders when switching markets
    /* A page load is not a market switch.
       `lastInitializedSymbolRef` starts as null, so it never equals the current
       symbol on the first pass and this branch ran on EVERY load — clearing the
       ids restored from sessionStorage a moment after they were read, which is
       why persisting them alone changed nothing. Only a genuine switch between
       markets should forget what has already been announced. */
    const isFirstPassAfterLoad = lastInitializedSymbolRef.current === null;
    if (lastInitializedSymbolRef.current !== currentSymbol) {
      isInitializedRef.current = false;
      lastInitializedSymbolRef.current = currentSymbol;
      if (!isFirstPassAfterLoad) {
        notifiedOrderIdsRef.current.clear();
        persistNotifiedOrderIds(notifiedOrderIdsRef.current);
      }
    }

    // If not initialized yet, snapshot all currently-loaded completed orders as
    // "already notified". This prevents toasts for historical orders on page load
    // or market switch. We mark initialized immediately (no timer) so that any
    // ORDER_COMPLETED WS event arriving while the initial fetch is in-flight is
    // NOT silently absorbed by this guard.
    if (!isInitializedRef.current) {
      for (const order of filteredCompletedOrders) {
        notifiedOrderIdsRef.current.add(order.id);
      }
      isInitializedRef.current = true;
      // Fall through — don't return. Any brand-new order IDs not in the snapshot
      // will be picked up by the loop below on this same render.
    }

    // After initialization, check for new orders we haven't notified about (filtered by mode)
    let delayCount = 0;
    for (const order of filteredCompletedOrders) {
      /* A result is announced because it just happened, not because it turned
         up in a list. `justSettled` is set only by the live ORDER_COMPLETED
         handler, never by a fetch.

         Every guard below this tried to infer "is this news?" from the data —
         a snapshot of what was on screen at mount, plus a 45-second age
         window — and each new way of loading history defeated it in turn: a
         reload replayed results, and so did switching market or flipping
         demo/live, because each swaps in orders this tab had never seen.
         Asking where the order came from settles all of them at once. */
      if (!order.justSettled) {
        notifiedOrderIdsRef.current.add(order.id);
        continue;
      }

      // Skip if we've already notified about this order
      if (notifiedOrderIdsRef.current.has(order.id)) {
        continue;
      }

      // Skip historical orders that were completed before the page loaded or are very old.
      // We check if the expiry is older than the current synchronized server-time minus 45 seconds.
      // This is clock-skew and timezone independent.
      const orderExpiryTimestamp = order.expiryTime instanceof Date
        ? order.expiryTime.getTime()
        : new Date(order.expiryTime).getTime();

      const syncedNow = getChartSynchronizedTime().getTime();
      if (orderExpiryTimestamp < syncedNow - 45000) {
        notifiedOrderIdsRef.current.add(order.id);
        continue;
      }

      // Mark as notified immediately to prevent duplicate notifications
      notifiedOrderIdsRef.current.add(order.id);

      const currentDelay = delayCount * 300;
      delayCount++;

      setTimeout(() => {
        if (order.status === "WIN") {
          // Show notification - profit for wins = amount * payout%
          // Use profitPercentage-based calculation since order.profit from backend
          // may contain incorrect values (total return, wrong currency, etc.)
          const pct = order.profitPercentage || 80;
          const profitUSD = order.amount * (pct / 100);
          const profit = profitUSD * preferredCurrencyRate;
          const durationMs = order.expiryTime && order.entryTime
            ? Math.abs(new Date(order.expiryTime).getTime() - new Date(order.entryTime).getTime())
            : 0;
          /* One sound for the end of a trade, whatever the outcome — the
             same one for a win, a loss and a refund. Three different endings
             announced by three different tones is a slot machine telling you
             how you did before you have looked; the terminal says a trade
             settled, and the row says the rest. */
          audioFeedbackRef.current?.playExpired();
          notifyTradeWin({
            orderId: order.id,
            symbol: order.symbol,
            side: order.side,
            amount: order.amount * preferredCurrencyRate,
            profit: profit,
            profitPercentage: pct,
            entryTime: order.entryTime ? new Date(order.entryTime).getTime() : undefined,
            expiryTime: order.expiryTime ? new Date(order.expiryTime).getTime() : undefined,
            durationMinutes: durationMs > 0 ? durationMs / 60000 : undefined,
            currency: preferredCurrency,
          });
        } else if (order.status === "LOSS") {
          // Show notification - loss = full trade amount
          // Loss is always the trade amount in the user's display currency
          const lossAmount = -(order.amount * preferredCurrencyRate);
          const lossDurationMs = order.expiryTime && order.entryTime
            ? Math.abs(new Date(order.expiryTime).getTime() - new Date(order.entryTime).getTime())
            : 0;
          audioFeedbackRef.current?.playExpired();
          notifyTradeLoss({
            orderId: order.id,
            symbol: order.symbol,
            side: order.side,
            amount: order.amount * preferredCurrencyRate,
            profit: lossAmount,
            profitPercentage: -100,
            entryTime: order.entryTime ? new Date(order.entryTime).getTime() : undefined,
            expiryTime: order.expiryTime ? new Date(order.expiryTime).getTime() : undefined,
            durationMinutes: lossDurationMs > 0 ? lossDurationMs / 60000 : undefined,
            currency: preferredCurrency,
          });
        } else if (order.status === "DRAW") {
          /* The branch that was missing entirely.

             Only WIN and LOSS were handled, so a drawn trade — the stake
             returned, nothing won or lost — settled in complete silence: the
             row left the list and the balance moved back up with no notice
             given for either. Of the three outcomes it is the one a trader is
             least able to reconstruct afterwards, and it was the only one not
             announced. */
          const drawDurationMs = order.expiryTime && order.entryTime
            ? Math.abs(new Date(order.expiryTime).getTime() - new Date(order.entryTime).getTime())
            : 0;
          audioFeedbackRef.current?.playExpired();
          notifyTradeRefund({
            orderId: order.id,
            symbol: order.symbol,
            side: order.side,
            amount: order.amount * preferredCurrencyRate,
            entryTime: order.entryTime ? new Date(order.entryTime).getTime() : undefined,
            expiryTime: order.expiryTime ? new Date(order.expiryTime).getTime() : undefined,
            durationMinutes: drawDurationMs > 0 ? drawDurationMs / 60000 : undefined,
            currency: preferredCurrency,
          });
        }
      }, currentDelay);
    }

    /* Clean up order IDs we no longer need, so the set cannot grow forever.
       Skipped while the list is empty: on a reload this effect runs before the
       completed-orders fetch resolves, and pruning against an empty list would
       throw away the very record of what has already been announced — which is
       what we just restored from sessionStorage. */
    if (filteredCompletedOrders.length > 0) {
      const currentIds = new Set(filteredCompletedOrders.map(o => o.id));
      for (const id of notifiedOrderIdsRef.current) {
        if (!currentIds.has(id)) {
          notifiedOrderIdsRef.current.delete(id);
        }
      }
    }

    persistNotifiedOrderIds(notifiedOrderIdsRef.current);
  }, [filteredCompletedOrders, currentSymbol, preferredCurrencyRate, preferredCurrency]);

  // Memoized computed values to prevent unnecessary recalculations
  const computedValues = useMemo(() => {
    const activePositionsCount = orders.filter(order => order.status === "PENDING").length;
    const completedPositionsCount = filteredCompletedOrders.length;
    const darkMode = currentTheme === "dark" || currentTheme === "navy";
    const showExpiry = true;
    // Extract quote currency from symbol (e.g., "BTC/USDT" -> "USDT")
    const currency = extractQuoteCurrency(currentSymbol, binaryMarkets) || "USD";

    return {
      activePositionsCount,
      completedPositionsCount,
      darkMode,
      showExpiry,
      currency,
    };
  }, [filteredCompletedOrders.length, orders, currentTheme, currentSymbol, binaryMarkets]);

  // Chart order type for combined active and completed orders
  type ChartOrderStatus = "PENDING" | "WIN" | "LOSS";
  interface ChartOrder {
    id: string;
    symbol: string;
    side: OrderSide;
    amount: number;
    entryPrice: number;
    entryTime: number;
    expiryTime: number;
    closePrice?: number;
    status: ChartOrderStatus;
    profit?: number;
    profitPercentage?: number;
    isDemo?: boolean;
    // Type-specific fields for different order types
    type?: "RISE_FALL" | "HIGHER_LOWER" | "TOUCH_NO_TOUCH" | "CALL_PUT" | "TURBO";
    barrier?: number;
    strikePrice?: number;
    payoutPerPoint?: number;
  }

  // Memoized combined orders for the chart (both active and completed)
  // This ensures completed orders show on the chart with their results
  const chartOrders = useMemo((): ChartOrder[] => {
    // Map active orders to chart format
    // Multiply amounts by preferredCurrencyRate so the chart marker shows the
    // user's preferred display currency amount (e.g. ₹1000 instead of $12)
    const activeChartOrders: ChartOrder[] = orders.map(order => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      amount: order.amount * preferredCurrencyRate,
      entryPrice: order.entryPrice,
      entryTime: order.createdAt,
      expiryTime: order.expiryTime,
      closePrice: order.closePrice,
      /* This compared against "win" in lowercase, which the server never sends.
         The test could not succeed, so every settled order reached the chart as
         a LOSS — winners and draws included — and the overlay contradicted the
         positions panel next to it. A DRAW returns the stake, so it belongs
         with neither outcome; the chart has no state for it and PENDING is the
         one that does not assert a result. */
      status: (order.status === "PENDING" || order.status === "DRAW"
        ? "PENDING"
        : order.status === "WIN"
          ? "WIN"
          : "LOSS") as ChartOrderStatus,
      profit: order.profit !== undefined ? order.profit * preferredCurrencyRate : order.profit,
      profitPercentage: order.profitPercentage,
      isDemo: order.mode === "demo",
      // Include type-specific fields for proper chart rendering
      type: order.type,
      barrier: order.barrier,
      strikePrice: order.strikePrice,
      payoutPerPoint: order.payoutPerPoint,
    }));

    // Map completed orders to chart format (use filtered orders for efficiency)
    const completedChartOrders: ChartOrder[] = filteredCompletedOrders.map(order => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      amount: order.amount * preferredCurrencyRate,
      entryPrice: order.entryPrice,
      entryTime: new Date(order.entryTime).getTime(),
      expiryTime: new Date(order.expiryTime).getTime(),
      closePrice: order.closePrice,
      status: order.status as ChartOrderStatus,
      profit: order.profit !== undefined ? order.profit * preferredCurrencyRate : order.profit,
      profitPercentage: order.profitPercentage,
      // Include type-specific fields for proper chart rendering
      type: order.type,
      barrier: order.barrier,
      strikePrice: order.strikePrice,
      payoutPerPoint: order.payoutPerPoint,
      // Include trading mode for filtering
      isDemo: order.isDemo,
    }));

    // FIXED: Use Set for O(n) uniqueness instead of O(n²) filter with findIndex
    // This significantly improves performance with large order lists
    const seenIds = new Set<string>();
    const uniqueOrders: ChartOrder[] = [];

    for (const order of activeChartOrders) {
      if (!seenIds.has(order.id)) {
        seenIds.add(order.id);
        uniqueOrders.push(order);
      }
    }

    for (const order of completedChartOrders) {
      if (!seenIds.has(order.id)) {
        seenIds.add(order.id);
        uniqueOrders.push(order);
      }
    }

    // Already filtered by mode since we used filteredCompletedOrders
    // But still filter activeChartOrders by mode for consistency
    return uniqueOrders.filter(order =>
      order.isDemo === (tradingMode === "demo")
    );
  }, [orders, filteredCompletedOrders, tradingMode, preferredCurrencyRate]);

  // Memoized position markers to prevent recreation
  const positionMarkers = useMemo(() => {
    return orders
      .filter(order => order.status === "PENDING" && isSameSymbol(order.symbol, currentSymbol) && order.mode === tradingMode)
      .map(order => ({
        id: order.id,
        entryTime: Math.floor(new Date(order.createdAt).getTime() / 1000),
        entryPrice: order.entryPrice,
        expiryTime: Math.floor(new Date(order.expiryTime).getTime() / 1000),
        type: order.side,
        amount: order.amount,
      }));
  }, [orders, currentSymbol, tradingMode]);

  // Optimized cleanup function with proper error handling
  const cleanupSubscriptions = useCallback(() => {
    try {
      if (unsubscribeTickerRef.current) {
        unsubscribeTickerRef.current();
        unsubscribeTickerRef.current = null;
      }
      
      // Clear any cached chart data
      if (chartContextRef.current && typeof (chartContextRef.current as any).clearSymbolCache === 'function') {
        const currentStoreSymbol = useBinaryStore.getState().currentSymbol;
        if (currentStoreSymbol) {
          (chartContextRef.current as any).clearSymbolCache(currentStoreSymbol);
        }
      }
      
      // Ensure WebSocket subscriptions are properly cleaned up
      if (currentSymbol) {
        // Force unsubscribe from any existing subscriptions for this symbol
        tickersWs.unsubscribeFromSymbol(currentSymbol);
      }
    } catch (error) {
      console.warn("Error during subscription cleanup:", error);
    }
  }, [currentSymbol]);

  // Enhanced symbol change handler with debouncing and proper cleanup
  const handleSymbolChange = useCallback((symbol: string) => {
    // Prevent unnecessary changes
    if (isSameSymbol(symbol, currentSymbol)) {
      return;
    }
    
    // Clear any pending cleanup timeout
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
    
    // Convert symbol format: change all dashes to slashes, but only for symbols
    // that aren't already in canonical slash form. Hyphenated tickers such as
    // BAJAJ-AUTO/OTC and MCDOWELL-N/OTC must keep their hyphen — rewriting it to
    // BAJAJ/AUTO/OTC stops the symbol matching any market, which blanks the
    // chart, mislabels the asset category and 404s the asset logo.
    const formattedSymbol = symbol.includes('/') ? symbol : symbol.replace(/-/g, '/');
    
    // Clean up current subscriptions before switching
    cleanupSubscriptions();
    
    // Clear any cached chart data for the old symbol (if chart context is available)
    if (chartContextRef.current && typeof (chartContextRef.current as any).clearSymbolCache === 'function') {
      (chartContextRef.current as any).clearSymbolCache(currentSymbol);
    }
    
    // Set market switching flag to true to prevent duplicate subscriptions
    useBinaryStore.setState({ isMarketSwitching: true });

    /* The switch happens now, not in 100ms.

       This was wrapped in a setTimeout described as a "small delay to ensure
       cleanup completes". There is nothing to wait for: cleanupSubscriptions
       above is entirely synchronous — it calls an unsubscribe function, clears
       a cache and calls tickersWs.unsubscribeFromSymbol, and returns. Nothing
       in it is async and nothing it starts finishes later, so the delay was not
       waiting on cleanup; it was just 100ms of nothing in front of every switch,
       and the candle request sat behind it. */
    setStoreCurrentSymbol(formattedSymbol);
    onSymbolChange(formattedSymbol);
    addMarket(formattedSymbol);

    /* The flag no longer gates the chart — it gates the ticker resubscribe below
       (and is passed to the engine as a prop). Clearing it late costs a slightly
       later first price tick, not a later chart. */
    cleanupTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        useBinaryStore.setState({ isMarketSwitching: false });
      }
    }, 300);
  }, [currentSymbol, cleanupSubscriptions, setStoreCurrentSymbol, onSymbolChange, addMarket]);

  // Memoized market selection handler
  const handleMarketSelect = useCallback((symbol: string) => {
    // Prevent unnecessary changes
    if (symbol === currentSymbol) {
      return;
    }

    // Process the market switch
    handleSymbolChange(symbol);
  }, [currentSymbol, handleSymbolChange]);

  // Memoized positions change handler
  const handlePositionsChange = useCallback((positions: any[]) => {
    // This could be used to update chart markers or other position-related UI
    // For now, it's a placeholder for future position management features
  }, []);

  // Set up component lifecycle management with proper cleanup
  useEffect(() => {
    isMountedRef.current = true;
    
    // Initialize market data service
    marketDataWs.initialize();
    
    return () => {
      isMountedRef.current = false;
      
      // Clear any pending timeouts
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }
      
      // Clean up subscriptions
      cleanupSubscriptions();
      
      // Reset market switching flag
      useBinaryStore.setState({ isMarketSwitching: false });
    };
  }, [cleanupSubscriptions]);

  // Optimized symbol synchronization with store
  useEffect(() => {
    // Only run when symbols actually change to prevent unnecessary updates
    if (storeCurrentSymbol && storeCurrentSymbol !== currentSymbol) {
      // Use requestAnimationFrame to defer state updates and prevent setState during render
      requestAnimationFrame(() => {
        if (isMountedRef.current) {
          onSymbolChange(storeCurrentSymbol);
          addMarket(storeCurrentSymbol);
        }
      });
    } else if (currentSymbol && currentSymbol !== "" && !storeCurrentSymbol) {
      // Use requestAnimationFrame to defer state updates
      requestAnimationFrame(() => {
        if (isMountedRef.current) {
          setStoreCurrentSymbol(currentSymbol);
          addMarket(currentSymbol);
        }
      });
    }
  }, [storeCurrentSymbol, currentSymbol, onSymbolChange, addMarket, setStoreCurrentSymbol]);

  // Optimized market data subscription with proper cleanup and error handling
  useEffect(() => {
    // Skip if no symbol, component unmounted, or market is currently switching
    if (!currentSymbol || currentSymbol === "" || !isMountedRef.current || useBinaryStore.getState().isMarketSwitching) {
      return;
    }

    // Debounced subscription to prevent rapid re-subscriptions
    const subscriptionTimeout = setTimeout(() => {
      if (!isMountedRef.current || !currentSymbol) {
        return;
      }

      // Clean up previous subscriptions first
      cleanupSubscriptions();

      try {
        let unsubscribeTicker: () => void;
        // Subscribe to ticker data for real-time price updates with optimized callback
        unsubscribeTicker = tickersWs.subscribeToSpotData((data) => {
            if (!isMountedRef.current) return;
            
            // Validate that we're still subscribed to the same symbol
            const currentStoreSymbol = useBinaryStore.getState().currentSymbol;
            if (currentStoreSymbol !== currentSymbol) {
              return;
            }

            // Try different symbol formats to find the price
            let price = data[currentSymbol]?.last;

            // If not found, try alternative formats
            if (typeof price !== "number") {
              // Try with / separator
              const symbolWithSlash = currentSymbol.includes('/') 
                ? currentSymbol 
                : currentSymbol.replace(/([A-Z]+)([A-Z]{3,4})$/, '$1/$2');
              price = data[symbolWithSlash]?.last;

              // Additional fallback: try common format variations
              if (typeof price !== "number") {
                const baseCurrency = extractBaseCurrency(currentSymbol);
                const quoteCurrency = extractQuoteCurrency(currentSymbol);
                
                // Try various combinations using extracted base/quote
                const variations = [
                  `${baseCurrency}${quoteCurrency}`,          // BTCUSDT
                  `${baseCurrency}/${quoteCurrency}`,         // BTC/USDT
                  `${baseCurrency}-${quoteCurrency}`,         // BTC-USDT
                  `${baseCurrency}_${quoteCurrency}`,         // BTC_USDT
                  currentSymbol.toUpperCase(),                // Original uppercase
                  currentSymbol.toLowerCase(),                // Original lowercase
                  // Also try with reversed case
                  `${baseCurrency.toLowerCase()}${quoteCurrency.toLowerCase()}`,
                  `${baseCurrency.toUpperCase()}/${quoteCurrency.toUpperCase()}`,
                  `${baseCurrency.toUpperCase()}-${quoteCurrency.toUpperCase()}`,
                  `${baseCurrency.toLowerCase()}/${quoteCurrency.toLowerCase()}`,
                  `${baseCurrency.toLowerCase()}-${quoteCurrency.toLowerCase()}`,
                ];
                
                for (const variation of variations) {
                  price = data[variation]?.last;
                  if (typeof price === "number") {
                    break;
                  }
                }
              }
            }

            // Update active markets for background symbols' price lookup
            requestAnimationFrame(() => {
              if (isMountedRef.current) {
                useBinaryStore.getState().updateActiveMarketsFromTicker(data);
              }
            });

            if (typeof price === "number") {
              // Use requestAnimationFrame to defer price updates and prevent setState during render
              requestAnimationFrame(() => {
                if (isMountedRef.current) {
                  setCurrentPrice(price);
                }
              });
            }
          });

        // Store the unsubscribe function
        unsubscribeTickerRef.current = unsubscribeTicker;
      } catch (error) {
        console.error("Error setting up market data subscription:", error);
      }
    }, 50); // Small debounce delay

    // Cleanup function
    return () => {
      clearTimeout(subscriptionTimeout);
    };
  }, [currentSymbol, cleanupSubscriptions, setCurrentPrice, isMarketSwitching]);

  // No bottom padding needed - trading history moved to analytics overlay
  const desktopBottomPadding = 0;

  // Render the appropriate layout
  return (
    <>
      {isMobile ? (
        <MobileLayout
          balance={balance}
          netPL={netPL}
          symbol={currentSymbol}
          handleSymbolChange={handleSymbolChange}
          addMarket={addMarket}
          removeMarket={removeMarket}
          orders={orders}
          chartOrders={chartOrders}
          tradingMode={tradingMode}
          handleTradingModeChange={setTradingMode}
          isLoadingWallet={isLoadingWallet}
          handlePositionsChange={handlePositionsChange}
          completedPositionsCount={computedValues.completedPositionsCount}
          activePositionsCount={computedValues.activePositionsCount}
          placeOrder={placeOrder}
          handleExpiryChange={setSelectedExpiryMinutes}
          selectedExpiryMinutes={selectedExpiryMinutes}
          isInSafeZone={isInSafeZone}
          candleData={candleData}
          activePanel={mobileState.activePanel}
          setActivePanel={mobileHandlers.setActivePanel}
          showMobileOrderPanel={mobileState.showMobileOrderPanel}
          setShowMobileOrderPanel={mobileHandlers.setShowMobileOrderPanel}
          showMobilePositions={mobileState.showMobilePositions}
          setShowMobilePositions={mobileHandlers.setShowMobilePositions}
          showQuickTradeButtons={mobileState.showQuickTradeButtons}
          toggleMobileOrderPanel={mobileHandlers.toggleMobileOrderPanel}
          toggleMobilePositions={mobileHandlers.toggleMobilePositions}
          toggleQuickTradeButtons={mobileHandlers.toggleQuickTradeButtons}
          setChartContextRef={setChartContextRef}
          isMarketSwitching={isMarketSwitching}
          timeFrame={timeFrame}
          handleTimeFrameChange={setTimeFrame}
          timeframeDurations={timeframeDurations}
          showExpiry={computedValues.showExpiry}
          positionMarkers={positionMarkers}
          darkMode={computedValues.darkMode}
          onDarkModeChange={() => {}}
          handleMarketSelect={handleMarketSelect}
          currency={preferredCurrency}
        />
      ) : (
        <DesktopLayout
          balance={balance}
          realBalance={realBalance}
          demoBalance={demoBalance}
          netPL={netPL}
          symbol={currentSymbol}
          handleSymbolChange={handleSymbolChange}
          addMarket={addMarket}
          removeMarket={removeMarket}
          orders={orders}
          chartOrders={chartOrders}
          tradingMode={tradingMode}
          handleTradingModeChange={setTradingMode}
          isLoadingWallet={isLoadingWallet}
          handlePositionsChange={handlePositionsChange}
          completedPositionsCount={computedValues.completedPositionsCount}
          activePositionsCount={computedValues.activePositionsCount}
          placeOrder={placeOrder}
          handleExpiryChange={setSelectedExpiryMinutes}
          selectedExpiryMinutes={selectedExpiryMinutes}
          isInSafeZone={isInSafeZone}
          candleData={candleData}
          setChartContextRef={setChartContextRef}
          isMarketSwitching={isMarketSwitching}
          timeFrame={timeFrame}
          timeframeDurations={timeframeDurations}
          showExpiry={computedValues.showExpiry}
          positionMarkers={positionMarkers}
          handleMarketSelect={handleMarketSelect}
          bottomSpacing={desktopBottomPadding}
          currency={preferredCurrency}
        />
      )}

      {/* Toast Container for trading notifications */}
      <ToastContainer darkMode={computedValues.darkMode} />
    </>
  );
}
