"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "List deposit bonus codes",
    operationId: "listBonusCodes",
    tags: ["Admin", "Finance"],
    description: "All bonus codes with their conditions and usage to date.",
    requiresAuth: true,
    permission: "view.deposit",
    responses: {
        200: { description: "Bonus codes" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
    },
};
exports.default = async (data) => {
    var _a;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const rows = await db_1.models.bonusCode.findAll({ order: [["createdAt", "DESC"]], limit: 200 });
    const now = Date.now();
    return {
        items: rows.map((row) => {
            const startsAt = row.startsAt ? new Date(row.startsAt).getTime() : null;
            const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
            const exhausted = Number(row.maxUsesTotal) > 0 && Number(row.usedCount) >= Number(row.maxUsesTotal);
            const state = !row.status
                ? "PAUSED"
                : exhausted
                    ? "EXHAUSTED"
                    : startsAt && startsAt > now
                        ? "SCHEDULED"
                        : expiresAt && expiresAt < now
                            ? "EXPIRED"
                            : "LIVE";
            return {
                id: row.id,
                code: row.code,
                description: row.description,
                type: row.type,
                value: Number(row.value),
                minDeposit: Number(row.minDeposit),
                maxBonus: Number(row.maxBonus),
                maxUsesTotal: Number(row.maxUsesTotal),
                maxUsesPerUser: Number(row.maxUsesPerUser),
                firstDepositOnly: Boolean(row.firstDepositOnly),
                allowedMethods: row.allowedMethods || null,
                startsAt: row.startsAt,
                expiresAt: row.expiresAt,
                status: Boolean(row.status),
                usedCount: Number(row.usedCount),
                totalPaidOut: Number(row.totalPaidOut),
                state,
                createdAt: row.createdAt,
            };
        }),
    };
};
