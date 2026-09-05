"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const wallet_credit_1 = require("../../../../finance/wallet-credit");
exports.metadata = {
    summary: "Approve or reject a deposit or withdrawal",
    operationId: "decideFinanceRequest",
    tags: ["Admin", "Finance"],
    description: "Approves or rejects a pending request. Approving a deposit credits the wallet; rejecting a withdrawal returns the held funds.",
    requiresAuth: true,
    permission: "edit.deposit",
    parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string" } },
    ],
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        action: { type: "string", enum: ["approve", "reject"] },
                        amount: {
                            type: "number",
                            description: "Deposit approvals only: the amount actually received, in USDT.",
                        },
                        note: { type: "string", description: "Reason, shown to nobody but recorded." },
                        reference: { type: "string", description: "Payout reference for a completed withdrawal." },
                    },
                    required: ["action"],
                },
            },
        },
    },
    responses: {
        200: { description: "Decision applied" },
        400: { description: "Invalid request" },
        404: { description: "Request not found" },
        409: { description: "Already decided" },
    },
};
exports.default = async (data) => {
    var _a, _b, _c, _d, _e;
    const operator = data === null || data === void 0 ? void 0 : data.user;
    if (!(operator === null || operator === void 0 ? void 0 : operator.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const id = String(((_a = data.params) === null || _a === void 0 ? void 0 : _a.id) || "");
    const action = String(((_b = data.body) === null || _b === void 0 ? void 0 : _b.action) || "").toLowerCase();
    const note = String(((_c = data.body) === null || _c === void 0 ? void 0 : _c.note) || "").slice(0, 500);
    if (action !== "approve" && action !== "reject") {
        throw (0, error_1.createError)({ statusCode: 400, message: "action must be approve or reject." });
    }
    const row = await db_1.models.transaction.findByPk(id);
    if (!row)
        throw (0, error_1.createError)({ statusCode: 404, message: "Request not found." });
    if (row.status !== "PENDING") {
        throw (0, error_1.createError)({ statusCode: 409, message: `This request is already ${row.status}.` });
    }
    let meta = {};
    try {
        meta = typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : row.metadata || {};
    }
    catch (_f) {
        meta = {};
    }
    const decidedBy = { decidedBy: operator.id, decidedAt: new Date().toISOString(), note };
    if (row.type === "DEPOSIT" && action === "approve") {
        const amount = Number((_d = data.body) === null || _d === void 0 ? void 0 : _d.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: `Enter the amount actually received, in ${wallet_credit_1.BALANCE_CURRENCY}.`,
            });
        }
        const outcome = await (0, wallet_credit_1.creditWallet)({
            transactionId: id,
            userId: row.userId,
            amount,
            settledMeta: { ...meta, ...decidedBy, verifiedBy: "MANUAL" },
        });
        if (outcome.status === "ALREADY_SETTLED") {
            throw (0, error_1.createError)({ statusCode: 409, message: "This deposit was already credited." });
        }
        if (outcome.status !== "CREDITED") {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: outcome.reason || "Could not credit this deposit.",
            });
        }
        await (0, wallet_credit_1.announceBalance)(row.userId, wallet_credit_1.BALANCE_CURRENCY, outcome.balance);
        return {
            id,
            status: "COMPLETED",
            message: `Credited ${outcome.amount.toFixed(2)} ${wallet_credit_1.BALANCE_CURRENCY}.`,
        };
    }
    if (row.type === "DEPOSIT" && action === "reject") {
        await db_1.models.transaction.update({ status: "REJECTED", metadata: JSON.stringify({ ...meta, ...decidedBy }) }, { where: { id, status: "PENDING" } });
        return { id, status: "REJECTED", message: "Deposit rejected." };
    }
    if (row.type === "WITHDRAW" && action === "approve") {
        const reference = String(((_e = data.body) === null || _e === void 0 ? void 0 : _e.reference) || "").slice(0, 191);
        const [updated] = await db_1.models.transaction.update({
            status: "COMPLETED",
            ...(reference ? { referenceId: reference } : {}),
            metadata: JSON.stringify({ ...meta, ...decidedBy, paidAt: new Date().toISOString() }),
        }, { where: { id, status: "PENDING" } });
        if (!updated)
            throw (0, error_1.createError)({ statusCode: 409, message: "This request was already decided." });
        return { id, status: "COMPLETED", message: "Marked as paid." };
    }
    const refund = Number(row.amount || 0) + Number(row.fee || 0);
    const result = await db_1.sequelize.transaction(async (t) => {
        const [claimed] = await db_1.models.transaction.update({ status: "REJECTED", metadata: JSON.stringify({ ...meta, ...decidedBy, refunded: refund }) }, { where: { id, status: "PENDING" }, transaction: t });
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
    if (!result.ok)
        throw (0, error_1.createError)({ statusCode: 409, message: "This request was already decided." });
    await (0, wallet_credit_1.announceBalance)(row.userId, wallet_credit_1.BALANCE_CURRENCY, result.balance);
    return {
        id,
        status: "REJECTED",
        message: `Rejected. ${refund.toFixed(2)} ${wallet_credit_1.BALANCE_CURRENCY} returned to the account.`,
    };
};
