"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderbookHandler = exports.TradesHandler = exports.OHLCVHandler = exports.TickerHandler = exports.OtcWebSocketSubscriber = exports.metadata = void 0;
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const Websocket_1 = require("@b/handler/Websocket");
const WebsocketHandler = __importStar(require("@b/handler/Websocket"));
const logger_1 = require("@b/utils/logger");
const utils_1 = require("../utils");
const ioredis_1 = __importDefault(require("ioredis"));
const ws_1 = __importDefault(require("ws"));
function logDebugOtc(msg) {
}
let _syncRedis = null;
function getSyncRedis() {
    if (!_syncRedis || _syncRedis.status === "close" || _syncRedis.status === "end") {
        _syncRedis = new ioredis_1.default({
            host: process.env.REDIS_HOST || "127.0.0.1",
            port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
            maxRetriesPerRequest: 1,
            connectTimeout: 1000,
            lazyConnect: true,
        });
        _syncRedis.on("error", () => { });
    }
    return _syncRedis;
}
exports.metadata = {};
const activeSecondsCandles = new Map();
function getIntervalDurationMs(interval) {
    const amount = parseInt(interval.slice(0, -1));
    const unit = interval.slice(-1);
    if (isNaN(amount))
        return 60000;
    switch (unit) {
        case "s": return amount * 1000;
        case "m": return amount * 60000;
        case "h": return amount * 3600000;
        case "d": return amount * 86400000;
        case "w": return amount * 604800000;
        case "M": return amount * 2592000000;
        default: return 60000;
    }
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
async function fetchOtcCandle(symbol, alignedTimestamp, interval) {
    try {
        const asset = (0, utils_1.vortexToBidexSymbol)(symbol);
        const tvResolution = vortexToTvResolution(interval);
        const bidexUrl = (process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
        const bidexApiKey = process.env.BIDEX_API_KEY;
        const durationMs = getIntervalDurationMs(interval);
        const from = alignedTimestamp;
        const to = alignedTimestamp + durationMs;
        const response = await fetch(`${bidexUrl}/api/chart?asset=${encodeURIComponent(asset)}&interval=${tvResolution}&from=${from}&to=${to}`, {
            headers: {
                ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
                "Origin": (0, utils_1.getOtcOrigin)()
            }
        });
        if (!response.ok) {
            const text = await response.text();
            console.error(`[OtcWebSocketSubscriber] fetchOtcCandle returned status ${response.status} for symbol ${symbol}. Response: ${text}`);
            return null;
        }
        const result = await response.json();
        if (result && Array.isArray(result.data) && result.data.length > 0) {
            const match = result.data.find((c) => Number(c[0]) === alignedTimestamp);
            if (match) {
                return [
                    Number(match[0]),
                    Number(match[1]),
                    Number(match[2]),
                    Number(match[3]),
                    Number(match[4]),
                    Number(match[5] || 0)
                ];
            }
        }
        return null;
    }
    catch (err) {
        return null;
    }
}
async function fetchCompletedBase(symbol, alignedBucketTs, tickCandleTs) {
    if (tickCandleTs <= alignedBucketTs) {
        return null;
    }
    try {
        const asset = (0, utils_1.vortexToBidexSymbol)(symbol);
        const bidexUrl = (process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
        const bidexApiKey = process.env.BIDEX_API_KEY;
        const from = alignedBucketTs;
        const to = tickCandleTs - 1;
        const response = await fetch(`${bidexUrl}/api/chart?asset=${encodeURIComponent(asset)}&interval=1&from=${from}&to=${to}`, {
            headers: {
                ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
                "Origin": (0, utils_1.getOtcOrigin)()
            }
        });
        if (!response.ok) {
            return null;
        }
        const result = await response.json();
        if (result && Array.isArray(result.data) && result.data.length > 0) {
            const validCandles = result.data.filter((c) => {
                const t = Number(c[0]);
                return t >= alignedBucketTs && t < tickCandleTs;
            });
            if (validCandles.length > 0) {
                validCandles.sort((a, b) => Number(a[0]) - Number(b[0]));
                let high = -Infinity;
                let low = Infinity;
                let volume = 0;
                for (const c of validCandles) {
                    high = Math.max(high, Number(c[2]));
                    low = Math.min(low, Number(c[3]));
                    volume += Number(c[5] || 0);
                }
                return {
                    open: Number(validCandles[0][1]),
                    high,
                    low,
                    close: Number(validCandles[validCandles.length - 1][4]),
                    volume
                };
            }
        }
        return null;
    }
    catch (err) {
        return null;
    }
}
class OtcWebSocketSubscriber {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.lastMessageAt = 0;
        this.heartbeatTimer = null;
        this.openTimer = null;
        this.reconnectAttempts = 0;
        this.idleCloseTimer = null;
    }
    static getInstance() {
        if (!OtcWebSocketSubscriber.instance) {
            OtcWebSocketSubscriber.instance = new OtcWebSocketSubscriber();
        }
        return OtcWebSocketSubscriber.instance;
    }
    async subscribe(symbol, callback) {
        const cleanSymbol = (0, utils_1.getCleanOtcSymbol)(symbol);
        logDebugOtc(`OtcWebSocketSubscriber.subscribe called for symbol: ${symbol} (clean: ${cleanSymbol})`);
        if (!this.listeners.has(cleanSymbol)) {
            this.listeners.set(cleanSymbol, new Set());
        }
        this.listeners.get(cleanSymbol).add(callback);
        this.cancelIdleClose();
        this.ensureConnected();
        return () => {
            logDebugOtc(`OtcWebSocketSubscriber unsubscribe called for symbol: ${symbol} (clean: ${cleanSymbol})`);
            const set = this.listeners.get(cleanSymbol);
            if (set) {
                set.delete(callback);
                if (set.size === 0) {
                    this.listeners.delete(cleanSymbol);
                }
            }
            if (this.listeners.size === 0) {
                this.scheduleIdleClose();
            }
        };
    }
    scheduleIdleClose() {
        if (this.idleCloseTimer)
            return;
        this.idleCloseTimer = setTimeout(() => {
            this.idleCloseTimer = null;
            if (this.listeners.size > 0)
                return;
            if (!this.ws)
                return;
            logDebugOtc(`Idle for ${OtcWebSocketSubscriber.IDLE_CLOSE_MS}ms, closing WS connection to BideX`);
            try {
                this.ws.close();
            }
            catch (_a) {
            }
            this.ws = null;
            this.stopHeartbeat();
        }, OtcWebSocketSubscriber.IDLE_CLOSE_MS);
    }
    cancelIdleClose() {
        if (this.idleCloseTimer) {
            clearTimeout(this.idleCloseTimer);
            this.idleCloseTimer = null;
        }
    }
    ensureConnected() {
        if (this.ws || this.isConnecting)
            return;
        this.isConnecting = true;
        logDebugOtc(`OtcWebSocketSubscriber.ensureConnected initiating WS connection to BideX...`);
        const bidexUrl = (process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
        const bidexApiKey = process.env.BIDEX_API_KEY;
        const wsUrl = bidexUrl.replace(/^http/, "ws") + "/ws/all" + (bidexApiKey ? `?api_key=${bidexApiKey}` : "");
        try {
            this.ws = new ws_1.default(wsUrl, {
                headers: {
                    Origin: "http://localhost"
                }
            });
            this.openTimer = setTimeout(() => {
                this.openTimer = null;
                if (this.ws && this.ws.readyState === ws_1.default.CONNECTING) {
                    console.error(`[OtcWebSocketSubscriber] connection did not open within ${OtcWebSocketSubscriber.OPEN_TIMEOUT_MS}ms — retrying`);
                    try {
                        this.ws.terminate();
                    }
                    catch (_a) {
                    }
                }
            }, OtcWebSocketSubscriber.OPEN_TIMEOUT_MS);
            this.ws.on("open", () => {
                logDebugOtc(`OtcWebSocketSubscriber successfully connected to BideX WS`);
                console.log(`[OtcWebSocketSubscriber] Connected to BideX WS at ${wsUrl}`);
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.lastMessageAt = Date.now();
                this.clearOpenTimer();
                this.startHeartbeat();
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
            });
            this.ws.on("pong", () => {
                this.lastMessageAt = Date.now();
            });
            this.ws.on("message", (data) => {
                this.lastMessageAt = Date.now();
                try {
                    const tick = JSON.parse(data.toString());
                    if (tick && tick.type === "TICK") {
                        const asset = tick.asset;
                        for (const cleanSymbol of this.listeners.keys()) {
                            if ((0, utils_1.isSymbolMatch)(cleanSymbol, asset)) {
                                const mappedTick = {
                                    symbol: cleanSymbol,
                                    price: tick.price,
                                    timestamp: tick.timestamp || Date.now(),
                                    volume: tick.volume || 0.1,
                                    open: tick.open,
                                    high: tick.high,
                                    low: tick.low,
                                    close: tick.close,
                                    candle_start_ts: tick.candle_start_ts,
                                };
                                const set = this.listeners.get(cleanSymbol);
                                if (set) {
                                    set.forEach((cb) => cb(mappedTick));
                                }
                            }
                        }
                    }
                }
                catch (err) {
                    console.error("[OtcWebSocketSubscriber] Error parsing BideX WS message:", err);
                }
            });
            this.ws.on("close", () => {
                logDebugOtc(`OtcWebSocketSubscriber connection closed`);
                this.stopHeartbeat();
                this.clearOpenTimer();
                this.ws = null;
                this.isConnecting = false;
                this.scheduleReconnect();
            });
            this.ws.on("error", (err) => {
                console.error("[OtcWebSocketSubscriber] socket error:", err);
                if (this.ws) {
                    try {
                        this.ws.terminate();
                    }
                    catch (_a) {
                    }
                }
            });
        }
        catch (err) {
            console.error("[OtcWebSocketSubscriber] Failed to initialize WS:", err);
            this.stopHeartbeat();
            this.clearOpenTimer();
            this.ws = null;
            this.isConnecting = false;
            this.scheduleReconnect();
        }
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            const ws = this.ws;
            if (!ws || ws.readyState !== ws_1.default.OPEN)
                return;
            const silentFor = Date.now() - this.lastMessageAt;
            if (silentFor > OtcWebSocketSubscriber.STALE_MS) {
                console.error(`[OtcWebSocketSubscriber] no data for ${Math.round(silentFor / 1000)}s — terminating to force reconnect`);
                try {
                    ws.terminate();
                }
                catch (_a) {
                }
                return;
            }
            try {
                ws.ping();
            }
            catch (_b) {
            }
        }, OtcWebSocketSubscriber.HEARTBEAT_MS);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    clearOpenTimer() {
        if (this.openTimer) {
            clearTimeout(this.openTimer);
            this.openTimer = null;
        }
    }
    getHealth() {
        var _a;
        const connected = ((_a = this.ws) === null || _a === void 0 ? void 0 : _a.readyState) === ws_1.default.OPEN;
        const silentForMs = this.lastMessageAt ? Date.now() - this.lastMessageAt : null;
        const listening = this.listeners.size > 0;
        return {
            connected,
            listening,
            symbols: this.listeners.size,
            silentForMs,
            reconnectAttempts: this.reconnectAttempts,
            healthy: !listening ||
                (connected &&
                    silentForMs !== null &&
                    silentForMs < OtcWebSocketSubscriber.STALE_MS),
        };
    }
    scheduleReconnect() {
        if (this.listeners.size === 0)
            return;
        if (this.reconnectTimer)
            return;
        const delay = Math.min(1000 * 2 ** this.reconnectAttempts, OtcWebSocketSubscriber.MAX_BACKOFF_MS);
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.ensureConnected();
        }, delay);
    }
}
exports.OtcWebSocketSubscriber = OtcWebSocketSubscriber;
OtcWebSocketSubscriber.HEARTBEAT_MS = 8000;
OtcWebSocketSubscriber.STALE_MS = 25000;
OtcWebSocketSubscriber.OPEN_TIMEOUT_MS = 15000;
OtcWebSocketSubscriber.MAX_BACKOFF_MS = 30000;
OtcWebSocketSubscriber.IDLE_CLOSE_MS = 300000;
function anyClientSubscribedTo(type, symbol, interval) {
    var _a;
    for (const want of clientSubscriptions()) {
        if (want === UNREADABLE_REGISTRY)
            return true;
        if (want.type === type &&
            want.symbol === symbol &&
            ((_a = want.interval) !== null && _a !== void 0 ? _a : undefined) === (interval !== null && interval !== void 0 ? interval : undefined)) {
            return true;
        }
    }
    return false;
}
const UNREADABLE_REGISTRY = Symbol("unreadable-registry");
function* clientSubscriptions() {
    var _a, _b, _c;
    let routeClients;
    try {
        routeClients = (_b = (_a = WebsocketHandler === null || WebsocketHandler === void 0 ? void 0 : WebsocketHandler.clients) === null || _a === void 0 ? void 0 : _a.get) === null || _b === void 0 ? void 0 : _b.call(_a, `/api/exchange/market`);
    }
    catch (_d) {
        yield UNREADABLE_REGISTRY;
        return;
    }
    if (!routeClients) {
        yield UNREADABLE_REGISTRY;
        return;
    }
    const records = typeof routeClients.values === "function" ? routeClients.values() : routeClients;
    let found = 0;
    for (const record of records) {
        const client = Array.isArray(record) ? record[1] : record;
        const subs = client === null || client === void 0 ? void 0 : client.subscriptions;
        if (!subs)
            continue;
        const entries = typeof subs.values === "function" ? subs.values() : subs;
        for (const entry of entries) {
            let parsed = entry;
            if (typeof entry === "string") {
                try {
                    parsed = JSON.parse(entry);
                }
                catch (_e) {
                    continue;
                }
            }
            if (!parsed || typeof parsed !== "object")
                continue;
            if (typeof parsed.type !== "string" || typeof parsed.symbol !== "string")
                continue;
            found++;
            yield {
                type: parsed.type,
                symbol: parsed.symbol,
                interval: (_c = parsed.interval) !== null && _c !== void 0 ? _c : undefined,
                limit: typeof parsed.limit === "number" ? parsed.limit : undefined,
            };
        }
    }
    if (found === 0 && (0, Websocket_1.hasClients)(`/api/exchange/market`)) {
        yield UNREADABLE_REGISTRY;
    }
}
class BaseMarketDataHandler {
    static streamKey(symbol, type, interval, limit) {
        return `${symbol}:${type}${interval ? `:${interval}` : ""}${limit ? `:${limit}` : ""}`;
    }
    startStreamSupervisor() {
        if (this.supervisorTimer)
            return;
        this.supervisorTimer = setInterval(() => {
            try {
                if (!this.handledType)
                    return;
                if (!(0, Websocket_1.hasClients)(`/api/exchange/market`))
                    return;
                for (const want of clientSubscriptions()) {
                    if (want === UNREADABLE_REGISTRY)
                        return;
                    if (want.type !== this.handledType)
                        continue;
                    const key = BaseMarketDataHandler.streamKey(want.symbol, want.type, want.interval, want.limit);
                    if (this.runningStreams.has(key))
                        continue;
                    console.info(`[market] no producer for ${key} but a client is subscribed — restarting`);
                    this.activeSubscriptions.add(key);
                    this.subscriptionParams.set(key, {
                        symbol: want.symbol,
                        type: want.type,
                        interval: want.interval,
                    });
                    this.reapStrikes.delete(key);
                    this.handleSubscription(want.symbol, want.type, want.interval, want.limit);
                }
            }
            catch (err) {
                console.error("[market] stream supervisor failed:", err);
            }
        }, 5000);
    }
    startStreamReaper() {
        if (this.reaperTimer)
            return;
        this.reaperTimer = setInterval(() => {
            try {
                for (const [key, params] of this.subscriptionParams) {
                    if (!this.activeSubscriptions.has(key)) {
                        this.subscriptionParams.delete(key);
                        continue;
                    }
                    if (anyClientSubscribedTo(params.type, params.symbol, params.interval)) {
                        this.reapStrikes.delete(key);
                        continue;
                    }
                    const strikes = (this.reapStrikes.get(key) || 0) + 1;
                    if (strikes < 2) {
                        this.reapStrikes.set(key, strikes);
                        continue;
                    }
                    console.info(`[market] no subscribers left for ${key} — stopping the stream`);
                    this.reapStrikes.delete(key);
                    this.activeSubscriptions.delete(key);
                    this.subscriptionParams.delete(key);
                }
            }
            catch (err) {
                console.error("[market] stream reaper failed:", err);
            }
        }, 30000);
    }
    constructor() {
        this.accumulatedBuffer = {};
        this.bufferInterval = null;
        this.unblockTime = 0;
        this.activeSubscriptions = new Set();
        this.subscriptionParams = new Map();
        this.reaperTimer = null;
        this.reapStrikes = new Map();
        this.runningStreams = new Set();
        this.handledType = null;
        this.supervisorTimer = null;
        this.exchange = null;
        this.symbolToStreamKey = {};
    }
    flushBuffer(type) {
        Object.entries(this.accumulatedBuffer).forEach(([streamKey, data]) => {
            if (Object.keys(data).length > 0) {
                const payload = { type: data.payload.type };
                if (data.payload.limit !== undefined)
                    payload.limit = data.payload.limit;
                if (data.payload.interval !== undefined)
                    payload.interval = data.payload.interval;
                payload.symbol = data.symbol;
                logDebugOtc(`flushBuffer flushing streamKey: ${streamKey}, payload: ${JSON.stringify(payload)}`);
                (0, Websocket_1.sendMessageToRoute)("/api/exchange/market", payload, {
                    stream: streamKey,
                    data: data.msg,
                    timestamp: data.timestamp || Date.now(),
                });
                delete this.accumulatedBuffer[streamKey];
            }
        });
    }
    async fetchDataWithRetries(fetchFunction) {
        if (Date.now() < this.unblockTime) {
            throw new Error(`Blocked until ${new Date(this.unblockTime).toLocaleString()}`);
        }
        return await fetchFunction();
    }
    handleSubscription(symbol, type, interval, limit) {
        const key = BaseMarketDataHandler.streamKey(symbol, type, interval, limit);
        if (this.runningStreams.has(key))
            return;
        this.runningStreams.add(key);
        Promise.resolve(this.runStream(symbol, type, interval, limit))
            .catch((err) => {
            console.error(`[market] stream ${key} ended with an error:`, err);
        })
            .finally(() => {
            this.runningStreams.delete(key);
        });
    }
    async runStream(symbol, type, interval, limit) {
        const frontendStreamKey = `${type}${interval ? `:${interval}` : ""}${limit ? `:${limit}` : ""}:${symbol}`;
        const internalStreamKey = `${symbol}:${type}${interval ? `:${interval}` : ""}${limit ? `:${limit}` : ""}`;
        this.symbolToStreamKey[frontendStreamKey] = symbol;
        if (symbol.toUpperCase().endsWith("OTC") || symbol.toUpperCase().includes("OTC")) {
            delete this.accumulatedBuffer[frontendStreamKey];
            const sym = symbol.toUpperCase();
            let bidexAsset = symbol;
            if (sym.endsWith("/OTC"))
                bidexAsset = symbol.slice(0, -4) + " (OTC)";
            else if (sym.includes("_OTC"))
                bidexAsset = symbol.replace(/_OTC/i, " (OTC)");
            const BIDEX_API = process.env.BIDEX_API_URL || process.env.BINDEX_API_URL || "http://localhost:8001";
            const BIDEX_KEY = process.env.BIDEX_API_KEY;
            const durationMs = interval ? getIntervalDurationMs(interval) : 60000;
            const intervalNum = vortexToTvResolution(interval || "1m");
            logDebugOtc(`OTC block entered: symbol=${symbol} bidexAsset=${bidexAsset} type=${type}`);
            if (type === "ohlcv") {
                console.log(`[OTC-WS→OHLCV] Starting WS subscriber for ${bidexAsset} (interval=${interval})`);
                let lastCachedTickTs = 0;
                let completedBase = null;
                const isOneMins = (interval === "1m" || interval === "1");
                let unsubscribeOtc = null;
                unsubscribeOtc = await OtcWebSocketSubscriber.getInstance().subscribe(symbol, async (tick) => {
                    try {
                        const tickCandleTs = Number(tick.candle_start_ts);
                        const tickOpen = Number(tick.open);
                        const tickHigh = Number(tick.high);
                        const tickLow = Number(tick.low);
                        const tickClose = Number(tick.close);
                        const tickVolume = Number(tick.volume || 1);
                        if (tickClose > 0) {
                            getSyncRedis().set(`otc:${bidexAsset}:last_price`, String(tickClose)).catch(() => { });
                            getSyncRedis().set(`otc:${bidexAsset}:last_price_ts`, String(Date.now())).catch(() => { });
                        }
                        const isSeconds = interval && interval.endsWith("s");
                        const tickTime = isSeconds ? Number(tick.timestamp || Date.now()) : Number(tick.candle_start_ts);
                        let candle;
                        if (isOneMins) {
                            candle = [tickCandleTs, tickOpen, tickHigh, tickLow, tickClose, tickVolume];
                        }
                        else if (isSeconds) {
                            const alignedBucketTs = Math.floor(tickTime / durationMs) * durationMs;
                            let active = activeSecondsCandles.get(frontendStreamKey);
                            if (!active || active.timestamp !== alignedBucketTs) {
                                active = {
                                    timestamp: alignedBucketTs,
                                    open: tickClose,
                                    high: tickClose,
                                    low: tickClose,
                                    close: tickClose,
                                    volume: 0
                                };
                                activeSecondsCandles.set(frontendStreamKey, active);
                            }
                            active.high = Math.max(active.high, tickClose);
                            active.low = Math.min(active.low, tickClose);
                            active.close = tickClose;
                            active.volume += tickVolume;
                            candle = [active.timestamp, active.open, active.high, active.low, active.close, active.volume];
                        }
                        else {
                            const alignedBucketTs = Math.floor(tickCandleTs / durationMs) * durationMs;
                            if (tickCandleTs !== lastCachedTickTs) {
                                lastCachedTickTs = tickCandleTs;
                                completedBase = await fetchCompletedBase(symbol, alignedBucketTs, tickCandleTs);
                            }
                            if (completedBase) {
                                candle = [
                                    alignedBucketTs,
                                    completedBase.open,
                                    Math.max(completedBase.high, tickHigh),
                                    Math.min(completedBase.low, tickLow),
                                    tickClose,
                                    completedBase.volume + tickVolume
                                ];
                            }
                            else {
                                candle = [alignedBucketTs, tickOpen, tickHigh, tickLow, tickClose, tickVolume];
                            }
                        }
                        this.accumulatedBuffer[frontendStreamKey] = {
                            symbol,
                            msg: [candle],
                            payload: { type, interval, limit },
                            timestamp: Number(tick.timestamp || Date.now()),
                        };
                    }
                    catch (err) {
                        console.error("Error handling OTC ohlcv WS update:", err);
                    }
                });
                while (this.activeSubscriptions.has(internalStreamKey) &&
                    (0, Websocket_1.hasClients)(`/api/exchange/market`)) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                if (unsubscribeOtc)
                    unsubscribeOtc();
                this.activeSubscriptions.delete(internalStreamKey);
                console.log(`[OTC-WS→OHLCV] Stopped WS subscriber for ${bidexAsset} (interval=${interval})`);
                return;
            }
            let unsubscribeOtc = null;
            let activeCandle = null;
            unsubscribeOtc = await OtcWebSocketSubscriber.getInstance().subscribe(symbol, (tick) => {
                var _a;
                try {
                    const timestamp = Number(tick.timestamp || Date.now());
                    const price = Number(tick.price);
                    const volume = Number(tick.volume || 0.1);
                    if (price > 0) {
                        getSyncRedis().set(`otc:${bidexAsset}:last_price`, price.toString()).catch(() => { });
                        getSyncRedis().set(`otc:${bidexAsset}:last_price_ts`, String(Date.now())).catch(() => { });
                    }
                    let msgToSend;
                    if (type === "ticker") {
                        msgToSend = {
                            symbol, timestamp,
                            datetime: new Date(timestamp).toISOString(),
                            high: activeCandle ? activeCandle[2] : price,
                            low: activeCandle ? activeCandle[3] : price,
                            close: price, last: price,
                            change: activeCandle ? (price - activeCandle[1]) : 0,
                            percentage: activeCandle ? ((price - activeCandle[1]) / activeCandle[1] * 100) : 0,
                            bid: price - 0.0005,
                            ask: price + 0.0005,
                        };
                    }
                    else if (type === "trades") {
                        msgToSend = [{
                                id: `otc_${timestamp}_${Math.random()}`,
                                timestamp, datetime: new Date(timestamp).toISOString(),
                                symbol, side: ((_a = tick.side) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "buy",
                                price, amount: volume,
                            }];
                    }
                    else if (type === "orderbook") {
                        msgToSend = {
                            symbol, timestamp, datetime: new Date(timestamp).toISOString(),
                            bids: [
                                [price - 0.0001, 1.2], [price - 0.0002, 3.4],
                                [price - 0.0003, 5.6], [price - 0.0004, 7.8], [price - 0.0005, 10.0],
                            ],
                            asks: [
                                [price + 0.0001, 1.1], [price + 0.0002, 2.3],
                                [price + 0.0003, 4.5], [price + 0.0004, 6.7], [price + 0.0005, 9.9],
                            ],
                        };
                    }
                    if (msgToSend) {
                        this.accumulatedBuffer[frontendStreamKey] = {
                            symbol, msg: msgToSend, payload: { type, interval, limit },
                            timestamp: Number(tick.timestamp || Date.now()),
                        };
                    }
                }
                catch (err) {
                    console.error("Error handling OTC tick update:", err);
                }
            });
            while (this.activeSubscriptions.has(internalStreamKey) &&
                (0, Websocket_1.hasClients)(`/api/exchange/market`)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (unsubscribeOtc)
                unsubscribeOtc();
            this.activeSubscriptions.delete(internalStreamKey);
            return;
        }
        const fetchData = {
            ticker: async () => ({
                msg: await this.exchange.watchTicker(symbol),
                payload: { type },
            }),
            ohlcv: async () => {
                let watchInterval = interval;
                if (interval === "2m" && (!this.exchange.timeframes || !this.exchange.timeframes["2m"])) {
                    watchInterval = "1m";
                }
                const rawCandles = await this.exchange.watchOHLCV(symbol, watchInterval, undefined, Number(limit) || 1000);
                const msg = (interval === "2m" && watchInterval === "1m")
                    ? aggregate1mTo2m(rawCandles)
                    : rawCandles;
                return {
                    msg,
                    payload: { type, interval, limit },
                };
            },
            trades: async () => ({
                msg: await this.exchange.watchTrades(symbol, undefined, limit ? Number(limit) : 20),
                payload: { type, limit },
            }),
            orderbook: async () => ({
                msg: await this.exchange.watchOrderBook(symbol, limit ? Number(limit) : 100),
                payload: { type, limit },
            }),
        };
        while (this.activeSubscriptions.has(internalStreamKey) &&
            (0, Websocket_1.hasClients)(`/api/exchange/market`)) {
            try {
                if (Date.now() < this.unblockTime) {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                    continue;
                }
                const { msg, payload } = await this.fetchDataWithRetries(() => fetchData[type]());
                this.accumulatedBuffer[frontendStreamKey] = { symbol, msg, payload, timestamp: Date.now() };
                await new Promise((resolve) => setTimeout(resolve, type === "ticker" ? 100 : 250));
            }
            catch (error) {
                (0, logger_1.logError)("exchange", error, __filename);
                const result = await (0, utils_1.handleExchangeError)(error, exchange_1.default);
                if (typeof result === "number") {
                    this.unblockTime = result;
                    await (0, utils_1.saveBanStatus)(this.unblockTime);
                }
                else {
                    this.exchange = result;
                }
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
        this.activeSubscriptions.delete(internalStreamKey);
    }
    async start(message, flushInterval) {
        try {
            this.unblockTime = await (0, utils_1.loadBanStatus)();
            if (typeof message === "string") {
                message = JSON.parse(message);
            }
            const { symbol, type, interval, limit } = message.payload;
            this.handledType = type;
            logDebugOtc(`start method called for symbol: ${symbol}, type: ${type}, action: ${message.action}`);
            if (!this.bufferInterval) {
                this.bufferInterval = setInterval(() => this.flushBuffer(type), flushInterval);
            }
            const isOtc = symbol && (symbol.toUpperCase().endsWith("OTC") || symbol.toUpperCase().includes("OTC"));
            if (!isOtc) {
                if (!this.exchange) {
                    this.exchange = await exchange_1.default.startExchange();
                    if (!this.exchange) {
                        throw new Error("Failed to start exchange");
                    }
                }
                const typeMap = {
                    ticker: "watchTicker",
                    ohlcv: "watchOHLCV",
                    trades: "watchTrades",
                    orderbook: "watchOrderBook",
                };
                if (!this.exchange.has[typeMap[type]]) {
                    console.info(`Endpoint ${type} is not available`);
                    return;
                }
            }
            const internalStreamKey = `${symbol}:${type}${interval ? `:${interval}` : ""}${limit ? `:${limit}` : ""}`;
            if (message.action === "UNSUBSCRIBE") {
                if (!anyClientSubscribedTo(type, symbol, interval)) {
                    this.activeSubscriptions.delete(internalStreamKey);
                }
                return;
            }
            this.activeSubscriptions.add(internalStreamKey);
            this.subscriptionParams.set(internalStreamKey, { symbol, type, interval });
            this.reapStrikes.delete(internalStreamKey);
            this.handleSubscription(symbol, type, interval, limit);
            this.startStreamReaper();
            this.startStreamSupervisor();
        }
        catch (error) {
            (0, logger_1.logError)("exchange", error, __filename);
        }
    }
    async stop() {
        this.activeSubscriptions.clear();
        this.subscriptionParams.clear();
        if (this.reaperTimer) {
            clearInterval(this.reaperTimer);
            this.reaperTimer = null;
        }
        if (this.supervisorTimer) {
            clearInterval(this.supervisorTimer);
            this.supervisorTimer = null;
        }
        if (this.bufferInterval) {
            clearInterval(this.bufferInterval);
            this.bufferInterval = null;
        }
        if (this.exchange) {
            await exchange_1.default.stopExchange();
            this.exchange = null;
        }
    }
}
class TickerHandler extends BaseMarketDataHandler {
    constructor() {
        super();
    }
    static getInstance() {
        if (!TickerHandler.instance) {
            TickerHandler.instance = new TickerHandler();
        }
        return TickerHandler.instance;
    }
}
exports.TickerHandler = TickerHandler;
class OHLCVHandler extends BaseMarketDataHandler {
    constructor() {
        super();
    }
    static getInstance() {
        if (!OHLCVHandler.instance) {
            OHLCVHandler.instance = new OHLCVHandler();
        }
        return OHLCVHandler.instance;
    }
}
exports.OHLCVHandler = OHLCVHandler;
class TradesHandler extends BaseMarketDataHandler {
    constructor() {
        super();
    }
    static getInstance() {
        if (!TradesHandler.instance) {
            TradesHandler.instance = new TradesHandler();
        }
        return TradesHandler.instance;
    }
}
exports.TradesHandler = TradesHandler;
class OrderbookHandler extends BaseMarketDataHandler {
    constructor() {
        super();
    }
    static getInstance() {
        if (!OrderbookHandler.instance) {
            OrderbookHandler.instance = new OrderbookHandler();
        }
        return OrderbookHandler.instance;
    }
}
exports.OrderbookHandler = OrderbookHandler;
exports.default = async (data, message) => {
    let parsedMessage;
    if (typeof message === "string") {
        try {
            parsedMessage = JSON.parse(message);
        }
        catch (error) {
            (0, logger_1.logError)("Invalid JSON message", error, __filename);
            return;
        }
    }
    else {
        parsedMessage = message;
    }
    logDebugOtc(`default export handler received message: ${JSON.stringify(parsedMessage)}`);
    const { type } = parsedMessage.payload;
    switch (type) {
        case "ticker":
            await TickerHandler.getInstance().start(parsedMessage, 100);
            break;
        case "ohlcv":
            await OHLCVHandler.getInstance().start(parsedMessage, 100);
            break;
        case "trades":
            await TradesHandler.getInstance().start(parsedMessage, 700);
            break;
        case "orderbook":
            await OrderbookHandler.getInstance().start(parsedMessage, 600);
            break;
        default:
            throw new Error(`Unknown type: ${type}`);
    }
};
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
