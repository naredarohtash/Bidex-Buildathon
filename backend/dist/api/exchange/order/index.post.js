"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.updateWalletQuery = updateWalletQuery;
exports.createOrder = createOrder;
const db_1 = require("@b/db");
const utils_1 = require("../utils");
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const index_ws_1 = require("./index.ws");
const query_1 = require("@b/utils/query");
const utils_2 = require("./utils");
exports.metadata = {
    summary: "Create Order",
    operationId: "createOrder",
    tags: ["Exchange", "Orders"],
    description: "Creates a new order for the authenticated user.",
    requestBody: {
        description: "Order creation data.",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        currency: {
                            type: "string",
                            description: "Currency symbol (e.g., BTC)",
                        },
                        pair: { type: "string", description: "Pair symbol (e.g., USDT)" },
                        type: {
                            type: "string",
                            description: "Order type (e.g., limit, market)",
                        },
                        side: { type: "string", description: "Order side (buy or sell)" },
                        amount: { type: "number", description: "Order amount" },
                        price: {
                            type: "number",
                            description: "Order price, required for limit orders",
                        },
                    },
                    required: ["currency", "pair", "type", "side", "amount"],
                },
            },
        },
        required: true,
    },
    responses: (0, query_1.createRecordResponses)("Order"),
    requiresAuth: true,
};
exports.default = async (data) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const { user, body } = data;
    if (!user) {
        throw new Error("User not found");
    }
    try {
        const unblockTime = await (0, utils_1.loadBanStatus)();
        if (await (0, utils_1.handleBanStatus)(unblockTime)) {
            const waitTime = unblockTime - Date.now();
            throw new Error(`Service temporarily unavailable. Please try again in ${(0, utils_1.formatWaitTime)(waitTime)}.`);
        }
        const { currency, pair, amount, price, type, side } = body;
        if (!currency || !pair) {
            throw new Error("Invalid symbol");
        }
        const symbol = `${currency}/${pair}`;
        const market = (await db_1.models.exchangeMarket.findOne({
            where: { currency, pair },
        }));
        if (!market || !market.metadata) {
            throw new Error("Market data not found");
        }
        const minAmount = Number(((_c = (_b = (_a = market.metadata) === null || _a === void 0 ? void 0 : _a.limits) === null || _b === void 0 ? void 0 : _b.amount) === null || _c === void 0 ? void 0 : _c.min) || 0);
        const minCost = Number(((_f = (_e = (_d = market.metadata) === null || _d === void 0 ? void 0 : _d.limits) === null || _e === void 0 ? void 0 : _e.cost) === null || _f === void 0 ? void 0 : _f.min) || 0);
        if (amount < minAmount) {
            throw new Error(`Amount is too low. You need ${minAmount} ${currency}`);
        }
        const precision = Number(side === "BUY"
            ? market.metadata.precision.amount
            : market.metadata.precision.price) || 8;
        const feeCurrency = side === "BUY" ? currency : pair;
        const feeRate = side === "BUY"
            ? Number(market.metadata.taker)
            : Number(market.metadata.maker);
        const exchange = await exchange_1.default.startExchange();
        const provider = await exchange_1.default.getProvider();
        if (!exchange) {
            throw new Error("Exchange service is currently unavailable");
        }
        let orderPrice;
        if (type.toLowerCase() === "market") {
            const ticker = await exchange.fetchTicker(symbol);
            if (!ticker || !ticker.last) {
                throw new Error("Unable to fetch current market price");
            }
            orderPrice = ticker.last;
        }
        else {
            if (!price) {
                throw new Error("Price is required for limit orders");
            }
            orderPrice = price;
        }
        const feeCalculated = (amount * orderPrice * feeRate) / 100;
        const fee = parseFloat(feeCalculated.toFixed(precision));
        const costCalculated = side === "BUY" ? amount * orderPrice + fee : amount;
        const cost = parseFloat(costCalculated.toFixed(precision));
        if (cost < minCost) {
            console.log("Cost is too low:", { cost, minCost });
            throw new Error(`Cost is too low. You need ${minCost} ${pair}`);
        }
        const currencyWallet = await getOrCreateWallet(user.id, currency);
        const pairWallet = await getOrCreateWallet(user.id, pair);
        if (side === "BUY") {
            if (pairWallet.balance < cost) {
                throw new Error(`Insufficient balance. You need ${cost} ${pair}`);
            }
        }
        else {
            if (currencyWallet.balance < amount) {
                throw new Error(`Insufficient balance. You need ${amount} ${currency}`);
            }
        }
        let order;
        const isXT = provider === "xt";
        const isMarketOrder = type.toLowerCase() === "market";
        try {
            order = await exchange.createOrder(symbol, type.toLowerCase(), side.toLowerCase(), amount, type.toLowerCase() === "limit" || (isXT && isMarketOrder)
                ? orderPrice
                : undefined);
        }
        catch (error) {
            const sanitizedErrorMessage = (0, utils_1.sanitizeErrorMessage)(error.message);
            throw new Error(`Unable to process order: ${sanitizedErrorMessage}`);
        }
        if (!order || !order.id) {
            throw new Error("Unable to process order");
        }
        let orderData = await exchange.fetchOrder(order.id, symbol);
        if (!orderData) {
            throw new Error("Failed to fetch order");
        }
        orderData = (0, utils_2.adjustOrderData)(orderData, provider);
        if (side === "BUY") {
            await updateWalletQuery(pairWallet.id, pairWallet.balance - orderData.cost);
            if (orderData.status === "closed") {
                const receivedAmount = Number(orderData.amount) - (Number((_g = orderData.fee) === null || _g === void 0 ? void 0 : _g.cost) || fee);
                await updateWalletQuery(currencyWallet.id, currencyWallet.balance + receivedAmount);
            }
        }
        else {
            await updateWalletQuery(currencyWallet.id, currencyWallet.balance - orderData.amount);
            if (orderData.status === "closed") {
                const receivedAmount = Number(orderData.cost) - (Number((_h = orderData.fee) === null || _h === void 0 ? void 0 : _h.cost) || fee);
                await updateWalletQuery(pairWallet.id, pairWallet.balance + receivedAmount);
            }
        }
        const response = (await createOrder(user.id, {
            ...orderData,
            referenceId: order.id,
            feeCurrency: feeCurrency,
            fee: ((_j = orderData.fee) === null || _j === void 0 ? void 0 : _j.cost) || fee,
        }));
        if (!response) {
            throw new Error("Failed to create order");
        }
        (0, index_ws_1.addUserToWatchlist)(user.id);
        (0, index_ws_1.addOrderToTrackedOrders)(user.id, {
            id: response.id,
            status: response.status,
            price: orderData.price,
            amount: orderData.amount,
            filled: orderData.filled,
            remaining: orderData.remaining,
            timestamp: orderData.timestamp,
            cost: orderData.cost,
        });
        return {
            message: "Order created successfully",
        };
    }
    catch (error) {
        const sanitizedErrorMessage = (0, utils_1.sanitizeErrorMessage)(error.message);
        throw new Error(sanitizedErrorMessage);
    }
};
async function getOrCreateWallet(userId, currency) {
    let wallet = await db_1.models.wallet.findOne({
        where: {
            userId,
            currency,
            type: "SPOT",
        },
    });
    if (!wallet) {
        wallet = await createWallet(userId, currency);
    }
    return wallet;
}
const createWallet = async (userId, currency) => {
    return await db_1.models.wallet.create({
        userId,
        type: "SPOT",
        currency,
        balance: 0,
    });
};
async function updateWalletQuery(id, balance) {
    await db_1.models.wallet.update({
        balance,
    }, {
        where: {
            id,
        },
    });
    const wallet = await db_1.models.wallet.findByPk(id);
    if (!wallet) {
        throw new Error("Wallet not found");
    }
    return wallet.get({ plain: true });
}
async function createOrder(userId, order) {
    const mappedOrder = mapOrderData(order);
    return (await db_1.sequelize
        .transaction(async (transaction) => {
        const newOrder = await db_1.models.exchangeOrder.create({
            ...mappedOrder,
            userId: userId,
        }, { transaction });
        return newOrder.get({ plain: true });
    })
        .catch((error) => {
        console.error("Failed to create order:", error);
        throw error;
    }));
}
const mapOrderData = (order) => {
    return {
        referenceId: order.referenceId,
        status: order.status ? order.status.toUpperCase() : undefined,
        symbol: order.symbol,
        type: order.type ? order.type.toUpperCase() : undefined,
        timeInForce: order.timeInForce
            ? order.timeInForce.toUpperCase()
            : undefined,
        side: order.side ? order.side.toUpperCase() : undefined,
        price: Number(order.price),
        average: Number(order.average) || undefined,
        amount: Number(order.amount),
        filled: Number(order.filled),
        remaining: Number(order.remaining),
        cost: Number(order.cost),
        trades: JSON.stringify(order.trades),
        fee: order.fee,
        feeCurrency: order.feeCurrency,
    };
};
