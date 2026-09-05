"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BALANCE_WALLET_TYPE = exports.BALANCE_CURRENCY = void 0;
exports.settleDeposit = settleDeposit;
exports.creditWallet = creditWallet;
exports.settleDepositAndAnnounce = settleDepositAndAnnounce;
exports.announceBalance = announceBalance;
const db_1 = require("@b/db");
const binance_verify_1 = require("./binance-verify");
const wallet_methods_1 = require("./wallet-methods");
const deposit_bonus_1 = require("./deposit-bonus");
const BALANCE_CURRENCY = "USDT";
exports.BALANCE_CURRENCY = BALANCE_CURRENCY;
const BALANCE_WALLET_TYPE = "SPOT";
exports.BALANCE_WALLET_TYPE = BALANCE_WALLET_TYPE;
async function announceBalance(userId, currency, balance) {
    var _a, _b;
    try {
        const ws = require("@b/handler/Websocket");
        const broker = (_b = (_a = ws === null || ws === void 0 ? void 0 : ws.default) === null || _a === void 0 ? void 0 : _a.messageBroker) !== null && _b !== void 0 ? _b : ws === null || ws === void 0 ? void 0 : ws.messageBroker;
        if (!(broker === null || broker === void 0 ? void 0 : broker.broadcastToSubscribedClients))
            return;
        await broker.broadcastToSubscribedClients("/api/finance/wallet", { type: "wallet", userId, currency }, { type: "BALANCE_UPDATED", currency, balance, timestamp: Date.now() });
    }
    catch (err) {
        console.error(`[DEPOSIT] balance broadcast failed: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
    }
}
async function settleDeposit(transactionId) {
    const pending = await db_1.models.transaction.findByPk(transactionId);
    if (!pending)
        return { status: "REJECTED", reason: "Deposit not found." };
    if (pending.status !== "PENDING")
        return { status: "ALREADY_SETTLED" };
    let meta = {};
    try {
        meta = typeof pending.metadata === "string" ? JSON.parse(pending.metadata) : pending.metadata || {};
    }
    catch (_a) {
        meta = {};
    }
    const method = (0, wallet_methods_1.findDepositMethod)(meta.methodId);
    if (!method)
        return { status: "PENDING", reason: "Unknown deposit method — needs review." };
    if (method.kind !== "CRYPTO") {
        return { status: "PENDING", reason: "Waiting for our team to confirm the payment." };
    }
    const txId = String(pending.referenceId || "").trim();
    if (!txId)
        return { status: "PENDING", reason: "No transaction hash to check." };
    const found = await (0, binance_verify_1.findDepositByTxId)(txId, method.asset, method.network);
    if (!found) {
        return { status: "PENDING", reason: "Not yet visible on the network." };
    }
    if (!found.credited) {
        return {
            status: "PENDING",
            reason: `Waiting for confirmations (${found.confirmations}/${method.confirmations}).`,
        };
    }
    if (found.confirmations < method.confirmations) {
        return {
            status: "PENDING",
            reason: `Waiting for confirmations (${found.confirmations}/${method.confirmations}).`,
        };
    }
    const rate = await (0, binance_verify_1.priceInUsdt)(found.asset);
    if (rate === null) {
        return { status: "PENDING", reason: `Could not price ${found.asset} — needs review.` };
    }
    const credit = found.amount * rate;
    if (!Number.isFinite(credit) || credit <= 0) {
        return { status: "REJECTED", reason: "Deposit amount is not valid." };
    }
    let bonusAmount = 0;
    let bonusCode = null;
    let bonusRecord = null;
    if (meta.bonusCode) {
        const applied = await (0, deposit_bonus_1.evaluateBonus)({
            rawCode: String(meta.bonusCode),
            deposit: credit,
            userId: pending.userId,
            methodId: method.id,
        });
        if (applied.ok) {
            bonusAmount = applied.amount;
            bonusCode = applied.code.code;
            bonusRecord = applied.code;
        }
    }
    return await creditWallet({
        transactionId,
        userId: pending.userId,
        amount: credit + bonusAmount,
        bonus: bonusRecord ? { code: bonusRecord, amount: bonusAmount, depositAmount: credit } : null,
        settledMeta: {
            ...meta,
            verifiedBy: "BINANCE",
            verifiedAt: new Date().toISOString(),
            receivedAmount: found.amount,
            receivedAsset: found.asset,
            rateUsdt: rate,
            confirmations: found.confirmations,
            depositAddress: found.address,
            depositAmount: credit,
            bonusCode,
            bonusAmount,
        },
    });
}
async function creditWallet(args) {
    const { transactionId, userId, amount, settledMeta, bonus } = args;
    try {
        return await db_1.sequelize.transaction(async (t) => {
            const tx = await db_1.models.transaction.findByPk(transactionId, {
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!tx)
                return { status: "REJECTED", reason: "Deposit not found." };
            if (tx.status !== "PENDING")
                return { status: "ALREADY_SETTLED" };
            const wallet = await db_1.models.wallet.findOne({
                where: { userId, currency: BALANCE_CURRENCY, type: BALANCE_WALLET_TYPE },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            let balance;
            let walletId;
            if (wallet) {
                balance = Number(wallet.balance || 0) + amount;
                walletId = wallet.id;
                await db_1.models.wallet.update({ balance }, { where: { id: wallet.id }, transaction: t });
            }
            else {
                const created = await db_1.models.wallet.create({ userId, type: BALANCE_WALLET_TYPE, currency: BALANCE_CURRENCY, balance: amount }, { transaction: t });
                balance = amount;
                walletId = created.id;
            }
            await db_1.models.transaction.update({
                status: "COMPLETED",
                amount,
                walletId,
                metadata: JSON.stringify(settledMeta || {}),
            }, { where: { id: transactionId }, transaction: t });
            if (bonus) {
                await (0, deposit_bonus_1.recordRedemption)({
                    code: bonus.code,
                    userId,
                    transactionId,
                    amount: bonus.amount,
                    depositAmount: bonus.depositAmount,
                    transaction: t,
                });
            }
            return { status: "CREDITED", amount, balance };
        });
    }
    catch (err) {
        console.error(`[DEPOSIT] credit failed for ${transactionId}: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
        return { status: "PENDING", reason: "Could not complete right now." };
    }
}
async function settleDepositAndAnnounce(transactionId) {
    const result = await settleDeposit(transactionId);
    if (result.status === "CREDITED") {
        const tx = await db_1.models.transaction.findByPk(transactionId);
        if (tx)
            await announceBalance(tx.userId, BALANCE_CURRENCY, result.balance);
    }
    return result;
}
