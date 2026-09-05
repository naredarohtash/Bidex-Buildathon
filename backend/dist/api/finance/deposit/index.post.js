"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const wallet_1 = require("@b/services/wallet");
const wallet_methods_1 = require("../wallet-methods");
const wallet_credit_1 = require("../wallet-credit");
const nowpayments_1 = require("../nowpayments");
exports.metadata = {
    summary: "Open a deposit",
    operationId: "createDeposit",
    tags: ["Finance", "Deposit"],
    description: "Opens a deposit. Crypto returns a payment address unique to this deposit; UPI and bank record a reference for an operator.",
    requiresAuth: true,
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        methodId: { type: "string" },
                        amount: { type: "number" },
                        txId: { type: "string", description: "UPI/bank reference. Not used for crypto." },
                        bonusCode: { type: "string" },
                    },
                    required: ["methodId", "amount"],
                },
            },
        },
    },
    responses: {
        200: { description: "Deposit opened" },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        409: { description: "Reference already submitted" },
        503: { description: "Payment provider unavailable" },
    },
};
exports.default = async (data) => {
    const user = data === null || data === void 0 ? void 0 : data.user;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const { methodId, amount, txId, bonusCode } = data.body || {};
    const method = (0, wallet_methods_1.findDepositMethod)(String(methodId || ""));
    if (!method)
        throw (0, error_1.createError)({ statusCode: 400, message: "Choose a deposit method." });
    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested <= 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Enter a valid amount." });
    }
    if (requested < method.min) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `The minimum deposit for ${method.label} is ${method.min} ${method.kind === "CRYPTO" ? method.asset : "INR"}.`,
        });
    }
    const reference = String(txId || "").trim();
    if (reference) {
        const clash = await db_1.models.transaction.findOne({
            where: { referenceId: reference, type: "DEPOSIT" },
        });
        if (clash) {
            throw (0, error_1.createError)({ statusCode: 409, message: "That reference has already been submitted." });
        }
    }
    else if (method.kind !== "CRYPTO") {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Enter the ${method.referenceLabel.toLowerCase()} so we can find your payment.`,
        });
    }
    const { wallet } = await wallet_1.walletCreationService.getOrCreateWallet(user.id, wallet_credit_1.BALANCE_WALLET_TYPE, wallet_credit_1.BALANCE_CURRENCY);
    const baseMeta = {
        methodId: method.id,
        kind: method.kind,
        asset: method.asset,
        network: method.network,
        networkLabel: method.networkLabel,
        claimedAmount: requested,
        bonusCode: typeof bonusCode === "string" && bonusCode.trim() ? bonusCode.trim().toUpperCase() : null,
        submittedAt: new Date().toISOString(),
    };
    const created = await db_1.models.transaction.create({
        userId: user.id,
        walletId: wallet.id,
        type: "DEPOSIT",
        status: "PENDING",
        amount: 0,
        fee: 0,
        referenceId: reference || null,
        description: `${method.label} deposit via ${method.networkLabel}`,
        metadata: JSON.stringify(baseMeta),
    });
    if (method.kind !== "CRYPTO") {
        return {
            id: created.id,
            status: "PENDING",
            message: `We have your ${method.label} deposit. Our team confirms these against the account, usually within ${method.eta}.`,
        };
    }
    if (!(await (0, nowpayments_1.nowPaymentsConfigured)())) {
        await db_1.models.transaction.update({ status: "FAILED" }, { where: { id: created.id, status: "PENDING" } });
        throw (0, error_1.createError)({
            statusCode: 503,
            message: "Crypto deposits are not available right now. Please try again shortly.",
        });
    }
    const payment = await (0, nowpayments_1.createPayment)({
        priceAmount: requested,
        payCurrency: method.processorCurrency || method.asset,
        orderId: created.id,
        description: `${method.label} deposit`,
    });
    if (!payment) {
        await db_1.models.transaction.update({ status: "FAILED" }, { where: { id: created.id, status: "PENDING" } });
        throw (0, error_1.createError)({
            statusCode: 503,
            message: `Could not open a payment for that amount. The minimum for ${method.label} changes with network fees — try a little more, or another method.`,
        });
    }
    await db_1.models.transaction.update({
        metadata: JSON.stringify({
            ...baseMeta,
            paymentId: payment.paymentId,
            payAddress: payment.payAddress,
            payAmount: payment.payAmount,
            payCurrency: payment.payCurrency,
            validUntil: payment.validUntil,
        }),
    }, { where: { id: created.id } });
    return {
        id: created.id,
        status: "AWAITING_PAYMENT",
        payAddress: payment.payAddress,
        payinExtraId: payment.payinExtraId,
        payAmount: payment.payAmount,
        payCurrency: payment.payCurrency,
        validUntil: payment.validUntil,
        creditAmount: payment.priceAmount,
        message: `Send exactly ${payment.payAmount} ${payment.payCurrency} to the address shown. Your balance updates on its own once it confirms.`,
    };
};
