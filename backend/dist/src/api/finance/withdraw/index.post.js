"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const wallet_methods_1 = require("../wallet-methods");
const wallet_credit_1 = require("../wallet-credit");
exports.metadata = {
    summary: "Request a withdrawal",
    operationId: "createWithdrawal",
    tags: ["Finance", "Withdraw"],
    description: "Places a withdrawal request and puts the amount plus fee on hold. Payout is released by an operator.",
    requiresAuth: true,
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        methodId: { type: "string" },
                        amount: { type: "number", description: `Amount in ${wallet_credit_1.BALANCE_CURRENCY}` },
                        details: { type: "object", description: "Payout destination fields for the method" },
                    },
                    required: ["methodId", "amount", "details"],
                },
            },
        },
    },
    responses: {
        200: { description: "Withdrawal requested" },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        402: { description: "Insufficient balance" },
    },
};
exports.default = async (data) => {
    const user = data === null || data === void 0 ? void 0 : data.user;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const { methodId, amount, details } = data.body || {};
    const method = (0, wallet_methods_1.findWithdrawMethod)(String(methodId || ""));
    if (!method)
        throw (0, error_1.createError)({ statusCode: 400, message: "Choose a withdrawal method." });
    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested <= 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Enter a valid amount." });
    }
    if (requested < method.min) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `The minimum withdrawal for ${method.label} is ${method.min} ${wallet_credit_1.BALANCE_CURRENCY}.`,
        });
    }
    const checked = (0, wallet_methods_1.validateWithdrawDetails)(method, details);
    if (!checked.ok)
        throw (0, error_1.createError)({ statusCode: 400, message: checked.error });
    const total = requested + method.fee;
    const result = await db_1.sequelize.transaction(async (t) => {
        const wallet = await db_1.models.wallet.findOne({
            where: { userId: user.id, currency: wallet_credit_1.BALANCE_CURRENCY, type: wallet_credit_1.BALANCE_WALLET_TYPE },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        const balance = Number((wallet === null || wallet === void 0 ? void 0 : wallet.balance) || 0);
        if (!wallet || balance < total) {
            return { ok: false, balance, needed: total };
        }
        const remaining = balance - total;
        await db_1.models.wallet.update({ balance: remaining }, { where: { id: wallet.id }, transaction: t });
        const tx = await db_1.models.transaction.create({
            userId: user.id,
            walletId: wallet.id,
            type: "WITHDRAW",
            status: "PENDING",
            amount: requested,
            fee: method.fee,
            description: `${method.label} withdrawal`,
            metadata: JSON.stringify({
                methodId: method.id,
                kind: method.kind,
                payoutCurrency: method.payoutCurrency,
                networkLabel: method.networkLabel,
                settlement: method.settlement,
                details: checked.details,
                requestedAt: new Date().toISOString(),
            }),
        }, { transaction: t });
        return { ok: true, id: tx.id, remaining };
    });
    if (!result.ok) {
        throw (0, error_1.createError)({
            statusCode: 402,
            message: `Not enough balance. You need ${result.needed.toFixed(2)} ${wallet_credit_1.BALANCE_CURRENCY} including the fee, and have ${result.balance.toFixed(2)}.`,
        });
    }
    await (0, wallet_credit_1.announceBalance)(user.id, wallet_credit_1.BALANCE_CURRENCY, result.remaining);
    return {
        id: result.id,
        status: "PENDING",
        balance: result.remaining,
        message: method.settlement === "MANUAL"
            ? `Withdrawal requested. Payouts to ${method.label} are checked by our team and usually take ${method.eta}.`
            : `Withdrawal requested. It is usually released within ${method.eta}.`,
    };
};
