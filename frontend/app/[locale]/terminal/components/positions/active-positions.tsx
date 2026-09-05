"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  BarChart3,
  ChevronLeft,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  X,
  DollarSign,
  Ban,
  Activity,
  Sparkles,
} from "lucide-react";
import type { Order, CompletedOrder } from "@/store/trade/use-binary-store";
import { tickersWs } from "@/services/tickers-ws";
import type { TickerData } from "@/services/market-data-ws";
import { marketDataWs } from "@/services/market-data-ws";
import {
  extractQuoteCurrency,
  extractBaseCurrency,
  useBinaryStore,
  isSameSymbol,
} from "@/store/trade/use-binary-store";
import { getChartSynchronizedTime, useSystemTimezone, formatTimeInTimezone, formatDateInTimezone } from "@/utils/time-sync";
import { $fetch } from "@/lib/api";
import { useTranslations } from "next-intl";
import { CancelOrderModal } from "../modals/cancel-order-modal";
import InlineExitConfirm from "./inline-exit-confirm";
import { OTC_BADGE_CLASS_ROW } from "../../lib/otc-badge";
import { useTradingSettingsStore } from "@/store/trade/use-trading-settings-store";
import type { OrderSide } from "@/types/binary-trading";
import { formatBinaryPrice, isForexSymbol } from "@/lib/precision-utils";
import { getCryptoImageUrl, handleImageError, getAssetDisplayName } from "@/utils/image-fallback";
import { EXCHANGE_RATES, CURRENCY_SYMBOLS } from "../header/header";

// Helper function to determine if an order side is bullish (upward direction)
function isBullishSide(side: OrderSide | string): boolean {
  return side === "RISE" || side === "HIGHER" || side === "TOUCH" || side === "CALL" || side === "UP";
}

const getCoinColors = (coin: string) => {
  const c = coin.toUpperCase();
  if (c === "BTC") return { bg: "bg-gradient-to-br from-amber-400 to-amber-500", text: "text-white", symbol: "₿" };
  if (c === "ETH") return { bg: "bg-gradient-to-br from-indigo-400 to-indigo-500", text: "text-white", symbol: "Ξ" };
  if (c === "USDT") return { bg: "bg-gradient-to-br from-emerald-400 to-emerald-500", text: "text-white", symbol: "₮" };
  if (c === "SOL") return { bg: "bg-gradient-to-br from-purple-500 to-indigo-500", text: "text-white", symbol: "S" };
  if (c === "ADA") return { bg: "bg-gradient-to-br from-blue-500 to-blue-600", text: "text-white", symbol: "A" };
  if (c === "XRP") return { bg: "bg-gradient-to-br from-sky-400 to-sky-500", text: "text-white", symbol: "X" };
  return { bg: "bg-gradient-to-br from-zinc-600 to-zinc-800", text: "text-zinc-300", symbol: coin[0] || "?" };
};

const getCoinsFromSymbol = (symbol: string) => {
  let base = "BTC";
  let quote = "USDT";
  if (symbol.includes("/")) {
    [base, quote] = symbol.split("/");
  } else if (symbol.includes("-")) {
    [base, quote] = symbol.split("-");
  } else if (symbol.includes("_")) {
    [base, quote] = symbol.split("_");
  } else {
    if (symbol.toUpperCase().endsWith("USDT")) {
      base = symbol.substring(0, symbol.length - 4);
      quote = "USDT";
    } else {
      base = symbol;
      quote = "";
    }
  }
  return [base, quote];
};

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL", "PKR", "BDT", "CNY", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP"
]);

