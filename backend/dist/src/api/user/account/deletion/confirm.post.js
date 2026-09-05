"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const redis_1 = require("@b/utils/redis");
const query_1 = require("@b/utils/query");
const code_post_1 = require("./code.post");
const CONFIRM_WORD = "DELETE";
const MAX_ATTEMPTS = 5;
exports.metadata = {
    summary: "Delete own account with an emailed code",
    operationId: "confirmAccountDeletion",
    tags: ["User", "Account"],
    description: "Soft-deletes the authenticated user's account. Requires the literal word DELETE and the six-digit code emailed by /api/user/account/deletion/code.",
    logModule: "USER",
    logTitle: "Delete account",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        confirm: { type: "string", description: 'Must be the word "DELETE"' },
                        code: { type: "string", description: "The six-digit code from the email" },
                    },
                    required: ["confirm", "code"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Account deleted",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: { message: { type: "string" } },
                    },
                },
            },
        },
        400: { description: "Wrong word, or a wrong, expired or exhausted code" },
        401: query_1.unauthorizedResponse,
        403: { description: "This account may not delete itself" },
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { body, user, ctx } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const word = String((body === null || body === void 0 ? void 0 : body.confirm) || "").trim().toUpperCase();
    if (word !== CONFIRM_WORD) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `Type ${CONFIRM_WORD} exactly to confirm.`,
        });
    }
    const code = String((body === null || body === void 0 ? void 0 : body.code) || "").replace(/\D/g, "");
    if (code.length !== 6) {
        throw (0, error_1.createError)({ statusCode: 400, message: "Enter the six-digit code from your email." });
    }
    const redis = redis_1.RedisSingleton.getInstance();
    const key = (0, code_post_1.deletionKey)(String(user.id));
    const raw = await redis.get(key);
    if (!raw) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "That code has expired. Ask for a new one.",
        });
    }
    let record;
    try {
        record = JSON.parse(raw);
    }
    catch (_a) {
        await redis.del(key);
        throw (0, error_1.createError)({ statusCode: 400, message: "That code has expired. Ask for a new one." });
    }
    if (record.code !== code) {
        const attempts = Number(record.attempts || 0) + 1;
        if (attempts >= MAX_ATTEMPTS) {
            await redis.del(key);
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "Too many wrong codes. Ask for a new one.",
            });
        }
        const age = Math.round((Date.now() - Number(record.sentAt || 0)) / 1000);
        const remaining = Math.max(1, code_post_1.DELETION_CODE_TTL_SECONDS - age);
        await redis.set(key, JSON.stringify({ ...record, attempts }), "EX", remaining);
        throw (0, error_1.createError)({
            statusCode: 400,
            message: `That code is not right. ${MAX_ATTEMPTS - attempts} ${MAX_ATTEMPTS - attempts === 1 ? "try" : "tries"} left.`,
        });
    }
    const { models } = require("@b/db");
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Retrieving user account");
    const row = await models.user.findOne({
        where: { id: user.id },
        include: [{ model: models.role, as: "role", attributes: ["name"] }],
    });
    if (!row) {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("User not found");
        throw (0, error_1.createError)({ statusCode: 404, message: "User not found" });
    }
    if (row.role && row.role.name === "Super Admin") {
        ctx === null || ctx === void 0 ? void 0 : ctx.fail("Super Admin accounts cannot be self-deleted");
        throw (0, error_1.createError)({
            statusCode: 403,
            message: "Super Admin accounts cannot be self-deleted",
        });
    }
    await redis.del(key);
    ctx === null || ctx === void 0 ? void 0 : ctx.step("Deleting user account");
    await row.destroy();
    ctx === null || ctx === void 0 ? void 0 : ctx.success("Account deleted successfully");
    return { message: "Your account has been deleted." };
};
