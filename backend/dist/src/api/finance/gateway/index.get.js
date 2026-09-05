"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const wallet_methods_1 = require("../wallet-methods");
const nowpayments_1 = require("../nowpayments");
const deposit_bonus_1 = require("../deposit-bonus");
const wallet_credit_1 = require("../wallet-credit");
exports.metadata = {
    summary: "Deposit and withdrawal methods",
    operationId: "getFinanceGateways",
    tags: ["Finance"],
    description: "Lists the deposit methods (with live deposit addresses) and withdrawal methods available to the caller.",
    requiresAuth: true,
    responses: {
        200: {
            description: "Available methods",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            balanceCurrency: { type: "string" },
                            deposit: { type: "array", items: { type: "object" } },
                            withdraw: { type: "array", items: { type: "object" } },
                        },
                    },
                },
            },
        },
        401: { description: "Unauthorized" },
    },
};
exports.default = async (data) => {
    var _a;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id)) {
        throw new Error("Unauthorized");
    }
    const configured = await (0, nowpayments_1.nowPaymentsConfigured)();
    const wallet = await db_1.models.wallet.findOne({
        where: { userId: data.user.id, currency: wallet_credit_1.BALANCE_CURRENCY, type: wallet_credit_1.BALANCE_WALLET_TYPE },
        attributes: ["balance"],
    });
    const deposit = await Promise.all(wallet_methods_1.DEPOSIT_METHODS.map(async (m) => {
        if (m.kind !== "CRYPTO") {
            const payTo = [];
            for (const spec of m.payToEnv || []) {
                const value = (process.env[spec.env] || "").trim();
                if (value)
                    payTo.push({ field: spec.field, label: spec.label, value });
            }
            const complete = payTo.length === (m.payToEnv || []).length && payTo.length > 0;
            return {
                id: m.id,
                label: m.label,
                kind: m.kind,
                asset: m.asset,
                network: m.network,
                networkLabel: m.networkLabel,
                min: m.min,
                confirmations: m.confirmations,
                eta: m.eta,
                settlement: m.settlement,
                referenceLabel: m.referenceLabel,
                referenceHint: m.referenceHint,
                address: null,
                tag: null,
                payTo: complete ? payTo : null,
                available: complete,
                unavailableReason: complete ? null : `${m.label} deposits are not set up yet.`,
            };
        }
        return {
            id: m.id,
            label: m.label,
            kind: m.kind,
            asset: m.asset,
            network: m.network,
            networkLabel: m.networkLabel,
            min: m.min,
            confirmations: m.confirmations,
            eta: m.eta,
            settlement: m.settlement,
            referenceLabel: m.referenceLabel,
            referenceHint: m.referenceHint,
            payTo: null,
            address: null,
            tag: null,
            available: configured,
            unavailableReason: configured ? null : "Crypto deposits are not configured yet.",
        };
    }));
    return {
        balanceCurrency: wallet_credit_1.BALANCE_CURRENCY,
        balance: Number((wallet === null || wallet === void 0 ? void 0 : wallet.balance) || 0),
        automaticDeposits: configured,
        bonusesEnabled: await (0, deposit_bonus_1.bonusesConfigured)(),
        deposit,
        withdraw: wallet_methods_1.WITHDRAW_METHODS.map((m) => ({
            id: m.id,
            label: m.label,
            kind: m.kind,
            payoutCurrency: m.payoutCurrency,
            networkLabel: m.networkLabel,
            min: m.min,
            fee: m.fee,
            eta: m.eta,
            settlement: m.settlement,
            fields: m.fields,
        })),
    };
};
