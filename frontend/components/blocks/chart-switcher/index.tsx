"use client";

import { useMemo, useCallback, useState, useEffect, type ComponentType } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import type { Symbol, TimeFrame } from "@/store/trade/use-binary-store";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { isForexSymbol, type MarketMetadata } from "@/lib/precision-utils";
import { useTranslations } from "next-intl";
import { calculateNextExpiryTime, getChartSynchronizedTime, setTimeOffset, getTimeOffset } from "@/utils/time-sync";
import { marketDataWs } from "@/services/market-data-ws";
import { DrawingPropertiesToolbar } from "./drawing-properties-toolbar";
import { ChartResultToasts } from "./chart-result-toasts";
import { PairInfoControl } from "./pair-info-control"; // reloaded Quotex style scroll button logic
import PriceAlertControl from "@/app/[locale]/terminal/components/alerts/price-alert-control";
import TimeAxisMarker from "@/app/[locale]/terminal/components/chart/time-axis-marker";
import PriceAlertToasts from "@/app/[locale]/terminal/components/alerts/price-alert-toasts";
import { useTradingSettingsStore } from "@/store/trade/use-trading-settings-store";

// ============================================================================
// CHART ENGINE DYNAMIC IMPORT
// Chart Engine is the primary and only chart provider
// ============================================================================

/* Typed as ComponentType<any> deliberately.

   tsconfig maps this module straight at the engine's minified dist/index.js, so
   TypeScript infers its props from that output rather than from a declaration.
   What it infers is not usable: an `orders = []` default becomes never[], which
   no real order array satisfies, and any prop destructured without a default
   becomes required, so correct calls are rejected for omitting things the engine
   treats as optional. Checking against invented types is not checking.

   A .d.ts beside the bundle is the real answer, but Next resolves this module
   through the same tsconfig path and would bundle the declaration instead of the
   engine. Until the engine ships types, the assertion belongs here — once — and
   not scattered across the props. */
/**
 * How long the tab must have been hidden before the server-clock offset is
 * measured again on return. Long enough that tab-flicking costs nothing, short
 * enough that any absence able to involve a suspended device is covered.
 */
const RESYNC_AFTER_HIDDEN_MS = 20000;

const ChartEngineDynamic = dynamic(
  () => import("@/lib/stubs/chart-engine-stub").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => null,
  }
) as ComponentType<any>;

// Define the BinaryOrder type
// Supports all order types: RISE_FALL, HIGHER_LOWER, TOUCH_NO_TOUCH, CALL_PUT, TURBO
type OrderSide = "RISE" | "FALL" | "HIGHER" | "LOWER" | "TOUCH" | "NO_TOUCH" | "CALL" | "PUT" | "UP" | "DOWN";
type BinaryOrderType = "RISE_FALL" | "HIGHER_LOWER" | "TOUCH_NO_TOUCH" | "CALL_PUT" | "TURBO";

interface BinaryOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  amount: number;
  entryPrice: number;
  entryTime: number;
  expiryTime: number;
  closePrice?: number;
  status: "PENDING" | "WIN" | "LOSS";
  profit?: number;
  profitPercentage?: number;
  isDemo: boolean;
  // Type-specific fields
  type?: BinaryOrderType;
  barrier?: number;          // For HIGHER_LOWER, TOUCH_NO_TOUCH, TURBO
  strikePrice?: number;      // For CALL_PUT
  payoutPerPoint?: number;   // For TURBO, CALL_PUT
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================

