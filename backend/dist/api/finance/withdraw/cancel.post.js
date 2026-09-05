"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const wallet_credit_1 = require("../wallet-credit");
exports.metadata = {
    summary: "Cancel your own pending withdrawal",
    operationId: "cancelWithdrawal",
    tags: ["Finance", "Withdraw"],
    description: "Cancels a withdrawal that has not been paid out yet and returns the held amount and fee to the balance. Only the person who made the request can cancel it, and only while it is still pending.",
    requiresAuth: true,
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: { id: { type: "string", description: "The withdrawal to cancel." } },
                    required: ["id"],
                },
            },
        },
    },
    responses: {
        200: { description: "Cancelled and refunded" },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        403: { description: "Not your withdrawal" },
        404: { description: "Not found" },
        409: { description: "Already decided" },
    },
};
exports.default = async (data) => {
    var _a;
    const user = data === null || data === void 0 ? void 0 : data.user;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const id = String(((_a = data === null || data === void 0 ? void 0 : data.body) === null || _a === void 0 ? void 0 : _a.id) || "").trim();
    if (!id)
        throw (0, error_1.createError)({ statusCode: 400, message: "Which withdrawal?" });
    const row = await db_1.models.transaction.findByPk(id);
    if (!row || row.type !== "WITHDRAW") {
        throw (0, error_1.createError)({ statusCode: 404, message: "Withdrawal not found." });
    }
    if (row.userId !== user.id)
        throw (0, error_1.createError)({ statusCode: 403, message: "Forbidden" });
    if (row.status !== "PENDING") {
        throw (0, error_1.createError)({
            statusCode: 409,
            message: row.status === "COMPLETED"
                ? "This withdrawal has already been paid out and cannot be cancelled."
                : `This withdrawal is already ${String(row.status).toLowerCase()}.`,
        });
    }
    let meta = {};
    try {
        meta = typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : row.metadata || {};
    }
    catch (_b) {
        meta = {};
    }
    const refund = Number(row.amount || 0) + Number(row.fee || 0);
    const cancelled = {
        cancelledAt: new Date().toISOString(),
        cancelledBy: "USER",
        refunded: refund,
    };
    const result = await db_1.sequelize.transaction(async (t) => {
        const [claimed] = await db_1.models.transaction.update({ status: "CANCELLED", metadata: JSON.stringify({ ...meta, ...cancelled }) }, { where: { id, status: "PENDING" }, transaction: t });
        if (!claimed)
            return { ok: false };
        const wallet = await db_1.models.wallet.findOne({
            where: { userId: row.userId, currency: wallet_credit_1.BALANCE_CURRENCY, type: wallet_credit_1.BALANCE_WALLET_TYPE },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!wallet) {
            const created = await db_1.models.wallet.create({ userId: row.userId, type: wallet_credit_1.BALANCE_WALLET_TYPE, currency: wallet_credit_1.BALANCE_CURRENCY, balance: refund }, { transaction: t });
            return { ok: true, balance: Number(created.balance) };
        }
        const balance = Number(wallet.balance || 0) + refund;
        await db_1.models.wallet.update({ balance }, { where: { id: wallet.id }, transaction: t });
        return { ok: true, balance };
    });
    if (!result.ok) {
        throw (0, error_1.createError)({
            statusCode: 409,
            message: "This withdrawal was just decided by our team. Refresh to see where it stands.",
        });
    }
    await (0, wallet_credit_1.announceBalance)(user.id, wallet_credit_1.BALANCE_CURRENCY, result.balance);
    return {
        id,
        status: "CANCELLED",
        balance: result.balance,
        refunded: refund,
        message: `Withdrawal cancelled. ${refund.toFixed(2)} ${wallet_credit_1.BALANCE_CURRENCY} is back in your balance.`,
    };
};