const renderCoinIcons = (symbol: string, theme: "dark" | "light" | "navy" = "dark") => {
  const parts = symbol.split("/");
  const base = parts[0] || "BTC";
  let quote = parts[1] || "USDT";

  const isOTC = symbol.toUpperCase().includes("OTC");
  
  let cleanQuote = quote;
  if (isOTC && quote === "OTC") {
    cleanQuote = "USD";
  }

  const cleanBase = base.replace(/_OTC$/i, '').replace(/OTC$/i, '').trim();
  const normalizedQuote = cleanQuote.replace(/_OTC$/i, '').replace(/OTC$/i, '').trim();

  const isSingle = isOTC && !FIAT_CURRENCIES.has(cleanBase.toUpperCase());

  const bgClass = theme === "dark" || theme === "navy" || isSingle ? "bg-zinc-900" : "bg-white";

  if (isSingle) {
    return (
      <div className="relative flex items-center w-7 h-7 mr-1.5 shrink-0 select-none justify-center">
        <div className={`w-[19px] h-[19px] rounded-full overflow-hidden border-2 border-zinc-950 dark:border-white ${bgClass} z-10 shadow-md`}>
          <img
            src={getCryptoImageUrl(cleanBase)}
            alt={cleanBase}
            className="object-cover w-full h-full"
            onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-center w-7 h-7 mr-1.5 shrink-0 select-none">
      {/* Base Currency Icon (behind, top-left) */}
      <div className={`absolute left-0 top-0 w-[17px] h-[17px] rounded-full overflow-hidden border border-zinc-950 dark:border-white ${bgClass} z-0 shadow-sm`}>
        <img
          src={getCryptoImageUrl(cleanBase)}
          alt={cleanBase}
          className="object-cover w-full h-full"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
      {/* Quote Currency Icon (in front, bottom-right) */}
      <div className={`absolute right-0 bottom-0 w-[17px] h-[17px] rounded-full overflow-hidden border border-zinc-950 dark:border-white ${bgClass} z-10 shadow-md`}>
        <img
          src={getCryptoImageUrl(normalizedQuote)}
          alt={normalizedQuote}
          className="object-cover w-full h-full"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
    </div>
  );
};

// Session-scoped cache of settled-order sparkline candles, keyed by the exact
// request window. Settled orders never change, so once fetched their sparkline
// is reused instantly on every re-open (e.g. scrolling history) — no network,
// no spinner. Lives until a full page reload.
const sparklineCache = new Map<string, any[]>();

/**
 * How many settled rows to mount at once, and how many more to add each time the
 * bottom of the list comes into view.
 *
 * The Settled tab used to render `completedOrders.map(...)` in full. At ~45 DOM
 * elements per collapsed row, an account with 1,594 settled trades mounted roughly
 * 71,000 nodes in one go — enough that layout, hit-testing and paint went slow
 * across the whole page, not just this panel. Mounting a screenful and extending
 * on scroll keeps the node count flat no matter how long the history gets.
 */
const HISTORY_PAGE_SIZE = 25;

// Helper function to determine timezone-aware date group key
function getDateGroupKey(date: Date, timezone: string): string {
  const now = getChartSynchronizedTime();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const keyToday = formatDateInTimezone(now, timezone, { year: "numeric", month: "2-digit", day: "2-digit" });
  const keyYesterday = formatDateInTimezone(yesterday, timezone, { year: "numeric", month: "2-digit", day: "2-digit" });
  const keyOrder = formatDateInTimezone(date, timezone, { year: "numeric", month: "2-digit", day: "2-digit" });

  const dateStr = formatDateInTimezone(date, timezone, {
    month: "short",
    day: "numeric",
  });

  if (keyOrder === keyToday) return `Today, ${dateStr}`;
  if (keyOrder === keyYesterday) return `Yesterday, ${dateStr}`;

  return formatDateInTimezone(date, timezone, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Sub-component for rendering completed order details with an area chart of its range
interface HistoryOrderCardProps {
  order: CompletedOrder;
  isSelected: boolean;
  /**
   * Takes the id rather than closing over it, so the parent can pass one stable
   * callback instead of minting `() => selectOrder(order.id)` per row. A fresh
   * function per row defeats the memo below on every single render.
   */
  onSelect: (orderId: string) => void;
  themeClasses: any;
  theme: "dark" | "light" | "navy";
  t: any;
  tBinaryComponents: any;
  preferredCurrency: string;
  preferredCurrencyRate: number;
  preferredCurrencySymbol: string;
}

function HistoryOrderCardImpl({
  order,
  isSelected,
  onSelect,
  themeClasses,
  theme,
  t,
  tBinaryComponents,
  preferredCurrency,
  preferredCurrencyRate,
  preferredCurrencySymbol,
}: HistoryOrderCardProps) {
  const getCurrency = (symbol: string) => symbol.split("/")[1] || "USDT";
  const timezone = useSystemTimezone();
  const [candles, setCandles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryTime = useMemo(() => new Date(order.entryTime), [order.entryTime]);
  const expiryTime = useMemo(() => new Date(order.expiryTime), [order.expiryTime]);

  const durationSeconds = useMemo(() => {
    const entry = entryTime.getTime();
    const expiry = expiryTime.getTime();
    if (isNaN(entry) || isNaN(expiry) || expiry <= entry) return 60;
    return Math.round((expiry - entry) / 1000);
  }, [entryTime, expiryTime]);

  const formattedDuration = useMemo(() => {
    if (durationSeconds <= 0) return "1m";
    if (durationSeconds < 60) return `${durationSeconds}s`;
    const minutes = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    if (minutes < 60) {
      if (secs === 0) return `${minutes}m`;
      return `${minutes}m ${secs}s`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  }, [durationSeconds]);

  const formattedOpenTime = useMemo(() => {
    const formatted = formatTimeInTimezone(entryTime, timezone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return formatted.replace(/\//g, "-");
  }, [entryTime, timezone]);

  const formattedCloseTime = useMemo(() => {
    const formatted = formatTimeInTimezone(expiryTime, timezone, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return formatted.replace(/\//g, "-");
  }, [expiryTime, timezone]);

  useEffect(() => {
    if (!isSelected) return;
    if (candles.length > 0) return;

    const tEntry = entryTime.getTime();
    const tExpiry = expiryTime.getTime();
    const durationMs = tExpiry - tEntry;

    // Determine resolution/interval and padding based on duration
    let interval = "1m";
    let padMs = 3 * 60 * 1000; // 3 min padding

    if (durationMs <= 2 * 60 * 1000) {
      interval = "5s";
      padMs = 1.5 * 60 * 1000; // 1.5 min padding for second charts to keep candle count reasonable
    } else if (durationMs <= 5 * 60 * 1000) {
      interval = "15s";
      padMs = 3 * 60 * 1000;
    } else if (durationMs <= 15 * 60 * 1000) {
      interval = "30s";
      padMs = 5 * 60 * 1000;
    } else if (durationMs > 24 * 60 * 60 * 1000) {
      interval = "1d";
      padMs = 2 * 24 * 60 * 60 * 1000;
    } else if (durationMs > 4 * 60 * 60 * 1000) {
      interval = "1h";
      padMs = 4 * 60 * 60 * 1000;
    } else if (durationMs > 60 * 60 * 1000) {
      interval = "15m";
      padMs = 60 * 60 * 1000;
    } else if (durationMs > 15 * 60 * 1000) {
      interval = "5m";
      padMs = 20 * 60 * 1000;
    }

    const from = tEntry - padMs;
    const to = tExpiry + padMs;
    const cacheKey = `${order.symbol}|${interval}|${from}|${to}`;

    // Instant path: reuse a previously-fetched sparkline for this exact window.
    // No network, no loading state — the chart renders on the same frame.
    const cached = sparklineCache.get(cacheKey);
    if (cached) {
      setCandles(cached);
      return;
    }

    let isMounted = true;

    const fetchHistoricalChart = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiIntervalDurations: Record<string, number> = {
          "1m": 60 * 1000,
          "5m": 5 * 60 * 1000,
          "15m": 15 * 60 * 1000,
          "1h": 60 * 60 * 1000,
          "1d": 24 * 60 * 60 * 1000,
        };

        const res = await $fetch({
          url: "/api/exchange/chart",
          silent: true,
          params: {
            symbol: order.symbol,
            interval: interval,
            from: from,
            to: to,
            duration: apiIntervalDurations[interval] || 60000,
          },
        });

        if (!isMounted) return;

        if (res.error) {
          setError(
            typeof res.error === "object" && res.error
              ? (res.error as any).message
              : String(res.error) || "Failed to load chart data"
          );
          return;
        }

        if (res.data && Array.isArray(res.data)) {
          const parsedCandles = res.data
            .map((item: any) => ({
              time: item[0],
              open: item[1],
              high: item[2],
              low: item[3],
              close: item[4],
              volume: item[5] || 0,
            }))
            .sort((a: any, b: any) => a.time - b.time);

          sparklineCache.set(cacheKey, parsedCandles);
          setCandles(parsedCandles);
        } else {
          setError("No chart data available");
        }
      } catch (err: any) {
        console.error("Error loading historical sparkline:", err);
        if (isMounted) {
          setError("Failed to load chart data");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchHistoricalChart();

    return () => {
      isMounted = false;
    };
  }, [isSelected, order.id, order.symbol, entryTime, expiryTime, candles.length]);

  const isProfitable = order.status === "WIN";
  const isDraw = order.status === "DRAW";
  const isDark = theme === "dark" || theme === "navy";

  const cardClass = theme === "navy"
    ? isSelected
      ? "bg-[#0e1626] border-[#223966] shadow-lg shadow-black/35"
      : "bg-[#0b101b] border-[#18253d]/80 hover:bg-[#0e1626]/80 hover:border-[#1c2a4a]"
    : theme === "dark"
      ? isSelected
        ? "bg-[#161619] border-[#26282f] shadow-lg shadow-black/35"
        : "bg-card/45 border-[#1f2027] hover:bg-card/65 hover:border-[#2a2c34]"
      : isSelected
        ? "bg-white border-zinc-400 shadow-md shadow-zinc-300/60"
        : "bg-white border-zinc-200/80 hover:bg-zinc-50 hover:border-zinc-300";

  const formattedPL = isDraw
    ? "0.00"
    : isProfitable
    ? `+${(order.profit * preferredCurrencyRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `-${(order.amount * preferredCurrencyRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const plColorClass = isDraw
    ? themeClasses.secondaryTextClass
    : isProfitable
    ? themeClasses.profitColorClass
    : themeClasses.lossColorClass;

  // Calculate Difference in integer points (e.g. +6 or -6)
  const priceDiff = order.closePrice - order.entryPrice;
  const diffSign = priceDiff > 0 ? "+" : priceDiff < 0 ? "-" : "";

  const diffColorClass = priceDiff > 0
    ? themeClasses.profitColorClass
    : priceDiff < 0
    ? themeClasses.lossColorClass
    : themeClasses.secondaryTextClass;

  const diffPoints = Math.round(
    priceDiff * Math.pow(10, isForexSymbol(order.symbol) ? 5 : 2)
  );
  const diffFormatted = `${diffSign}${Math.abs(diffPoints).toLocaleString()}`;

  // Render sparkline SVG
  const renderSparkline = () => {
    if (loading) {
      // Quiet, same-height placeholder — no spinner or "loading" text, so a brief
      // fetch never reads as buffering. The real sparkline fades in when ready.
      return (
        <div className="mt-3 h-24 rounded-lg bg-card/10 border border-border/20" aria-hidden="true" />
      );
    }

    if (error) {
      return (
        <div className="mt-3 h-24 flex items-center justify-center rounded-lg bg-card/10 border border-border/20 text-muted-foreground text-[10px] font-medium">
          <span>{error}</span>
        </div>
      );
    }

    if (candles.length < 2) {
      return (
        <div className="mt-3 h-24 flex items-center justify-center rounded-lg bg-card/10 border border-border/20 text-muted-foreground text-[10px] font-medium">
          <span>No historical chart data</span>
        </div>
      );
    }

    const tEntry = entryTime.getTime();
    const tExpiry = expiryTime.getTime();
    const durationMs = tExpiry - tEntry;

    let padMs = 3 * 60 * 1000; // 3 min padding
    if (durationMs <= 2 * 60 * 1000) padMs = 1.5 * 60 * 1000; // 1.5 min padding
    else if (durationMs <= 5 * 60 * 1000) padMs = 3 * 60 * 1000;
    else if (durationMs <= 15 * 60 * 1000) padMs = 5 * 60 * 1000;
    else if (durationMs > 24 * 60 * 60 * 1000) padMs = 2 * 24 * 60 * 60 * 1000;
    else if (durationMs > 4 * 60 * 60 * 1000) padMs = 4 * 60 * 60 * 1000;
    else if (durationMs > 60 * 60 * 1000) padMs = 60 * 60 * 1000;
    else if (durationMs > 15 * 60 * 1000) padMs = 20 * 60 * 1000;

    const from = tEntry - padMs;
    const to = tExpiry + padMs;

    const prices = [
      ...candles.map((c) => c.close),
      order.entryPrice,
      order.closePrice,
    ];
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const padding = priceRange * 0.08;
    const yMin = minPrice - padding;
    const yMax = maxPrice + padding;
    const yRange = yMax - yMin;

    const width = 240;
    const height = 96;
    const chartPadding = 6;
    const chartHeight = height - chartPadding * 2;

    const points = candles.map((candle, index) => {
      const x = ((candle.time - from) / (to - from)) * width;
      const y = chartHeight - ((candle.close - yMin) / yRange) * chartHeight + chartPadding;
      return { x, y, time: candle.time };
    });

    const pathData = points
      .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const entryLineY = chartHeight - ((order.entryPrice - yMin) / yRange) * chartHeight + chartPadding;

    // Exact event coordinate offsets
    const xEntry = ((tEntry - from) / (to - from)) * width;
    const xExpiry = ((tExpiry - from) / (to - from)) * width;
    const yEntry = entryLineY;
    const yExpiry = chartHeight - ((order.closePrice - yMin) / yRange) * chartHeight + chartPadding;

    const firstTradePoint = points.length > 0 ? { x: xEntry, y: yEntry, time: tEntry } : null;
    const lastTradePoint = points.length > 0 ? { x: xExpiry, y: yExpiry, time: tExpiry } : null;

    // Split the points into pre-trade, active-trade, and post-trade segments
    const preTradePoints = points.filter((p) => p.time < tEntry);
    const preTradePointsWithConnection = firstTradePoint
      ? [...preTradePoints, firstTradePoint]
      : preTradePoints;

    const middleTradePoints = points.filter((p) => p.time >= tEntry && p.time <= tExpiry);
    const tradePointsWithConnection = firstTradePoint && lastTradePoint
      ? [firstTradePoint, ...middleTradePoints, lastTradePoint]
      : middleTradePoints;

    const postTradePoints = points.filter((p) => p.time > tExpiry);
    const postTradePointsWithConnection = lastTradePoint
      ? [lastTradePoint, ...postTradePoints]
      : postTradePoints;

    const preTradePathData = preTradePointsWithConnection
      .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const tradePathData = tradePointsWithConnection
      .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const postTradePathData = postTradePointsWithConnection
      .map((p, index) => `${index === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const tradeAreaPath = lastTradePoint && firstTradePoint && tradePointsWithConnection.length > 0
      ? `${tradePathData} L ${lastTradePoint.x} ${height} L ${firstTradePoint.x} ${height} Z`
      : "";

    const lineColor = isDraw ? "#71717a" : isBullishSide(order.side) ? "#10b981" : "#ef4444";

    return (
      <div className="mt-3 overflow-hidden rounded-lg border border-border/40 bg-card/35 p-2 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-300">
        {/* 11px on an explicit colour rather than 9px on muted-foreground. That
            token is deliberately low-contrast for secondary text, and at 9px it
            fell below what a 1x display can render legibly — it read as a smudge
            rather than a label. Dropping font-mono keeps it in the interface face
            like everything around it. */}
        {/* 24-hour, and every part held on one line. Without hour12:false the
            locale decided, and "07:48 PM" is four characters longer than
            "19:48" — enough that the row broke and each timestamp stacked its
            AM/PM onto a second line. The rest of the panel already uses 24-hour,
            so this was inconsistent as well as broken. */}
        {/* Weight 300 to match the value rows above. These are axis labels for
            the sparkline, not headings — bold gave them more presence than the
            prices they annotate. */}
        <div className="flex items-center justify-between gap-1 text-[10px] tracking-wider text-zinc-500 dark:text-zinc-300 font-light antialiased px-0.5 whitespace-nowrap">
          <span>{formatTimeInTimezone(entryTime, timezone, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
          <span>Price movement</span>
          <span>{formatTimeInTimezone(expiryTime, timezone, { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
        </div>
        <div className="h-24 relative overflow-hidden bg-background/20 rounded-lg">
          <svg
            className="w-full h-full"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={`blue-grad-${order.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id={`grad-${order.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.16" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Bullish/Bearish winning region/side highlight */}
            {entryLineY >= 0 && entryLineY <= height && firstTradePoint && lastTradePoint && (
              <rect
                x={firstTradePoint.x}
                y={isBullishSide(order.side) ? 0 : entryLineY}
                width={lastTradePoint.x - firstTradePoint.x}
                height={isBullishSide(order.side) ? entryLineY : height - entryLineY}
                fill={isBullishSide(order.side) ? "rgba(16, 185, 129, 0.04)" : "rgba(239, 68, 68, 0.04)"}
                pointerEvents="none"
              />
            )}

            {/* Horizontal entry price level line (Full length end to end) */}
            {entryLineY >= 0 && entryLineY <= height && (
              <line
                x1={0}
                y1={entryLineY}
                x2={width}
                y2={entryLineY}
                stroke={lineColor}
                strokeWidth="1.25"
                strokeDasharray="3,3"
                opacity="0.8"
              />
            )}

            {/* Pre-trade muted gray wiggling path */}
            {preTradePathData && (
              <path
                d={preTradePathData}
                fill="none"
                stroke={isDark ? "rgba(113, 113, 122, 0.4)" : "rgba(113, 113, 122, 0.35)"}
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Post-trade muted gray wiggling path */}
            {postTradePathData && (
              <path
                d={postTradePathData}
                fill="none"
                stroke={isDark ? "rgba(113, 113, 122, 0.4)" : "rgba(113, 113, 122, 0.35)"}
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Active/Completed Trade Area Outcome Gradient */}
            {tradeAreaPath && (
              <path
                d={tradeAreaPath}
                fill={`url(#grad-${order.id})`}
              />
            )}

            {/* Active/Completed Trade Path (Thick green/red) */}
            {tradePathData && (
              <path
                d={tradePathData}
                fill="none"
                stroke={lineColor}
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Entry Point marker */}
            {firstTradePoint && (
              <circle
                cx={firstTradePoint.x}
                cy={firstTradePoint.y}
                r="3.5"
                fill="#e4e4e7"
                stroke={lineColor}
                strokeWidth="2"
              />
            )}

            {/* Expiry/Close Point marker */}
            {lastTradePoint && (
              <circle
                cx={lastTradePoint.x}
                cy={lastTradePoint.y}
                r="2.5"
                fill={lineColor}
                stroke={theme === "navy" ? "#0b111e" : theme === "dark" ? "#09090b" : "#ffffff"}
                strokeWidth="1"
              />
            )}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div
      onClick={() => onSelect(order.id)}
      className={`px-3 py-2 rounded-lg border cursor-pointer transition-all duration-200 ${cardClass}`}
    >
      {/* Minimized Completed Row (Two rows) */}
      <div className="flex flex-col gap-1 w-full">
        {/* Row 1: Chevron + Coin Icons + Symbol on Left, Expiry Time on Right */}
        {/* gap-2 is what stops the OTC badge touching the clock.

            justify-between only distributes space that is left over. With a long
            name like BANKBARODA there is none left, so the two groups met at zero
            separation and the badge sat flush against the duration — which reads
            as a collision, not a layout. A gap is a floor the name must shrink to
            respect, and the name is the flexible one here (min-w-0 + truncate),
            so it gives way rather than the spacing. */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center min-w-0">
            {renderCoinIcons(order.symbol, theme)}
            {/* gap-1, not gap-1.5.

                Long single-ticker OTC names (BANKBARODA, MCDOWELL-N) are the
                only ones that overflow this row, and they were losing three or
                four characters to the ellipsis — "BANKBARO..." names nothing.
                The half-step recovered here goes to the name, and the badge
                below no longer needs sub-pixel padding to fit beside it. */}
            <div className={`flex items-center gap-1 min-w-0 ${themeClasses.textClass}`}>
              {/* No ceiling: the name takes whatever the row has left after the
                  timer column, which is now a fixed width — see the timer below.
                  The old 96px cap was aimed at the same problem from the wrong
                  end. It truncated every long name at a constant point, but the
                  thing that actually moved was the timer: "47s" and "1m 14s" are
                  different widths, so the space the name was competing for
                  changed row by row, and the cap could not fix that. What it did
                  instead was cut names earlier than necessary while still letting
                  the OTC mark end up hard against the clock. */}
              {/* semibold, matching the stake on the line below.

                  The name and the timer were bold while the figures under them
                  are semibold, so the top line of every row carried more weight
                  than the numbers — and the numbers are what the row is for. Two
                  weights across four values also implied a hierarchy that is not
                  there: an instrument, its remaining time, its stake and its P/L
                  are four facts about one trade, not a heading and its details. */}
              <span className="font-semibold text-[12px] tracking-[0.012em] truncate">
                {order.symbol.toUpperCase().includes("OTC")
                  ? getAssetDisplayName(order.symbol)
                  : order.symbol.split('/')[0]}
              </span>
              {!order.symbol.toUpperCase().includes("OTC") && order.symbol.includes('/') && (
                <span className={`text-[10px] font-semibold ${themeClasses.secondaryTextClass}`}>
                  /{order.symbol.split('/')[1]}
                </span>
              )}
              {/* A chip, rather than three characters squeezed into a box.

                  This was 8px with 0.5px of vertical padding — below the size the
                  badge is legible at, and too tight for the border to read as a
                  deliberate outline rather than a rendering artefact. At 9px with
                  a full pixel of padding and real letter-spacing it sits level
                  with the asset name instead of clinging to it, and the border is
                  dropped in favour of a flat tint: one shape reads more cleanly at
                  this size than an outline around a fill. */}
              {order.symbol.toUpperCase().includes("OTC") && (
                <span className={OTC_BADGE_CLASS_ROW}>
                  OTC
                </span>
              )}
            </div>
          </div>

{/* No clock icon, and the timer takes the asset name's colour.

              The icon was labelling a value that is unmistakably a duration —
              "53s" needs no glyph to say it is time — and it cost width in the
              row that was already the tightest. Colour was doing the same kind
              of unasked-for work: the timer sat at muted-foreground while the
              instrument beside it was full-strength, so the row read as a name
              with a footnote rather than two facts of equal standing. */}
          <div className={`flex items-center justify-end gap-1 font-mono text-[12px] font-semibold shrink-0 min-w-[46px] ${themeClasses.textClass}`}>
            <span>{formattedDuration}</span>
          </div>
        </div>

        {/* Row 2: Direction indicator + Amount on Left, P/L on Right */}
        <div className="flex items-center justify-between w-full pl-3">
          <div className="flex items-center gap-1.5 min-w-0">
            {isBullishSide(order.side) ? (
              <ArrowUpCircle className={`w-3.5 h-3.5 shrink-0 ${themeClasses.riseColorClass}`} />
            ) : (
              <ArrowDownCircle className={`w-3.5 h-3.5 shrink-0 ${themeClasses.fallColorClass}`} />
            )}
            <span className={`font-semibold text-xs tabular-nums ${themeClasses.secondaryTextClass}`}>
              {(order.amount * preferredCurrencyRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] opacity-70">{preferredCurrencySymbol}</span>
            </span>
          </div>

          <span className={`text-xs font-bold tabular-nums shrink-0 ${plColorClass}`}>
            {formattedPL} <span className="text-[10px] font-sans font-normal opacity-85">{preferredCurrencySymbol}</span>
          </span>
        </div>
      </div>

      {/* Expanded Section */}
      {isSelected && (
        <div className={`mt-3 pt-3 ${themeClasses.borderClass} border-t animate-in fade-in slide-in-from-top-1 duration-200`}>
          {(() => {
            const isUp = isBullishSide(order.side);
            const sideLabel = String(order.side || (isUp ? "RISE" : "FALL"))
              .replace(/_/g, " ")
              .toUpperCase();
            const displaySide = sideLabel === "RISE" ? "CALL" : sideLabel === "FALL" ? "PUT" : sideLabel;

            const plValue = isDraw
              ? 0
              : isProfitable
              ? order.profit * preferredCurrencyRate
              : -order.amount * preferredCurrencyRate;

            const plSign = isDraw ? "" : isProfitable ? "+" : "-";

            /* The 400s were picked against a dark card and left to serve every
               theme. On white, emerald-400 text over a 15% emerald wash is two
               pale greens on top of each other — the CALL and ITM pills, the two
               words that say what the position was and how it ended, rendered at
               barely two to one. Light takes the 700s over the same wash. */
            const pill = (tone: "up" | "down" | "flat") => {
              if (tone === "flat") return isDark ? "bg-zinc-500/15 text-zinc-400" : "bg-zinc-500/15 text-zinc-700";
              if (tone === "up") return isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-500/15 text-emerald-700";
              return isDark ? "bg-red-500/15 text-red-400" : "bg-red-500/15 text-red-700";
            };

            const sideColor = pill(isUp ? "up" : "down");
            const plColor = pill(isDraw ? "flat" : isProfitable ? "up" : "down");

            const labelClass = `text-[11px] ${theme === "navy" ? "text-slate-400" : isDark ? "text-zinc-400" : "text-zinc-500"}`;
            /* Weight 300, not 600, and antialiased.
               These values are timestamps and prices — dense runs of digits read
               at a glance, where semibold thickens the strokes until adjacent
               figures start to merge. Light keeps the counters open, and
               antialiasing stops the thin stems fragmenting on a 1x display.
               tabular-nums stays: the columns still have to line up.

               Except on white. The separation between a label and its value is
               carried by lightness, and on a dark card that works twice over —
               zinc-400 against zinc-100 is a wide gap and the light stroke reads
               as bright. Invert the background and the same pairing collapses:
               zinc-500 and a 300-weight near-black both land as mid-grey, and
               the two columns stop being distinguishable at a glance. Light gets
               the full 400 weight against zinc-950, which restores the contrast
               without touching the themes where the thin stroke is doing its
               job. */
            const valueClass = `text-[11px] tabular-nums antialiased ${
              theme === "navy"
                ? "font-light text-slate-100"
                : isDark
                ? "font-light text-zinc-100"
                : "font-normal text-zinc-950"
            }`;

            const rows = [
              {
                label: "Open",
                value: formattedOpenTime,
              },
              {
                label: "Close",
                value: formattedCloseTime,
              },
              {
                label: tBinaryComponents("entry") || "Entry",
                value: formatBinaryPrice(order.entryPrice, order.symbol),
              },
              {
                label: "Close Price",
                value: order.closePrice ? formatBinaryPrice(order.closePrice, order.symbol) : "N/A",
              },
              {
                label: "Difference",
                value: diffFormatted,
                colorClass: diffColorClass,
              },
            ];

            return (
              <>
                {/* Direction + P/L pills */}
                <div className="flex items-stretch gap-2 mb-3">
                  <div className={`flex-1 flex items-center justify-center gap-1 h-[25px] rounded-md text-[11px] font-extrabold uppercase tracking-wide ${sideColor}`}>
                    {displaySide}
                  </div>
                  <div className={`flex-1 flex items-center justify-center h-[25px] rounded-md text-[11px] font-extrabold uppercase tracking-wide ${plColor}`}>
                    {order.status === "WIN" ? "ITM" : order.status === "DRAW" ? "REFUNDED" : "OTM"}
                  </div>
                </div>

                {/* Label / value rows */}
                <div className={`border rounded-lg overflow-hidden ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
                  {rows.map((row, idx) => (
                    <div
                      key={row.label}
                      /* nowrap on both sides. The timestamps render as
                         "08-02-2026, 15:12:57" — long enough that flex broke the row
                         onto two lines, splitting the label into "Open" / "Time" and
                         the value after the comma. The panel is 250px and the pair
                         needs about 190px set solid, so the room is there; it only
                         wrapped because nothing said not to. */
                      className={`flex items-center justify-between gap-2 px-2 py-[7px] ${
                        idx < rows.length - 1 ? `border-b ${isDark ? "border-zinc-800" : "border-zinc-200"}` : ""
                      }`}
                    >
                      <span className={`${labelClass} whitespace-nowrap`}>{row.label}</span>
                      <span className={`whitespace-nowrap ${row.colorClass ? `text-[11px] font-light tabular-nums antialiased ${row.colorClass}` : valueClass}`}>
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {/* Area Chart / Sparkline */}
          {renderSparkline()}
        </div>
      )}
    </div>
  );
}

/**
 * Memoised so the settled list survives the parent's render rate.
 *
 * ActivePositions re-renders on every ticker message — `tickersWs.subscribeToSpotData`
 * calls setTickerData(data) with a fresh object from the socket, several times a
 * second, and that subscription is always on regardless of tab or whether any
 * position is live. Unmemoised, each of those ticks re-rendered EVERY settled card.
 * With 1,594 settled orders that is tens of thousands of component renders per
 * second, which is why opening Settled made the chart, the panels and even the
 * cursor stutter while Live stayed smooth.
 *
 * A settled order is immutable — it has already expired and paid out — so the
 * shallow compare is exactly right here: nothing but selection can change a row.
 * The props it receives are all stable (themeClasses is useMemo'd, the translators
 * come from a useMemo'd shim, and onSelect is now a single useCallback rather than
 * a per-row arrow), so the shallow compare actually holds instead of silently
 * failing on a new object identity each render.
 */
const HistoryOrderCard = memo(HistoryOrderCardImpl);

interface ActivePositionsProps {
  orders: Order[];
  currentPrice?: number;
  onPositionsChange?: (positions: any[]) => void;
  className?: string;
  isMobile?: boolean;
  hasCompletedPositions?: boolean;
  theme?: "dark" | "light" | "navy";
  isEmbedded?: boolean;
  completedOrders?: CompletedOrder[];
}

export default function ActivePositions({
  orders,
  currentPrice: propCurrentPrice,
  onPositionsChange,
  className = "",
  isMobile = false,
  hasCompletedPositions = false,
  theme = "dark",
  isEmbedded = false,
  completedOrders = [],
}: ActivePositionsProps) {
  const storeCurrentPrice = useBinaryStore((state) => state.currentPrice);
  const storeCurrentSymbol = useBinaryStore((state) => state.currentSymbol);
  const currentPrice = propCurrentPrice ?? storeCurrentPrice;
  const currentSymbol = storeCurrentSymbol;
  const timezone = useSystemTimezone();

  const t = useTranslations("common");
  const tBinaryComponents = useTranslations("binary_components");
  
  // State management with proper initialization
  const [timeLeft, setTimeLeft] = useState<Record<string, string>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isListCollapsed, setIsListCollapsed] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [tickerData, setTickerData] = useState<Record<string, TickerData>>({});
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  const [historyVisible, setHistoryVisible] = useState(HISTORY_PAGE_SIZE);
  const historySentinelRef = useRef<HTMLDivElement | null>(null);

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

  const preferredCurrencyRate = EXCHANGE_RATES[preferredCurrency] || 1.0;
  const preferredCurrencySymbol = CURRENCY_SYMBOLS[preferredCurrency] || "$";

  // Load list collapse state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("binary_positions_list_collapsed");
    if (saved !== null) {
      setIsListCollapsed(saved === "true");
    }
  }, []);

  const toggleListCollapse = useCallback(() => {
    setIsListCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("binary_positions_list_collapsed", String(next));
      return next;
    });
  }, []);

  // Modal state for cancel and cash out
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);

  /* Early exit is a card anchored to the button that opens it, not a dialog.

     It has to be portalled for the same reason the trade confirmation is: this
     panel and its scroll container are overflow-hidden, so a card positioned
     against the button and opening leftwards over the chart is rendered and
     then clipped away to nothing. The anchor element is kept rather than a
     snapshot of its rect, because the list scrolls and the card has to follow
     the row it belongs to. */
  /* Which live positions are open, where the user has said so.

     Only overrides live here — the default is positional (the top one is open,
     the rest are shut), so a new trade arriving at the top opens itself without
     needing an entry, and a position the user collapsed stays collapsed even as
     others come and go above it. Storing the resolved state instead would mean
     writing an entry for every order on first render and deciding what a
     "default" means for one that has never been rendered. */
  const [liveOpenOverride, setLiveOpenOverride] = useState<Record<string, boolean>>({});
  const toggleLiveOpen = useCallback((orderId: string, currentlyOpen: boolean) => {
    setLiveOpenOverride((prev) => ({ ...prev, [orderId]: !currentlyOpen }));
  }, []);

  const [cashOutModalOrder, setCashOutModalOrder] = useState<Order | null>(null);
  const exitAnchorElRef = useRef<HTMLElement | null>(null);
  const [exitAnchor, setExitAnchor] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [exitError, setExitError] = useState<string | null>(null);
  /* Re-render while the card is open so the fee, the value and any "wait 9s"
     countdown stay live even in a gap between ticker messages. The counter's
     value is kept, not just its setter: the quote below is memoised, and a
     dependency it cannot observe does not recompute it — which is what left the
     figures frozen at whatever they were when the card opened. */
  const [exitTick, setExitTick] = useState(0);

  // Get store actions
  const cancelOrder = useBinaryStore((state) => state.cancelOrder);
  const closeOrderEarly = useBinaryStore((state) => state.closeOrderEarly);

  // Refs for cleanup and optimization
  const isMountedRef = useRef(true);
  const prevPriceRef = useRef<number>(0);
  const activeOrdersRef = useRef<Order[]>([]);
  const tickerUnsubscribeRef = useRef<(() => void) | null>(null);

  // Ref to track which seconds have been played for countdown sounds (per order)

  // Get audio settings from store

  // Synchronized time source for ticks
  const now = getChartSynchronizedTime().getTime();

  // Calculate filtered orders on every render tick and prioritize current symbol orders at top
  const filteredActiveOrders = useMemo(() => {
    const list = orders.filter((order) => {
      if (order.status === "PENDING") {
        return order.expiryTime > now;
      }
      return false;
    });
    return list.sort((a, b) => {
      const aIsCurrent = isSameSymbol(a.symbol, currentSymbol);
      const bIsCurrent = isSameSymbol(b.symbol, currentSymbol);
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      return 0;
    });
  }, [orders, now, currentSymbol]);

  // Keep a persistent ref to the stable array reference of active orders
  const stableActiveOrdersRef = useRef<Order[]>([]);

  // Update stable active orders reference only when length or order IDs/status change
  const activeOrders = useMemo(() => {
    const prev = stableActiveOrdersRef.current;
    const isSame =
      prev.length === filteredActiveOrders.length &&
      prev.every((o, i) => o.id === filteredActiveOrders[i].id && o.status === filteredActiveOrders[i].status);

    if (!isSame) {
      stableActiveOrdersRef.current = filteredActiveOrders;
    }
    return stableActiveOrdersRef.current;
  }, [filteredActiveOrders]);

  // Keep live section open when active orders are present or placed
  useEffect(() => {
    if (activeOrders.length > 0) {
      setActiveTab("active");
      setIsListCollapsed(false);
    }
  }, [activeOrders.length]);

  // Memoized position markers for chart
  const positions = useMemo(() => {
    return activeOrders.map((order) => ({
      id: order.id,
      entryTime: Math.floor(order.createdAt / 1000), // createdAt is already in ms
      entryPrice: order.entryPrice,
      expiryTime: Math.floor(order.expiryTime / 1000), // expiryTime is already in ms
      type: order.side,
      amount: order.amount,
    }));
  }, [activeOrders]);

  // Memoized theme classes to prevent recreation
  const themeClasses = useMemo(() => {
    const isDark = theme === "dark" || theme === "navy";
    return {
      bgClass: isDark ? "bg-background" : "bg-white",
      panelBgClass: isDark ? "bg-background" : "bg-transparent",
      textClass: isDark ? "text-foreground" : "text-black",
      secondaryTextClass: isDark ? "text-muted-foreground" : "text-zinc-600",
      borderClass: isDark ? "border-zinc-800" : "border-zinc-200",
      hoverBgClass: isDark ? "hover:bg-muted" : "hover:bg-zinc-100",
      riseColorClass: isDark ? "text-emerald-400" : "text-emerald-600",
      fallColorClass: isDark ? "text-rose-400" : "text-rose-600",
      profitColorClass: isDark ? "text-emerald-400" : "text-emerald-600",
      lossColorClass: isDark ? "text-rose-400" : "text-rose-600",
    };
  }, [theme]);

  // Optimized price getter with memoization
  const getCurrentPrice = useCallback((symbol: string): number => {
    // Prefer the live per-symbol feed (chart's own source)
    const wsPrice = livePrices[symbol];
    if (typeof wsPrice === "number" && wsPrice > 0) return wsPrice;

    // Try different symbol formats to find the price
    let price: number | undefined = tickerData[symbol]?.last;
    if (typeof price === "number" && price <= 0) price = undefined;

    if (typeof price !== "number") {
      // Try with / separator
      const symbolWithSlash = symbol.includes('/') 
        ? symbol 
        : symbol.replace(/([A-Z]+)([A-Z]{3,4})$/, '$1/$2');
      price = tickerData[symbolWithSlash]?.last;
      if (typeof price === "number" && price <= 0) price = undefined;

      // Additional fallback: try common format variations
      if (typeof price !== "number") {
        const baseCurrency = extractBaseCurrency(symbol);
        const quoteCurrency = extractQuoteCurrency(symbol);
        
        const variations = [
          `${baseCurrency}${quoteCurrency}`,
          `${baseCurrency}/${quoteCurrency}`,
          `${baseCurrency}-${quoteCurrency}`,
          `${baseCurrency}_${quoteCurrency}`,
          symbol.toUpperCase(),
          symbol.toLowerCase(),
        ];
        
        for (const variation of variations) {
          price = tickerData[variation]?.last;
          if (typeof price === "number" && price > 0) {
            break;
          }
          price = undefined;
        }
      }
    }

    if (typeof price === "number" && price > 0) return price;
    // Last resort: the chart store price is only valid for the open chart's symbol
    return isSameSymbol(symbol, currentSymbol) ? currentPrice : 0;
  }, [livePrices, tickerData, currentPrice, currentSymbol]);

  // Memoized profit/loss calculation - supports all order types
  const calculateProfitLoss = useCallback((order: Order, symbolPrice: number): number => {
    const profitPercentage = order.profitPercentage || 85;
    const potentialProfit = (order.amount * profitPercentage) / 100;
    const potentialLoss = -order.amount;

    let isWinning: boolean;

    switch (order.type) {
      case "RISE_FALL":
      case "CALL_PUT":
      case "HIGHER_LOWER":
      case "TURBO":
        if (order.strikePrice || order.barrier) {
          const targetLevel = order.strikePrice || order.barrier;
          isWinning = isBullishSide(order.side)
            ? symbolPrice > targetLevel!
            : symbolPrice < targetLevel!;
        } else {
          isWinning = isBullishSide(order.side)
            ? symbolPrice > order.entryPrice
            : symbolPrice < order.entryPrice;
        }
        break;
      case "TOUCH_NO_TOUCH":
        if (order.barrier) {
          const distance = Math.abs(symbolPrice - order.barrier);
          const distancePercent = (distance / order.barrier) * 100;
          const isTouching = distancePercent < 0.1;
          isWinning = order.side === "TOUCH" ? isTouching : !isTouching;
        } else {
          isWinning = false;
        }
        break;
      default:
        isWinning = isBullishSide(order.side)
          ? symbolPrice > order.entryPrice
          : symbolPrice < order.entryPrice;
        break;
    }

    return isWinning ? potentialProfit : potentialLoss;
  }, []);

  const totalActivePL = useMemo(() => {
    return activeOrders.reduce((sum, order) => {
      const symbolPrice = getCurrentPrice(order.symbol);
      return sum + calculateProfitLoss(order, symbolPrice);
    }, 0);
  }, [activeOrders, getCurrentPrice, calculateProfitLoss]);

  // Memoized time formatting
  const formatTimeLeft = useCallback((expiryTime: number): string => {
    const now = getChartSynchronizedTime().getTime();
    const timeLeft = Math.max(0, expiryTime - now);
    const totalSeconds = Math.ceil(timeLeft / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  // Component lifecycle management
  useEffect(() => {
    isMountedRef.current = true;
    
    // Initialize WebSocket connection
    tickersWs.initialize();

    return () => {
      isMountedRef.current = false;
      
      // Clean up all intervals and timeouts
      // Clean up ticker subscription
      if (tickerUnsubscribeRef.current) {
        tickerUnsubscribeRef.current();
        tickerUnsubscribeRef.current = null;
      }
    };
  }, []);

  // Update active orders ref when orders change
  useEffect(() => {
    activeOrdersRef.current = activeOrders;
  }, [activeOrders]);

  // Live per-symbol prices for active orders via marketDataWs (the same feed
  // the chart uses) — tickersWs doesn't reliably carry OTC symbols.
  const activeSymbolsKey = useMemo(
    () => Array.from(new Set(activeOrders.map((o) => o.symbol))).sort().join("|"),
    [activeOrders]
  );

  useEffect(() => {
    if (!activeSymbolsKey) {
      setLivePrices({});
      return;
    }
    const symbols = activeSymbolsKey.split("|").filter(Boolean);
    const unsubs = symbols.map((symbol) =>
      marketDataWs.subscribe<{ data?: number[][] }>(
        { symbol, type: "ohlcv", marketType: "spot", interval: "1m" },
        (msg) => {
          const arr = msg?.data;
          if (!Array.isArray(arr) || arr.length === 0) return;
          const price = Number(arr[arr.length - 1]?.[4]); // close
          if (!Number.isFinite(price) || price <= 0) return;
          setLivePrices((prev) => (prev[symbol] === price ? prev : { ...prev, [symbol]: price }));
        }
      )
    );
    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
    };
  }, [activeSymbolsKey]);

  // Optimized ticker data subscription with proper cleanup
  useEffect(() => {
    // Clean up previous subscription
    if (tickerUnsubscribeRef.current) {
      tickerUnsubscribeRef.current();
      tickerUnsubscribeRef.current = null;
    }

    // Subscribe to ticker data with optimized callback
    const unsubscribe = tickersWs.subscribeToSpotData((data) => {
      if (!isMountedRef.current) return;

      // Use requestAnimationFrame to defer ticker data updates
      requestAnimationFrame(() => {
        if (isMountedRef.current) {
          setTickerData(data);
        }
      });
    });

    tickerUnsubscribeRef.current = unsubscribe;

    return () => {
      if (tickerUnsubscribeRef.current) {
        tickerUnsubscribeRef.current();
        tickerUnsubscribeRef.current = null;
      }
    };
  }, []);

  /* The 100ms profit-history interval is gone.

     It kept a rolling hundred profit samples per open position and compared
     the last two, ten times a second, for one purpose: to decide whether the
     P/L figure should pulse. Nothing ever read the history for anything else.
     With the pulse removed that is ten state writes a second across the whole
     positions list, re-rendering every row, to compute a value no longer used.

     The figures themselves were never coming from here — each row reads the
     live price directly on render — so removing this changes nothing on
     screen except that the number no longer jumps. */

  // Optimized time left updates with countdown tick sounds
  useEffect(() => {
    if (activeOrders.length === 0) {
      setTimeLeft({});
      // Clean up played seconds tracker when no orders
      return;
    }

    const updateTimeLeft = () => {
      if (!isMountedRef.current) return;

      const now = getChartSynchronizedTime().getTime();
      const newTimeLeft: Record<string, string> = {};

      activeOrdersRef.current.forEach((order) => {
        // Only show time for orders that haven't expired
        if (order.expiryTime > now) {
          newTimeLeft[order.id] = formatTimeLeft(order.expiryTime);

          /* The countdown ticks are gone. The terminal now makes exactly two
             sounds — one when a trade opens, one when it settles — so the five
             beeps in the last five seconds of every open position, on every
             open position at once, are not a setting that is off by default any
             more; they are not a thing the app does. */
        } else {
          // Order has expired, show 00:00 briefly before it's removed
          newTimeLeft[order.id] = "00:00";
        }
      });

      setTimeLeft(newTimeLeft);
    };

    // Update immediately
    updateTimeLeft();

    // Set up interval for time updates
    const timeInterval = setInterval(updateTimeLeft, 250);

    return () => {
      clearInterval(timeInterval);
    };
  }, [activeOrders.length, formatTimeLeft]);

  // Memoized positions change handler
  const handlePositionsChange = useCallback(() => {
    if (onPositionsChange) {
      onPositionsChange(positions);
    }
  }, [positions, onPositionsChange]);

  // Update positions only when they actually change
  useEffect(() => {
    handlePositionsChange();
  }, [handlePositionsChange]);

  // Memoized handlers to prevent recreation
  const toggleCollapse = useCallback(() => {
    setIsCollapsed(!isCollapsed);
  }, [isCollapsed]);

  // Functional update so this callback is created once and never changes. As a
  // dependency on `selectedOrder` it was rebuilt on every selection, which handed
  // every memoised settled row a new prop and re-rendered the whole list.
  const selectOrder = useCallback((orderId: string) => {
    setSelectedOrder((prev) => (prev === orderId ? null : orderId));
  }, []);

  // ── Settled list: mount a screenful, extend on scroll ──────────────────────
  const visibleCompletedOrders = useMemo(
    () => completedOrders.slice(0, historyVisible),
    [completedOrders, historyVisible]
  );

  // Start over whenever the tab is re-opened, so leaving Settled after scrolling
  // deep into history doesn't re-mount thousands of rows on the way back in.
  useEffect(() => {
    setHistoryVisible(HISTORY_PAGE_SIZE);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "history") return;
    if (historyVisible >= completedOrders.length) return;
    const el = historySentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          // Extend rather than replace — rows already mounted keep their state
          // (an expanded row stays expanded, its sparkline stays fetched).
          setHistoryVisible((v) => Math.min(v + HISTORY_PAGE_SIZE, completedOrders.length));
        }
      },
      // Load the next page slightly before the sentinel is actually on screen so
      // scrolling doesn't visibly stall at the boundary.
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [activeTab, historyVisible, completedOrders.length]);

  // Modal handlers
  const handleOpenCancelModal = useCallback((order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelModalOrder(order);
  }, []);

  const handleOpenCashOutModal = useCallback((order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    exitAnchorElRef.current = e.currentTarget as HTMLElement;
    setExitError(null);
    setCashOutModalOrder(order);
  }, []);

  const closeExitCard = useCallback(() => {
    setCashOutModalOrder(null);
    setExitError(null);
    exitAnchorElRef.current = null;
  }, []);

  /* Placement, mirroring the trade confirmation: leftwards over the chart at a
     fixed width on desktop, where there is a chart to open over; directly above
     the button at its own width on mobile, where there is not. Recomputed on
     scroll (capture, because the list scrolls, not the window) and on resize,
     since a fixed element does not follow its anchor by itself. */
  useLayoutEffect(() => {
    if (!cashOutModalOrder) {
      setExitAnchor(null);
      return;
    }
    const CARD = 268;
    const GAP = 8;
    const place = () => {
      const el = exitAnchorElRef.current;

      /* The button can go away underneath the card — the position settles, the
         row unmounts, and this ref is left holding a node with no place in the
         document. A detached node still answers getBoundingClientRect, with
         zeroes, so the card did not vanish: it jumped to the top-left corner
         and sat there over the whole screen. Close instead. */
      if (!el || !el.isConnected) {
        closeExitCard();
        return;
      }

      const r = el.getBoundingClientRect();

      /* Fixed position means the card does not scroll with the list, so it has
         to be told when its row has scrolled away. Without this it stayed put
         while the row slid out from under it, ending up floating over the chart
         attached to nothing — which is what "it scrolls out of the box" was.
         The panel is the reference, not the viewport: the row leaves the panel
         long before it leaves the screen. */
      const panel = el.closest("[data-positions-panel]") as HTMLElement | null;
      const bounds = panel?.getBoundingClientRect();
      if (bounds && (r.bottom < bounds.top + 4 || r.top > bounds.bottom - 4)) {
        closeExitCard();
        return;
      }

      if (isMobile) {
        setExitAnchor({ left: r.left, top: r.top - GAP, width: r.width });
      } else {
        // Clamped to the viewport, so a row near either edge cannot push the
        // card off-screen or under the top of the window.
        const top = Math.min(window.innerHeight - GAP, Math.max(140, r.bottom));
        setExitAnchor({
          left: Math.max(GAP, Math.min(r.left - CARD - GAP, window.innerWidth - CARD - GAP)),
          top,
          width: CARD,
        });
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [cashOutModalOrder, isMobile, closeExitCard]);

  /* Close when the position is no longer open.

     The card held its own copy of the order, so it outlived the thing it was
     about: the trade expired, the row left the list, the panel said "No Active
     Positions" — and the card was still offering to exit it, with a live
     countdown and an Exit button that could only have failed. A confirmation
     for something that has already happened is worse than no confirmation. */
  useEffect(() => {
    if (!cashOutModalOrder) return;
    if (!activeOrders.some((o) => o.id === cashOutModalOrder.id)) closeExitCard();
  }, [activeOrders, cashOutModalOrder, closeExitCard]);

  useEffect(() => {
    if (!cashOutModalOrder) return;
    const id = setInterval(() => setExitTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [cashOutModalOrder]);

  /* What the card shows. Deliberately the same policy the server settles on —
     a fee on winnings that decays as expiry approaches — so the figure quoted
     is the figure paid. The price comes from this position's own symbol, not
     the chart's: the dialog this replaced read the chart price, so a position on
     any other instrument was valued against the wrong market, and against 0
     whenever the chart had not priced it. Against 0 every FALL looks like a
     winner, which is why a position could be declared "In Profit" while the
     price beside it read 0.00 (-100.00%). */
  const exitQuote = useMemo(() => {
    const order = cashOutModalOrder;
    if (!order) return null;

    const price = getCurrentPrice(order.symbol);
    const now = getChartSynchronizedTime().getTime();
    const heldMs = now - order.createdAt;
    const untilExpiryMs = order.expiryTime - now;

    const bullish = ["RISE", "HIGHER", "TOUCH", "CALL", "UP"].includes(
      String(order.side)
    );
    const isWinning = price > 0 && (bullish ? price > order.entryPrice : price < order.entryPrice);

    const grossProfit = (order.amount * (order.profitPercentage || 87)) / 100;
    const progress = Math.min(
      1,
      heldMs / Math.max(1, order.expiryTime - order.createdAt)
    );
    const fee = isWinning ? (grossProfit * (10 * (1 - progress))) / 100 : 0;
    const netProfit = isWinning ? grossProfit - fee : -order.amount;
    const exitValue = isWinning ? order.amount + netProfit : 0;

    let blockedReason: string | null = null;
    if (!(price > 0)) {
      blockedReason = "Waiting for a live price for this market";
    } else if (heldMs < 30000) {
      blockedReason = `Wait ${Math.ceil((30000 - heldMs) / 1000)}s before exiting`;
    } else if (untilExpiryMs < 10000) {
      blockedReason = "Too close to expiry to exit";
    }

    return {
      exitValue: exitValue * preferredCurrencyRate,
      netChange: (exitValue - order.amount) * preferredCurrencyRate,
      fee: fee * preferredCurrencyRate,
      invested: order.amount * preferredCurrencyRate,
      isWinning,
      blockedReason,
    };
    // exitTick is a deliberate dependency: it is what makes the fee and the
    // countdown move in the seconds between ticker messages.
  }, [cashOutModalOrder, getCurrentPrice, preferredCurrencyRate, tickerData, livePrices, exitTick]);

  const handleConfirmExit = useCallback(async () => {
    if (!cashOutModalOrder) return;
    const result = await closeOrderEarly(cashOutModalOrder.id);
    if (result.success) {
      closeExitCard();
    } else {
      // Kept open, showing why. The dialog collapsed every cause into "Cash Out
      // Failed", which told a trader nothing about whether to try again.
      setExitError(result.error || "Could not close this position");
    }
  }, [cashOutModalOrder, closeOrderEarly, closeExitCard]);

  const handleCancelOrder = useCallback(async (orderId: string) => {
    const result = await cancelOrder(orderId);
    return result.success;
  }, [cancelOrder]);

  // Check if an order can be cancelled (> 10 seconds to expiry)
  const canCancelOrder = useCallback((order: Order) => {
    const timeUntilExpiry = order.expiryTime - getChartSynchronizedTime().getTime();
    return timeUntilExpiry > 10000;
  }, []);

  // Check if an order can be cashed out (> 30s from entry, > 10s to expiry)
  const canCashOutOrder = useCallback((order: Order) => {
    const timeFromEntry = getChartSynchronizedTime().getTime() - order.createdAt;
    const timeUntilExpiry = order.expiryTime - getChartSynchronizedTime().getTime();
    return timeFromEntry >= 30000 && timeUntilExpiry >= 10000;
  }, []);

  // Render empty state if no active orders (only for standalone mode)
  if (!isEmbedded && activeOrders.length === 0) {
    return (
      <div className={`${className} ${themeClasses.panelBgClass} flex items-center justify-center`}>
        <div className={`text-center ${themeClasses.secondaryTextClass}`}>
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">{t("no_active_positions")}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-tutorial="active-positions"
      className={`${className} ${isEmbedded ? "bg-transparent" : themeClasses.panelBgClass} flex flex-col transition-all duration-200 ${
        isEmbedded
          ? "w-full flex-1 min-h-0"
          : `${themeClasses.borderClass} border-r ${isCollapsed ? 'w-16' : 'w-80'}`
      }`}
    >
      {/* Header */}
      {!isEmbedded && (
        <div className={`${isCollapsed ? 'p-2' : 'p-4'} ${themeClasses.borderClass} border-b flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} transition-all duration-200`}>
          {!isCollapsed && (
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4" />
              <h3 className={`font-medium ${themeClasses.textClass}`}>
                {`${t("active_positions")} •`} ({activeOrders.length})
              </h3>
            </div>
          )}
          {isCollapsed && (
            <div className="flex flex-col items-center space-y-1">
              <BarChart3 className="w-4 h-4" />
              <span className={`text-xs ${themeClasses.secondaryTextClass}`}>
                {activeOrders.length}
              </span>
            </div>
          )}
          <button
            onClick={toggleCollapse}
            className={`${isCollapsed ? 'absolute top-2 right-2' : ''} p-1 rounded ${themeClasses.hoverBgClass} transition-all duration-200`}
          >
            <ChevronLeft 
              className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} 
            />
          </button>
        </div>
      )}      {isEmbedded && (
        <div className="px-1.5 py-1.5 border-b border-zinc-200/70 dark:border-zinc-800/50 bg-zinc-950/5 dark:bg-zinc-900/20 flex items-center justify-between gap-1 select-none">
          {/* The borders here were zinc-200/40 and zinc-800/60 — a quarter-opacity
              line on light, a near-black line on near-black. Neither drew an
              edge, so the control had no outline and the pill appeared to float
              on the panel rather than travel inside a track. Both are opaque
              now, and the track is darker than the panel so the raised pill has
              something to be raised against. */}
          {/* Quiet, on purpose.

              The correction for "the borders are invisible" overshot into the
              opposite fault: a lifted pill with its own border and a drop shadow
              on a track with a border and an inset shadow. Five devices marking
              a choice between two words, on a panel whose whole character is
              dark and flat — so the control read as punched out of it rather
              than part of it.

              A shadow is what makes something look raised, so the shadows go and
              the pill is left to a fill a couple of steps above its track. That
              is enough to say which side is selected, and on a surface this dark
              it is all that is wanted. */}
          <div className="relative flex items-center bg-zinc-100 dark:bg-black/20 p-1 rounded-lg border border-zinc-300 dark:border-[#1d1e23] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none flex-1 h-[30px] overflow-hidden">
            {/* Sliding Pill Background Indicator */}
            <div
              className={`absolute top-[3px] bottom-[3px] w-[calc(50%-4px)] rounded-[6px] ${
                theme === "dark" || theme === "navy"
                  ? "bg-[#212227] border border-[#292a31]"
                  : "bg-white border border-zinc-300 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              }`}
              style={{
                transform: activeTab === "active" ? "translateX(0)" : "translateX(100%)",
                left: "4px",
                transition: "transform 255ms cubic-bezier(0.2, 0.8, 0.2, 1)"
              }}
            />

            {/* antialiased, and a hair more size and spacing.

              These two words were 11px bold with no letter-spacing, rendered
              light-on-dark, which is where subpixel hinting is least kind: the
              stems thicken and the counters close up, so the labels read as
              smudged rather than small. Antialiasing is what the settled rows'
              figures already use for the same reason. The extra half-pixel and
              the touch of tracking open them the rest of the way. */}
            <button
              onClick={() => {
                setActiveTab("active");
                setIsListCollapsed(false);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-center text-[11.5px] font-bold tracking-[0.015em] antialiased py-1 px-3 z-10 transition-colors duration-200 cursor-pointer ${
                activeTab === "active" && !isListCollapsed
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="leading-none">Live ({activeOrders.length})</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                setIsListCollapsed(false);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 text-center text-[11.5px] font-bold tracking-[0.015em] antialiased py-1 px-3 z-10 transition-colors duration-200 cursor-pointer ${
                activeTab === "history" && !isListCollapsed
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-current shrink-0" />
              <span className="leading-none">Settled</span>
            </button>
          </div>
          <button
            onClick={toggleListCollapse}
            className="p-1 rounded hover:bg-zinc-200/60 dark:hover:bg-muted/40 transition-colors cursor-pointer shrink-0 border border-transparent hover:border-zinc-200/20"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${
                isListCollapsed ? "-rotate-90" : ""
              }`}
            />
          </button>
        </div>
      )}

      {/* Content.
          data-positions-panel marks the scroll box for the portalled exit card:
          that card is fixed-position and lives outside this subtree, so it has
          no other way to tell that its row has been scrolled out of view. */}
      {(!isCollapsed || isEmbedded) && (!isEmbedded || !isListCollapsed) && (
        <div data-positions-panel className={isEmbedded ? "flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800/60 dark:scrollbar-thumb-zinc-800/60 scrollbar-track-transparent" : "flex-1 overflow-y-auto"}>

          <div className="p-2 space-y-1">
            {activeTab === "active" ? (
              activeOrders.length === 0 ? (
                <div className={`text-center py-4 ${themeClasses.secondaryTextClass}`}>
                  <p className="text-[10px]">{t("no_active_positions")}</p>
                </div>
              ) : (
                activeOrders.map((order, orderIndex) => {
                  const symbolPrice = getCurrentPrice(order.symbol);
                  const profitLoss = calculateProfitLoss(order, symbolPrice);
                  const isProfitable = profitLoss > 0;
                  const timeLeftForOrder = timeLeft[order.id] || "00:00";
                  /* The top position is open; the rest are shut until asked for.

                     Every live position used to render fully expanded, so four
                     trades filled the panel with four detail tables and the one
                     the trader had just opened — the reason they were looking —
                     was pushed off the bottom. The newest is at the top and is
                     the one open by default; the others keep their header row,
                     which already carries the instrument, the timer and the P/L,
                     and open on a click. */
                  const isSelected = liveOpenOverride[order.id] ?? orderIndex === 0;

                  const priceDiff = symbolPrice - order.entryPrice;
                  const priceDiffPercent = order.entryPrice > 0 ? (priceDiff / order.entryPrice) * 100 : 0;
                  const diffSign = priceDiff > 0 ? "+" : priceDiff < 0 ? "-" : "";

                  const diffColorClass = priceDiff > 0
                    ? themeClasses.profitColorClass
                    : priceDiff < 0
                    ? themeClasses.lossColorClass
                    : themeClasses.secondaryTextClass;

                  // Difference in integer points counted from 0 — one point per
                  // smallest quoted unit (e.g. 0.01 for stocks, 0.00001 for forex).
                  const diffPoints = Math.round(
                    priceDiff * Math.pow(10, isForexSymbol(order.symbol) ? 5 : 2)
                  );
                  const diffFormatted = `${diffSign}${Math.abs(diffPoints).toLocaleString()}`;

                  const isDark = theme === "dark" || theme === "navy";
                  const cardClass = theme === "navy"
                    ? "bg-[#0e1626] border-[#223966] shadow-md shadow-black/25 cursor-default select-none"
                    : theme === "dark"
                      ? "bg-[#161619] border-[#26282f] shadow-md shadow-black/15 cursor-default select-none"
                      : "bg-white border-zinc-300 shadow-md shadow-zinc-200/30 cursor-default select-none";

                  const cashOutBtnClass = canCashOutOrder(order)
                    ? isProfitable
                      ? isDark
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                        : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                      : isDark
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                      : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"
                    : isDark
                      ? "bg-card/40 text-muted-foreground/40 border-border/40 cursor-not-allowed opacity-40"
                      : "bg-zinc-50 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-50";

                  return (
                    <div
                      key={order.id}
                      className={`
                        px-3 py-2 rounded-lg border transition-all duration-200
                        ${cardClass}
                      `}
                    >
                      {/* The header row is the control that opens the position.
                          The whole row, not a separate button: it is the part
                          already being read, and a row that reveals more when
                          tapped is the behaviour the panel needs to teach only
                          once. The chevron is there so it teaches it. */}
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={isSelected}
                        onClick={() => toggleLiveOpen(order.id, isSelected)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleLiveOpen(order.id, isSelected);
                          }
                        }}
                        className="flex flex-col gap-1 w-full cursor-pointer"
                      >
                        {/* Row 1: Chevron + Coin Icons + Symbol on Left, Timer on Right */}
                        <div className="flex items-center justify-between gap-3 w-full">
                          <div className="flex items-center min-w-0">
                            {renderCoinIcons(order.symbol, theme)}
                            <div className={`flex items-center gap-1 min-w-0 ${themeClasses.textClass}`}>
                              {/* Uncapped — the timer column is the fixed thing now,
                                  so the space left for the name is identical on
                                  every row and the name can simply use it. See the
                                  settled row for why the cap was the wrong lever. */}
                              <span className="font-semibold text-[12px] tracking-[0.012em] truncate">
                                {order.symbol.toUpperCase().includes("OTC")
                                  ? getAssetDisplayName(order.symbol)
                                  : order.symbol.split('/')[0]}
                              </span>
                              {!order.symbol.toUpperCase().includes("OTC") && order.symbol.includes('/') && (
                                <span className={`text-[10px] font-semibold ${themeClasses.secondaryTextClass}`}>
                                  /{order.symbol.split('/')[1]}
                                </span>
                              )}
                              {order.symbol.toUpperCase().includes("OTC") && (
                                <span className={OTC_BADGE_CLASS_ROW}>
                                  OTC
                                </span>
                              )}
                            </div>
                          </div>

                          <div className={`flex items-center justify-end gap-1 shrink-0 min-w-[46px] font-mono text-[12px] font-semibold ${themeClasses.textClass}`}>
                            <span>{timeLeftForOrder}</span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 text-muted-foreground/70 transition-transform duration-200 ${
                                isSelected ? "rotate-180" : ""
                              }`}
                            />
                          </div>
                        </div>

                        {/* Row 2, but only while the position is shut.

                            Collapsed, it is the whole summary — direction, stake
                            and live P/L, the same shape the settled rows use, so
                            a closed live trade reads like a finished one and the
                            panel stays legible with several running.

                            Open, every figure on it appears again a few pixels
                            below: the direction becomes the CALL/PUT chip, the
                            P/L the chip beside it, and the stake the Amount row
                            of the table. Four values, each printed twice within
                            one card, which is what made the expanded state look
                            padded rather than detailed. The expanded section says
                            all of it better, so this row stands down. */}
                        {!isSelected && (
                        <div className="flex items-center justify-between w-full pl-3">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isBullishSide(order.side) ? (
                              <ArrowUpCircle className={`w-3.5 h-3.5 shrink-0 ${themeClasses.riseColorClass}`} />
                            ) : (
                              <ArrowDownCircle className={`w-3.5 h-3.5 shrink-0 ${themeClasses.fallColorClass}`} />
                            )}
                            <span className={`font-semibold text-xs tabular-nums ${themeClasses.secondaryTextClass}`}>
                              {(order.amount * preferredCurrencyRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] opacity-70">{preferredCurrencySymbol}</span>
                            </span>
                          </div>

                          <span
                            className={`text-xs font-bold tabular-nums shrink-0 transition-colors duration-200 ${
                              profitLoss > 0
                                ? themeClasses.profitColorClass
                                : profitLoss < 0
                                  ? themeClasses.lossColorClass
                                  : themeClasses.secondaryTextClass
                            }`}
                          >
                            {profitLoss > 0 ? "+" : profitLoss < 0 ? "-" : ""}
                            {Math.abs(profitLoss * preferredCurrencyRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] font-sans font-normal opacity-85">{preferredCurrencySymbol}</span>
                          </span>
                        </div>
                        )}

                      </div>

                      {/* Expanded Section (Maximized) — chart-tooltip style */}
                      {isSelected && (() => {
                        const isUp = isBullishSide(order.side);
                        const sideLabel = String(order.side || (isUp ? "RISE" : "FALL"))
                          .replace(/_/g, " ")
                          .toUpperCase();
                        const displaySide = sideLabel === "RISE" ? "CALL" : sideLabel === "FALL" ? "PUT" : sideLabel;
                        const plValue = profitLoss * preferredCurrencyRate;
                        const plSign = plValue > 0 ? "+" : plValue < 0 ? "-" : "";
                        const sideColor = isUp ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400";
                        const plColor = plValue >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400";
                        const labelClass = `text-[11px] ${theme === "navy" ? "text-slate-400" : isDark ? "text-zinc-400" : "text-zinc-500"}`;
                        /* Weight 300, not 600, and antialiased.
               These values are timestamps and prices — dense runs of digits read
               at a glance, where semibold thickens the strokes until adjacent
               figures start to merge. Light keeps the counters open, and
               antialiasing stops the thin stems fragmenting on a 1x display.
               tabular-nums stays: the columns still have to line up. */
            const valueClass = `text-[11px] font-light tabular-nums antialiased ${theme === "navy" ? "text-slate-100" : isDark ? "text-zinc-100" : "text-zinc-900"}`;

                        const rows = [
                          { label: t("amount"), value: `${preferredCurrencySymbol}${(order.amount * preferredCurrencyRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                          { label: tBinaryComponents("entry"), value: formatBinaryPrice(order.entryPrice, order.symbol) },
                          { label: t("current"), value: formatBinaryPrice(symbolPrice, order.symbol), live: true },
                          { label: "Difference", value: diffFormatted, colorClass: diffColorClass },
                        ];

                        return (
                          <div className={`mt-3 pt-3 ${themeClasses.borderClass} border-t animate-in fade-in slide-in-from-top-1 duration-200`}>
                            {/* Direction + P/L pills */}
                            <div className="flex items-stretch gap-2 mb-3">
                              <div className={`flex-1 flex items-center justify-center gap-1 h-[25px] rounded-md text-[11px] font-extrabold uppercase tracking-wide ${sideColor}`}>
                                {displaySide}
                              </div>
                              <div className={`flex-1 flex items-center justify-center h-[25px] rounded-md text-[11px] font-extrabold tabular-nums ${plColor}`}>
                                {plSign}{preferredCurrencySymbol}{Math.abs(plValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>

                            {/* Label / value rows */}
                            <div className={`border rounded-lg overflow-hidden ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
                              {rows.map((row, idx) => (
                                <div
                                  key={row.label}
                                  className={`flex items-center justify-between px-3 py-[7px] ${idx < rows.length - 1 ? `border-b ${isDark ? "border-zinc-800" : "border-zinc-200"}` : ""}`}
                                >
                                  <span className={labelClass}>{row.label}</span>
                                  <span className={(row as any).highlight ? "text-[11px] font-semibold tabular-nums text-red-400" : row.colorClass ? `text-[11px] font-semibold tabular-nums ${row.colorClass}` : valueClass}>{row.value}</span>
                                </div>
                              ))}
                            </div>

                            {/* Exit Position */}
                            <div className="mt-3 flex gap-2">
                              <button
                                onClick={(e) => handleOpenCashOutModal(order, e)}
                                disabled={!canCashOutOrder(order)}
                                className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-bold transition-all border ${cashOutBtnClass}`}
                              >
                                <span className="font-sans text-xs font-bold mr-0.5">{preferredCurrencySymbol}</span>
                                Exit Position
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )
            ) : (
              // History tab
              completedOrders.length === 0 ? (
                <div className={`text-center py-4 ${themeClasses.secondaryTextClass}`}>
                  <p className="text-[10px]">No completed trades</p>
                </div>
              ) : (
                <>
                  {(() => {
                    let lastDateKey = "";
                    const isDark = theme === "dark" || theme === "navy";
                    return visibleCompletedOrders.map((order) => {
                      const orderDate = new Date(order.expiryTime);
                      const dateKey = getDateGroupKey(orderDate, timezone);
                      const showSeparator = dateKey !== lastDateKey;
                      lastDateKey = dateKey;

                      return (
                        <div key={order.id} className="flex flex-col gap-1">
                          {showSeparator && (
                            <div className="flex items-center justify-center py-1 px-1 mt-1.5 first:mt-0 select-none">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-1 h-1 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-400"}`} />
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                                  {dateKey}
                                </span>
                                <div className={`w-1 h-1 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-400"}`} />
                              </div>
                            </div>
                          )}
                          <HistoryOrderCard
                            order={order}
                            isSelected={selectedOrder === order.id}
                            onSelect={selectOrder}
                            themeClasses={themeClasses}
                            theme={theme}
                            t={t}
                            tBinaryComponents={tBinaryComponents}
                            preferredCurrency={preferredCurrency}
                            preferredCurrencyRate={preferredCurrencyRate}
                            preferredCurrencySymbol={preferredCurrencySymbol}
                          />
                        </div>
                      );
                    });
                  })()}
                  {historyVisible < completedOrders.length && (
                    <div
                      ref={historySentinelRef}
                      className={`text-center py-3 text-[10px] ${themeClasses.secondaryTextClass}`}
                    >
                      Loading more — {visibleCompletedOrders.length} of{" "}
                      {completedOrders.length.toLocaleString()}
                    </div>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      <CancelOrderModal
        order={cancelModalOrder}
        isOpen={cancelModalOrder !== null}
        onClose={() => setCancelModalOrder(null)}
        onConfirm={handleCancelOrder}
      />

      {/* Early exit, portalled past this panel's overflow-hidden ancestors and
          positioned from the button's own rect, so it reads as attached to the
          control while living outside the box that would clip it. No overlay
          and no dimming: the chart stays live beside it. */}
      {cashOutModalOrder &&
        exitAnchor &&
        exitQuote &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: exitAnchor.left,
              top: exitAnchor.top,
              width: exitAnchor.width,
              transform: "translateY(-100%)",
              zIndex: 9998,
            }}
          >
            <InlineExitConfirm
              exitValue={exitQuote.exitValue}
              netChange={exitQuote.netChange}
              fee={exitQuote.fee}
              invested={exitQuote.invested}
              currencySymbol={preferredCurrencySymbol}
              isWinning={exitQuote.isWinning}
              blockedReason={exitQuote.blockedReason}
              error={exitError}
              onConfirm={handleConfirmExit}
              onCancel={closeExitCard}
              theme={theme}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

export { ActivePositions };