interface ChartSwitcherProps {
  symbol: Symbol;
  timeFrame: TimeFrame;
  orders?: any[];
  expiryMinutes?: number;
  showExpiry?: boolean;
  timeframeDurations?: Array<{ value: TimeFrame; label: string }>;
  positions?: any[];
  isMarketSwitching?: boolean;
  onChartContextReady?: (context: any) => void;
  marketType?: "spot" | "eco" | "futures";
  onPriceUpdate?: (price: number) => void;
  metadata?: MarketMetadata;
  isBinaryContext?: boolean;
  currency?: string;
  // Limit order alert integration
  defaultOrderAmount?: number;
  onPlaceOrder?: (side: "RISE" | "FALL", amount: number, expiryMinutes: number) => Promise<boolean>;
  // Mobile support
  isMobile?: boolean;
  /**
   * The engine's left drawing rail. Mobile only — on desktop the setting is
   * left alone so the engine's own settings panel stays authoritative.
   *
   * It has to go through the engine rather than CSS: the engine computes the
   * chart width as `container - drawingToolbarWidth` from this flag, so a rail
   * hidden with display:none still costs its 40px and leaves a dead strip down
   * the right-hand edge.
   */
  showDrawingTools?: boolean;
  // External notification settings
  onOpenNotificationSettings?: () => void;
  // Callback to close parent overlays
  onCloseParentOverlays?: () => void;
  // When true, closes all internal chart overlays
  closeInternalOverlays?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ChartSwitcher({
  symbol,
  timeFrame,
  orders = [],
  expiryMinutes = 5,
  showExpiry = true,
  timeframeDurations,
  positions,
  isMarketSwitching = false,
  onChartContextReady,
  marketType = "spot",
  onPriceUpdate,
  metadata,
  isBinaryContext = false,
  currency = "USD",
  defaultOrderAmount,
  onPlaceOrder,
  isMobile = false,
  showDrawingTools = false,
  onOpenNotificationSettings,
  onCloseParentOverlays,
  closeInternalOverlays = false,
}: ChartSwitcherProps) {
  const t = useTranslations("components_blocks");

  // Theme handling
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [isPaused, setIsPaused] = useState(false);

  /* The engine draws its order badges on a canvas, and a canvas cannot ask
     React anything. A badge on a phone drops its amount and its clock and keeps
     only its arrow — there is no room over a chart that is a third of a screen
     for three pieces of information per open trade — and the drawing code needs
     to know which it is looking at. Publishing the flag the layout already
     decided is the whole mechanism: the alternative is the canvas guessing from
     window.innerWidth and disagreeing with the layout at the breakpoint. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    (window as any).__bidexIsMobile = isMobile;
  }, [isMobile]);

  // Listen for toolbar mute toggle requests from the drawing toolbar inside the chart engine
  useEffect(() => {
    const handleMuteToggle = () => {
      const store = useTradingSettingsStore.getState();
      const currentEnabled = store.audio.enabled;
      const nextEnabled = !currentEnabled;
      store.setAudioEnabled(nextEnabled);
      store.updateNotifications({ soundEnabled: nextEnabled });

      // Save/persist immediately to localStorage so the chart engine can read the synced state
      try {
        const stored = localStorage.getItem("trading-settings-store");
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.state.audio.enabled = nextEnabled;
          parsed.state.notifications.soundEnabled = nextEnabled;
          localStorage.setItem("trading-settings-store", JSON.stringify(parsed));
        }
      } catch (err) {}

      // Dispatch event to notify the chart engine to update its rendering button icon
      window.dispatchEvent(new Event("chart-mute-synced"));
    };

    window.addEventListener("mute-toggle-requested", handleMuteToggle);
    return () => window.removeEventListener("mute-toggle-requested", handleMuteToggle);
  }, []);

  useEffect(() => {
    if (!symbol) return;
    
    let active = true;
    const checkAssetStatus = async () => {
      try {
        const res = await fetch(`/api/exchange/market-status?symbol=${encodeURIComponent(String(symbol))}`);
        if (res.ok) {
          const data = await res.json();
          if (active) {
            setIsPaused(data.status === "PAUSED");
          }
        } else {
          if (active) setIsPaused(false);
        }
      } catch (err) {
        if (active) setIsPaused(false);
      }
    };

    checkAssetStatus();
    
    const intervalId = setInterval(checkAssetStatus, 8000);

    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [symbol]);

  // Synchronize time offset with backend on mount
  useEffect(() => {
    let active = true;
    const syncTime = async () => {
      try {
        const startTime = Date.now();
        const isDev = process.env.NODE_ENV === "development";
        const backendPort = process.env.NEXT_PUBLIC_BACKEND_PORT || "4000";
        let syncUrl = "";
        
        if (typeof window !== "undefined") {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
          if (backendUrl) {
            syncUrl = `${backendUrl}/api/exchange/chart`;
          } else if (isDev) {
            syncUrl = `${window.location.protocol}//${window.location.hostname}:${backendPort}/api/exchange/chart`;
          } else {
            syncUrl = `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/api/exchange/chart`;
          }
        }
        
        const res = await fetch(`${syncUrl}?symbol=${encodeURIComponent(symbol)}&interval=1h&from=${startTime}&to=${startTime}`, {
          credentials: "include",
        });
        const endTime = Date.now();
        
        if (!active) return;

        let serverTime = 0;
        try {
          const json = await res.json();
          if (json && typeof json.timestamp === "number") {
            serverTime = json.timestamp;
          }
        } catch (e) {
          console.error("[ChartSwitcher TimeSync] Failed to parse JSON response:", e);
        }

        // Fallback to Date header if JSON parsing failed or timestamp is missing
        if (!serverTime) {
          const serverDateHeader = res.headers.get("Date");
          if (serverDateHeader) {
            serverTime = new Date(serverDateHeader).getTime();
          }
        }

        if (serverTime) {
          const rtt = endTime - startTime;
          const serverTimeAdjusted = serverTime + Math.min(rtt / 2, 5000);
          const rawOffset = serverTimeAdjusted - endTime;
          
          console.log(`[ChartSwitcher TimeSync] Calculated server offset for ${symbol}: ${rawOffset}ms`);
          setTimeOffset(rawOffset, true);
          marketDataWs.setTimeOffset(rawOffset);
        }
      } catch (err) {
        console.error("[ChartSwitcher TimeSync] Failed to sync clock with server on mount/change:", err);
      }
    };
    
    syncTime();

    /* And again whenever the tab comes back from a spell in the background.
       "Once per mount" is right for asset switches and wrong for suspension: a
       phone that has had this tab frozen for forty minutes may have had its
       clock stepped by NTP in the meantime, and the offset measured on mount
       describes a relationship between the two machines that no longer holds.
       Everything downstream is built on it — which candle "now" belongs to, and
       what expiry a trade is given — so a stale offset does not merely misdraw
       the chart, it misprices the order.

       Only after a real absence. Flicking to another tab for two seconds does
       not move anybody's clock, and this costs a round trip. */
    let hiddenAt = 0;
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away >= RESYNC_AFTER_HIDDEN_MS) syncTime();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      active = false;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
    // Once per mount, not once per symbol. This measures the offset between the
    // browser clock and the server's — a property of the two machines, not of
    // the instrument being charted. Keyed on [symbol] it fired an extra network
    // round trip on every single asset switch and recomputed the same number.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartTheme: any = mounted && resolvedTheme ? (resolvedTheme === "navy" ? "navy" : resolvedTheme === "dark" ? "dark" : "light") : "dark";

