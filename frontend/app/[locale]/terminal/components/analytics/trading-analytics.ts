/**
 * Binary Trading Analytics Utilities
 *
 * Functions for calculating trading statistics and performance metrics.
 */

import type { CompletedOrder } from "@/store/trade/use-binary-store";
import type { TradingStats, SymbolStats, TimeOfDayStats, DayOfWeekStats } from "@/types/binary-trading";

// ============================================================================
// CORE STATISTICS CALCULATIONS
// ============================================================================

/**
 * Calculate comprehensive trading statistics from completed orders
 */
/**
 * Realised P&L of a single settled trade, in the account currency.
 *
 * THE single definition. It used to be written out by hand at five call sites and
 * four of them were wrong — calculateEquityCurve, calculateStatsByDay,
 * calculateSharpeRatio and calculateSortinoRatio all did:
 *
 *     const pnl = order.status === "WIN" ? profit : -Math.abs(profit);
 *
 * On a losing trade `profit` is not always populated, and `-Math.abs(0)` is 0 — so
 * losses contributed NOTHING to the equity curve while wins added their full
 * profit. That is why the page showed a curve climbing to $912K beside a headline
 * of -$39,176, a max drawdown of 0.0% on a losing account, a recovery factor of
 * 0.00 and a Sortino of Infinity: a monotonically rising curve has no drawdown and
 * no downside deviation. Only calculateTradingStats carried the stake fallback.
 *
 * Binary options settle three ways:
 *   WIN  — stake returned plus a payout, so P&L is the payout alone.
 *   LOSS — the whole stake is gone.
 *   DRAW — price closed exactly at entry; the stake is refunded, so P&L is zero.
 *          It is NOT a loss, which is the other thing the equity curve got wrong.
 */
export function tradePnl(order: CompletedOrder): number {
  if (order.status === "DRAW") return 0;

  const stake = Number(order.amount) || 0;
  const recorded = Number(order.profit);
  const hasRecorded = Number.isFinite(recorded) && recorded !== 0;

  if (order.status === "WIN") {
    if (hasRecorded) return Math.abs(recorded);
    // Fall back to the payout rate the order settled at.
    const pct = Number(order.profitPercentage);
    return Number.isFinite(pct) && pct > 0 ? (stake * pct) / 100 : 0;
  }

  // LOSS — `profit` on a losing row holds the stake, not the payout. When it is
  // missing the stake itself is the loss; never zero.
  return -(hasRecorded ? Math.abs(recorded) : stake);
}

/** A trade that resolved for or against the trader. Draws are excluded. */
export function isDecided(order: CompletedOrder): boolean {
  return order.status === "WIN" || order.status === "LOSS";
}

/**
 * Win rate a trader must beat merely to break even, given the payout on offer.
 *
 * The single most useful number on a fixed-payout product and one the page did not
 * show at all. At a 78% payout a win returns 0.78x the stake while a loss costs
 * 1.00x, so breakeven is 1 / 1.78 = 56.2%. A 58.9% win rate reads like a winning
 * strategy until you see it is worth only 2.7 points of edge.
 */
export function breakEvenWinRate(payoutPercent: number): number {
  const p = Number(payoutPercent);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return (100 / (1 + p / 100));
}

/** Stake-weighted mean payout rate across settled trades, in percent. */
export function averagePayoutPercent(orders: CompletedOrder[]): number {
  const wins = orders.filter((o) => o.status === "WIN");
  let stake = 0;
  let payout = 0;
  for (const o of wins) {
    const s = Number(o.amount) || 0;
    stake += s;
    payout += tradePnl(o);
  }
  if (stake <= 0) return 0;
  return (payout / stake) * 100;
}

/** Total staked across settled trades — turnover, not P&L. */
export function totalTurnover(orders: CompletedOrder[]): number {
  return orders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
}

