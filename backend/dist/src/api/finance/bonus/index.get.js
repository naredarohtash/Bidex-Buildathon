"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const deposit_bonus_1 = require("../deposit-bonus");
exports.metadata = {
    summary: "Check a deposit bonus code",
    operationId: "checkDepositBonus",
    tags: ["Finance", "Deposit"],
    description: "Validates a bonus code against an intended deposit amount and returns its value.",
    requiresAuth: true,
    parameters: [
        { name: "code", in: "query", required: true, schema: { type: "string" } },
        { name: "amount", in: "query", required: true, schema: { type: "number" } },
        { name: "methodId", in: "query", required: false, schema: { type: "string" } },
    ],
    responses: {
        200: { description: "Result of the check" },
        401: { description: "Unauthorized" },
    },
};
exports.default = async (data) => {
    var _a, _b, _c, _d;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    if (!(await (0, deposit_bonus_1.bonusesConfigured)())) {
        return { valid: false, enabled: false, error: "No bonus codes are active right now." };
    }
    const result = await (0, deposit_bonus_1.evaluateBonus)({
        rawCode: String(((_b = data.query) === null || _b === void 0 ? void 0 : _b.code) || ""),
        deposit: Number((_c = data.query) === null || _c === void 0 ? void 0 : _c.amount),
        userId: data.user.id,
        methodId: ((_d = data.query) === null || _d === void 0 ? void 0 : _d.methodId) ? String(data.query.methodId) : undefined,
    });
    if (!result.ok)
        return { valid: false, enabled: true, error: result.error };
    return {
        valid: true,
        enabled: true,
        code: result.code.code,
        type: result.code.type,
        percent: result.code.type === "PERCENTAGE" ? Number(result.code.value) : null,
        amount: result.amount,
    };
};
