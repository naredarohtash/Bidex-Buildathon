"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const error_1 = require("@b/utils/error");
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const utils_1 = require("@b/api/exchange/utils");
const query_1 = require("@b/utils/query");
const index_post_1 = require("../../index.post");
const audit_1 = require("../../util/audit");
const EARLY_CLOSE_FEE_PERCENT = parseFloat(process.env.BINARY_EARLY_CLOSE_FEE_PERCENT || "10");
const MIN_SECONDS_AFTER_ENTRY = parseInt(process.env.BINARY_EARLY_CLOSE_MIN_SECONDS || "30", 10);
const MIN_SECONDS_BEFORE_EXPIRY = parseInt(process.env.BINARY_EARLY_CLOSE_EXPIRY_GUARD_SECONDS || "10", 10);
const BULLISH = new Set(["RISE", "HIGHER", "TOUCH", "CALL", "UP"]);
exports.metadata = {
    summary: "Close Binary Order Early",
    operationId: "closeBinaryOrderEarly",
    tags: ["Binary", "Orders"],
    description: "Closes a pending binary order before expiry at the current market price, returning the stake plus any winnings less an early-close fee.",
    parameters: [
        {
            name: "id",
            in: "path",
            description: "ID of the binary order to close early.",
            required: true,
            schema: { type: "string" },
        },
    ],
    requestBody: {
        description: "Optional. No field here affects the payout — the price is resolved server-side.",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        isDemo: { type: "boolean" },
                    },
                },
            },
        },
        required: false,
    },
    responses: {
        200: {
            description: "Binary order closed early",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string" },
                            cashoutAmount: { type: "number" },
                            penalty: { type: "number" },
                            profit: { type: "number" },
                            closePrice: { type: "number" },
                            status: { type: "string" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Binary Order"),
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, params } = data;
    const { id } = params;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)(401, "Unauthorized");
    const order = await db_1.models.binaryOrder.findOne({
        where: { id, userId: user.id },
    });
    if (!order)
        throw (0, error_1.createError)(404, "Order not found");
    if (order.status !== "PENDING")
        throw (0, error_1.createError)(400, "Order is no longer open");
    const now = Date.now();
    const createdAt = new Date(order.createdAt).getTime();
    const expiryAt = new Date(order.closedAt).getTime();
    const heldFor = now - createdAt;
    if (heldFor < MIN_SECONDS_AFTER_ENTRY * 1000) {
        const wait = Math.ceil((MIN_SECONDS_AFTER_ENTRY * 1000 - heldFor) / 1000);
        throw (0, error_1.createError)(400, `Please wait ${wait}s before closing this position`);
    }
    const untilExpiry = expiryAt - now;
    if (untilExpiry < MIN_SECONDS_BEFORE_EXPIRY * 1000) {
        throw (0, error_1.createError)(400, "Too close to expiry to close early");
    }
    const isDemo = Boolean(order.isDemo);
    try {
        const unblockTime = await (0, utils_1.loadBanStatus)();
        if (await (0, utils_1.handleBanStatus)(unblockTime)) {
            throw (0, error_1.createError)(503, "Service temporarily unavailable. Please try again later.");
        }
        let closePrice = 0;
        if (String(order.symbol).toUpperCase().includes("OTC")) {
            closePrice = await (0, index_post_1.fetchOtcCurrentPrice)(order.symbol);
        }
        else {
            const exchange = await exchange_1.default.startExchange();
            if (!exchange) {
                throw (0, error_1.createError)(503, "Service temporarily unavailable. Please try again later.");
            }
            const ticker = await exchange.fetchTicker(order.symbol);
            closePrice = Number(ticker === null || ticker === void 0 ? void 0 : ticker.last) || 0;
        }
        if (!(closePrice > 0)) {
            throw (0, error_1.createError)(503, "No live price for this market right now");
        }
        const entryPrice = Number(order.price);
        const stake = Number(order.amount);
        const profitPercentage = Number(order.profitPercentage) || 87;
        const isWinning = BULLISH.has(String(order.side))
            ? closePrice > entryPrice
            : closePrice < entryPrice;
        const totalDuration = Math.max(1, expiryAt - createdAt);
        const progress = Math.min(1, heldFor / totalDuration);
        let netProfit;
        let penalty = 0;
        if (isWinning) {
            const grossProfit = (stake * profitPercentage) / 100;
            penalty = (grossProfit * (EARLY_CLOSE_FEE_PERCENT * (1 - progress))) / 100;
            netProfit = grossProfit - penalty;
        }
        else {
            netProfit = -stake;
        }
        const round = (n) => Math.round(n * 100) / 100;
        netProfit = round(netProfit);
        penalty = round(penalty);
        const cashoutAmount = isWinning ? round(stake + netProfit) : 0;
        const finalStatus = isWinning ? "WIN" : "LOSS";
        const dbTx = await db_1.sequelize.transaction();
        try {
            const [affected] = await db_1.models.binaryOrder.update({
                status: finalStatus,
                closePrice,
                profit: isWinning ? netProfit : 0,
                closedAt: new Date(),
            }, { where: { id: order.id, status: "PENDING" }, transaction: dbTx });
            if (affected === 0) {
                await dbTx.rollback();
                throw (0, error_1.createError)(409, "This position has already been settled");
            }
            if (!isDemo && cashoutAmount > 0) {
                const transaction = await db_1.models.transaction.findOne({
                    where: { referenceId: order.id },
                    transaction: dbTx,
                });
                const wallet = transaction
                    ? await db_1.models.wallet.findOne({
                        where: { id: transaction.walletId },
                        transaction: dbTx,
                    })
                    : null;
                if (!wallet) {
                    await dbTx.rollback();
                    throw (0, error_1.createError)(404, "Wallet not found");
                }
                await db_1.models.wallet.update({ balance: (0, sequelize_1.literal)(`balance + ${cashoutAmount}`) }, { where: { id: wallet.id }, transaction: dbTx });
                if (transaction) {
                    await db_1.models.transaction.update({
                        status: "COMPLETED",
                        description: `Binary Position closed early | Market: ${order.symbol} | Stake: ${stake} USDT | Close: ${closePrice} | Fee: ${penalty} USDT | Returned: ${cashoutAmount} USDT`,
                    }, { where: { id: transaction.id }, transaction: dbTx });
                }
                (0, audit_1.writeAuditLog)({
                    action: "BINARY_ORDER_CLOSED_EARLY",
                    userId: user.id,
                    walletId: wallet.id,
                    orderId: order.id,
                    amount: cashoutAmount,
                    price: closePrice,
                    side: String(order.side),
                    detail: `stake=${stake} fee=${penalty} profit=${netProfit} status=${finalStatus}`,
                });
            }
            else {
                (0, audit_1.writeAuditLog)({
                    action: "BINARY_ORDER_CLOSED_EARLY",
                    userId: user.id,
                    orderId: order.id,
                    amount: cashoutAmount,
                    price: closePrice,
                    side: String(order.side),
                    detail: `demo=${isDemo} stake=${stake} fee=${penalty} profit=${netProfit} status=${finalStatus}`,
                });
            }
            await dbTx.commit();
        }
        catch (err) {
            await dbTx.rollback().catch(() => { });
            throw err;
        }
        if (index_post_1.orderIntervals.has(id)) {
            clearTimeout(index_post_1.orderIntervals.get(id));
            index_post_1.orderIntervals.delete(id);
        }
        return {
            message: "Position closed",
            cashoutAmount,
            penalty,
            profit: netProfit,
            closePrice,
            status: finalStatus,
        };
    }
    catch (error) {
        if (error === null || error === void 0 ? void 0 : error.statusCode)
            throw error;
        (0, audit_1.captureException)(error, { path: "binary.order.closeEarly", orderId: id });
        console.error("Error closing binary order early:", error);
        throw (0, error_1.createError)(500, "An error occurred while closing the position");
    }
};
