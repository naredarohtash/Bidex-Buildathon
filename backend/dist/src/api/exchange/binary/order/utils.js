"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseBinaryOrderSchema = void 0;
exports.ensureNotBanned = ensureNotBanned;
exports.ensureExchange = ensureExchange;
exports.getBinaryOrder = getBinaryOrder;
exports.getBinaryOrdersByStatus = getBinaryOrdersByStatus;
const schema_1 = require("@b/utils/schema");
const db_1 = require("@b/db");
const exchange_1 = __importDefault(require("@b/utils/exchange"));
const utils_1 = require("../../utils");
const error_1 = require("@b/utils/error");
async function ensureNotBanned() {
    const unblockTime = await (0, utils_1.loadBanStatus)();
    if (await (0, utils_1.handleBanStatus)(unblockTime)) {
        throw (0, error_1.createError)({
            statusCode: 503,
            message: "Service temporarily unavailable. Please try again later.",
        });
    }
}
async function ensureExchange() {
    await ensureNotBanned();
    const exchange = await exchange_1.default.startExchange();
    if (!exchange) {
        throw (0, error_1.createError)({
            statusCode: 503,
            message: "Service temporarily unavailable. Please try again later.",
        });
    }
    return exchange;
}
exports.baseBinaryOrderSchema = {
    id: (0, schema_1.baseStringSchema)("ID of the binary order", undefined, undefined, false, undefined, "uuid"),
    userId: (0, schema_1.baseStringSchema)("User ID associated with the order"),
    symbol: (0, schema_1.baseStringSchema)("Trading symbol"),
    price: (0, schema_1.baseNumberSchema)("Entry price of the order"),
    amount: (0, schema_1.baseNumberSchema)("Amount of the order"),
    profit: (0, schema_1.baseNumberSchema)("Profit from the order"),
    side: (0, schema_1.baseStringSchema)("Side of the order (e.g., BUY, SELL)"),
    type: (0, schema_1.baseStringSchema)("Type of order (e.g., LIMIT, MARKET)"),
    status: (0, schema_1.baseStringSchema)("Status of the order (e.g., OPEN, CLOSED)"),
    isDemo: (0, schema_1.baseBooleanSchema)("Whether the order is a demo"),
    closedAt: (0, schema_1.baseDateTimeSchema)("Time when the order was closed", true),
    closePrice: (0, schema_1.baseNumberSchema)("Price at which the order was closed"),
    createdAt: (0, schema_1.baseDateTimeSchema)("Creation date of the order"),
    updatedAt: (0, schema_1.baseDateTimeSchema)("Last update date of the order", true),
};
async function getBinaryOrder(userId, id) {
    const response = await db_1.models.binaryOrder.findOne({
        where: {
            id,
            userId,
        },
    });
    if (!response) {
        throw new Error(`Binary order with ID ${id} not found`);
    }
    return response.get({ plain: true });
}
async function getBinaryOrdersByStatus(status) {
    return await db_1.models.binaryOrder.findAll({
        where: {
            status: status,
        },
    });
}
