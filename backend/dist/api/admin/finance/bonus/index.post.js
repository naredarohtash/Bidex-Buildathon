"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const wallet_methods_1 = require("../../../finance/wallet-methods");
exports.metadata = {
    summary: "Create or update a bonus code",
    operationId: "saveBonusCode",
    tags: ["Admin", "Finance"],
    description: "Creates a bonus code, or updates one when an id is supplied.",
    requiresAuth: true,
    permission: "edit.deposit",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        id: { type: "string", description: "Omit to create." },
                        code: { type: "string" },
                        description: { type: "string" },
                        type: { type: "string", enum: ["PERCENTAGE", "FIXED"] },
                        value: { type: "number" },
                        minDeposit: { type: "number" },
                        maxBonus: { type: "number", description: "0 = uncapped" },
                        maxUsesTotal: { type: "number", description: "0 = unlimited" },
                        maxUsesPerUser: { type: "number", description: "0 = unlimited" },
                        firstDepositOnly: { type: "boolean" },
                        allowedMethods: { type: "array", items: { type: "string" } },
                        startsAt: { type: "string", nullable: true },
                        expiresAt: { type: "string", nullable: true },
                        status: { type: "boolean" },
                    },
                    required: ["code", "type", "value"],
                },
            },
        },
    },
    responses: {
        200: { description: "Saved" },
        400: { description: "Invalid" },
        409: { description: "That code already exists" },
    },
};
const VALID_METHODS = new Set(wallet_methods_1.DEPOSIT_METHODS.map((m) => m.id));
function toDate(value) {
    if (!value)
        return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
}
exports.default = async (data) => {
    var _a, _b;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const body = data.body || {};
    const code = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9_-]{3,64}$/.test(code)) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Code must be 3-64 characters: letters, numbers, hyphen or underscore.",
        });
    }
    const type = body.type === "FIXED" ? "FIXED" : "PERCENTAGE";
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Enter a bonus value above zero." });
    }
    if (type === "PERCENTAGE" && value > 100) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "A percentage bonus above 100% pays more than the deposit. Use a fixed amount if that is intended.",
        });
    }
    const minDeposit = Math.max(0, Number(body.minDeposit) || 0);
    const maxBonus = Math.max(0, Number(body.maxBonus) || 0);
    const maxUsesTotal = Math.max(0, Math.floor(Number(body.maxUsesTotal) || 0));
    const maxUsesPerUser = Math.max(0, Math.floor((_b = Number(body.maxUsesPerUser)) !== null && _b !== void 0 ? _b : 1));
    if (type === "PERCENTAGE" && maxBonus === 0) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Set a maximum bonus. An uncapped percentage has no limit on what a single deposit can pay out.",
        });
    }
    const startsAt = toDate(body.startsAt);
    const expiresAt = toDate(body.expiresAt);
    if (startsAt && expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
        throw (0, error_1.createError)({ statusCode: 400, message: "The end date must be after the start date." });
    }
    let allowedMethods = null;
    if (Array.isArray(body.allowedMethods) && body.allowedMethods.length > 0) {
        const chosen = body.allowedMethods.map(String).filter((id) => VALID_METHODS.has(id));
        if (chosen.length === 0) {
            throw (0, error_1.createError)({ statusCode: 400, message: "None of those payment methods exist." });
        }
        allowedMethods = chosen;
    }
    const fields = {
        code,
        description: String(body.description || "").slice(0, 191) || null,
        type,
        value,
        minDeposit,
        maxBonus,
        maxUsesTotal,
        maxUsesPerUser,
        firstDepositOnly: Boolean(body.firstDepositOnly),
        allowedMethods,
        startsAt,
        expiresAt,
        status: body.status === undefined ? true : Boolean(body.status),
    };
    const id = body.id ? String(body.id) : null;
    const clash = await db_1.models.bonusCode.findOne({ where: { code } });
    if (clash && (!id || clash.id !== id)) {
        throw (0, error_1.createError)({ statusCode: 409, message: `The code ${code} already exists.` });
    }
    if (id) {
        const existing = await db_1.models.bonusCode.findByPk(id);
        if (!existing)
            throw (0, error_1.createError)({ statusCode: 404, message: "Code not found." });
        await db_1.models.bonusCode.update(fields, { where: { id } });
        return { id, code, message: `${code} updated.` };
    }
    const created = await db_1.models.bonusCode.create(fields);
    return { id: created.id, code, message: `${code} created.` };
};
