"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const nowpayments_1 = require("../nowpayments");
const wallet_credit_1 = require("../wallet-credit");
const deposit_bonus_1 = require("../deposit-bonus");
exports.metadata = {
    summary: "Payment processor callback",
    operationId: "depositIpn",
    tags: ["Finance", "Deposit"],
    description: "Receives payment status callbacks from NOWPayments. Public by necessity; every request is signature-verified.",
    requiresAuth: false,
    responses: {
        200: { description: "Acknowledged" },
        401: { description: "Signature missing or invalid" },
    },
};
exports.default = async (data) => {
    var _a, _b, _c, _d;
    const body = data === null || data === void 0 ? void 0 : data.body;
    const signature = ((_a = data === null || data === void 0 ? void 0 : data.headers) === null || _a === void 0 ? void 0 : _a["x-nowpayments-sig"]) || ((_b = data === null || data === void 0 ? void 0 : data.headers) === null || _b === void 0 ? void 0 : _b["X-NOWPAYMENTS-SIG"]);
    if (!(await (0, nowpayments_1.verifyCallback)(body, signature))) {
        console.error("[NOWPAY] rejected an unsigned or badly signed callback");
        return { statusCode: 401, ok: false };
    }
    const orderId = String((body === null || body === void 0 ? void 0 : body.order_id) || "").trim();
    const paymentId = String((body === null || body === void 0 ? void 0 : body.payment_id) || "").trim();
    const state = (0, nowpayments_1.classify)(body === null || body === void 0 ? void 0 : body.payment_status);
    if (!orderId) {
        console.error(`[NOWPAY] callback with no order_id (payment ${paymentId})`);
        return { ok: true, ignored: "no order id" };
    }
    const deposit = await db_1.models.transaction.findByPk(orderId);
    if (!deposit || deposit.type !== "DEPOSIT") {
        console.error(`[NOWPAY] callback for unknown deposit ${orderId}`);
        return { ok: true, ignored: "unknown deposit" };
    }
    if (deposit.status !== "PENDING")
        return { ok: true, ignored: "already settled" };
    let meta = {};
    try {
        meta = typeof deposit.metadata === "string" ? JSON.parse(deposit.metadata) : deposit.metadata || {};
    }
    catch (_e) {
        meta = {};
    }
    if (state === "FAILED") {
        await db_1.models.transaction.update({
            status: "FAILED",
            metadata: JSON.stringify({ ...meta, paymentStatus: body === null || body === void 0 ? void 0 : body.payment_status, paymentId }),
        }, { where: { id: orderId, status: "PENDING" } });
        return { ok: true, status: "FAILED" };
    }
    if (state !== "CREDIT") {
        await db_1.models.transaction.update({ metadata: JSON.stringify({ ...meta, paymentStatus: body === null || body === void 0 ? void 0 : body.payment_status, paymentId }) }, { where: { id: orderId, status: "PENDING" } });
        return { ok: true, status: "PENDING" };
    }
    const outcome = Number(body === null || body === void 0 ? void 0 : body.outcome_amount);
    const requested = Number(body === null || body === void 0 ? void 0 : body.price_amount);
    const credited = Number.isFinite(outcome) && outcome > 0 ? outcome : requested;
    if (!Number.isFinite(credited) || credited <= 0) {
        console.error(`[NOWPAY] callback for ${orderId} carried no usable amount`);
        return { ok: true, ignored: "no amount" };
    }
    let bonusAmount = 0;
    let bonusRecord = null;
    if (meta.bonusCode) {
        const applied = await (0, deposit_bonus_1.evaluateBonus)({
            rawCode: String(meta.bonusCode),
            deposit: credited,
            userId: deposit.userId,
            methodId: meta.methodId,
        });
        if (applied.ok) {
            bonusAmount = applied.amount;
            bonusRecord = applied.code;
        }
    }
    const result = await (0, wallet_credit_1.creditWallet)({
        transactionId: orderId,
        userId: deposit.userId,
        amount: credited + bonusAmount,
        bonus: bonusRecord
            ? { code: bonusRecord, amount: bonusAmount, depositAmount: credited }
            : null,
        settledMeta: {
            ...meta,
            verifiedBy: "NOWPAYMENTS",
            verifiedAt: new Date().toISOString(),
            paymentId,
            paymentStatus: body === null || body === void 0 ? void 0 : body.payment_status,
            actuallyPaid: (_c = body === null || body === void 0 ? void 0 : body.actually_paid) !== null && _c !== void 0 ? _c : null,
            payCurrency: (_d = body === null || body === void 0 ? void 0 : body.pay_currency) !== null && _d !== void 0 ? _d : null,
            depositAmount: credited,
            bonusAmount,
        },
    });
    if (result.status === "CREDITED") {
        await (0, wallet_credit_1.announceBalance)(deposit.userId, wallet_credit_1.BALANCE_CURRENCY, result.balance);
        console.log(`[NOWPAY] credited ${result.amount.toFixed(2)} to user ${deposit.userId} (payment ${paymentId})`);
    }
    return { ok: true, status: result.status };
};
