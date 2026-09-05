/**
 * Standard technical indicators, computed from real closes.
 *
 * These exist because the asset-info panel was displaying RSI, MACD and EMA
 * readings that were never calculated from price at all: they were derived from
 * a "sentiment" figure which was itself `40 + (hash(symbol) % 50)`. The values
 * were stable per instrument and meaningless — a trader reading "RSI (14):
 * Neutral" was reading a property of the string "AUD/USD".
 *
 * Every function here returns null rather than a number when there is not enough
 * data to compute it honestly. A short window is the normal case on a freshly
 * opened chart, and an indicator that quietly falls back to a default is how the
 * panel got into this state to begin with.
 */

/** Exponential moving average over `period`, or null if there are too few points. */
export function ema(values: number[], period: number): number | null {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  const k = 2 / (period + 1);
  // Seed with the simple average of the first `period` values, which is the
  // conventional starting point and avoids the first sample dominating.
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i];
  let prev = acc / period;
  for (let i = period; i < values.length; i++) prev = values[i] * k + prev * (1 - k);
  return prev;
}

/** Full EMA series, needed because MACD's signal line is an EMA of an EMA difference. */
function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  let acc = 0;
  for (let i = 0; i < period; i++) acc += values[i];
  let prev = acc / period;
  const out = [prev];
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * Wilder's RSI over `period` (14 by convention).
 *
 * Wilder's smoothing, not a simple average of gains and losses — the two give
 * visibly different readings and every charting package quotes the former.
 */
export function rsi(values: number[], period = 14): number | null {
  if (!Array.isArray(values) || values.length < period + 1) return null;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }

  // No downside over the whole window is a legitimate 100, not a divide by zero.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** MACD line, signal line and histogram (12/26/9 by convention). */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signal = 9
): { macd: number; signal: number; histogram: number } | null {
  if (!Array.isArray(values) || values.length < slow + signal) return null;

  const fastSeries = emaSeries(values, fast);
  const slowSeries = emaSeries(values, slow);
  if (!fastSeries.length || !slowSeries.length) return null;

  // The two series start at different indices; align them on their tails.
  const n = Math.min(fastSeries.length, slowSeries.length);
  const macdLine: number[] = [];
  for (let i = 0; i < n; i++) {
    macdLine.push(fastSeries[fastSeries.length - n + i] - slowSeries[slowSeries.length - n + i]);
  }
  if (macdLine.length < signal) return null;

  const signalSeries = emaSeries(macdLine, signal);
  if (!signalSeries.length) return null;

  const m = macdLine[macdLine.length - 1];
  const s = signalSeries[signalSeries.length - 1];
  return { macd: m, signal: s, histogram: m - s };
}

export type Bias = "Buy" | "Sell" | "Neutral";

/** RSI read the conventional way: oversold is a buy, overbought a sell. */
export function rsiBias(value: number | null): Bias {
  if (value == null) return "Neutral";
  if (value <= 30) return "Buy";
  if (value >= 70) return "Sell";
  return "Neutral";
}

/**
 * MACD read against its signal line, with a deadband.
 *
 * The deadband is not a nicety. When momentum is steady — a market climbing at a
 * constant rate — the MACD line converges on its signal and the histogram
 * collapses to floating-point residue: measured at -1.78e-15 on a clean linear
 * ramp. Taking the sign of that reports "Sell" on a rising market, decided
 * entirely by the last bit of a double.
 *
 * So a separation has to be a millionth of the MACD's own magnitude before it
 * counts as a direction. Scaling by the magnitude rather than using a fixed
 * epsilon keeps it meaningful across instruments priced at 0.6 and at 60,000.
 */
export function macdBias(m: { macd: number; signal: number } | null): Bias {
  if (!m) return "Neutral";
  const separation = m.macd - m.signal;
  const deadband = Math.max(Math.abs(m.macd) * 1e-6, Number.EPSILON * 100);
  if (Math.abs(separation) <= deadband) return "Neutral";
  return separation > 0 ? "Buy" : "Sell";
}

/** Price against its EMA — above is a buy, below a sell. */
export function emaBias(price: number, value: number | null): Bias {
  if (value == null || !(price > 0)) return "Neutral";
  if (price > value) return "Buy";
  if (price < value) return "Sell";
  return "Neutral";
}

/** The three biases resolved into one summary, by simple majority. */
export function summariseBias(biases: Bias[]): Bias {
  const buys = biases.filter((b) => b === "Buy").length;
  const sells = biases.filter((b) => b === "Sell").length;
  if (buys > sells) return "Buy";
  if (sells > buys) return "Sell";
  return "Neutral";
}
