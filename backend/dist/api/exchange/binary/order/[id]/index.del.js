"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const ioredis_1 = __importDefault(require("ioredis"));
const query_1 = require("@b/utils/query");
const index_post_1 = require("../index.post");
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const error_1 = require("@b/utils/error");
const utils_1 = require("@b/api/exchange/utils");
const binaryProfit = parseFloat(process.env.NEXT_PUBLIC_BINARY_PROFIT || "87");
exports.metadata = {
    summary: "Cancel Binary Order",
    operationId: "cancelBinaryOrder",
    tags: ["Binary", "Orders"],
    description: "Cancels a binary order for the authenticated user.",
    parameters: [
        {
            name: "id",
            in: "path",
            description: "ID of the binary order to cancel.",
            required: true,
            schema: { type: "string" },
        },
    ],
    requestBody: {
        description: "Cancellation percentage data.",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        percentage: { type: "number" },
                    },
                },
            },
        },
        required: false,
    },
    responses: {
        200: {
            description: "Binary order cancelled",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Binary Order"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { id } = data.params;
    const { percentage } = data.body;
    const order = await db_1.models.binaryOrder.findOne({
        where: {
            id,
        },
    });
    if (!order) {
        throw (0, error_1.createError)(404, "Order not found");
    }
    let wallet, balance, transaction;
    const isDemo = order.isDemo || false;
    try {
        const unblockTime = await (0, utils_1.loadBanStatus)();
        if (await (0, utils_1.handleBanStatus)(unblockTime)) {
            throw (0, error_1.createError)(503, "Service temporarily unavailable. Please try again later.");
        }
        const exchange = await exchange_1.default.startExchange();
        if (!exchange) {
            throw (0, error_1.createError)(503, "Service temporarily unavailable. Please try again later.");
        }
        let currentPrice = 0;
        if (order.symbol.toUpperCase().includes("OTC")) {
            const bidexSymbol = order.symbol.toUpperCase().endsWith("/OTC")
                ? order.symbol.slice(0, -4) + " (OTC)"
                : order.symbol.replace("_OTC", " (OTC)");
            const otcRedis = new ioredis_1.default({
                host: process.env.REDIS_HOST || "127.0.0.1",
                port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
                maxRetriesPerRequest: 1,
                connectTimeout: 1000,
            });
            try {
                const priceStr = await otcRedis.get(`otc:${bidexSymbol}:last_price`);
                if (priceStr) {
                    currentPrice = parseFloat(priceStr);
                }
            }
            catch (err) {
                console.error("[OTC Price Fetch Error in Cancel]:", err);
            }
            finally {
                await otcRedis.quit().catch(() => { });
            }
            if (!currentPrice) {
                throw (0, error_1.createError)(500, "Error fetching OTC price data");
            }
        }
        else {
            const ticker = await exchange.fetchTicker(order.symbol);
            currentPrice = ticker.last;
        }
        if (!isDemo) {
            transaction = await db_1.models.transaction.findOne({
                where: {
                    referenceId: order.id,
                },
            });
            if (!transaction) {
                throw (0, error_1.createError)(404, "Transaction not found");
            }
            wallet = await db_1.models.wallet.findOne({
                where: {
                    id: transaction.walletId,
                },
            });
            if (!wallet) {
                throw (0, error_1.createError)(404, "Wallet not found");
            }
            let partialReturn = order.amount;
            if (order.side === "RISE") {
                if (currentPrice > order.price) {
                    partialReturn += order.amount * (binaryProfit / 100);
                }
                else {
                    partialReturn -= order.amount * (binaryProfit / 100);
                }
            }
            else if (order.side === "FALL") {
                if (currentPrice < order.price) {
                    partialReturn += order.amount * (binaryProfit / 100);
                }
                else {
                    partialReturn -= order.amount * (binaryProfit / 100);
                }
            }
            if (percentage !== undefined) {
                const cutAmount = order.amount * (Math.abs(percentage) / 100);
                partialReturn = wallet.balance + order.amount - cutAmount;
            }
            balance = wallet.balance + partialReturn;
            await db_1.models.wallet.update({
                balance: balance,
            }, {
                where: {
                    id: wallet.id,
                },
            });
            await db_1.models.transaction.destroy({
                where: {
                    id: transaction.id,
                },
                force: true,
            });
        }
        if (index_post_1.orderIntervals.has(id)) {
            clearTimeout(index_post_1.orderIntervals.get(id));
            index_post_1.orderIntervals.delete(id);
        }
        await db_1.models.binaryOrder.update({
            status: "CANCELED",
            closePrice: currentPrice,
        }, {
            where: {
                id,
            },
        });
        return { message: "Order cancelled" };
    }
    catch (error) {
        if (error.statusCode === 503) {
            throw error;
        }
        console.error("Error cancelling binary order:", error);
        throw (0, error_1.createError)(500, "An error occurred while cancelling the order");
    }
};
