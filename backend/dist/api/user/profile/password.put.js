"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const passwords_1 = require("@b/utils/passwords");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Change Password",
    operationId: "changeOwnPassword",
    tags: ["User", "Security"],
    description: "Changes the authenticated user's password. The current password must be supplied and is verified before the new one is written. Accounts without a password (provider sign-in) are directed to the emailed reset link instead.",
    logModule: "PASSWORD",
    logTitle: "Change password",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        currentPassword: {
                            type: "string",
                            description: "The password currently on the account",
                        },
                        newPassword: {
                            type: "string",
                            description: "The replacement. At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.",
                        },
                    },
                    required: ["currentPassword", "newPassword"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Password changed",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: { message: { type: "string" } },
                    },
                },
            },
        },
        400: { description: "Missing, incorrect or unusable password" },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
const RULE = "Use at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";
exports.default = async (data) => {
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const currentPassword = String((body === null || body === void 0 ? void 0 : body.currentPassword) || "");
    const newPassword = String((body === null || body === void 0 ? void 0 : body.newPassword) || "");
    if (!currentPassword || !newPassword) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Both your current password and a new one are required",
        });
    }
    const record = await db_1.models.user.findByPk(user.id, {
        attributes: ["id", "password"],
    });
    if (!record)
        throw (0, error_1.createError)({ statusCode: 404, message: "User not found" });
    if (!record.password) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "This account signs in without a password. Use the emailed reset link to set one.",
        });
    }
    const ok = await (0, passwords_1.verifyPassword)(record.password, currentPassword);
    if (!ok) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "Your current password is not correct",
        });
    }
    if (currentPassword === newPassword) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "The new password is the same as the current one",
        });
    }
    if (!(0, passwords_1.validatePassword)(newPassword)) {
        throw (0, error_1.createError)({ statusCode: 400, message: RULE });
    }
    const hashed = await (0, passwords_1.hashPassword)(newPassword);
    await db_1.models.user.update({ password: hashed }, { where: { id: user.id } });
    return { message: "Password changed" };
};
