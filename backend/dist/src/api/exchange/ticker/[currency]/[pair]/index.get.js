"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const utils_1 = require("@b/api/exchange/utils");
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const ioredis_1 = __importDefault(require("ioredis"));
const logger_1 = require("@b/utils/logger");
const query_1 = require("@b/utils/query");
const utils_2 = require("@b/api/exchange/utils");
exports.metadata = {
    summary: "Get Market Ticker",
    operationId: "getMarketTicker",
    tags: ["Exchange", "Markets"],
    description: "Retrieves ticker information for a specific market pair.",
    parameters: [
        {
            name: "currency",
            in: "path",
            required: true,
            description: "The base currency of the market pair.",
            schema: { type: "string" },
        },
        {
            name: "pair",
            in: "path",
            required: true,
            description: "The quote currency of the market pair.",
            schema: { type: "string" },
        },
    ],
    responses: {
        200: {
            description: "Ticker information",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: utils_1.baseTickerSchema,
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Ticker"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { currency, pair } = data.params;
    const symbol = `${currency}/${pair}`;
    try {
        const unblockTime = await (0, utils_2.loadBanStatus)();
        if (await (0, utils_2.handleBanStatus)(unblockTime)) {
            return query_1.serverErrorResponse;
        }
        const exchange = await exchange_1.default.startExchange();
        if (!exchange) {
            (0, logger_1.logError)("exchange", new Error("Failed to start exchange"), __filename);
            return query_1.serverErrorResponse;
        }
        let ticker;
        if (symbol.toUpperCase().includes("OTC") || pair === "OTC") {
            const bidexSymbol = symbol.toUpperCase().endsWith("/OTC")
                ? symbol.slice(0, -4) + " (OTC)"
                : symbol.replace("_OTC", " (OTC)");
            const otcRedis = new ioredis_1.default({
                host: process.env.REDIS_HOST || "127.0.0.1",
                port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
                maxRetriesPerRequest: 1,
                connectTimeout: 1000,
            });
            let price = 0;
            try {
                const priceStr = await otcRedis.get(`otc:${bidexSymbol}:last_price`);
                if (priceStr) {
                    price = parseFloat(priceStr);
                }
            }
            catch (err) {
                console.error("[OTC Price Fetch Error in Ticker]:", err);
            }
            finally {
                await otcRedis.quit().catch(() => { });
            }
            if (!price) {
                return (0, query_1.notFoundMetadataResponse)("Ticker");
            }
            ticker = {
                symbol,
                bid: price * 0.999,
                ask: price * 1.001,
                close: price,
                last: price,
                percentage: 0,
                baseVolume: 0,
                quoteVolume: 0,
            };
        }
        else {
            ticker = await exchange.fetchTicker(symbol);
        }
        if (!ticker) {
            return (0, query_1.notFoundMetadataResponse)("Ticker");
        }
        return {
            symbol: ticker.symbol,
            bid: ticker.bid,
            ask: ticker.ask,
            close: ticker.close,
            last: ticker.last,
            change: ticker.percentage,
            baseVolume: ticker.baseVolume,
            quoteVolume: ticker.quoteVolume,
        };
    }
    catch (error) {
        const result = await (0, utils_2.handleExchangeError)(error, exchange_1.default);
        if (typeof result === "number") {
            return query_1.serverErrorResponse;
        }
        (0, logger_1.logError)("exchange", error, __filename);
        return query_1.serverErrorResponse;
    }
};