export function calculateTradingStats(orders: CompletedOrder[]): TradingStats {
  if (orders.length === 0) {
    return getEmptyStats();
  }

  // Filter out cancelled orders for main statistics
  const validOrders = orders.filter(isDecided);

  const wins = validOrders.filter(o => o.status === "WIN");
  const losses = validOrders.filter(o => o.status === "LOSS");
  const draws = orders.filter(o => !isDecided(o));

  const totalTrades = validOrders.length;
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  // Calculate P/L — one definition, shared with every other calculation here.
  const totalPnL = validOrders.reduce((sum, o) => sum + tradePnl(o), 0);

  // Average amounts
  const avgWinAmount = winCount > 0
    ? wins.reduce((sum, o) => sum + tradePnl(o), 0) / winCount
    : 0;
  const avgLossAmount = lossCount > 0
    ? losses.reduce((sum, o) => sum + Math.abs(tradePnl(o)), 0) / lossCount
    : 0;

  // Best/worst trades
  const profits = validOrders.map(tradePnl);
  const bestTrade = profits.length > 0 ? Math.max(...profits) : 0;
  const worstTrade = profits.length > 0 ? Math.min(...profits) : 0;

  // Calculate streaks
  const { currentStreak, isWinningStreak, longestWinStreak, longestLossStreak } =
    calculateStreaks(validOrders);

  // Profit factor
  const grossProfit = wins.reduce((sum, o) => sum + tradePnl(o), 0);
  const grossLoss = losses.reduce((sum, o) => sum + Math.abs(tradePnl(o)), 0);
  // No losses at all is not an infinite profit factor, it is an unmeasurable one.
  // Infinity renders as the literal string "Infinity" in the UI — exactly what the
  // old Sortino card was doing on screen.
  //
  // DISPLAY CONTRACT: 0 here is ambiguous — it means both "no profit" and "no losses
  // to divide by". The UI must check `lossCount === 0` and render an em dash rather
  // than a misleading 0.00. Same for sharpe/sortino/recoveryFactor, which return 0
  // when their denominator is undefined.
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

  // Average trade duration
  const avgTradeDuration = calculateAvgDuration(validOrders);

  return {
    totalTrades,
    wins: winCount,
    losses: lossCount,
    draws: draws.length,
    winRate,
    totalPnL,
    avgWinAmount,
    avgLossAmount,
    bestTrade,
    worstTrade,
    currentStreak,
    isWinningStreak,
    longestWinStreak,
    longestLossStreak,
    profitFactor,
    avgTradeDuration,
  };
}

/**
 * Get empty stats object
 */
function getEmptyStats(): TradingStats {
  return {
    totalTrades: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    winRate: 0,
    totalPnL: 0,
    avgWinAmount: 0,
    avgLossAmount: 0,
    bestTrade: 0,
    worstTrade: 0,
    currentStreak: 0,
    isWinningStreak: false,
    longestWinStreak: 0,
    longestLossStreak: 0,
    profitFactor: 0,
    avgTradeDuration: 0,
  };
}

// ============================================================================
// STREAK CALCULATIONS
// ============================================================================

interface StreakResult {
  currentStreak: number;
  isWinningStreak: boolean;
  longestWinStreak: number;
  longestLossStreak: number;
}

/**
 * Calculate win/loss streaks from orders (ordered by time)
 */
export function calculateStreaks(orders: CompletedOrder[]): StreakResult {
  if (orders.length === 0) {
    return {
      currentStreak: 0,
      isWinningStreak: false,
      longestWinStreak: 0,
      longestLossStreak: 0,
    };
  }

  // Sort by expiry time (most recent first)
  const sortedOrders = [...orders].sort(
    (a, b) => b.expiryTime.getTime() - a.expiryTime.getTime()
  );

  let currentStreak = 0;
  let isWinningStreak = false;
  let longestWinStreak = 0;
  let longestLossStreak = 0;

  let winStreak = 0;
  let lossStreak = 0;

  // Calculate current streak from most recent trades
  let foundCurrentStreak = false;
  for (const order of sortedOrders) {
    if (order.status === "WIN") {
      if (!foundCurrentStreak) {
        currentStreak++;
        isWinningStreak = true;
      } else if (!isWinningStreak) {
        break;
      } else {
        currentStreak++;
      }
      winStreak++;
      lossStreak = 0;
    } else if (order.status === "LOSS") {
      if (!foundCurrentStreak) {
        currentStreak++;
        isWinningStreak = false;
        foundCurrentStreak = true;
      } else if (isWinningStreak) {
        break;
      } else {
        currentStreak++;
      }
      lossStreak++;
      winStreak = 0;
    }

    if (!foundCurrentStreak && order.status !== "WIN" && order.status !== "LOSS") {
      continue;
    }
    foundCurrentStreak = true;

    longestWinStreak = Math.max(longestWinStreak, winStreak);
    longestLossStreak = Math.max(longestLossStreak, lossStreak);
  }

  // Recalculate longest streaks from full history
  const { maxWin, maxLoss } = calculateLongestStreaks(sortedOrders);

  return {
    currentStreak,
    isWinningStreak,
    longestWinStreak: Math.max(longestWinStreak, maxWin),
    longestLossStreak: Math.max(longestLossStreak, maxLoss),
  };
}

