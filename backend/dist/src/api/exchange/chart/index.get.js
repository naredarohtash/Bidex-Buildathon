"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.getHistoricalOHLCV = getHistoricalOHLCV;
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const query_1 = require("@b/utils/query");
const utils_1 = require("./utils");
const utils_2 = require("../utils");
let lastOtcServerTime = null;
let lastOtcFetchTime = null;
const OTC_DEBUG = process.env.OTC_DEBUG === "true";
function logOtcDebug(message) {
    if (OTC_DEBUG)
        console.log(`[OTC] ${message}`);
}
exports.metadata = {
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
                            properties: utils_1.baseChartDataPointSchema,
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Chart"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { query } = data;
    const ohlcv = await getHistoricalOHLCV(query.symbol, query.interval, Math.round(Number(query.from)), Math.round(Number(query.to)), Math.round(Number(query.duration)));
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
function aggregateCandles(candles1m, interval) {
    const intervalMs = (0, utils_1.intervalToMilliseconds)(interval);
    if (intervalMs <= 60000)
        return candles1m;
    const aggregated = [];
    const map = new Map();
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
        }
        else {
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
function vortexToTvResolution(interval) {
    const map = {
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
function expand1mToSeconds(candles1m, interval) {
    const stepMs = interval === "5s" ? 5000 : interval === "10s" ? 10000 : interval === "15s" ? 15000 : interval === "30s" ? 30000 : 15000;
    const expanded = [];
    const steps = 60000 / stepMs;
    function getSeededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }
    for (const candle of candles1m) {
        const [timestamp, open, high, low, close, volume] = candle;
        const subVolume = (volume || 0) / steps;
        const highStep = Math.floor(getSeededRandom(timestamp + 1) * steps);
        let lowStep = Math.floor(getSeededRandom(timestamp + 2) * steps);
        if (lowStep === highStep && steps > 1) {
            lowStep = (lowStep + 1) % steps;
        }
        const pathClose = new Array(steps + 1);
        pathClose[0] = open;
        pathClose[steps] = close;
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
            const standardWick = Math.abs(subClose - subOpen) * 0.3 + (high - low) * 0.04;
            let subHigh = Math.max(subOpen, subClose) + standardWick;
            let subLow = Math.min(subOpen, subClose) - standardWick;
            if (i === highStep) {
                subHigh = high;
            }
            if (i === lowStep) {
                subLow = low;
            }
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
const inFlightOtc = new Map();
class OtcFeedError extends Error {
    constructor(reason) {
        super(`Chart feed temporarily unavailable (${reason})`);
        this.statusCode = 503;
        this.name = "OtcFeedError";
    }
}
async function getOtcCandles(symbol, from, to, interval) {
    try {
        const asset = (0, utils_2.vortexToBidexSymbol)(symbol);
        const isSeconds = interval === "5s" || interval === "10s" || interval === "15s" || interval === "30s";
        const tvResolution = isSeconds ? "1" : vortexToTvResolution(interval);
        const bidexUrl = process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001";
        const bidexApiKey = process.env.BIDEX_API_KEY;
        const otcTimeOffset = global.otcTimeOffset || 0;
        const syncedNow = Date.now() + otcTimeOffset;
        const isRequestingLatest = to >= syncedNow - 60000;
        const adjustedTo = isRequestingLatest ? Math.max(to, syncedNow + 7200000) : to;
        const url = `${bidexUrl}/api/chart?asset=${encodeURIComponent(asset)}&interval=${tvResolution}&from=${from}&to=${adjustedTo}`;
        logOtcDebug(`chart request ${asset} ${tvResolution} ${from}-${adjustedTo}`);
        const pending = inFlightOtc.get(url);
        if (pending)
            return await pending;
        const TOTAL_BUDGET_MS = 7000;
        const deadline = Date.now() + TOTAL_BUDGET_MS;
        const fetchOtc = () => fetch(url, {
            headers: {
                ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
                "Origin": (0, utils_2.getOtcOrigin)()
            },
            signal: AbortSignal.timeout(Math.max(500, deadline - Date.now()))
        });
        const task = (async () => {
            let response;
            try {
                response = await fetchOtc();
            }
            catch (firstErr) {
                const name = firstErr === null || firstErr === void 0 ? void 0 : firstErr.name;
                if (name === "TimeoutError" || name === "AbortError") {
                    console.warn(`[OTC] ${symbol} timed out after ${TOTAL_BUDGET_MS}ms`);
                    throw firstErr;
                }
                console.warn(`[OTC] first attempt failed for ${symbol} (${name || firstErr}); retrying once`);
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
                global.otcTimeOffset = lastOtcServerTime - lastOtcFetchTime;
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
        }
        finally {
            inFlightOtc.delete(url);
        }
    }
    catch (err) {
        console.error(`[OTC] chart fetch failed for ${symbol}:`, err);
        if (err instanceof OtcFeedError)
            throw err;
        throw new OtcFeedError((err === null || err === void 0 ? void 0 : err.name) || String(err));
    }
}
async function getHistoricalOHLCV(symbol, interval, from, to, duration, maxRetries = 3, retryDelay = 1000) {
    const upperSym = symbol ? symbol.toUpperCase() : "";
    const isStandardCcxtCrypto = (upperSym.endsWith("/USDT") || upperSym.endsWith("/BTC") || upperSym.endsWith("/ETH")) && !upperSym.includes("OTC");
    if (upperSym.includes("OTC") || !upperSym.includes("/") || !isStandardCcxtCrypto) {
        return getOtcCandles(symbol, from, to, interval);
    }
    const unblockTime = await (0, utils_2.loadBanStatus)();
    if (await (0, utils_2.handleBanStatus)(unblockTime)) {
        return await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
    }
    const exchange = await exchange_1.default.startExchange();
    if (!exchange) {
        return [];
    }
    const cachedData = await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
    const expectedBars = Math.ceil((to - from) / (0, utils_1.intervalToMilliseconds)(interval));
    if (cachedData.length === expectedBars) {
        return cachedData;
    }
    const missingIntervals = (0, utils_1.findGapsInCachedData)(cachedData, from, to, interval);
    const currentTimestamp = Date.now();
    const intervalMs = (0, utils_1.intervalToMilliseconds)(interval);
    for (const { gapStart, gapEnd } of missingIntervals) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (await (0, utils_2.handleBanStatus)(await (0, utils_2.loadBanStatus)())) {
                    return cachedData;
                }
                const adjustedGapEnd = gapEnd > currentTimestamp - intervalMs
                    ? currentTimestamp - intervalMs
                    : gapEnd;
                let data = [];
                if (interval === "2m" && (!exchange.timeframes || !exchange.timeframes["2m"])) {
                    const intervalMs1m = 60 * 1000;
                    const limit1m = Math.min(1000, Math.ceil((adjustedGapEnd - gapStart) / intervalMs1m) + 10);
                    const rawData1m = await exchange.fetchOHLCV(symbol, "1m", gapStart, limit1m, { until: adjustedGapEnd });
                    data = aggregate1mTo2m(rawData1m);
                }
                else {
                    data = await exchange.fetchOHLCV(symbol, interval, gapStart, 500, { until: adjustedGapEnd });
                }
                await (0, utils_1.saveOHLCVToCache)(symbol, interval, data);
                break;
            }
            catch (e) {
                if (attempt < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelay));
                    retryDelay *= 2;
                }
                else {
                    throw new Error("Unable to fetch historical data at this time");
                }
            }
        }
    }
    const resultData = await (0, utils_1.getCachedOHLCV)(symbol, interval, from, to);
    if (to >= currentTimestamp - intervalMs && exchange) {
        try {
            const latestData = await exchange.fetchOHLCV(symbol, interval, currentTimestamp - intervalMs * 2, 2);
            if (latestData && latestData.length > 0) {
                const lastCachedTimestamp = resultData.length > 0 ? resultData[resultData.length - 1][0] : 0;
                for (const candle of latestData) {
                    if (candle[0] > lastCachedTimestamp) {
                        resultData.push(candle);
                    }
                    else if (candle[0] === lastCachedTimestamp) {
                        resultData[resultData.length - 1] = candle;
                    }
                }
            }
        }
        catch (e) {
            console.error("Error fetching ongoing candle from exchange:", e);
        }
    }
    return resultData;
}
function aggregate1mTo2m(candles1m) {
    if (!candles1m || candles1m.length === 0) {
        return [];
    }
    const sorted1m = [...candles1m].sort((a, b) => a[0] - b[0]);
    const aggregatedMap = new Map();
    for (const candle of sorted1m) {
        const [timestamp, open, high, low, close, volume] = candle;
        const t2m = Math.floor(timestamp / 120000) * 120000;
        const existing = aggregatedMap.get(t2m);
        if (!existing) {
            aggregatedMap.set(t2m, [t2m, open, high, low, close, volume]);
        }
        else {
            existing[2] = Math.max(existing[2], high);
            existing[3] = Math.min(existing[3], low);
            existing[4] = close;
            existing[5] = (existing[5] || 0) + (volume || 0);
        }
    }
    return Array.from(aggregatedMap.values()).sort((a, b) => a[0] - b[0]);
}
