"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseOrderSchema = void 0;
exports.updateOrderData = updateOrderData;
exports.adjustOrderData = adjustOrderData;
const db_1 = require("@b/db");
async function updateOrderData(id, orderData) {
    var _a;
    const updateData = {
        status: orderData.status.toUpperCase(),
        filled: orderData.filled,
        remaining: orderData.remaining,
        cost: orderData.cost,
        fee: (_a = orderData.fee) === null || _a === void 0 ? void 0 : _a.cost,
        trades: orderData.trades,
        average: orderData.average,
    };
    const filteredUpdateData = Object.fromEntries(Object.entries(updateData).filter(([_, value]) => value !== undefined));
    await db_1.models.exchangeOrder.update(filteredUpdateData, {
        where: {
            id,
        },
    });
    const updatedOrder = await db_1.models.exchangeOrder.findOne({
        where: {
            id,
        },
    });
    if (!updatedOrder) {
        throw new Error("Order not found");
    }
    return updatedOrder.get({ plain: true });
}
const schema_1 = require("@b/utils/schema");
exports.baseOrderSchema = {
    id: (0, schema_1.baseStringSchema)("Unique identifier for the order"),
    referenceId: (0, schema_1.baseStringSchema)("External reference ID for the order"),
    userId: (0, schema_1.baseStringSchema)("User ID associated with the order"),
    status: (0, schema_1.baseStringSchema)("Status of the order (e.g., pending, completed)"),
    symbol: (0, schema_1.baseStringSchema)("Trading symbol for the order"),
    type: (0, schema_1.baseStringSchema)("Type of order (e.g., market, limit)"),
    timeInForce: (0, schema_1.baseStringSchema)("Time in force policy for the order"),
    side: (0, schema_1.baseStringSchema)("Order side (buy or sell)"),
    price: (0, schema_1.baseNumberSchema)("Price per unit"),
    average: (0, schema_1.baseNumberSchema)("Average price per unit"),
    amount: (0, schema_1.baseNumberSchema)("Total amount ordered"),
    filled: (0, schema_1.baseNumberSchema)("Amount filled"),
    remaining: (0, schema_1.baseNumberSchema)("Amount remaining"),
    cost: (0, schema_1.baseNumberSchema)("Total cost"),
    trades: {
        type: "object",
        description: "Details of trades executed for this order",
        additionalProperties: true,
    },
    fee: (0, schema_1.baseNumberSchema)("Transaction fee"),
    feeCurrency: (0, schema_1.baseStringSchema)("Currency of the transaction fee"),
    createdAt: (0, schema_1.baseStringSchema)("Creation date of the order"),
    updatedAt: (0, schema_1.baseStringSchema)("Last update date of the order"),
};
function adjustOrderData(order, provider) {
    if (provider === "xt") {
        const info = order.info;
        const side = info.side.toUpperCase();
        let amount, filled, remaining, cost, fee;
        const avgPrice = parseFloat(info.avgPrice);
        const executedQty = parseFloat(info.executedQty);
        const leavingQty = parseFloat(info.leavingQty);
        if (side === "BUY") {
            amount = executedQty / avgPrice;
            filled = amount;
            remaining = leavingQty / avgPrice;
            cost = executedQty;
            fee = { currency: info.feeCurrency, cost: parseFloat(info.fee) };
        }
        else if (side === "SELL") {
            amount = executedQty;
            filled = amount;
            remaining = leavingQty;
            cost = parseFloat(info.tradeQuote);
            fee = { currency: info.feeCurrency, cost: parseFloat(info.fee) };
        }
        else {
            amount = parseFloat(info.tradeBase);
            filled = parseFloat(info.executedQty);
            remaining = leavingQty;
            cost = parseFloat(info.tradeQuote);
            fee = { currency: info.feeCurrency, cost: parseFloat(info.fee) };
        }
        return {
            ...order,
            amount: amount,
            filled: filled,
            remaining: remaining,
            cost: cost,
            fee: fee,
            average: avgPrice,
            price: avgPrice,
        };
    }
    return order;
}
