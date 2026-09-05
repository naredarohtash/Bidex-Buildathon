"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  ChevronUp,
  Clock,
  DollarSign,
  BarChart2,
  Filter,
  Download,
} from "lucide-react";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import type { CompletedOrder } from "@/store/trade/use-binary-store";
import { useTranslations } from "next-intl";
import { useSystemTimezone, formatTimeInTimezone, formatDateInTimezone } from "@/utils/time-sync";
import { useVariableVirtualList } from "@/hooks/use-virtual-list";
import type { OrderSide } from "@/types/binary-trading";
import { formatBinaryPrice } from "@/lib/precision-utils";
import { getAssetDisplayName } from "@/utils/image-fallback";
import { EXCHANGE_RATES, CURRENCY_SYMBOLS } from "../header/header";

// Helper function to determine if an order side is bullish (upward direction)
function isBullishSide(side: OrderSide | string): boolean {
  return side === "RISE" || side === "HIGHER" || side === "TOUCH" || side === "CALL" || side === "UP";
}

function formatTradeDuration(entryTime: Date | number | string, expiryTime: Date | number | string): string {
  const entryMs = new Date(entryTime).getTime();
  const expiryMs = new Date(expiryTime).getTime();
  if (isNaN(entryMs) || isNaN(expiryMs) || expiryMs <= entryMs) return "1m";

  const diffSec = Math.round((expiryMs - entryMs) / 1000);
  if (diffSec < 60) return `${diffSec}s`;

  const minutes = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (minutes < 60) {
    if (secs === 0) return `${minutes}m`;
    return `${minutes}m ${secs}s`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

// ---------------------------------------------------------------------------
// Date-grouping helpers
// ---------------------------------------------------------------------------

/** Returns a human-readable date group key for a given Date object. */
function getDateGroupKey(date: Date): string {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  if (date.toDateString() === todayStr) return `Today, ${dateStr}`;
  if (date.toDateString() === yesterdayStr) return `Yesterday, ${dateStr}`;

  // Exact date formatted as "Mon, Aug 1" (short weekday + month + day)
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Virtual list item union type
// ---------------------------------------------------------------------------

type DateSeparatorItem = {
  type: "separator";
  id: string;
  dateKey: string;
  totalCount: number;
  wins: number;
  losses: number;
  pnl: number;
};

type OrderRowItem = {
  type: "row";
  id: string;
  order: CompletedOrder;
};

type FlatItem = DateSeparatorItem | OrderRowItem;

const DATE_SEPARATOR_HEIGHT = 28; // px — compact header band height
const DESKTOP_ROW_HEIGHT = 44;   // px — existing row height
const MOBILE_ROW_HEIGHT = 120;   // px — existing mobile row height

// ---------------------------------------------------------------------------
// Flatten sorted orders into a mixed array of separators + rows
// ---------------------------------------------------------------------------

function buildFlatItems(orders: CompletedOrder[], preferredCurrencyRate: number): FlatItem[] {
  if (orders.length === 0) return [];

  const groups: Map<string, { orders: CompletedOrder[]; dateKey: string }> = new Map();
  const groupOrder: string[] = [];

  for (const order of orders) {
    const key = getDateGroupKey(order.expiryTime);
    if (!groups.has(key)) {
      groups.set(key, { orders: [], dateKey: key });
      groupOrder.push(key);
    }
    groups.get(key)!.orders.push(order);
  }

  const flat: FlatItem[] = [];

  for (const key of groupOrder) {
    const group = groups.get(key)!;
    let wins = 0, losses = 0, pnl = 0;
    for (const o of group.orders) {
      if (o.status === "WIN") {
        wins++;
        pnl += (o.profit || 0);
      } else if (o.status === "LOSS") {
        losses++;
        pnl -= o.amount;
      }
    }

    flat.push({
      type: "separator",
      id: `sep-${key}`,
      dateKey: key,
      totalCount: group.orders.length,
      wins,
      losses,
      pnl,
    });

    for (const order of group.orders) {
      flat.push({ type: "row", id: order.id, order });
    }
  }

  return flat;
}

// ---------------------------------------------------------------------------
// Memoized order row component (unchanged from original)
// ---------------------------------------------------------------------------

const OrderRow = memo(function OrderRow({
  order,
  isHovered,
  onMouseEnter,
  onMouseLeave,
  formatTime,
  formatDate,
  getCurrency,
  theme,
  borderLightClass,
  tableValueClass,
  tertiaryTextClass,
  winBadgeClass,
  lossBadgeClass,
  preferredCurrencySymbol,
}: {
  order: CompletedOrder;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  formatTime: (date: Date) => string;
  formatDate: (date: Date) => string;
  getCurrency: (symbol: string) => string;
  theme: "dark" | "light" | "navy";
  borderLightClass: string;
  tableValueClass: string;
  tertiaryTextClass: string;
  winBadgeClass: string;
  lossBadgeClass: string;
  preferredCurrencySymbol: string;
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`grid grid-cols-7 gap-2 px-3 py-2 text-xs border-b h-full items-center ${borderLightClass} transition-colors duration-200 ${isHovered ? ((theme === "dark" || theme === "navy") ? "bg-muted" : "bg-zinc-50") : ""}`}
    >
      <div className={`text-[10px] ${tertiaryTextClass}`}>
        {formatTradeDuration(order.entryTime, order.expiryTime)}
        <div className="text-[10px] opacity-70">
          {formatDate(order.expiryTime)}
        </div>
      </div>
      <div className={`font-medium text-xs ${tableValueClass} flex items-center gap-1.5`}>
        <span>{order.symbol.toUpperCase().includes("OTC") ? getAssetDisplayName(order.symbol) : order.symbol.replace("USDT", "").replace("/", "")}</span>
        {order.symbol.toUpperCase().includes("OTC") && (
          <span className="text-[8px] font-bold leading-none tracking-wide px-[3px] py-[0.5px] rounded-[3px] shrink-0 border inline-block text-zinc-600 bg-zinc-200/80 border-zinc-300 dark:text-zinc-200 dark:bg-zinc-700 dark:border-zinc-600 [.navy_&]:text-sky-200 [.navy_&]:bg-sky-900/70 [.navy_&]:border-sky-700/60">
            OTC
          </span>
        )}
      </div>
      <div
        className={`text-xs font-medium ${
          isBullishSide(order.side) ? "text-[#22c55e]" : "text-[#ef4444]"
        }`}
      >
        {isBullishSide(order.side) ? "↑" : "↓"}
      </div>
      <div className={`text-xs ${tableValueClass}`}>
        {formatBinaryPrice(order.entryPrice, order.symbol)} {order.symbol.split("/")[1] || "USDT"}
      </div>
      <div className={`text-xs ${tableValueClass}`}>
        {preferredCurrencySymbol}{order.amount.toFixed(2)}
      </div>
      <div
        className={`font-semibold text-xs ${
          order.status === "WIN" ? "text-[#22c55e]" : order.status === "LOSS" ? "text-[#ef4444]" : tertiaryTextClass
        }`}
      >
        {order.status === "WIN" ? "+" : order.status === "LOSS" ? "-" : ""}{preferredCurrencySymbol}{Math.abs(order.profit || (order.status === "LOSS" ? order.amount : 0)).toFixed(2)}
      </div>
      <div>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            order.status === "WIN" ? winBadgeClass : order.status === "LOSS" ? lossBadgeClass : "bg-zinc-800 text-zinc-300 border border-zinc-700"
          }`}
        >
          {order.status === "WIN" ? "W" : order.status === "LOSS" ? "L" : "D"}
        </span>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Date separator header row (desktop)
// ---------------------------------------------------------------------------

const DateSeparatorRow = memo(function DateSeparatorRow({
  item,
  isDark,
  borderLightClass,
  tableValueClass,
}: {
  item: DateSeparatorItem;
  isDark: boolean;
  borderLightClass: string;
  tableValueClass: string;
}) {
  return (
    <div
      className={`px-3 h-full flex items-center justify-center text-[10px] border-b ${borderLightClass} ${isDark ? "bg-zinc-900/80" : "bg-zinc-50/80"}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`w-1 h-1 rounded-full shrink-0 ${isDark ? "bg-zinc-500" : "bg-zinc-400"}`} />
        <span className={`font-bold font-mono uppercase tracking-wider ${tableValueClass}`}>{item.dateKey}</span>
        <span className={`w-1 h-1 rounded-full shrink-0 ${isDark ? "bg-zinc-500" : "bg-zinc-400"}`} />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Grouped virtual order list (desktop) — uses useVariableVirtualList
// ---------------------------------------------------------------------------

interface GroupedVirtualOrderListProps {
  flatItems: FlatItem[];
  containerHeight: number;
  theme: "dark" | "light" | "navy";
  isDark: boolean;
  hoveredOrder: string | null;
  setHoveredOrder: (id: string | null) => void;
  formatTime: (date: Date) => string;
  formatDate: (date: Date) => string;
  getCurrency: (symbol: string) => string;
  borderLightClass: string;
  tableValueClass: string;
  tertiaryTextClass: string;
  winBadgeClass: string;
  lossBadgeClass: string;
  secondaryTextClass: string;
  emptyMessage: string;
  emptySubMessage: string;
  preferredCurrencySymbol: string;
}

const GroupedVirtualOrderList = memo(function GroupedVirtualOrderList({
  flatItems,
  containerHeight,
  theme,
  isDark,
  hoveredOrder,
  setHoveredOrder,
  formatTime,
  formatDate,
  getCurrency,
  borderLightClass,
  tableValueClass,
  tertiaryTextClass,
  winBadgeClass,
  lossBadgeClass,
  secondaryTextClass,
  emptyMessage,
  emptySubMessage,
  preferredCurrencySymbol,
}: GroupedVirtualOrderListProps) {
  const getItemHeight = useCallback((item: FlatItem) => {
    return item.type === "separator" ? DATE_SEPARATOR_HEIGHT : DESKTOP_ROW_HEIGHT;
  }, []);

  const {
    virtualItems,
    totalHeight,
    containerRef,
    handleScroll,
    isScrolling,
  } = useVariableVirtualList({
    items: flatItems,
    estimatedItemHeight: DESKTOP_ROW_HEIGHT,
    getItemHeight,
    overscan: 10,
  });

  const orderCount = flatItems.filter((i) => i.type === "row").length;

  if (orderCount === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-8 ${secondaryTextClass}`}
      >
        <BarChart2 size={24} className="mb-2 opacity-50" />
        <p>{emptyMessage}</p>
        <p className="text-xs mt-1">{emptySubMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto"
      style={{ height: containerHeight, maxHeight: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {virtualItems.map(({ item, style }) => (
          <div key={item.id} style={style}>
            {item.type === "separator" ? (
              <DateSeparatorRow
                item={item}
                isDark={isDark}
                borderLightClass={borderLightClass}
                tableValueClass={tableValueClass}
              />
            ) : (
              <OrderRow
                order={item.order}
                isHovered={!isScrolling && hoveredOrder === item.order.id}
                onMouseEnter={() => !isScrolling && setHoveredOrder(item.order.id)}
                onMouseLeave={() => setHoveredOrder(null)}
                formatTime={formatTime}
                formatDate={formatDate}
                getCurrency={getCurrency}
                theme={theme}
                borderLightClass={borderLightClass}
                tableValueClass={tableValueClass}
                tertiaryTextClass={tertiaryTextClass}
                winBadgeClass={winBadgeClass}
                lossBadgeClass={lossBadgeClass}
                preferredCurrencySymbol={preferredCurrencySymbol}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Mobile order row (unchanged from original)
// ---------------------------------------------------------------------------

const MobileOrderRow = memo(function MobileOrderRow({
  order,
  getCurrency,
  formatTime,
  formatDate,
  tableValueClass,
  secondaryTextClass,
  winBadgeClass,
  lossBadgeClass,
  borderLightClass,
  entryPriceLabel,
  preferredCurrencySymbol,
}: {
  order: CompletedOrder;
  getCurrency: (symbol: string) => string;
  formatTime: (date: Date) => string;
  formatDate: (date: Date) => string;
  tableValueClass: string;
  secondaryTextClass: string;
  winBadgeClass: string;
  lossBadgeClass: string;
  borderLightClass: string;
  entryPriceLabel: string;
  preferredCurrencySymbol: string;
}) {
  return (
    <div className={`p-4 border-b ${borderLightClass}`}>
      {/* First row: Symbol, Side, and Status */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center flex-1 min-w-0">
          <span className={`font-semibold text-base ${tableValueClass} truncate flex items-center gap-1.5`}>
            <span>{order.symbol.toUpperCase().includes("OTC") ? getAssetDisplayName(order.symbol) : order.symbol.replace("USDT", "").replace("/", "")}</span>
            {order.symbol.toUpperCase().includes("OTC") && (
              <span className="text-[8px] font-bold leading-none tracking-wide px-[3px] py-[0.5px] rounded-[3px] shrink-0 border inline-block text-zinc-600 bg-zinc-200/80 border-zinc-300 dark:text-zinc-200 dark:bg-zinc-700 dark:border-zinc-600 [.navy_&]:text-sky-200 [.navy_&]:bg-sky-900/70 [.navy_&]:border-sky-700/60">
                OTC
              </span>
            )}
          </span>
          <span
            className={`ml-2 text-xs px-2 py-0.5 rounded font-medium ${isBullishSide(order.side) ? "bg-green-500/20 text-[#22c55e]" : "bg-red-500/20 text-[#ef4444]"}`}
          >
            {order.side}
          </span>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${order.status === "WIN" ? winBadgeClass : lossBadgeClass}`}
        >
          {order.status}
        </span>
      </div>

      {/* Second row: Amount and Profit/Loss */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex flex-col">
          <span className={`text-xs ${secondaryTextClass} uppercase tracking-wide`}>
            Amount
          </span>
          <span className={`text-sm font-medium ${tableValueClass}`}>
            {preferredCurrencySymbol}{order.amount.toFixed(2)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-xs ${secondaryTextClass} uppercase tracking-wide`}>
            {order.status === "WIN" ? "Profit" : "Loss"}
          </span>
          <span
            className={`text-sm font-bold ${order.status === "WIN" ? "text-[#22c55e]" : "text-[#ef4444]"}`}
          >
            {order.status === "WIN" ? "+" : "-"}{preferredCurrencySymbol}{Math.abs(order.profit || 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Third row: Time and Entry Price */}
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <span className={`text-xs ${secondaryTextClass} uppercase tracking-wide`}>
            Time
          </span>
          <span className={`text-xs ${secondaryTextClass}`}>
            {formatTradeDuration(order.entryTime, order.expiryTime)} • {formatDate(order.expiryTime)}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className={`text-xs ${secondaryTextClass} uppercase tracking-wide`}>
            {entryPriceLabel}
          </span>
          <span className={`text-xs ${tableValueClass} font-mono`}>
            {formatBinaryPrice(order.entryPrice, order.symbol)} {order.symbol.split("/")[1] || "USDT"}
          </span>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Mobile date separator header
// ---------------------------------------------------------------------------

const MobileDateSeparator = memo(function MobileDateSeparator({
  dateKey,
  isDark,
  borderLightClass,
  secondaryTextClass,
}: {
  dateKey: string;
  isDark: boolean;
  borderLightClass: string;
  secondaryTextClass: string;
}) {
  return (
    <div
      className={`px-3 py-1.5 flex items-center justify-center border-b ${borderLightClass} ${isDark ? "bg-zinc-900/70" : "bg-zinc-100/80"}`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDark ? "bg-zinc-500" : "bg-zinc-400"}`} />
        <span className={`text-xs font-semibold ${secondaryTextClass}`}>{dateKey}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDark ? "bg-zinc-500" : "bg-zinc-400"}`} />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Mobile grouped order list (non-virtual — mobile row count is small per day)
// ---------------------------------------------------------------------------

interface GroupedMobileOrderListProps {
  flatItems: FlatItem[];
  isDark: boolean;
  getCurrency: (symbol: string) => string;
  formatTime: (date: Date) => string;
  formatDate: (date: Date) => string;
  tableValueClass: string;
  secondaryTextClass: string;
  tertiaryTextClass: string;
  winBadgeClass: string;
  lossBadgeClass: string;
  borderLightClass: string;
  entryPriceLabel: string;
  emptyMessage: string;
  emptySubMessage: string;
  preferredCurrencySymbol: string;
}

const GroupedMobileOrderList = memo(function GroupedMobileOrderList({
  flatItems,
  isDark,
  getCurrency,
  formatTime,
  formatDate,
  tableValueClass,
  secondaryTextClass,
  tertiaryTextClass,
  winBadgeClass,
  lossBadgeClass,
  borderLightClass,
  entryPriceLabel,
  emptyMessage,
  emptySubMessage,
  preferredCurrencySymbol,
}: GroupedMobileOrderListProps) {
  const orderCount = flatItems.filter((i) => i.type === "row").length;

  if (orderCount === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-8 ${secondaryTextClass}`}
      >
        <BarChart2 size={24} className="mb-2 opacity-50" />
        <p>{emptyMessage}</p>
        <p className="text-xs mt-1">{emptySubMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {flatItems.map((item) =>
        item.type === "separator" ? (
          <MobileDateSeparator
            key={item.id}
            dateKey={item.dateKey}
            isDark={isDark}
            borderLightClass={borderLightClass}
            secondaryTextClass={secondaryTextClass}
          />
        ) : (
          <MobileOrderRow
            key={item.id}
            order={item.order}
            getCurrency={getCurrency}
            formatTime={formatTime}
            formatDate={formatDate}
            tableValueClass={tableValueClass}
            secondaryTextClass={secondaryTextClass}
            winBadgeClass={winBadgeClass}
            lossBadgeClass={lossBadgeClass}
            borderLightClass={borderLightClass}
            entryPriceLabel={entryPriceLabel}
            preferredCurrencySymbol={preferredCurrencySymbol}
          />
        )
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main CompletedPositions component props
// ---------------------------------------------------------------------------

interface CompletedPositionsProps {
  className?: string;
  theme?: "dark" | "light" | "navy";
  isMobile?: boolean;
  onPanelStateChange?: (isOpen: boolean, height: number) => void;
}

export default function CompletedPositions({
  className = "",
  theme = "dark",
  isMobile = false,
  onPanelStateChange,
}: CompletedPositionsProps) {
  const t = useTranslations("binary_components");
  const tCommon = useTranslations("common");
  const timezone = useSystemTimezone();
  const [isOpen, setIsOpenInternal] = useState(false);

  const setIsOpen = (value: boolean) => {
    setIsOpenInternal(value);
    if (onPanelStateChange) {
      onPanelStateChange(value, panelHeight);
    }
  };
  const [filter, setFilter] = useState<"all" | "WIN" | "LOSS">("all");
  const [sortBy, setSortBy] = useState<"time" | "profit" | "symbol">("time");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [hoveredOrder, setHoveredOrder] = useState<string | null>(null);
  const [sortedOrders, setSortedOrders] = useState<CompletedOrder[]>([]);
  const [stats, setStats] = useState({
    totalProfit: 0,
    winRate: "0.0",
    completedOrdersCount: 0,
  });
  // Load saved height from localStorage or use default
  const [panelHeight, setPanelHeightInternal] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('binary-completed-orders-height');
      return saved ? parseInt(saved, 10) : 500;
    }
    return 500;
  });

  const setPanelHeight = (height: number) => {
    setPanelHeightInternal(height);
    if (onPanelStateChange && isOpen) {
      onPanelStateChange(isOpen, height);
    }
  };
  const [isResizing, setIsResizing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const { completedOrders, isLoadingOrders, fetchCompletedOrders, tradingMode } =
    useBinaryStore();

  // Track preferred display currency from localStorage
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

  // Filter completed orders by current trading mode and convert to preferred display currency
  const filteredCompletedOrders = useMemo(() => {
    return completedOrders
      .filter(order => order.isDemo === (tradingMode === "demo"))
      .map(order => ({
        ...order,
        amount: order.amount * preferredCurrencyRate,
        profit: order.profit !== undefined ? order.profit * preferredCurrencyRate : order.profit,
      }));
  }, [completedOrders, tradingMode, preferredCurrencyRate]);

  // Theme-based classes using zinc colors
  const isDark = theme === "dark" || theme === "navy";
  const bgClass = isDark ? "bg-card" : "bg-white";
  const bgGradientClass =
    isDark
      ? "bg-card/95"
      : "bg-white/95";
  const textClass = isDark ? "text-foreground" : "text-black";
  const borderClass = isDark ? "border-zinc-800" : "border-zinc-200";
  const borderLightClass =
    isDark ? "border-zinc-800/60" : "border-zinc-100";
  const secondaryBgClass = isDark ? "bg-background" : "bg-zinc-50";
  const hoverBgClass =
    isDark ? "hover:bg-muted" : "hover:bg-zinc-100";
  const activeBgClass = isDark ? "bg-muted" : "bg-zinc-100";
  const secondaryTextClass =
    isDark ? "text-muted-foreground" : "text-zinc-600";
  const tertiaryTextClass =
    isDark ? "text-muted-foreground/80" : "text-zinc-400";
  const badgeBgClass = isDark ? "bg-muted" : "bg-zinc-100";
  const tableHeaderClass = isDark ? "bg-muted/80" : "bg-zinc-100";
  const winBadgeClass =
    isDark
      ? "bg-[#22c55e]/20 text-[#22c55e]"
      : "bg-green-100 text-green-600";
  const lossBadgeClass =
    isDark
      ? "bg-[#ef4444]/20 text-[#ef4444]"
      : "bg-red-100 text-red-600";
  const headerBgClass = isDark ? "bg-card" : "bg-zinc-100";
  const iconClass = isDark ? "text-muted-foreground" : "text-zinc-600";
  const tableValueClass = isDark ? "text-foreground" : "text-zinc-800";

  // Handle resize start
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = panelHeight;
  }, [panelHeight]);

  // Handle resize move
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const deltaY = startYRef.current - e.clientY;
      const newHeight = Math.min(Math.max(200, startHeightRef.current + deltaY), 800);
      setPanelHeight(newHeight);
      if (onPanelStateChange) {
        onPanelStateChange(isOpen, newHeight);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(false);
      // Save the new height to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('binary-completed-orders-height', panelHeight.toString());
      }
      // Remove overlay
      const overlay = document.getElementById('resize-overlay');
      if (overlay) {
        overlay.remove();
      }
    };

    // Create an invisible overlay to capture all mouse events during resize
    const overlay = document.createElement('div');
    overlay.id = 'resize-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.zIndex = '9999';
    overlay.style.cursor = 'ns-resize';
    document.body.appendChild(overlay);

    // Add events to the overlay instead of document
    overlay.addEventListener('mousemove', handleMouseMove);
    overlay.addEventListener('mouseup', handleMouseUp);
    overlay.addEventListener('mouseleave', handleMouseUp);

    // Add cursor style during resize
    document.body.style.userSelect = 'none';

    return () => {
      const overlayEl = document.getElementById('resize-overlay');
      if (overlayEl) {
        overlayEl.remove();
      }
      document.body.style.userSelect = '';
    };
  }, [isResizing, panelHeight]);

  const updateSortedOrders = (orders: CompletedOrder[]) => {
    let filteredOrders = [...orders];
    if (filter !== "all") {
      filteredOrders = filteredOrders.filter(
        (order) => order.status === filter
      );
    }
    const sorted = [...filteredOrders].sort((a, b) => {
      let comparison = 0;
      if (sortBy === "time") {
        comparison = a.expiryTime.getTime() - b.expiryTime.getTime();
      } else if (sortBy === "profit") {
        comparison = (a.profit || 0) - (b.profit || 0);
      } else if (sortBy === "symbol") {
        comparison = a.symbol.localeCompare(b.symbol);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    setSortedOrders(sorted);
  };

  // Process orders and update stats when orders change - with memoization
  useEffect(() => {
    // Ensure we have orders to process (use filtered orders by trading mode)
    if (!filteredCompletedOrders || filteredCompletedOrders.length === 0) {
      setSortedOrders([]);
      setStats({
        totalProfit: 0,
        winRate: "0.0",
        completedOrdersCount: 0,
      });
      return;
    }

    // Debounce updates to prevent excessive re-renders
    const timeoutId = setTimeout(() => {
      const completedOrdersCount = filteredCompletedOrders.length;

    // Calculate total profit/loss
    const totalProfit = filteredCompletedOrders.reduce(
      (sum, order) => {
        if (order.status === "WIN") {
          return sum + (order.profit || 0);
        } else if (order.status === "LOSS") {
          return sum - order.amount;
        }
        return sum;
      },
      0
    );
    const winRate =
      filteredCompletedOrders.length > 0
        ? (
            (filteredCompletedOrders.filter((order) => order.status === "WIN").length /
              filteredCompletedOrders.length) *
            100
          ).toFixed(1)
        : "0.0";
    setStats({
      totalProfit,
      winRate,
      completedOrdersCount,
    });

      // Update sorted orders
      updateSortedOrders(filteredCompletedOrders);
    }, 100); // Small debounce

    return () => clearTimeout(timeoutId);
  }, [filteredCompletedOrders, filter, sortBy, sortDirection]);

  // Build flat items array for virtualized grouped rendering
  const flatItems = useMemo(
    () => buildFlatItems(sortedOrders, preferredCurrencyRate),
    [sortedOrders, preferredCurrencyRate]
  );

  // Hide the component when there are no completed trades
  if (stats.completedOrdersCount === 0) {
    return null;
  }

  // Format time
  const formatTime = (date: Date) => {
    return formatTimeInTimezone(date, timezone, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Format date
  const formatDate = (date: Date) => {
    return formatDateInTimezone(date, timezone, {
      month: "short",
      day: "numeric",
    });
  };

  // Extract currency from symbol (e.g., "BTC/USDT" -> "USDT")
  const getCurrency = (symbol: string) => {
    return preferredCurrency;
  };

  // Toggle sort
  const toggleSort = (newSortBy: "time" | "profit" | "symbol") => {
    if (sortBy === newSortBy) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSortBy);
      setSortDirection("desc");
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      "Date",
      "Time",
      "Symbol",
      "Side",
      "Entry Price",
      "Exit Price",
      "Amount",
      "Profit/Loss",
      "Status",
    ];
    const csvContent = [
      headers.join(","),
      ...sortedOrders.map((order) =>
        [
          formatDate(order.entryTime),
          formatTime(order.entryTime),
          order.symbol,
          order.side,
          formatBinaryPrice(order.entryPrice, order.symbol),
          order.closePrice ? formatBinaryPrice(order.closePrice, order.symbol) : "N/A",
          order.amount.toFixed(2),
          (order.profit || 0).toFixed(2),
          order.status,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `trading-history-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // For mobile, always show content without collapsible behavior
  if (isMobile) {
    return (
      <div className={`w-full h-full flex flex-col ${bgClass} ${className}`}>
        {/* Mobile header with stats */}
        <div
          className={`flex-shrink-0 ${headerBgClass} border-b ${borderClass} px-4 py-3`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <BarChart2 size={16} className="mr-2 text-zinc-500" />
              <span className={`font-medium text-sm ${textClass}`}>
                {t("trading_history")}
              </span>
            </div>
            {stats.completedOrdersCount > 0 && (
              <div className="flex items-center space-x-3">
                <div
                  className={`text-sm ${stats.totalProfit >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}
                >
                  {stats.totalProfit >= 0 ? "+" : "-"}{preferredCurrencySymbol}{Math.abs(stats.totalProfit).toFixed(2)}
                </div>
                <div className={`text-xs ${secondaryTextClass}`}>
                  {tCommon("win")}:{" "}
                  <span
                    className={
                      Number(stats.winRate) > 50
                        ? "text-[#22c55e]"
                        : secondaryTextClass
                    }
                  >
                    {stats.winRate}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile filters - pill style tabs */}
        <div
          className={`flex-shrink-0 px-3 py-2 ${theme === "dark" ? "bg-zinc-950" : "bg-white"}`}
        >
          <div className={`flex p-1 rounded-lg ${theme === "dark" ? "bg-zinc-900" : "bg-zinc-200"}`}>
            <button
              className={`flex-1 py-2 px-3 text-sm font-medium transition-all rounded-md ${
                filter === "all"
                  ? theme === "dark"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "bg-white text-zinc-900 shadow-sm"
                  : `${secondaryTextClass} hover:text-zinc-${theme === "dark" ? "300" : "700"}`
              }`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              className={`flex-1 py-2 px-3 text-sm font-medium transition-all rounded-md ${
                filter === "WIN"
                  ? "bg-green-500/20 text-green-400 shadow-sm"
                  : `${secondaryTextClass} hover:text-green-400`
              }`}
              onClick={() => setFilter("WIN")}
            >
              Won
            </button>
            <button
              className={`flex-1 py-2 px-3 text-sm font-medium transition-all rounded-md ${
                filter === "LOSS"
                  ? "bg-red-500/20 text-red-400 shadow-sm"
                  : `${secondaryTextClass} hover:text-red-400`
              }`}
              onClick={() => setFilter("LOSS")}
            >
              Lost
            </button>
          </div>
        </div>

        {/* Mobile content - date-grouped list */}
        <GroupedMobileOrderList
          flatItems={flatItems}
          isDark={isDark}
          getCurrency={getCurrency}
          formatTime={formatTime}
          formatDate={formatDate}
          tableValueClass={tableValueClass}
          secondaryTextClass={secondaryTextClass}
          tertiaryTextClass={tertiaryTextClass}
          winBadgeClass={winBadgeClass}
          lossBadgeClass={lossBadgeClass}
          borderLightClass={borderLightClass}
          entryPriceLabel={tCommon("entry_price")}
          emptyMessage={t("no_completed_trades_found")}
          emptySubMessage={t("completed_trades_will_appear_here")}
          preferredCurrencySymbol={preferredCurrencySymbol}
        />
      </div>
    );
  }

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 ${className}`}>
      {/* Container with smooth transition */}
      <div
        className={`relative bg-zinc-900`}
        style={{
          boxShadow: "0 -2px 10px rgba(0,0,0,0.1)",
          transform: isOpen ? "translateY(0)" : `translateY(calc(100% - 40px))`,
          height: isOpen ? `${panelHeight + 40}px` : "40px",
          transition: !isResizing ? "transform 0.3s ease-in-out, height 0.3s ease-in-out" : "none",
        }}
      >
        {/* Resize handle - only visible when panel is open */}
        {isOpen && (
          <div
            ref={resizeRef}
            className={`absolute top-0 left-0 right-0 h-3 cursor-ns-resize group z-50 flex items-center justify-center ${isResizing ? "bg-blue-500/10" : "hover:bg-zinc-800/50"}`}
            onMouseDown={handleResizeStart}
            style={{ touchAction: 'none' }}
          >
            <div className={`w-12 h-1 ${isResizing ? "bg-blue-500" : "bg-zinc-600 group-hover:bg-zinc-500"} rounded-full transition-colors`} />
          </div>
        )}
        {/* Header bar - always visible */}
        <div
          className={`${headerBgClass} border-t ${borderClass} px-4 py-2 flex items-center justify-between cursor-pointer transition-colors duration-200 ${isOpen ? "mt-3" : ""}}`}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setIsOpen(!isOpen);
            }
          }}
        >
          <div className="flex items-center">
            <BarChart2 size={16} className="mr-2 text-zinc-500" />
            <span
              className={`font-medium ${theme === "dark" ? "text-white" : "text-black"}`}
            >
              {t("trading_history")}
            </span>
            {stats.completedOrdersCount > 0 && (
              <>
                <div
                  className={`ml-3 text-sm ${stats.totalProfit >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}
                >
                  {stats.totalProfit >= 0 ? "+" : "-"}{preferredCurrencySymbol}{Math.abs(stats.totalProfit).toFixed(2)}
                </div>
                <div
                  className={`ml-3 text-xs ${theme === "dark" ? "text-zinc-400" : "text-zinc-500"}`}
                >
                  {tCommon("win_rate")}:{" "}
                  <span
                    className={
                      Number(stats.winRate) > 50
                        ? "text-[#22c55e]"
                        : theme === "dark"
                          ? "text-zinc-300"
                          : "text-zinc-400"
                    }
                  >
                    {stats.winRate}%
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center">
            <ChevronUp
              size={20}
              className={`transform transition-transform duration-300 ${iconClass} ${isOpen ? "rotate-180" : "rotate-0"}`}
            />
          </div>
        </div>

        {/* Content panel */}
        <div
          ref={contentRef}
          className={`${bgClass} border-t ${borderClass} overflow-hidden`}
          style={{
            height: isOpen ? `${panelHeight}px` : "0px",
            opacity: isOpen ? 1 : 0,
            transition: !isResizing ? "all 0.3s ease-in-out" : "none",
          }}
        >
          {/* Filters and controls - more compact */}
          <div
            className={`flex justify-between items-center px-3 py-1 border-b ${borderLightClass}`}
          >
            <div className="flex items-center gap-2">
              <div className="flex rounded-md overflow-hidden border ${borderLightClass}">
                <button
                  className={`px-3 py-1 text-xs transition-colors ${filter === "all" ? (theme === "dark" ? "bg-zinc-800 text-white" : "bg-zinc-200 text-black") : theme === "dark" ? "text-zinc-400 hover:bg-zinc-800/50" : "text-zinc-500 hover:bg-zinc-100"}`}
                  onClick={() => setFilter("all")}
                >
                  All
                </button>
                <button
                  className={`px-3 py-1 text-xs transition-colors border-l ${borderLightClass} ${filter === "WIN" ? "bg-green-500/20 text-[#22c55e]" : theme === "dark" ? "text-zinc-400 hover:bg-zinc-800/50" : "text-zinc-500 hover:bg-zinc-100"}`}
                  onClick={() => setFilter("WIN")}
                >
                  Won
                </button>
                <button
                  className={`px-3 py-1 text-xs transition-colors border-l ${borderLightClass} ${filter === "LOSS" ? "bg-red-500/20 text-[#ef4444]" : theme === "dark" ? "text-zinc-400 hover:bg-zinc-800/50" : "text-zinc-500 hover:bg-zinc-100"}`}
                  onClick={() => setFilter("LOSS")}
                >
                  Lost
                </button>
              </div>
            </div>
            <button
              onClick={exportToCSV}
              className={`flex items-center text-xs ${theme === "dark" ? "text-zinc-400 hover:text-zinc-300" : "text-zinc-600 hover:text-zinc-800"} transition-colors`}
            >
              <Download size={12} className="mr-1" />
              Export
            </button>
          </div>

          {/* Table header - more compact */}
          <div
            className={`grid grid-cols-7 gap-2 px-3 py-1.5 border-b ${borderLightClass} text-xs font-medium ${tableHeaderClass} ${theme === "dark" ? "text-zinc-400" : "text-zinc-600"}`}
          >
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSort("time")}
            >
              <Clock size={12} className="mr-1" />
              Time
              {sortBy === "time" && (
                <span className="ml-1">
                  {sortDirection === "asc" ? "↑" : "↓"}
                </span>
              )}
            </div>
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSort("symbol")}
            >
              Symbol
              {sortBy === "symbol" && (
                <span className="ml-1">
                  {sortDirection === "asc" ? "↑" : "↓"}
                </span>
              )}
            </div>
            <div>Side</div>
            <div>{tCommon("entry_price")}</div>
            <div>Amount</div>
            <div
              className="flex items-center cursor-pointer"
              onClick={() => toggleSort("profit")}
            >
              <DollarSign size={12} className="mr-1" />
              {tCommon("profit_loss")}
              {sortBy === "profit" && (
                <span className="ml-1">
                  {sortDirection === "asc" ? "↑" : "↓"}
                </span>
              )}
            </div>
            <div>Status</div>
          </div>

          {/* Table content - date-grouped VIRTUALIZED list */}
          <GroupedVirtualOrderList
            flatItems={flatItems}
            containerHeight={panelHeight - 100}
            theme={theme}
            isDark={isDark}
            hoveredOrder={hoveredOrder}
            setHoveredOrder={setHoveredOrder}
            formatTime={formatTime}
            formatDate={formatDate}
            getCurrency={getCurrency}
            borderLightClass={borderLightClass}
            tableValueClass={tableValueClass}
            tertiaryTextClass={tertiaryTextClass}
            winBadgeClass={winBadgeClass}
            lossBadgeClass={lossBadgeClass}
            secondaryTextClass={secondaryTextClass}
            emptyMessage={t("no_completed_trades_found")}
            emptySubMessage={t("completed_trades_will_appear_here")}
            preferredCurrencySymbol={preferredCurrencySymbol}
          />
        </div>
      </div>
    </div>
  );
}
