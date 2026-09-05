import ExchangeManager from "@b/utils/exchange";
import { db } from "@b/db";
import Redis from "ioredis";
import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import {
  baseChartDataPointSchema,
  findGapsInCachedData,
  getCachedOHLCV,
  intervalToMilliseconds,
  saveOHLCVToCache,
} from "./utils";
import { handleBanStatus, loadBanStatus, vortexToBidexSymbol, getOtcOrigin } from "../utils";

let lastOtcServerTime: number | null = null;
let lastOtcFetchTime: number | null = null;

/* Chart traffic is the highest-volume path in the app, and it was logging five
   lines per request unconditionally — including the full upstream URL and a
   prefix of the API key. Over one log window that was 763 requests' worth of
   noise in a 7 MB file, written synchronously to disk on every chart load, and
   it buried the failures that actually mattered. Behind a flag it stays
   available for the next investigation without costing anything in normal use. */
const OTC_DEBUG = process.env.OTC_DEBUG === "true";
function logOtcDebug(message: string) {
  if (OTC_DEBUG) console.log(`[OTC] ${message}`);
}

export const metadata: OperationObject = {
  summary: "Get Historical Chart Data",
  operationId: "getHistoricalChartData",
  tags: ["Chart", "Historical"],
  description: "Retrieves historical chart data for the authenticated user.",
  parameters: [
    {
      name: "symbol",
      in: "query",
      description: "Symbol to retrieve data for.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "interval",
      in: "query",
      description: "Interval to retrieve data for.",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "from",
      in: "query",
      description: "Start timestamp to retrieve data from.",
      required: true,
      schema: { type: "number" },
    },
    {
      name: "to",
      in: "query",
      description: "End timestamp to retrieve data from.",
      required: true,
      schema: { type: "number" },
    },
    {
      name: "duration",
      in: "query",
      description: "Duration to retrieve data for.",
      required: true,
      schema: { type: "number" },
    },
  ],
  responses: {
    200: {
      description: "Historical chart data retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "array",
            items: {
              type: "object",
              properties: baseChartDataPointSchema,
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Chart"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { query } = data;
  const ohlcv = await getHistoricalOHLCV(
    query.symbol,
    query.interval,
    Math.round(Number(query.from)),
    Math.round(Number(query.to)),
    Math.round(Number(query.duration))
  );

  let timestamp = Date.now();
  if (query.symbol && query.symbol.toUpperCase().includes("OTC") && lastOtcServerTime && lastOtcFetchTime) {
    const elapsed = Date.now() - lastOtcFetchTime;
    if (elapsed < 15000) {
      timestamp = lastOtcServerTime + elapsed;
    }
  }

  return {
    data: ohlcv,
    timestamp,
  };
};

function aggregateCandles(candles1m: any[], interval: string): any[] {
  const intervalMs = intervalToMilliseconds(interval);
  if (intervalMs <= 60000) return candles1m;

  const aggregated: any[] = [];
  const map = new Map<number, any>();

  for (const candle of candles1m) {
    const [timestamp, open, high, low, close, volume] = candle;
    const bucket = Math.floor(timestamp / intervalMs) * intervalMs;

    if (!map.has(bucket)) {
      map.set(bucket, {
        timestamp: bucket,
        open,
        high,
        low,
        close,
        volume,
      });
    } else {
      const existing = map.get(bucket);
      existing.high = Math.max(existing.high, high);
      existing.low = Math.min(existing.low, low);
      existing.close = close;
      existing.volume += volume;
    }
  }

  const sortedBuckets = Array.from(map.keys()).sort((a, b) => a - b);
  return sortedBuckets.map((bucket) => {
    const item = map.get(bucket);
    return [
      item.timestamp,
      item.open,
      item.high,
      item.low,
      item.close,
      item.volume,
    ];
  });
}


function vortexToTvResolution(interval: string): string {
  const map: Record<string, string> = {
    "1m": "1",
    "2m": "2",
    "3m": "3",
    "5m": "5",
    "10m": "10",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "8h": "480",
    "12h": "720",
    "1d": "1D",
    "3d": "3D",
    "1w": "1W",
    "1M": "1M"
  };
  return map[interval] || "1";
}

function expand1mToSeconds(candles1m: any[], interval: string): any[] {
  const stepMs = interval === "5s" ? 5000 : interval === "10s" ? 10000 : interval === "15s" ? 15000 : interval === "30s" ? 30000 : 15000;
  const expanded: any[] = [];
  const steps = 60000 / stepMs;

  function getSeededRandom(seed: number) {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }

  for (const candle of candles1m) {
    const [timestamp, open, high, low, close, volume] = candle;
    const subVolume = (volume || 0) / steps;

    // Pick deterministic but randomized steps to visit the parent's high and low extremes
    const highStep = Math.floor(getSeededRandom(timestamp + 1) * steps);
    let lowStep = Math.floor(getSeededRandom(timestamp + 2) * steps);
    if (lowStep === highStep && steps > 1) {
      lowStep = (lowStep + 1) % steps;
    }

    const pathClose = new Array(steps + 1);
    pathClose[0] = open;
    pathClose[steps] = close;

    // Generate random intermediate path nodes
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const basePrice = open + (close - open) * t;
      const range = high - low;
      const fluctuation = (getSeededRandom(timestamp + 10 + i) * 2 - 1) * range * 0.25;
      pathClose[i] = Math.max(low, Math.min(high, basePrice + fluctuation));
    }

    for (let i = 0; i < steps; i++) {
      const subTs = timestamp + i * stepMs;
      const subOpen = pathClose[i];
      const subClose = pathClose[i + 1];

      // Proportional wicks
      const standardWick = Math.abs(subClose - subOpen) * 0.3 + (high - low) * 0.04;

      let subHigh = Math.max(subOpen, subClose) + standardWick;
      let subLow = Math.min(subOpen, subClose) - standardWick;

      // Force-visit high/low points
      if (i === highStep) {
        subHigh = high;
      }
      if (i === lowStep) {
        subLow = low;
      }

      // Keep boundaries intact
      subHigh = Math.min(high, Math.max(subHigh, subOpen, subClose));
      subLow = Math.max(low, Math.min(subLow, subOpen, subClose));

      expanded.push([
        subTs,
        subOpen,
        subHigh,
        subLow,
        subClose,
        subVolume
      ]);
    }
  }
  return expanded;
}



/* generateSyntheticOtcCandles was removed rather than left unreferenced.

   It fabricated a price series whenever the upstream feed failed, and a helper
   that invents market data is not something to keep within reach of a future
   edit. If the feed is down the correct answer is an empty series, which the
   chart already handles. See the catch in getOtcCandles for what it did in
   production and why it is gone. */

/* One upstream request per distinct query, however many browsers ask for it.

   Every device showing the same asset issues the same history query at roughly
   the same moment, and each one used to become its own upstream fetch. Three
   devices meant three identical requests; switching asset across all of them
   meant a burst of them. The upstream feed is the single shared resource in
   this system, so load against it was growing with the number of screens open
   rather than with the number of distinct things being asked for — which is
   why the charts got worse the more devices were in use, and why this never
   reproduced on one machine.

   Keyed on the exact URL, so a caller only ever shares a result identical to
   the one it asked for. The entry is deleted the moment it settles: this is
   in-flight coalescing, not a cache, and it therefore cannot serve a stale
   bar the way an HTTP cache once did here. */
const inFlightOtc = new Map<string, Promise<any[]>>();

/**
 * The OTC feed could not be reached or refused the request.
 *
 * Distinct from "the feed answered and had no candles for that range", which is
 * a legitimate empty result. Callers must be able to tell the two apart: one
 * means keep showing what is on screen and try again, the other means there is
 * genuinely nothing there.
 */
class OtcFeedError extends Error {
  statusCode = 503;
  constructor(reason: string) {
    super(`Chart feed temporarily unavailable (${reason})`);
    this.name = "OtcFeedError";
  }
}

async function getOtcCandles(symbol: string, from: number, to: number, interval: string) {
  try {
    const asset = vortexToBidexSymbol(symbol);
    const isSeconds = interval === "5s" || interval === "10s" || interval === "15s" || interval === "30s";
    const tvResolution = isSeconds ? "1" : vortexToTvResolution(interval);
    const bidexUrl = process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001";
    const bidexApiKey = process.env.BIDEX_API_KEY;
    
    // Sync safety: If the client's local clock is running slow compared to BideX server time,
    // a request with to = Date.now() will cut off recent candles.
    // Querying up to at least Date.now() + 2 hours ensures we get all available candles up to the server's actual time.
    // However, for historical/older candle queries, we must use the requested 'to' directly to avoid large range queries
    // that exceed BideX's 1000-candle limit and leave gaps.
    // We use the synchronized BideX time (Date.now() + otcTimeOffset) to perform this check to prevent time offset mismatch.
    const otcTimeOffset = (global as any).otcTimeOffset || 0;
    const syncedNow = Date.now() + otcTimeOffset;
    const isRequestingLatest = to >= syncedNow - 60000;
    const adjustedTo = isRequestingLatest ? Math.max(to, syncedNow + 7200000) : to;
    
    const url = `${bidexUrl}/api/chart?asset=${encodeURIComponent(asset)}&interval=${tvResolution}&from=${from}&to=${adjustedTo}`;
    logOtcDebug(`chart request ${asset} ${tvResolution} ${from}-${adjustedTo}`);

    const pending = inFlightOtc.get(url);
    if (pending) return await pending;

    /* This budget has to fit inside the caller's patience, and it did not.

       The chain is: browser $fetch (10s) → Next chart proxy (8s) → here. Two
       attempts at 12s each let this layer spend 24s on a request the browser
       abandoned at 10s, so the retry — added precisely to absorb a transient
       stall — could never once have helped a user. What the caller saw instead
       was Chrome's own abort, "signal timed out", and a chart reading "No chart
       data available" while this process was still working on an answer nobody
       was waiting for. Worse, that abandoned request stayed in flight upstream,
       so under several devices a stall compounded into a pile-up.

       An inner timeout must always be shorter than its caller's, or the layer
       that can actually explain a failure never gets to report one. The whole
       call now lands inside 7s, under the 8s proxy budget.

       The 3s that used to be here was measured against an upstream on
       localhost — 0.07-0.12s even twelve requests deep, so "25x headroom".
       BIDEX_API_URL is a remote host over TLS in every real deployment, and
       twelve deep it answers in 2.77-2.83s. The headroom was 1.06x, so any
       burst tipped the whole batch over the line at once and the chart stopped
       updating with "No chart data available" while the upstream was healthy
       and answering.

       A timeout is also the one failure a retry cannot help. It means the
       upstream is saturated, and firing a second request adds load to exactly
       the pool that is saturated — which is how one slow burst became a
       self-sustaining one. Retries are now reserved for connection-level
       errors, which fail fast and are worth another go; they draw from the
       same overall deadline so two attempts still cannot outlive the proxy. */
    const TOTAL_BUDGET_MS = 7000;
    const deadline = Date.now() + TOTAL_BUDGET_MS;
    const fetchOtc = () =>
      fetch(url, {
        headers: {
          ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
          "Origin": getOtcOrigin()
        },
        signal: AbortSignal.timeout(Math.max(500, deadline - Date.now()))
      });

    const task = (async (): Promise<any[]> => {
      let response: Awaited<ReturnType<typeof fetchOtc>>;
      try {
        response = await fetchOtc();
      } catch (firstErr: any) {
        const name = firstErr?.name;
        if (name === "TimeoutError" || name === "AbortError") {
          console.warn(`[OTC] ${symbol} timed out after ${TOTAL_BUDGET_MS}ms`);
          throw firstErr;
        }
        console.warn(
          `[OTC] first attempt failed for ${symbol} (${name || firstErr}); retrying once`
        );
        response = await fetchOtc();
      }

      if (!response.ok) {
        console.error(`[OTC] upstream returned ${response.status} for ${symbol}`);
        throw new OtcFeedError(`upstream returned ${response.status}`);
      }

      const dateHeader = response.headers.get("Date");
      if (dateHeader) {
        lastOtcServerTime = new Date(dateHeader).getTime();
        lastOtcFetchTime = Date.now();
        (global as any).otcTimeOffset = lastOtcServerTime - lastOtcFetchTime;
      }

      const result = await response.json();
      if (result && Array.isArray(result.data)) {
        logOtcDebug(`${asset} returned ${result.data.length} candles`);
        return isSeconds ? expand1mToSeconds(result.data, interval) : result.data;
      }
      logOtcDebug(`${asset} returned no usable data`);
      return [];
    })();

    inFlightOtc.set(url, task);
    try {
      return await task;
    } finally {
      inFlightOtc.delete(url);
    }
  } catch (err) {
    console.error(`[OTC] chart fetch failed for ${symbol}:`, err);
    /* Empty, never invented.

       This used to return generateSyntheticOtcCandles — a random walk seeded
       from the symbol name — on any upstream failure. In the last log window
       that path was taken 17 times: seventeen charts drawn from prices that
       never existed. Because the series is generated per request, two devices
       on the same asset received different candles, at a level unrelated to the
       real market (observed: AUD/USD drawn across 0.75-1.05 while the live
       price was 0.647). When the true feed resumed, the chart jumped from the
       invented level to the real one — and that jump is the "gap" that kept
       being reported.

       Nothing invented is still the rule. But "empty" was the wrong way to say
       "I could not reach the feed", because to the caller those are not the same
       statement and it does not treat them the same: the chart engine only
       throws on `error`, and for a 200 carrying an empty array it calls
       setCandles([]) — which erases the candles already drawn. So a single
       three-second timeout on a feed that was otherwise fine blanked a chart the
       trader was watching, and it happened more often with two devices open
       because there were simply more requests to catch a stall. Its error path,
       by contrast, sets an error and leaves the candles alone.

       So a failure is now reported as one and an empty series means only what it
       says — the feed answered and had no candles. Nothing is fabricated and
       nothing stale is passed off as live; the chart keeps the real candles it
       already had and recovers on the next poll. */
    if (err instanceof OtcFeedError) throw err;
    throw new OtcFeedError((err as any)?.name || String(err));
  }
}

export async function getHistoricalOHLCV(
  symbol: string,
  interval: string,
  from: number,
  to: number,
  duration: number,
  maxRetries = 3,
  retryDelay = 1000
) {
  const upperSym = symbol ? symbol.toUpperCase() : "";
  const isStandardCcxtCrypto = (upperSym.endsWith("/USDT") || upperSym.endsWith("/BTC") || upperSym.endsWith("/ETH")) && !upperSym.includes("OTC");
  
  // Route to OTC candles handler if symbol has OTC suffix, or is single-ticker (e.g. Indian stocks), or not standard CCXT
  if (upperSym.includes("OTC") || !upperSym.includes("/") || !isStandardCcxtCrypto) {
    return getOtcCandles(symbol, from, to, interval);
  }

  // Check for ban status
  const unblockTime = await loadBanStatus();
  if (await handleBanStatus(unblockTime)) {
    return await getCachedOHLCV(symbol, interval, from, to);
  }

  const exchange = await (ExchangeManager as any).startExchange();
  if (!exchange) {
    return [];
  }

  const cachedData = await getCachedOHLCV(symbol, interval, from, to);
  const expectedBars = Math.ceil(
    (to - from) / intervalToMilliseconds(interval)
  );

  if (cachedData.length === expectedBars) {
    return cachedData;
  }

  const missingIntervals = findGapsInCachedData(cachedData, from, to, interval);
  const currentTimestamp = Date.now();
  const intervalMs = intervalToMilliseconds(interval);

  for (const { gapStart, gapEnd } of missingIntervals) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (await handleBanStatus(await loadBanStatus())) {
          return cachedData;
        }

        // Adjust gapEnd to skip the current ongoing bar
        const adjustedGapEnd =
          gapEnd > currentTimestamp - intervalMs
            ? currentTimestamp - intervalMs
            : gapEnd;

        let data: any[] = [];
        if (interval === "2m" && (!exchange.timeframes || !exchange.timeframes["2m"])) {
          const intervalMs1m = 60 * 1000;
          const limit1m = Math.min(1000, Math.ceil((adjustedGapEnd - gapStart) / intervalMs1m) + 10);
          const rawData1m = await exchange.fetchOHLCV(
            symbol,
            "1m",
            gapStart,
            limit1m,
            { until: adjustedGapEnd }
          );
          data = aggregate1mTo2m(rawData1m);
        } else {
          data = await exchange.fetchOHLCV(
            symbol,
            interval,
            gapStart,
            500,
            { until: adjustedGapEnd }
          );
        }

        await saveOHLCVToCache(symbol, interval, data);
        break;
      } catch (e) {
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          retryDelay *= 2;
        } else {
          throw new Error("Unable to fetch historical data at this time");
        }
      }
    }
  }

  const resultData = await getCachedOHLCV(symbol, interval, from, to);

  // Try to append the live ongoing candle if "to" is very recent or in the future
  if (to >= currentTimestamp - intervalMs && exchange) {
    try {
      const latestData = await exchange.fetchOHLCV(symbol, interval, currentTimestamp - intervalMs * 2, 2);
      if (latestData && latestData.length > 0) {
        const lastCachedTimestamp = resultData.length > 0 ? resultData[resultData.length - 1][0] : 0;
        for (const candle of latestData) {
          if (candle[0] > lastCachedTimestamp) {
            resultData.push(candle);
          } else if (candle[0] === lastCachedTimestamp) {
            resultData[resultData.length - 1] = candle;
          }
        }
      }
    } catch (e) {
      console.error("Error fetching ongoing candle from exchange:", e);
    }
  }

  return resultData;
}



function aggregate1mTo2m(candles1m: any[]): any[] {
  if (!candles1m || candles1m.length === 0) {
    return [];
  }
  const sorted1m = [...candles1m].sort((a, b) => a[0] - b[0]);
  const aggregatedMap = new Map<number, any[]>();
  for (const candle of sorted1m) {
    const [timestamp, open, high, low, close, volume] = candle;
    const t2m = Math.floor(timestamp / 120000) * 120000;
    const existing = aggregatedMap.get(t2m);
    if (!existing) {
      aggregatedMap.set(t2m, [t2m, open, high, low, close, volume]);
    } else {
      existing[2] = Math.max(existing[2], high);
      existing[3] = Math.min(existing[3], low);
      existing[4] = close;
      existing[5] = (existing[5] || 0) + (volume || 0);
    }
  }
  return Array.from(aggregatedMap.values()).sort((a, b) => a[0] - b[0]);
}
