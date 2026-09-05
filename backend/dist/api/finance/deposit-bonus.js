"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findBonusCode = findBonusCode;
exports.bonusesConfigured = bonusesConfigured;
exports.evaluateBonus = evaluateBonus;
exports.recordRedemption = recordRedemption;
const db_1 = require("@b/db");
async function findBonusCode(raw) {
    const code = String(raw || "").trim().toUpperCase();
    if (!code)
        return null;
    return await db_1.models.bonusCode.findOne({ where: { code } });
}
async function bonusesConfigured() {
    try {
        return (await db_1.models.bonusCode.count({ where: { status: true } })) > 0;
    }
    catch (_a) {
        return false;
    }
}
function valueOf(code, deposit) {
    const raw = code.type === "FIXED" ? Number(code.value) : (deposit * Number(code.value)) / 100;
    const capped = Number(code.maxBonus) > 0 ? Math.min(raw, Number(code.maxBonus)) : raw;
    return Math.floor(capped * 100) / 100;
}
async function evaluateBonus(args) {
    const { rawCode, deposit, userId, methodId } = args;
    const code = await findBonusCode(rawCode);
    if (!code)
        return { ok: false, error: "That code is not valid." };
    if (!code.status)
        return { ok: false, error: "That code is no longer active." };
    const now = Date.now();
    if (code.startsAt && new Date(code.startsAt).getTime() > now) {
        return { ok: false, error: "That code is not active yet." };
    }
    if (code.expiresAt && new Date(code.expiresAt).getTime() < now) {
        return { ok: false, error: "That code has expired." };
    }
    const amount = Number(deposit);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, error: "Enter your deposit amount first." };
    }
    if (Number(code.minDeposit) > 0 && amount < Number(code.minDeposit)) {
        return { ok: false, error: `This code needs a deposit of at least ${code.minDeposit} USDT.` };
    }
    if (methodId && Array.isArray(code.allowedMethods) && code.allowedMethods.length > 0) {
        if (!code.allowedMethods.includes(methodId)) {
            return { ok: false, error: "This code cannot be used with that payment method." };
        }
    }
    if (Number(code.maxUsesTotal) > 0 && Number(code.usedCount) >= Number(code.maxUsesTotal)) {
        return { ok: false, error: "This code has reached its limit." };
    }
    if (userId) {
        if (Number(code.maxUsesPerUser) > 0) {
            const mine = await db_1.models.bonusRedemption.count({
                where: { bonusCodeId: code.id, userId },
            });
            if (mine >= Number(code.maxUsesPerUser)) {
                return {
                    ok: false,
                    error: Number(code.maxUsesPerUser) === 1
                        ? "You have already used this code."
                        : `You have already used this code ${code.maxUsesPerUser} times.`,
                };
            }
        }
        if (code.firstDepositOnly) {
            const completed = await db_1.models.transaction.count({
                where: { userId, type: "DEPOSIT", status: "COMPLETED" },
            });
            if (completed > 0) {
                return { ok: false, error: "This code is only for your first deposit." };
            }
        }
    }
    const payout = valueOf(code, amount);
    if (payout <= 0)
        return { ok: false, error: "This code adds nothing to that amount." };
    return { ok: true, code, amount: payout };
}
async function recordRedemption(args) {
    const { code, userId, transactionId, amount, depositAmount, transaction } = args;
    try {
        await db_1.models.bonusRedemption.create({ bonusCodeId: code.id, userId, transactionId, amount, depositAmount }, { transaction });
        await db_1.models.bonusCode.update({
            usedCount: Number(code.usedCount || 0) + 1,
            totalPaidOut: Number(code.totalPaidOut || 0) + amount,
        }, { where: { id: code.id }, transaction });
        return true;
    }
    catch (err) {
        console.error(`[BONUS] could not record redemption for ${transactionId}: ${err === null || err === void 0 ? void 0 : err.message}`);
        return false;
    }
}
