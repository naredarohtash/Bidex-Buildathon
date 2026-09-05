/**
 * The trading analytics surface: a performance dashboard and a trade journal.
 *
 * Nine other components used to be exported from here — summary cards, a win
 * rate gauge, a streak indicator, a recent-trades table, an equity curve, symbol
 * statistics, advanced metrics and two chart bundles. None of them had a call
 * site: they were the parts of an older dashboard, kept exported after the page
 * that used them was rewritten, and a barrel file is very good at hiding that.
 * They are gone rather than left "in case", because dead code that still
 * compiles is dead code that still gets maintained.
 */

export { AnalyticsDashboard, default } from "./analytics-dashboard";

export { AnalyticsOverview } from "./analytics-overview";
export { TradeJournal } from "./trade-journal";

export { downloadTrades, type ExportFormat } from "./export-trades";

export {
  useTradingAnalytics,
  rangeBounds,
  rangeBuckets,
  activeFilterCount,
  ANALYTICS_RANGES,
  EMPTY_FILTERS,
  type AdvancedMetrics as AdvancedMetricsType,
  type AnalyticsFilters,
  type AnalyticsRange,
  type TradingAnalytics,
} from "./use-trading-analytics";

export {
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
  breakEvenWinRate,
  tradePnl,
  formatDuration,
  formatPercent,
  formatCurrency,
  getPerformanceColor,
  getWinRateColor,
  type EquityPoint,
} from "./trading-analytics";
