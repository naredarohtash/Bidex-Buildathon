"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
exports.metadata = {
    summary: "Abandon an unpaid deposit",
    operationId: "abandonDeposit",
    tags: ["Finance", "Deposit"],
    description: "Marks a deposit the trader walked away from. The address stays live and anything sent to it is still credited; this only records that nobody is waiting on it.",
    requiresAuth: true,
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: { id: { type: "string", description: "The deposit to abandon." } },
                    required: ["id"],
                },
            },
        },
    },
    responses: {
        200: { description: "Recorded" },
        400: { description: "Invalid request" },
        401: { description: "Unauthorized" },
        403: { description: "Not your deposit" },
    },
};
exports.default = async (data) => {
    var _a;
    const user = data === null || data === void 0 ? void 0 : data.user;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const id = String(((_a = data === null || data === void 0 ? void 0 : data.body) === null || _a === void 0 ? void 0 : _a.id) || "").trim();
    if (!id)
        throw (0, error_1.createError)({ statusCode: 400, message: "Which deposit?" });
    const deposit = await db_1.models.transaction.findByPk(id);
    if (!deposit || deposit.type !== "DEPOSIT")
        return { ok: true, status: "GONE" };
    if (deposit.userId !== user.id) {
        throw (0, error_1.createError)({ statusCode: 403, message: "Forbidden" });
    }
    if (deposit.status !== "PENDING")
        return { ok: true, status: deposit.status };
    let meta = {};
    try {
        meta =
            typeof deposit.metadata === "string"
                ? JSON.parse(deposit.metadata)
                : deposit.metadata || {};
    }
    catch (_b) {
        meta = {};
    }
    if (meta.abandonedAt)
        return { ok: true, status: "ABANDONED" };
    await db_1.models.transaction.update({ metadata: JSON.stringify({ ...meta, abandonedAt: new Date().toISOString() }) }, { where: { id, status: "PENDING" } });
    return { ok: true, status: "ABANDONED" };
};
