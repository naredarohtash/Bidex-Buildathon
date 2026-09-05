"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const wallet_credit_1 = require("../wallet-credit");
exports.metadata = {
    summary: "Check a deposit's progress",
    operationId: "depositStatus",
    tags: ["Finance", "Deposit"],
    description: "Reports whether a deposit has been credited yet. Read-only — polled by the payment screen.",
    requiresAuth: true,
    parameters: [
        {
            name: "id",
            in: "query",
            required: true,
            description: "The deposit to check.",
            schema: { type: "string" },
        },
    ],
    responses: {
        200: { description: "Current state" },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        403: { description: "Not your deposit" },
        404: { description: "No such deposit" },
    },
};
exports.default = async (data) => {
    var _a;
    const user = data === null || data === void 0 ? void 0 : data.user;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const id = String(((_a = data === null || data === void 0 ? void 0 : data.query) === null || _a === void 0 ? void 0 : _a.id) || "").trim();
    if (!id)
        throw (0, error_1.createError)({ statusCode: 400, message: "Which deposit?" });
    const deposit = await db_1.models.transaction.findByPk(id);
    if (!deposit || deposit.type !== "DEPOSIT") {
        throw (0, error_1.createError)({ statusCode: 404, message: "No such deposit." });
    }
    if (deposit.userId !== user.id)
        throw (0, error_1.createError)({ statusCode: 403, message: "Forbidden" });
    let meta = {};
    try {
        meta =
            typeof deposit.metadata === "string"
                ? JSON.parse(deposit.metadata)
                : deposit.metadata || {};
    }
    catch (_b) {
        meta = {};
    }
    let balance = null;
    if (deposit.status === "COMPLETED") {
        const wallet = await db_1.models.wallet.findOne({
            where: { userId: user.id, type: wallet_credit_1.BALANCE_WALLET_TYPE, currency: wallet_credit_1.BALANCE_CURRENCY },
        });
        balance = wallet ? Number(wallet.balance) : null;
    }
    return {
        id: deposit.id,
        status: deposit.status,
        credited: Number(deposit.amount) || 0,
        depositAmount: Number(meta.depositAmount) || null,
        bonusAmount: Number(meta.bonusAmount) || 0,
        paymentStatus: meta.paymentStatus || null,
        balance,
        currency: wallet_credit_1.BALANCE_CURRENCY,
    };
};