  // Actively sync Chart Grid Opacity to the engine to prevent visibility desyncs on server restarts
  useEffect(() => {
    if (mounted && typeof window !== "undefined" && (window as any).setChartGridOpacity) {
      try {
        const stored = localStorage.getItem("chart_grid_opacity");
        if (stored !== null) {
          const val = parseFloat(stored);
          if (!isNaN(val)) {
            (window as any).setChartGridOpacity(Math.max(1, Math.min(10, val)));
          }
        }
      } catch (e) {}
    }
  }, [mounted, chartTheme]);

  // Memoize callbacks to prevent re-renders from prop changes
  const handleBinaryChartReady = useCallback(() => {
    if (onChartContextReady) {
      onChartContextReady({ type: "chart-engine", symbol });
    }
  }, [onChartContextReady, symbol]);

  const handleTimeFrameChange = useCallback(() => {
    // Handle timeframe change if needed
  }, []);

  const binaryCallbacks = useMemo(() => ({
    onReady: handleBinaryChartReady,
    onPriceUpdate: onPriceUpdate,
    onTimeFrameChange: handleTimeFrameChange,
  }), [handleBinaryChartReady, onPriceUpdate, handleTimeFrameChange]);

  // Memoize binary orders conversion
  const binaryOrders = useMemo((): BinaryOrder[] => {
    const res = orders.map((order) => {
      let entryTime = getChartSynchronizedTime().getTime();
      if (order.entryTime) {
        if (order.entryTime instanceof Date) {
          entryTime = order.entryTime.getTime();
        } else if (typeof order.entryTime === 'number') {
          entryTime = order.entryTime;
        } else {
          entryTime = new Date(order.entryTime).getTime() || entryTime;
        }
      } else if (order.createdAt) {
        entryTime = typeof order.createdAt === 'number' ? order.createdAt : new Date(order.createdAt).getTime() || entryTime;
      }

      let expiryTime = calculateNextExpiryTime(expiryMinutes).getTime();
      if (order.expiryTime) {
        if (order.expiryTime instanceof Date) {
          expiryTime = order.expiryTime.getTime();
        } else if (typeof order.expiryTime === 'number') {
          expiryTime = order.expiryTime;
        } else {
          expiryTime = new Date(order.expiryTime).getTime() || expiryTime;
        }
      } else if (order.closedAt) {
        expiryTime = typeof order.closedAt === 'number' ? order.closedAt : new Date(order.closedAt).getTime() || expiryTime;
      }

      // Sync safety: OTC orders are created with real system time for `createdAt`/`entryTime`
      // on the backend database, but the chart uses the shifted timeline (`offset`).
      // We adjust the `entryTime` to align it with the expiry time on the chart if there is a discrepancy.
      const offset = getTimeOffset();
      if (symbol.toUpperCase().includes("OTC") && offset !== 0) {
        const diff = Math.abs(expiryTime - entryTime);
        // If the discrepancy is significant (greater than a typical order duration, e.g. 10 minutes),
        // it means the entry time lacks the offset. We add the offset to correct its timeline.
        if (diff > 600000) {
          entryTime += offset;
        }
      }

      return {
        id: order.id || String(entryTime),
        symbol: order.symbol || symbol,
        side: order.side || "RISE",
        amount: order.amount || 0,
        entryPrice: order.entryPrice || order.price || 0,
        entryTime,
        expiryTime,
        closePrice: order.closePrice,
        status: order.status || "PENDING",
        profit: order.profit,
        profitPercentage: order.profitPercentage,
        isDemo: Boolean(order.isDemo),
        type: order.type,
        barrier: order.barrier,
        strikePrice: order.strikePrice,
        payoutPerPoint: order.payoutPerPoint,
      };
    });
    return res;
  }, [orders, symbol, expiryMinutes]);

