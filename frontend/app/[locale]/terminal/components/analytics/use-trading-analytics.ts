"use client";

/**
 * Binary Trading Analytics Hook
 *
 * Provides reactive trading statistics and analytics data.
 */

import { useMemo } from "react";
import { useBinaryStore, type CompletedOrder } from "@/store/trade/use-binary-store";
import {
  calculateTradingStats,
  calculateStatsBySymbol,
  calculateStatsByHour,
  calculateStatsByDay,
  calculateStreaks,
  calculateEquityCurve,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateMaxDrawdown,
  calculateRecoveryFactor,
  averagePayoutPercent,
  totalTurnover,
  type EquityPoint,
} from "./trading-analytics";
import type {
  TradingStats,
  SymbolStats,
  TimeOfDayStats,
  DayOfWeekStats,
} from "@/types/binary-trading";

// ============================================================================
// TYPES
// ============================================================================

export interface AdvancedMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  recoveryFactor: number;
  profitFactor: number;
  expectancy: number;
  riskRewardRatio: number;
}

/**
 * Window the whole page is scoped to. One global range rather than a control per
 * card: every figure on screen then describes the same period, so the equity
 * curve, the per-market table and the headline cannot disagree about what "now"
 * means.
 */
export type AnalyticsRange = "today" | "week" | "month" | "all";

/**
 * What the header's Filters control narrows the page to.
 *
 * Applied before the range window, not after: the previous-period comparison has
 * to be drawn from the same subset as the current one, or every "vs last week" on
 * the page compares a filtered figure against an unfiltered one.
 *
 * `symbols` empty means every market rather than none — an empty multi-select is
 * the state you land in, and landing in "show nothing" reads as a broken page.
 */
export interface AnalyticsFilters {
  /** Raw order symbols to keep. Empty = all markets. */
  symbols: string[];
  /** Direction the position was opened in. */
  side: "ALL" | "UP" | "DOWN";
  outcome: "ALL" | "WIN" | "LOSS" | "DRAW";
}

export const EMPTY_FILTERS: AnalyticsFilters = { symbols: [], side: "ALL", outcome: "ALL" };

/** How many of the three are doing something — the count on the Filters button. */
export function activeFilterCount(f: AnalyticsFilters): number {
  return (f.symbols.length > 0 ? 1 : 0) + (f.side !== "ALL" ? 1 : 0) + (f.outcome !== "ALL" ? 1 : 0);
}

/* Binary options carry ten side values across four instrument types, and only
   eight of them point anywhere. TOUCH / NO_TOUCH are bets on volatility rather
   than on direction, so they belong to neither bucket and are dropped by a
   direction filter rather than being forced into one. */
const UP_SIDES = new Set(["RISE", "HIGHER", "CALL", "UP"]);
const DOWN_SIDES = new Set(["FALL", "LOWER", "PUT", "DOWN"]);

/* Widest first.
 *
 * The menu used to run Today → Week → Month → All, which is the order the
 * windows are *computed* in and the wrong order to offer them in: the top of a
 * list is where the eye starts, and the top of that list was the window least
 * likely to have anything in it. An account that traded yesterday and not today
 * opened the menu on an empty option. Widest first means the first thing read
 * is the window that always has data, and each step down is a narrowing. */
export const ANALYTICS_RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "today", label: "Today" },
];

/**
 * [start, end) of the selected window, and of the equally-long window before it.
 *
 * Calendar-aligned, not rolling. It used to be `now - 7 * 86_400_000`, which is
 * the last 168 hours — a window whose edge falls at whatever time of day you
 * happen to open the page, and which therefore contains part of a day it cannot
 * name. The dashboard now prints the window as a date range in its header
 * ("Aug 29 – Sep 4") and plots it as a row of day columns, and neither of those
 * can be drawn from a boundary sitting halfway through a Tuesday.
 *
 * "Week" is today plus the six days before it, and days are stepped by
 * constructing dates rather than by subtracting milliseconds, so a window that
 * crosses a daylight-saving change is still seven midnights wide.
 */