function calculateLongestStreaks(orders: CompletedOrder[]): { maxWin: number; maxLoss: number } {
  let maxWin = 0;
  let maxLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;

  // Sort by entry time (oldest first)
  const sortedOrders = [...orders].sort(
    (a, b) => a.entryTime.getTime() - b.entryTime.getTime()
  );

  for (const order of sortedOrders) {
    if (order.status === "WIN") {
      currentWin++;
      currentLoss = 0;
      maxWin = Math.max(maxWin, currentWin);
    } else if (order.status === "LOSS") {
      currentLoss++;
      currentWin = 0;
      maxLoss = Math.max(maxLoss, currentLoss);
    }
  }

  return { maxWin, maxLoss };
}

// ============================================================================
// SYMBOL STATISTICS
// ============================================================================

/**
 * Calculate statistics grouped by symbol
 */
export function calculateStatsBySymbol(orders: CompletedOrder[]): SymbolStats[] {
  const symbolMap = new Map<string, CompletedOrder[]>();

  // Group orders by symbol
  for (const order of orders) {
    const symbol = order.symbol;
    if (!symbolMap.has(symbol)) {
      symbolMap.set(symbol, []);
    }
    symbolMap.get(symbol)!.push(order);
  }

  // Calculate stats for each symbol
  const result: SymbolStats[] = [];
  for (const [symbol, symbolOrders] of symbolMap) {
    const stats = calculateTradingStats(symbolOrders);
    result.push({ ...stats, symbol });
  }

  // Sort by total P/L descending
  result.sort((a, b) => b.totalPnL - a.totalPnL);

  return result;
}

// ============================================================================
// TIME-BASED STATISTICS
// ============================================================================

/**
 * Calculate statistics by hour of day
 */
export function calculateStatsByHour(orders: CompletedOrder[]): TimeOfDayStats[] {
  const hourMap = new Map<number, CompletedOrder[]>();

  // Initialize all hours
  for (let h = 0; h < 24; h++) {
    hourMap.set(h, []);
  }

  // Group orders by hour
  for (const order of orders) {
    const hour = order.entryTime.getHours();
    hourMap.get(hour)!.push(order);
  }

  // Calculate stats for each hour
  const result: TimeOfDayStats[] = [];
  for (let hour = 0; hour < 24; hour++) {
    const hourOrders = hourMap.get(hour)!;
    const validOrders = hourOrders.filter(o => o.status === "WIN" || o.status === "LOSS");
    const wins = validOrders.filter(o => o.status === "WIN").length;
    const trades = validOrders.length;
    const winRate = trades > 0 ? (wins / trades) * 100 : 0;
    const avgPnL = validOrders.length > 0
      ? validOrders.reduce((sum, o) => sum + tradePnl(o), 0) / validOrders.length
      : 0;

    result.push({
      hour,
      trades,
      wins,
      winRate,
      avgPnL,
    });
  }

  return result;
}

/**
 * Calculate statistics by day of week
 */
export function calculateStatsByDay(orders: CompletedOrder[]): DayOfWeekStats[] {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayMap = new Map<number, CompletedOrder[]>();

  // Initialize all days
  for (let d = 0; d < 7; d++) {
    dayMap.set(d, []);
  }

  // Group orders by day of week
  for (const order of orders) {
    const day = order.entryTime.getDay();
    dayMap.get(day)!.push(order);
  }

  // Calculate stats for each day
  const result: DayOfWeekStats[] = [];
  for (let day = 0; day < 7; day++) {
    const dayOrders = dayMap.get(day)!;
    const validOrders = dayOrders.filter(o => o.status === "WIN" || o.status === "LOSS");
    const wins = validOrders.filter(o => o.status === "WIN").length;
    const trades = validOrders.length;
    const winRate = trades > 0 ? (wins / trades) * 100 : 0;
    const avgPnL = validOrders.length > 0
      ? validOrders.reduce((sum, o) => sum + tradePnl(o), 0) / validOrders.length
      : 0;

    result.push({
      day,
      dayName: dayNames[day],
      trades,
      wins,
      winRate,
      avgPnL,
    });
  }

  return result;
}

// ============================================================================
// EQUITY CURVE
// ============================================================================

export interface EquityPoint {
  time: Date;
  balance: number;
  trade: CompletedOrder | null;
  drawdown: number;
  drawdownPercent: number;
}

/**
 * Calculate equity curve data points
 */
export function calculateEquityCurve(
  orders: CompletedOrder[],
  startingBalance: number
): EquityPoint[] {
  if (orders.length === 0) {
    return [{
      time: new Date(),
      balance: startingBalance,
      trade: null,
      drawdown: 0,
      drawdownPercent: 0,
    }];
  }

  // Sort by expiry time (oldest first)
  const sortedOrders = [...orders].sort(
    (a, b) => a.expiryTime.getTime() - b.expiryTime.getTime()
  );

  const result: EquityPoint[] = [];
  let balance = startingBalance;
  let peakBalance = startingBalance;

  // Add starting point
  result.push({
    time: sortedOrders[0].entryTime,
    balance: startingBalance,
    trade: null,
    drawdown: 0,
    drawdownPercent: 0,
  });

  // Add point for each trade
  for (const order of sortedOrders) {
    const pnl = tradePnl(order);
    balance += pnl;
    peakBalance = Math.max(peakBalance, balance);

    const drawdown = peakBalance - balance;
    const drawdownPercent = peakBalance > 0 ? (drawdown / peakBalance) * 100 : 0;

    result.push({
      time: order.expiryTime,
      balance,
      trade: order,
      drawdown,
      drawdownPercent,
    });
  }

  return result;
}

