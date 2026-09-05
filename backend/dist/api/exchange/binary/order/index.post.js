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
exports.metadata = exports.orderIntervals = void 0;
exports.fetchOtcCurrentPrice = fetchOtcCurrentPrice;
exports.createBinaryOrder = createBinaryOrder;
exports.createBinaryOrdersBatch = createBinaryOrdersBatch;
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const error_1 = require("@b/utils/error");
const ioredis_1 = __importDefault(require("ioredis"));
const binary_settings_cache_1 = require("@b/utils/binary-settings-cache");
const BinaryOrderService_1 = require("@b/api/exchange/binary/order/util/BinaryOrderService");
const audit_1 = require("./util/audit");
exports.orderIntervals = new Map();
let __binarySweeperStarted = false;
function startBinarySettlementSweeper() {
    if (__binarySweeperStarted)
        return;
    __binarySweeperStarted = true;
    const sweep = async () => {
        try {
            await BinaryOrderService_1.BinaryOrderService.processPendingOrders(false);
        }
        catch (err) {
            (0, audit_1.captureException)(err, { path: "binary.settlement.sweep" });
            console.error("[Binary Settlement Sweeper] sweep failed:", (err === null || err === void 0 ? void 0 : err.message) || err);
        }
    };
    setTimeout(sweep, 8000);
    setInterval(sweep, 30000);
}
startBinarySettlementSweeper();
const binaryStatus = process.env.NEXT_PUBLIC_BINARY_STATUS !== "false";
const binaryProfit = parseFloat(process.env.NEXT_PUBLIC_BINARY_PROFIT || "87");
let otcTimeOffset = 0;
const MIN_TRADE_DURATION_SECONDS = 60;
const EXPIRY_SKEW_TOLERANCE_SECONDS = 5;
const MIN_CLOCK_EXPIRY_SECONDS = 26;
const ACCOUNT_LEVELS = [
    { key: "elite", name: "Elite", minBalanceUsd: 12000, maxTradeUsd: 3000 },
    { key: "advanced", name: "Advanced", minBalanceUsd: 5000, maxTradeUsd: 2000 },
    { key: "basic", name: "Basic", minBalanceUsd: 0, maxTradeUsd: 1000 },
];
function accountLevelFor(realBalanceUsd) {
    var _a;
    const bal = Number.isFinite(realBalanceUsd) ? realBalanceUsd : 0;
    return (_a = ACCOUNT_LEVELS.find((l) => bal >= l.minBalanceUsd)) !== null && _a !== void 0 ? _a : ACCOUNT_LEVELS[ACCOUNT_LEVELS.length - 1];
}
async function getRealUsdtBalance(userId) {
    for (const type of ["SPOT", "FUNDING", "BINARY"]) {
        const w = await db_1.models.wallet.findOne({ where: { userId, currency: "USDT", type } });
        if (w)
            return Number(w.balance) || 0;
    }
    const any = await db_1.models.wallet.findOne({ where: { userId, currency: "USDT" } });
    return any ? Number(any.balance) || 0 : 0;
}
const query_1 = require("@b/utils/query");
const WebsocketHandler = __importStar(require("@b/handler/Websocket"));
const utils_1 = require("../../utils");
exports.metadata = {
    summary: "Create Binary Order",
    operationId: "createBinaryOrder",
    tags: ["Binary", "Orders"],
    description: "Creates a new binary order for the authenticated user.",
    requestBody: {
        description: "Binary order data to be created.",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        currency: { type: "string" },
                        pair: { type: "string" },
                        amount: { type: "number" },
                        side: { type: "string" },
                        closedAt: { type: "string" },
                        isDemo: { type: "boolean" },
                        type: { type: "string" },
                        durationId: { type: "string" },
                    },
                },
            },
        },
        required: true,
    },
    responses: (0, query_1.createRecordResponses)("Binary Order"),
    requiresAuth: true,
};
function applyAdjustment(percentage, adjustment) {
    return adjustment === 0 ? percentage : Math.round(percentage * (1 + adjustment / 100));
}
function calculateCumulativeAdjustments(durations) {
    var _a;
    const sorted = [...durations].sort((a, b) => a.minutes - b.minutes);
    const cumulative = {
        RISE_FALL: 0,
        HIGHER_LOWER: 0,
        TOUCH_NO_TOUCH: 0,
        CALL_PUT: 0,
        TURBO: 0,
    };
    const adjustmentsMap = new Map();
    for (const duration of sorted) {
        const overrides = duration.orderTypeOverrides || {};
        for (const orderType of ["RISE_FALL", "HIGHER_LOWER", "TOUCH_NO_TOUCH", "CALL_PUT", "TURBO"]) {
            const adjustment = ((_a = overrides[orderType]) === null || _a === void 0 ? void 0 : _a.profitAdjustment) || 0;
            if (adjustment !== 0) {
                cumulative[orderType] += adjustment;
            }
        }
        adjustmentsMap.set(duration.id, { ...cumulative });
    }
    return adjustmentsMap;
}
function toBidexAsset(symbol) {
    const upper = symbol.toUpperCase();
    if (upper.endsWith("/OTC"))
        return symbol.slice(0, -4) + " (OTC)";
    if (upper.includes("_OTC"))
        return symbol.replace(/_OTC/i, " (OTC)");
    return symbol + " (OTC)";
}
let _sharedRedis = null;
function getSharedRedis() {
    if (!_sharedRedis || _sharedRedis.status === "close" || _sharedRedis.status === "end") {
        _sharedRedis = new ioredis_1.default({
            host: process.env.REDIS_HOST || "127.0.0.1",
            port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
            ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
            maxRetriesPerRequest: 1,
            connectTimeout: 1000,
            lazyConnect: true,
        });
        _sharedRedis.on("error", () => { });
    }
    return _sharedRedis;
}
const _lastBgRefresh = new Map();
async function fetchBidexPriceAndCache(bidexAsset, redisKey) {
    var _a;
    try {
        const bidexUrl = (process.env.BIDEX_API_URL || process.env.BINDEX_API_URL || "http://localhost:8001").replace(/\/$/, "");
        const bidexApiKey = process.env.BIDEX_API_KEY;
        const now = Date.now();
        const res = await fetch(`${bidexUrl}/api/chart?asset=${encodeURIComponent(bidexAsset)}&interval=1&from=${now - 7200000}&to=${now + 7200000}`, {
            headers: {
                ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
                "Origin": (0, utils_1.getOtcOrigin)(),
            },
            signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
            const dateHeader = res.headers.get("Date");
            if (dateHeader) {
                otcTimeOffset = new Date(dateHeader).getTime() - Date.now();
                global.otcTimeOffset = otcTimeOffset;
            }
            const result = await res.json();
            if (((_a = result === null || result === void 0 ? void 0 : result.data) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                const price = Number(result.data[result.data.length - 1][4]);
                if (price > 0) {
                    getSharedRedis().set(redisKey, price.toString()).catch(() => { });
                    getSharedRedis().set(`${redisKey}_ts`, String(Date.now())).catch(() => { });
                    return price;
                }
            }
        }
    }
    catch (err) {
        console.warn(`[OTC Price] BideX API fetch error for ${bidexAsset}:`, err.message);
    }
    return 0;
}
function refreshOtcPriceInBackground(bidexAsset, redisKey) {
    const now = Date.now();
    if (now - (_lastBgRefresh.get(bidexAsset) || 0) < 2000)
        return;
    _lastBgRefresh.set(bidexAsset, now);
    fetchBidexPriceAndCache(bidexAsset, redisKey).catch(() => { });
}
async function fetchOtcCurrentPrice(symbol) {
    const bidexAsset = toBidexAsset(symbol);
    const redisKey = `otc:${bidexAsset}:last_price`;
    const cleanSym = symbol.replace(/\s*\(OTC\)/gi, "").replace(/_OTC/gi, "").replace(/\/OTC/gi, "").trim();
    const priceKeys = [
        redisKey,
        `otc:${cleanSym} (OTC):last_price`,
        `otc:${cleanSym}:last_price`,
        `otc:${symbol}:last_price`,
    ];
    const tsKeys = priceKeys.map((k) => `${k}_ts`);
    const maxStaleMs = Number(process.env.OTC_PRICE_MAX_STALE_MS || 120000);
    const allowStaleEntry = process.env.OTC_ALLOW_STALE_ENTRY !== "false";
    let stalePrice = 0;
    try {
        const all = await getSharedRedis().mget(...priceKeys, ...tsKeys);
        const now = Date.now();
        for (let i = 0; i < priceKeys.length; i++) {
            const v = all[i];
            if (!v)
                continue;
            const price = parseFloat(v);
            if (!(price > 0))
                continue;
            const tsRaw = all[priceKeys.length + i];
            const age = tsRaw ? now - Number(tsRaw) : Infinity;
            if (age <= maxStaleMs) {
                refreshOtcPriceInBackground(bidexAsset, redisKey);
                return price;
            }
            if (!stalePrice)
                stalePrice = price;
        }
    }
    catch (err) {
        console.warn(`[OTC Price] Redis read failed for ${symbol}:`, err.message);
    }
    const fresh = await fetchBidexPriceAndCache(bidexAsset, redisKey);
    if (fresh > 0) {
        console.log(`[OTC Price] Fresh fetch from BideX for ${symbol} (${bidexAsset}): ${fresh}`);
        return fresh;
    }
    if (stalePrice > 0) {
        if (allowStaleEntry) {
            console.warn(`[OTC Price] Using cached price for ${symbol}: ${stalePrice}`);
            getSharedRedis().set(`${redisKey}_ts`, String(Date.now())).catch(() => { });
            return stalePrice;
        }
        throw (0, error_1.createError)({
            statusCode: 503,
            message: "Market data is temporarily unavailable (stale price feed). Order halted — please try again shortly.",
        });
    }
    throw new Error(`No price data found for ${symbol}`);
}
async function getOtcConfig(symbol) {
    var _a, _b, _c, _d, _e;
    if (!symbol || !symbol.toUpperCase().includes("OTC"))
        return null;
    const bidexSymbol = symbol.toUpperCase().endsWith("/OTC")
        ? symbol.slice(0, -4) + " (OTC)"
        : symbol.replace("_OTC", " (OTC)");
    const normalizedSymbol = bidexSymbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const otcRedis = getSharedRedis();
    try {
        const configStr = await otcRedis.get(`otc:pair:config:${normalizedSymbol}`);
        if (!configStr)
            return null;
        const config = JSON.parse(configStr);
        let payout = (_b = (_a = config.roi_configuration) === null || _a === void 0 ? void 0 : _a.base_payout_percentage) !== null && _b !== void 0 ? _b : 0.82;
        if (((_c = config.roi_configuration) === null || _c === void 0 ? void 0 : _c.mode) === 'DYNAMIC') {
            const exposureStr = await otcRedis.get(`otc:exposure:${normalizedSymbol}`);
            if (exposureStr) {
                const exposure = JSON.parse(exposureStr);
                const totalCalls = exposure.total_call_volume_usd || 0;
                const totalPuts = exposure.total_put_volume_usd || 0;
                const threshold = ((_d = config.roi_configuration) === null || _d === void 0 ? void 0 : _d.exposure_threshold_usd) || 15000;
                const diff = Math.abs(totalCalls - totalPuts);
                if (diff > threshold) {
                    const excess = diff - threshold;
                    const reduction = Math.min(0.2, (excess / threshold) * 0.05);
                    payout = Math.max(((_e = config.roi_configuration) === null || _e === void 0 ? void 0 : _e.minimum_allowed_payout) || 0.55, payout - reduction);
                }
            }
        }
        return {
            payout: Math.round(payout * 100),
            status: config.status === 'ACTIVE'
        };
    }
    catch (error) {
        console.error("[OTC Config Bridge Error]:", error);
        return null;
    }
}
exports.default = async (data) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u;
    if (!binaryStatus) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Binary trading is disabled",
        });
    }
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const { currency, pair, amount, side, type, closedAt, isDemo, durationId, symbol: bodySymbol, price: clientPrice } = body || {};
    let market = (await db_1.models.exchangeMarket.findOne({
        where: { currency, pair },
    }));
    if (!market) {
        const binaryMarket = await db_1.models.binaryMarket.findOne({
            where: { currency, pair },
        });
        if (!binaryMarket) {
            throw new Error("Market data not found");
        }
        market = {
            ...binaryMarket.get({ plain: true }),
            metadata: null,
        };
    }
    let minAmount = 1;
    let maxAmount = 1000000;
    try {
        const settings = await (0, binary_settings_cache_1.getBinarySettings)();
        if (((_a = settings === null || settings === void 0 ? void 0 : settings.global) === null || _a === void 0 ? void 0 : _a.minOrderAmount) !== undefined) {
            minAmount = Number(settings.global.minOrderAmount);
        }
        if (((_b = settings === null || settings === void 0 ? void 0 : settings.global) === null || _b === void 0 ? void 0 : _b.maxOrderAmount) !== undefined) {
            maxAmount = Number(settings.global.maxOrderAmount);
        }
    }
    catch (e) {
    }
    if (((_e = (_d = (_c = market.metadata) === null || _c === void 0 ? void 0 : _c.limits) === null || _d === void 0 ? void 0 : _d.amount) === null || _e === void 0 ? void 0 : _e.min) !== undefined && ((_h = (_g = (_f = market.metadata) === null || _f === void 0 ? void 0 : _f.limits) === null || _g === void 0 ? void 0 : _g.amount) === null || _h === void 0 ? void 0 : _h.min) !== null) {
        minAmount = Number(market.metadata.limits.amount.min);
    }
    if (((_l = (_k = (_j = market.metadata) === null || _j === void 0 ? void 0 : _j.limits) === null || _k === void 0 ? void 0 : _k.amount) === null || _l === void 0 ? void 0 : _l.max) !== undefined && ((_p = (_o = (_m = market.metadata) === null || _m === void 0 ? void 0 : _m.limits) === null || _o === void 0 ? void 0 : _o.amount) === null || _p === void 0 ? void 0 : _p.max) !== null) {
        maxAmount = Number(market.metadata.limits.amount.max);
    }
    if (amount < minAmount || amount > maxAmount) {
        throw new Error(`Amount must be between ${minAmount} and ${maxAmount} ${currency}`);
    }
    {
        const realBalance = await getRealUsdtBalance(user.id);
        const level = accountLevelFor(realBalance);
        if (Number(amount) > level.maxTradeUsd) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Maximum ${level.maxTradeUsd.toLocaleString("en-US")} USDT per position on the ` +
                    `${level.name} account level.`,
            });
        }
    }
    {
        const closeMs = new Date(closedAt).getTime();
        if (!Number.isFinite(closeMs)) {
            throw (0, error_1.createError)({ statusCode: 400, message: "Invalid expiry time" });
        }
        const symbolForOtc = `${String(bodySymbol !== null && bodySymbol !== void 0 ? bodySymbol : "")} ${currency} ${pair}`.toUpperCase();
        const isOtcSymbol = symbolForOtc.includes("OTC");
        let nowMs = Date.now();
        const otcOffset = global.otcTimeOffset || otcTimeOffset || 0;
        if (isOtcSymbol && otcOffset !== 0) {
            nowMs += otcOffset;
        }
        const secondsToExpiry = (closeMs - nowMs) / 1000;
        const isClockExpiry = closeMs % 60000 === 0;
        if (isClockExpiry) {
            if (secondsToExpiry < MIN_CLOCK_EXPIRY_SECONDS) {
                throw (0, error_1.createError)({
                    statusCode: 400,
                    message: "Selected expiry time has already passed",
                });
            }
        }
        else if (secondsToExpiry < MIN_TRADE_DURATION_SECONDS - EXPIRY_SKEW_TOLERANCE_SECONDS) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Minimum trade duration is ${MIN_TRADE_DURATION_SECONDS} seconds`,
            });
        }
    }
    const idemKeyRaw = ((_u = (_t = (_r = (_q = data.headers) === null || _q === void 0 ? void 0 : _q["idempotency-key"]) !== null && _r !== void 0 ? _r : (_s = data.headers) === null || _s === void 0 ? void 0 : _s["Idempotency-Key"]) !== null && _t !== void 0 ? _t : body === null || body === void 0 ? void 0 : body.idempotencyKey) !== null && _u !== void 0 ? _u : "").toString().trim().slice(0, 128);
    const idemRedisKey = idemKeyRaw ? `idem:binary:${user.id}:${idemKeyRaw}` : null;
    if (idemRedisKey) {
        let claimed = "OK";
        try {
            claimed = await getSharedRedis().set(idemRedisKey, "PENDING", "EX", 90, "NX");
        }
        catch (_v) {
            claimed = "OK";
        }
        if (claimed === null) {
            (0, audit_1.writeAuditLog)({ action: "BINARY_ORDER_DUPLICATE", userId: user.id, detail: idemKeyRaw });
            let prior = null;
            try {
                prior = await getSharedRedis().get(idemRedisKey);
            }
            catch (_w) { }
            if (prior && prior !== "PENDING") {
                const priorOrder = await db_1.models.binaryOrder.findByPk(prior).catch(() => null);
                if (priorOrder) {
                    return { order: priorOrder, message: "Duplicate order ignored (idempotent)" };
                }
            }
            throw (0, error_1.createError)({ statusCode: 409, message: "Duplicate order ignored (already processing)" });
        }
    }
    const batchCount = Math.max(1, Math.min(100, Math.floor(Number(body === null || body === void 0 ? void 0 : body.batch) || 1)));
    try {
        const unblockTime = await (0, utils_1.loadBanStatus)();
        if (await (0, utils_1.handleBanStatus)(unblockTime)) {
            throw (0, error_1.createError)({
                statusCode: 503,
                message: "Service temporarily unavailable. Please try again later.",
            });
        }
        if (batchCount > 1) {
            const orders = await createBinaryOrdersBatch(user.id, currency, pair, amount, side, type, closedAt, isDemo, durationId, bodySymbol, batchCount);
            if (idemRedisKey) {
                await getSharedRedis()
                    .set(idemRedisKey, orders[0] ? String(orders[0].id) : "BATCH", "EX", 90)
                    .catch(() => { });
            }
            return {
                orders,
                count: orders.length,
                batch: true,
                message: `${orders.length} binary orders created successfully`,
            };
        }
        const transaction = await createBinaryOrder(user.id, currency, pair, amount, side, type, closedAt, isDemo, durationId, bodySymbol, clientPrice);
        if (idemRedisKey) {
            await getSharedRedis().set(idemRedisKey, String(transaction.id), "EX", 90).catch(() => { });
        }
        startOrderMonitoring(user.id, transaction.id, `${currency}/${pair}`, new Date(closedAt).getTime());
        return {
            order: transaction,
            message: "Binary order created successfully",
        };
    }
    catch (error) {
        if (idemRedisKey) {
            await getSharedRedis().del(idemRedisKey).catch(() => { });
        }
        (0, audit_1.captureException)(error, {
            path: "binary.order.create",
            userId: user.id,
            currency,
            pair,
            amount,
            side,
            type,
        });
        throw new Error(error.message);
    }
};
async function createBinaryOrder(userId, currency, pair, amount, side, type, closedAt, isDemo = false, durationId, requestSymbol, clientPrice) {
    var _a, _b;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("Invalid amount");
    }
    let wallet;
    if (!isDemo) {
        const walletCurrency = "USDT";
        const walletPriority = ["SPOT", "FUNDING", "BINARY"];
        for (const walletType of walletPriority) {
            wallet = await db_1.models.wallet.findOne({
                where: { userId, currency: walletCurrency, type: walletType },
            });
            if (wallet)
                break;
        }
        if (!wallet) {
            wallet = await db_1.models.wallet.findOne({
                where: { userId, currency: walletCurrency },
            });
        }
        if (!wallet) {
            throw new Error("Wallet not found");
        }
    }
    const closeAtDate = new Date(closedAt);
    void clientPrice;
    let price = undefined;
    const symbol = `${currency}/${pair}`;
    const effectiveSymbol = String(requestSymbol || symbol);
    const isOtcMarket = effectiveSymbol.toUpperCase().includes("OTC") ||
        symbol.toUpperCase().includes("OTC") ||
        pair.toUpperCase().includes("OTC") ||
        currency.toUpperCase().includes("OTC");
    if (!price) {
        if (isOtcMarket) {
            try {
                price = await fetchOtcCurrentPrice(symbol);
            }
            catch (err) {
                throw new Error("Error fetching OTC price data: " + err.message);
            }
        }
        else {
            const exchange = await exchange_1.default.startExchange();
            if (!exchange) {
                throw (0, error_1.createError)({
                    statusCode: 503,
                    message: "Service temporarily unavailable. Please try again later.",
                });
            }
            try {
                const unblockTime = await (0, utils_1.loadBanStatus)();
                if (await (0, utils_1.handleBanStatus)(unblockTime)) {
                    throw (0, error_1.createError)({
                        statusCode: 503,
                        message: "Service temporarily unavailable. Please try again later.",
                    });
                }
                const ticker = await exchange.fetchTicker(symbol);
                price = ticker.last;
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.statusCode) === 503) {
                    throw error;
                }
                throw new Error("Error fetching market data");
            }
        }
    }
    if (!price) {
        throw new Error("Error fetching ticker data");
    }
    let profit = binaryProfit;
    const otcConfig = await getOtcConfig(symbol);
    if (otcConfig) {
        profit = otcConfig.payout;
    }
    else {
        try {
            const settings = await (0, binary_settings_cache_1.getBinarySettings)();
            const duration = settings.durations.find((d) => d.id === durationId);
            if (duration) {
                const baseProfit = ((_a = settings.orderTypes[type]) === null || _a === void 0 ? void 0 : _a.profitPercentage) || binaryProfit;
                const adjustments = calculateCumulativeAdjustments(settings.durations);
                const adjustment = ((_b = adjustments.get(duration.id)) === null || _b === void 0 ? void 0 : _b[type]) || 0;
                profit = applyAdjustment(baseProfit, adjustment);
            }
        }
        catch (err) {
            console.warn("Failed to retrieve adjusted binary settings profit, using fallback:", err);
        }
    }
    const orderFields = {
        userId: userId,
        symbol: `${currency}/${pair}`,
        type: type,
        side: side,
        status: "PENDING",
        price: price,
        profit: profit,
        profitPercentage: profit,
        amount: amount,
        isDemo: isDemo,
        closedAt: closeAtDate,
    };
    let finalOrder;
    if (!isDemo) {
        const dbTx = await db_1.sequelize.transaction();
        try {
            const [affected] = await db_1.models.wallet.update({ balance: (0, sequelize_1.literal)(`balance - ${amt}`) }, { where: { id: wallet.id, balance: { [sequelize_1.Op.gte]: amt } }, transaction: dbTx });
            if (affected === 0) {
                (0, audit_1.writeAuditLog)({
                    action: "BINARY_ORDER_REJECTED_INSUFFICIENT_BALANCE",
                    userId,
                    walletId: wallet.id,
                    currency,
                    amount: amt,
                    balanceBefore: Number(wallet.balance),
                });
                throw new Error("Insufficient balance");
            }
            finalOrder = await db_1.models.binaryOrder.create(orderFields, { transaction: dbTx });
            await db_1.models.transaction.create({
                userId: userId,
                walletId: wallet.id,
                type: "BINARY_ORDER",
                status: "PENDING",
                amount: amount,
                fee: 0,
                description: `Binary Position | Market: ${currency}/${pair} | Amount: ${amount} USDT | Price: ${price} | Profit Margin: ${profit}% | Side: ${side} | Expiration: ${closedAt.toLocaleString()} | Type: Live Position`,
                referenceId: finalOrder.id,
            }, { transaction: dbTx });
            await dbTx.commit();
            (0, audit_1.writeAuditLog)({
                action: "BINARY_ORDER_DEBIT",
                userId,
                walletId: wallet.id,
                orderId: finalOrder.id,
                currency,
                amount: amt,
                balanceBefore: Number(wallet.balance),
                balanceAfter: Number(wallet.balance) - amt,
                side,
                type,
                price,
            });
        }
        catch (e) {
            await dbTx.rollback();
            throw e;
        }
    }
    else {
        finalOrder = await db_1.models.binaryOrder.create(orderFields);
    }
    startOrderMonitoring(userId, finalOrder.id, symbol, closeAtDate.getTime());
    broadcastOrderCreated(finalOrder);
    return finalOrder;
}
function broadcastOrderCreated(order) {
    try {
        if (!(order === null || order === void 0 ? void 0 : order.userId) || !(order === null || order === void 0 ? void 0 : order.symbol))
            return;
        const broker = WebsocketHandler === null || WebsocketHandler === void 0 ? void 0 : WebsocketHandler.messageBroker;
        if (!(broker === null || broker === void 0 ? void 0 : broker.broadcastToSubscribedClients))
            return;
        broker.broadcastToSubscribedClients("/api/exchange/binary/order", { type: "order", symbol: order.symbol, userId: order.userId }, { type: "ORDER_CREATED", order });
    }
    catch (err) {
        console.error("[binary.order] failed to broadcast ORDER_CREATED:", err);
    }
}
async function createBinaryOrdersBatch(userId, currency, pair, amount, side, type, closedAt, isDemo = false, durationId, requestSymbol, count = 1) {
    var _a, _b;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
        throw new Error("Invalid amount");
    const n = Math.max(1, Math.min(100, Math.floor(Number(count) || 1)));
    let wallet;
    if (!isDemo) {
        const walletCurrency = "USDT";
        const walletPriority = ["SPOT", "FUNDING", "BINARY"];
        for (const walletType of walletPriority) {
            wallet = await db_1.models.wallet.findOne({
                where: { userId, currency: walletCurrency, type: walletType },
            });
            if (wallet)
                break;
        }
        if (!wallet) {
            wallet = await db_1.models.wallet.findOne({
                where: { userId, currency: walletCurrency },
            });
        }
        if (!wallet)
            throw new Error("Wallet not found");
    }
    const closeAtDate = new Date(closedAt);
    let price = undefined;
    const symbol = `${currency}/${pair}`;
    const effectiveSymbol = String(requestSymbol || symbol);
    const isOtcMarket = effectiveSymbol.toUpperCase().includes("OTC") ||
        symbol.toUpperCase().includes("OTC") ||
        pair.toUpperCase().includes("OTC") ||
        currency.toUpperCase().includes("OTC");
    if (isOtcMarket) {
        try {
            price = await fetchOtcCurrentPrice(symbol);
        }
        catch (err) {
            throw new Error("Error fetching OTC price data: " + err.message);
        }
    }
    else {
        const exchange = await exchange_1.default.startExchange();
        if (!exchange) {
            throw (0, error_1.createError)({ statusCode: 503, message: "Service temporarily unavailable. Please try again later." });
        }
        try {
            const unblockTime = await (0, utils_1.loadBanStatus)();
            if (await (0, utils_1.handleBanStatus)(unblockTime)) {
                throw (0, error_1.createError)({ statusCode: 503, message: "Service temporarily unavailable. Please try again later." });
            }
            const ticker = await exchange.fetchTicker(symbol);
            price = ticker.last;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.statusCode) === 503)
                throw error;
            throw new Error("Error fetching market data");
        }
    }
    if (!price)
        throw new Error("Error fetching ticker data");
    let profit = binaryProfit;
    const otcConfig = await getOtcConfig(symbol);
    if (otcConfig) {
        profit = otcConfig.payout;
    }
    else {
        try {
            const settings = await (0, binary_settings_cache_1.getBinarySettings)();
            const duration = settings.durations.find((d) => d.id === durationId);
            if (duration) {
                const baseProfit = ((_a = settings.orderTypes[type]) === null || _a === void 0 ? void 0 : _a.profitPercentage) || binaryProfit;
                const adjustments = calculateCumulativeAdjustments(settings.durations);
                const adjustment = ((_b = adjustments.get(duration.id)) === null || _b === void 0 ? void 0 : _b[type]) || 0;
                profit = applyAdjustment(baseProfit, adjustment);
            }
        }
        catch (err) {
            console.warn("Failed to retrieve adjusted binary settings profit, using fallback:", err);
        }
    }
    const orderFieldsBase = {
        userId,
        symbol,
        type,
        side,
        status: "PENDING",
        price,
        profit,
        profitPercentage: profit,
        amount,
        isDemo,
        closedAt: closeAtDate,
    };
    let created = [];
    if (!isDemo) {
        const total = amt * n;
        const dbTx = await db_1.sequelize.transaction();
        try {
            const [affected] = await db_1.models.wallet.update({ balance: (0, sequelize_1.literal)(`balance - ${total}`) }, { where: { id: wallet.id, balance: { [sequelize_1.Op.gte]: total } }, transaction: dbTx });
            if (affected === 0) {
                (0, audit_1.writeAuditLog)({
                    action: "BINARY_ORDER_BATCH_REJECTED_INSUFFICIENT_BALANCE",
                    userId,
                    walletId: wallet.id,
                    currency,
                    amount: amt,
                    count: n,
                    total,
                    balanceBefore: Number(wallet.balance),
                });
                throw new Error("Insufficient balance");
            }
            const orderRows = Array.from({ length: n }, () => ({ ...orderFieldsBase }));
            created = await db_1.models.binaryOrder.bulkCreate(orderRows, { transaction: dbTx });
            const txnRows = created.map((o) => ({
                userId,
                walletId: wallet.id,
                type: "BINARY_ORDER",
                status: "PENDING",
                amount,
                fee: 0,
                description: `Binary Position | Market: ${symbol} | Amount: ${amount} USDT | Price: ${price} | Profit Margin: ${profit}% | Side: ${side} | Expiration: ${closedAt} | Type: Live Position`,
                referenceId: o.id,
            }));
            await db_1.models.transaction.bulkCreate(txnRows, { transaction: dbTx });
            await dbTx.commit();
            (0, audit_1.writeAuditLog)({
                action: "BINARY_ORDER_BATCH_DEBIT",
                userId,
                walletId: wallet.id,
                currency,
                amount: amt,
                count: created.length,
                total,
                balanceBefore: Number(wallet.balance),
                balanceAfter: Number(wallet.balance) - total,
                side,
                type,
                price,
            });
        }
        catch (e) {
            await dbTx.rollback();
            throw e;
        }
    }
    else {
        const orderRows = Array.from({ length: n }, () => ({ ...orderFieldsBase }));
        created = await db_1.models.binaryOrder.bulkCreate(orderRows);
    }
    for (const o of created) {
        startOrderMonitoring(userId, o.id, symbol, closeAtDate.getTime());
        broadcastOrderCreated(o);
    }
    return created;
}
function startOrderMonitoring(userId, id, symbol, closedAt) {
    let currentTimeUtc = new Date().getTime();
    let offset = global.otcTimeOffset || otcTimeOffset || 0;
    if (symbol.toUpperCase().includes("OTC") && offset === 0) {
        const diff = closedAt - currentTimeUtc;
        if (diff > 2400000 && diff < 10800000) {
            offset = 2645000;
            global.otcTimeOffset = 2645000;
            console.log(`[OTC Time Sync] Auto-detected BideX offset: ${offset}ms from order closedAt`);
        }
    }
    if (symbol.toUpperCase().includes("OTC") && offset !== 0) {
        currentTimeUtc += offset;
    }
    const delay = closedAt - currentTimeUtc;
    console.log(`[Binary Order Monitor] Scheduling order ${id} processing with delay ${delay}ms (BideX time: ${new Date(closedAt).toISOString()}, Backend adjusted time: ${new Date(currentTimeUtc).toISOString()})`);
    const timer = setTimeout(() => {
        processOrder(userId, id, symbol);
    }, delay);
    exports.orderIntervals.set(id, timer);
}
async function processOrder(userId, id, symbol) {
    try {
        await BinaryOrderService_1.BinaryOrderService.processOrder(userId, id, symbol);
        exports.orderIntervals.delete(id);
    }
    catch (error) {
        console.error(`Error processing order ${id}: ${error}`);
    }
}