  // Dispatch resize events to ensure chart engine measures container correctly
  // after CSS transitions complete AND after dynamic import of chart engine loads
  useEffect(() => {
    const fireResize = () => window.dispatchEvent(new Event('resize'));
    const fireChartResize = () => window.dispatchEvent(new Event('chart-resize-requested'));
    const fire = () => { fireResize(); fireChartResize(); };
    const t1 = setTimeout(fire, 50);
    const t2 = setTimeout(fire, 200);
    const t3 = setTimeout(fire, 500);
    const t4 = setTimeout(fire, 1000);
    const t5 = setTimeout(fire, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, timeFrame]);

  // Get price precision from market metadata for chart display
  const priceDecimals = metadata?.precision?.price ?? (isForexSymbol(symbol) ? 5 : 2);

  // Always render Chart Engine
  return (
    <div className="relative w-full h-full flex-1 min-h-0" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ChartEngineDynamic
        key={`chart-engine-${symbol}-binary-${marketType}`}
        symbol={symbol}
        timeFrame={timeFrame}
        tradingMode="binary"
        marketType={marketType}
        theme={chartTheme === "navy" ? "dark" : chartTheme}
        orders={binaryOrders}
        expiryMinutes={expiryMinutes}
        showExpiry={showExpiry}
        isMarketSwitching={isMarketSwitching}
        currency={currency}
        decimals={priceDecimals}
        callbacks={binaryCallbacks}
        defaultOrderAmount={defaultOrderAmount}
        onPlaceOrder={onPlaceOrder}
        isMobile={isMobile}
        onOpenNotificationSettings={onOpenNotificationSettings}
        onCloseParentOverlays={onCloseParentOverlays}
        closeInternalOverlays={closeInternalOverlays}
        initialSettings={{
          showExpiryLines: true,
          showOrderCountdown: true,
          showToolbar: false,
          /* Only sent on mobile. initialSettings is re-applied on every render,
             so including this key on desktop would overwrite the trader's own
             choice in the chart settings panel on the next render. */
          ...(isMobile
            ? {
                showDrawingTools,
                /* No crosshair on a phone. It is a mouse instrument: it
                   follows a pointer that is hovering, and a finger is never
                   hovering — it is either not touching the chart or it is
                   dragging it. What it actually did here was fire under the
                   tool rail every time that rail was tapped, drawing a
                   readout over the controls the tap was aimed at. */
                showCrosshair: false,
              }
            : {}),
        }}
      />
      
      {isPaused && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,rgba(9,9,11,0.85)_0%,rgba(9,9,11,0.98)_100%)] text-center p-6 z-[9999] backdrop-blur-md">
          {/* Glowing Glassmorphic Card */}
          <div className="bg-zinc-900/35 border border-white/5 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center relative overflow-hidden backdrop-blur-xl">
            {/* Subtle Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-rose-500/50 to-transparent" />
            
            {/* Pulsing indicator ring */}
            <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-rose-500/10 text-rose-500 mb-5">
              <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping opacity-40" />
              <div className="absolute inset-2 rounded-full bg-rose-500/10 border border-rose-500/20" />
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6 relative z-10">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>

            {/* Typography */}
            <h3 className="text-[14px] font-bold text-zinc-100 mb-2 leading-none tracking-wide uppercase">Market Closed</h3>
            <p className="text-zinc-400 text-xs leading-relaxed mb-6 px-1">
              The OTC market for <span className="font-semibold text-rose-400">{String(symbol).replace(" (OTC)", "").replace("/OTC", "").replace("OTC", "").replace("/USD", "").trim().toUpperCase()}</span> is currently closed. Please select another active asset to start trading.
            </p>

            {/* Quick Action Button */}
            <button
              onClick={() => window.dispatchEvent(new Event("open-market-browser"))}
              className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white font-semibold text-xs px-5 py-2.5 rounded-lg shadow-[0_4px_12px_rgba(16,185,129,0.2)] flex items-center gap-1.5 border border-emerald-400/20 cursor-pointer"
            >
              Choose Another Asset
            </button>
          </div>
        </div>
      )}

      <DrawingPropertiesToolbar />
      <PairInfoControl
        symbol={symbol}
        currency={currency}
        decimals={priceDecimals}
        compact={isMobile}
      />
      {/* Setting an alert means dragging a line to a price on a chart this
          size with a finger — the gesture is the same one that pans the
          chart, so it is off on a phone. Alerts already set elsewhere still
          fire and still toast; only the control that creates them is gone. */}
      {!isMobile && <PriceAlertControl />}
      <TimeAxisMarker />
      <PriceAlertToasts />
      <ChartResultToasts symbol={symbol} currency={currency} expiryMinutes={expiryMinutes} />
    </div>
  );
}