// ============================================================================
// ADVANCED METRICS
// ============================================================================

/**
 * Calculate Sharpe Ratio (simplified version using trade returns)
 */
export function calculateSharpeRatio(
  orders: CompletedOrder[],
  riskFreeRate: number = 0
): number {
  const validOrders = orders.filter(o => o.status === "WIN" || o.status === "LOSS");
  if (validOrders.length < 2) return 0;

  // Return per unit staked, so a $10 and a $3,000 trade weigh the same.
  const returns = validOrders
    .filter((o) => (Number(o.amount) || 0) > 0)
    .map((o) => tradePnl(o) / o.amount);
  if (returns.length < 2) return 0;

  // Calculate mean return
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Calculate standard deviation
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Zero dispersion means the ratio is undefined, not infinite. Returning Infinity
  // is how "Sortino ratio: Infinity" ended up rendered on the page.
  if (stdDev === 0) return 0;

  // Sharpe Ratio = (Mean Return - Risk Free Rate) / Std Dev
  return (meanReturn - riskFreeRate) / stdDev;
}

/**
 * Calculate Sortino Ratio (only considers downside volatility)
 */
export function calculateSortinoRatio(
  orders: CompletedOrder[],
  riskFreeRate: number = 0
): number {
  const validOrders = orders.filter(o => o.status === "WIN" || o.status === "LOSS");
  if (validOrders.length < 2) return 0;

  // Return per unit staked, so a $10 and a $3,000 trade weigh the same.
  const returns = validOrders
    .filter((o) => (Number(o.amount) || 0) > 0)
    .map((o) => tradePnl(o) / o.amount);
  if (returns.length < 2) return 0;

  // Calculate mean return
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

  // Calculate downside deviation (only negative returns)
  const negativeReturns = returns.filter(r => r < 0);
  // No losing trades at all => no downside to measure. Undefined, not infinite.
  if (negativeReturns.length === 0) return 0;

  const downsideVariance = negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length;
  const downsideDev = Math.sqrt(downsideVariance);

  if (downsideDev === 0) return 0;

  return (meanReturn - riskFreeRate) / downsideDev;
}

/**
 * Calculate Maximum Drawdown
 */
export function calculateMaxDrawdown(
  orders: CompletedOrder[],
  startingBalance: number
): { maxDrawdown: number; maxDrawdownPercent: number } {
  const equityCurve = calculateEquityCurve(orders, startingBalance);

  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;

  for (const point of equityCurve) {
    if (point.drawdown > maxDrawdown) {
      maxDrawdown = point.drawdown;
      maxDrawdownPercent = point.drawdownPercent;
    }
  }

  return { maxDrawdown, maxDrawdownPercent };
}

/**
 * Calculate Recovery Factor
 * Recovery Factor = Net Profit / Max Drawdown
 */
export function calculateRecoveryFactor(
  orders: CompletedOrder[],
  startingBalance: number
): number {
  const stats = calculateTradingStats(orders);
  const { maxDrawdown } = calculateMaxDrawdown(orders, startingBalance);

  if (maxDrawdown === 0) return 0;

  return stats.totalPnL / maxDrawdown;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate average trade duration in seconds
 */
function calculateAvgDuration(orders: CompletedOrder[]): number {
  if (orders.length === 0) return 0;

  const totalDuration = orders.reduce((sum, o) => {
    const duration = (o.expiryTime.getTime() - o.entryTime.getTime()) / 1000;
    return sum + duration;
  }, 0);

  return totalDuration / orders.length;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * Format percentage with specified decimal places
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, currency: string = "USDT"): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${currency}`;
}

/**
 * Get performance color based on value
 */
export function getPerformanceColor(value: number): string {
  if (value > 0) return "text-green-500";
  if (value < 0) return "text-red-500";
  return "text-zinc-400";
}

/**
 * Get win rate color based on percentage
 */
export function getWinRateColor(winRate: number): string {
  if (winRate >= 60) return "text-green-500";
  if (winRate >= 50) return "text-yellow-500";
  if (winRate >= 40) return "text-orange-500";
  return "text-red-500";
}