export function rangeBounds(range: AnalyticsRange, now: Date = new Date()) {
  if (range === "all") {
    return { start: 0, end: Infinity, prevStart: 0, prevEnd: 0 };
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const days = range === "today" ? 1 : range === "week" ? 7 : 30;
  const start = new Date(y, m, d - (days - 1)).getTime();
  // Runs to the end of today, not to this instant: the last column of the chart
  // is a whole day that is still filling up, not a day cut short at 14:32.
  const end = new Date(y, m, d + 1).getTime();
  // Same number of days, immediately before — so "vs previous" compares like
  // with like, and the two windows never overlap.
  const prevStart = new Date(y, m, d - (days * 2 - 1)).getTime();
  return { start, end, prevStart, prevEnd: start };
}

/** How the chart slices a window: one column per hour for a day, else per day. */
export function rangeBuckets(range: AnalyticsRange): { unit: "hour" | "day"; count: number } {
  if (range === "today") return { unit: "hour", count: 24 };
  if (range === "week") return { unit: "day", count: 7 };
  return { unit: "day", count: 30 };
}

export interface TradingAnalytics {
  // Core stats
  stats: TradingStats;

  /** Same stats over the preceding window of equal length, for period-on-period deltas. */
  previousStats: TradingStats;

  /** Stake-weighted mean payout rate (%) across wins in the window. */
  avgPayoutPercent: number;

  /** Total staked in the window — volume, not profit. */
  turnover: number;

  /** The window currently in effect. */
  range: AnalyticsRange;

  // Grouped statistics
  statsBySymbol: SymbolStats[];
  statsByHour: TimeOfDayStats[];
  statsByDay: DayOfWeekStats[];

  // Streaks
  currentStreak: number;
  isWinningStreak: boolean;
  longestWinStreak: number;
  longestLossStreak: number;

  // Equity data
  equityCurve: EquityPoint[];
  currentBalance: number;
  startingBalance: number;

  // Advanced metrics
  advancedMetrics: AdvancedMetrics;

  // Recent trades
  recentTrades: CompletedOrder[];

  /** Every settled trade inside the window, after filters. The new dashboard
      buckets these itself — by day, by hour and by market — rather than being
      handed four pre-aggregated shapes that can drift apart. */
  orders: CompletedOrder[];

  /** The same, for the equally-long window immediately before it. Empty on "all". */
  previousOrders: CompletedOrder[];

  /** Markets this account has traded, for the Filters menu. Unaffected by filters. */
  tradedSymbols: string[];

  /** Whether the account has any settled trade at all, ignoring range and filters.
      Distinguishes "you have not traded" from "nothing matched" — two empty
      states that need two different messages. */
  hasAnyHistory: boolean;

  // Best/worst performance
  bestSymbol: SymbolStats | null;
  worstSymbol: SymbolStats | null;
  bestHour: TimeOfDayStats | null;
  worstHour: TimeOfDayStats | null;

  // Status
  isLoading: boolean;
  hasData: boolean;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to get comprehensive trading analytics
 */
export function useTradingAnalytics(
  range: AnalyticsRange = "all",
  filters: AnalyticsFilters = EMPTY_FILTERS
): TradingAnalytics {
  const {
    completedOrders,
    isLoadingOrders,
    demoBalance,
    realBalance,
    tradingMode,
  } = useBinaryStore();

  // Orders for the active trading mode. Demo and real must never be mixed — a
  // 10,000 demo balance would otherwise flatter a real account's numbers.
  const modeOrders = useMemo(() => {
    return completedOrders.filter(order => order.isDemo === (tradingMode === "demo"));
  }, [completedOrders, tradingMode]);

  /** Every market this account has actually traded, for the filter's list. Taken
      from modeOrders rather than from the filtered set, so choosing one market
      does not empty the menu you chose it from. */
  const tradedSymbols = useMemo(() => {
    const seen = new Set<string>();
    for (const o of modeOrders) if (o.symbol) seen.add(String(o.symbol));
    return Array.from(seen).sort();
  }, [modeOrders]);

  // The header's Filters control, applied before the window is cut so that the
  // current and previous periods are always the same slice of the account.
  const scopedOrders = useMemo(() => {
    const { symbols, side, outcome } = filters;
    if (symbols.length === 0 && side === "ALL" && outcome === "ALL") return modeOrders;
    const keep = new Set(symbols);
    return modeOrders.filter((o) => {
      if (keep.size > 0 && !keep.has(String(o.symbol))) return false;
      if (side === "UP" && !UP_SIDES.has(String(o.side))) return false;
      if (side === "DOWN" && !DOWN_SIDES.has(String(o.side))) return false;
      if (outcome !== "ALL" && o.status !== outcome) return false;
      return true;
    });
  }, [modeOrders, filters]);

  // Scoped by settlement time, not entry time: a trade belongs to the period in
  // which it actually paid out, which is what the equity curve steps on.
  const { filteredOrders, previousOrders } = useMemo(() => {
    if (range === "all") return { filteredOrders: scopedOrders, previousOrders: [] };
    const { start, end, prevStart, prevEnd } = rangeBounds(range);
    const cur: CompletedOrder[] = [];
    const prev: CompletedOrder[] = [];
    for (const o of scopedOrders) {
      const t = o.expiryTime.getTime();
      if (t >= start && t < end) cur.push(o);
      else if (t >= prevStart && t < prevEnd) prev.push(o);
    }
    return { filteredOrders: cur, previousOrders: prev };
  }, [scopedOrders, range]);

  const previousStats = useMemo(
    () => calculateTradingStats(previousOrders),
    [previousOrders]
  );

  const avgPayoutPercent = useMemo(
    () => averagePayoutPercent(filteredOrders),
    [filteredOrders]
  );

  const turnover = useMemo(() => totalTurnover(filteredOrders), [filteredOrders]);

  // Get starting balance based on trading mode
  const startingBalance = useMemo(() => {
    return tradingMode === "demo" ? 10000 : (realBalance ?? 0);
  }, [tradingMode, realBalance]);

  // Current balance
  const currentBalance = useMemo(() => {
    return tradingMode === "demo" ? demoBalance : (realBalance ?? 0);
  }, [tradingMode, demoBalance, realBalance]);

  // Core statistics (use filtered orders by trading mode)
  const stats = useMemo(() => {
    return calculateTradingStats(filteredOrders);
  }, [filteredOrders]);

  // Statistics by symbol
  const statsBySymbol = useMemo(() => {
    return calculateStatsBySymbol(filteredOrders);
  }, [filteredOrders]);

  // Statistics by hour
  const statsByHour = useMemo(() => {
    return calculateStatsByHour(filteredOrders);
  }, [filteredOrders]);

  // Statistics by day
  const statsByDay = useMemo(() => {
    return calculateStatsByDay(filteredOrders);
  }, [filteredOrders]);

  // Streaks
  const streaks = useMemo(() => {
    return calculateStreaks(filteredOrders);
  }, [filteredOrders]);

  // Equity curve
  const equityCurve = useMemo(() => {
    // Use starting balance as base for equity calculation
    const baseBalance = startingBalance || 10000;
    return calculateEquityCurve(filteredOrders, baseBalance);
  }, [filteredOrders, startingBalance]);

  // Advanced metrics
  const advancedMetrics = useMemo((): AdvancedMetrics => {
    const sharpeRatio = calculateSharpeRatio(filteredOrders);
    const sortinoRatio = calculateSortinoRatio(filteredOrders);
    const { maxDrawdown, maxDrawdownPercent } = calculateMaxDrawdown(
      filteredOrders,
      startingBalance || 10000
    );
    const recoveryFactor = calculateRecoveryFactor(
      filteredOrders,
      startingBalance || 10000
    );

    // Expectancy = (Win% × Avg Win) - (Loss% × Avg Loss)
    const winPercent = stats.winRate / 100;
    const lossPercent = 1 - winPercent;
    const expectancy = stats.totalTrades > 0
      ? (winPercent * stats.avgWinAmount) - (lossPercent * stats.avgLossAmount)
      : 0;

    // Risk/Reward Ratio = Avg Win / Avg Loss
    const riskRewardRatio = stats.avgLossAmount > 0
      ? stats.avgWinAmount / stats.avgLossAmount
      : stats.avgWinAmount > 0 ? Infinity : 0;

    return {
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      maxDrawdownPercent,
      recoveryFactor,
      profitFactor: stats.profitFactor,
      expectancy,
      riskRewardRatio,
    };
  }, [filteredOrders, startingBalance, stats]);

  // Recent trades (last 10)
  const recentTrades = useMemo(() => {
    return [...filteredOrders]
      .sort((a, b) => b.expiryTime.getTime() - a.expiryTime.getTime())
      .slice(0, 10);
  }, [filteredOrders]);

  // Best/worst symbols
  const bestSymbol = useMemo(() => {
    const sorted = [...statsBySymbol].sort((a, b) => b.winRate - a.winRate);
    return sorted.find(s => s.totalTrades >= 5) || sorted[0] || null;
  }, [statsBySymbol]);

  const worstSymbol = useMemo(() => {
    const sorted = [...statsBySymbol].sort((a, b) => a.winRate - b.winRate);
    return sorted.find(s => s.totalTrades >= 5) || sorted[0] || null;
  }, [statsBySymbol]);

  // Best/worst hours
  const bestHour = useMemo(() => {
    const sorted = [...statsByHour]
      .filter(h => h.trades >= 3)
      .sort((a, b) => b.winRate - a.winRate);
    return sorted[0] || null;
  }, [statsByHour]);

  const worstHour = useMemo(() => {
    const sorted = [...statsByHour]
      .filter(h => h.trades >= 3)
      .sort((a, b) => a.winRate - b.winRate);
    return sorted[0] || null;
  }, [statsByHour]);

  return {
    stats,
    previousStats,
    avgPayoutPercent,
    turnover,
    range,
    statsBySymbol,
    statsByHour,
    statsByDay,
    currentStreak: streaks.currentStreak,
    isWinningStreak: streaks.isWinningStreak,
    longestWinStreak: streaks.longestWinStreak,
    longestLossStreak: streaks.longestLossStreak,
    equityCurve,
    currentBalance,
    startingBalance: startingBalance || 10000,
    advancedMetrics,
    recentTrades,
    orders: filteredOrders,
    previousOrders,
    tradedSymbols,
    hasAnyHistory: modeOrders.length > 0,
    bestSymbol,
    worstSymbol,
    bestHour,
    worstHour,
    isLoading: isLoadingOrders,
    hasData: filteredOrders.length > 0,
  };
}

export default useTradingAnalytics;
