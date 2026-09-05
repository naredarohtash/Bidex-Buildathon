"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Pending deposits and withdrawals",
    operationId: "listFinanceRequests",
    tags: ["Admin", "Finance"],
    description: "Lists deposits and withdrawals awaiting an operator decision.",
    requiresAuth: true,
    permission: "view.deposit",
    parameters: [
        {
            name: "kind",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["deposit", "withdraw"] },
        },
        {
            name: "status",
            in: "query",
            required: false,
            description: "Defaults to PENDING.",
            schema: { type: "string" },
        },
    ],
    responses: {
        200: { description: "Pending requests" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
    },
};
function parseMeta(raw) {
    try {
        return typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    }
    catch (_a) {
        return {};
    }
}
exports.default = async (data) => {
    var _a, _b, _c;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const kind = String(((_b = data.query) === null || _b === void 0 ? void 0 : _b.kind) || "").toLowerCase();
    const types = kind === "deposit" ? ["DEPOSIT"] : kind === "withdraw" ? ["WITHDRAW"] : ["DEPOSIT", "WITHDRAW"];
    const status = String(((_c = data.query) === null || _c === void 0 ? void 0 : _c.status) || "PENDING").toUpperCase();
    const rows = await db_1.models.transaction.findAll({
        where: { type: types, status },
        order: [["createdAt", "ASC"]],
        limit: 200,
        include: [
            {
                model: db_1.models.user,
                as: "user",
                attributes: ["id", "firstName", "lastName", "email"],
            },
        ],
    });
    const actionable = rows.filter((row) => {
        if (row.type !== "DEPOSIT")
            return true;
        const meta = parseMeta(row.metadata);
        if (meta.kind !== "CRYPTO")
            return true;
        const state = String(meta.paymentStatus || "").toLowerCase();
        return state !== "" && state !== "waiting";
    });
    return {
        items: actionable.map((row) => {
            var _a, _b;
            const meta = parseMeta(row.metadata);
            return {
                id: row.id,
                kind: row.type === "DEPOSIT" ? "deposit" : "withdraw",
                status: row.status,
                amount: Number(row.amount) || 0,
                claimedAmount: (_a = meta.claimedAmount) !== null && _a !== void 0 ? _a : null,
                fee: Number(row.fee) || 0,
                methodId: meta.methodId || null,
                methodLabel: row.description || null,
                networkLabel: meta.networkLabel || null,
                payoutCurrency: meta.payoutCurrency || null,
                details: row.type === "WITHDRAW" ? meta.details || null : null,
                reference: row.referenceId || null,
                endedBy: meta.cancelledBy || (meta.decidedBy ? "OPERATOR" : null),
                endedAt: meta.cancelledAt || meta.decidedAt || null,
                operatorId: meta.decidedBy || null,
                operatorNote: meta.note || null,
                refunded: (_b = meta.refunded) !== null && _b !== void 0 ? _b : null,
                user: row.user
                    ? {
                        id: row.user.id,
                        name: [row.user.firstName, row.user.lastName].filter(Boolean).join(" "),
                        email: row.user.email,
                    }
                    : null,
                createdAt: row.createdAt,
                waitingHours: Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 3600000),
            };
        }),
    };
};
