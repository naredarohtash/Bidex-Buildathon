"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const wallet_credit_1 = require("../wallet-credit");
exports.metadata = {
    summary: "Deposit and withdrawal history",
    operationId: "getFinanceLedger",
    tags: ["Finance"],
    description: "Returns the caller's deposits and withdrawals, newest first.",
    requiresAuth: true,
    parameters: [
        {
            name: "kind",
            in: "query",
            required: false,
            description: "Limit to deposits or withdrawals. Omit for both.",
            schema: { type: "string", enum: ["deposit", "withdraw"] },
        },
        {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", default: 50 },
        },
    ],
    responses: {
        200: { description: "History" },
        401: { description: "Unauthorized" },
    },
};
const KINDS = { deposit: "DEPOSIT", withdraw: "WITHDRAW" };
function parseMeta(raw) {
    try {
        return typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    }
    catch (_a) {
        return {};
    }
}
exports.default = async (data) => {
    var _a, _b;
    const user = data === null || data === void 0 ? void 0 : data.user;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const kind = String(((_a = data.query) === null || _a === void 0 ? void 0 : _a.kind) || "").toLowerCase();
    const types = kind in KINDS ? [KINDS[kind]] : [KINDS.deposit, KINDS.withdraw];
    const requested = Number((_b = data.query) === null || _b === void 0 ? void 0 : _b.limit);
    const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 50, 200);
    const rows = await db_1.models.transaction.findAll({
        where: { userId: user.id, type: types },
        order: [["createdAt", "DESC"]],
        limit,
    });
    const items = rows.map((row) => {
        var _a;
        const meta = parseMeta(row.metadata);
        const isDeposit = row.type === "DEPOSIT";
        return {
            id: row.id,
            kind: isDeposit ? "deposit" : "withdraw",
            status: row.status,
            amount: Number(row.amount) || 0,
            claimedAmount: (_a = meta.claimedAmount) !== null && _a !== void 0 ? _a : null,
            fee: Number(row.fee) || 0,
            currency: wallet_credit_1.BALANCE_CURRENCY,
            methodId: meta.methodId || null,
            methodLabel: row.description || null,
            networkLabel: meta.networkLabel || null,
            reference: row.referenceId || null,
            payoutCurrency: meta.payoutCurrency || null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    });
    const settled = items.filter((i) => i.status === "COMPLETED");
    return {
        currency: wallet_credit_1.BALANCE_CURRENCY,
        items,
        totals: {
            deposited: settled.filter((i) => i.kind === "deposit").reduce((n, i) => n + i.amount, 0),
            withdrawn: settled.filter((i) => i.kind === "withdraw").reduce((n, i) => n + i.amount, 0),
            pendingDeposits: items.filter((i) => i.kind === "deposit" && i.status === "PENDING").length,
            pendingWithdrawals: items.filter((i) => i.kind === "withdraw" && i.status === "PENDING").length,
        },
    };
};
