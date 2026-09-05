"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const MAX_BYTES = 256 * 1024;
exports.metadata = {
    summary: "Save Terminal Preferences",
    operationId: "saveTerminalPreferences",
    tags: ["User", "Preferences"],
    description: "Merges the supplied preferences into the authenticated user's account-level terminal settings. Keys are merged, not replaced, so a client that knows about only some settings cannot drop the rest. A null value deletes that key.",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        preferences: {
                            type: "object",
                            description: "Map of storage key to serialized value. Null deletes a key.",
                            additionalProperties: { type: "string", nullable: true },
                        },
                    },
                    required: ["preferences"],
                },
            },
        },
    },
    responses: {
        200: {
            description: "Preferences saved",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            message: { type: "string" },
                            updatedAt: { type: "number" },
                            count: { type: "number" },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const incoming = body === null || body === void 0 ? void 0 : body.preferences;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "preferences must be an object",
        });
    }
    const record = await db_1.models.user.findByPk(user.id, {
        attributes: ["id", "settings"],
    });
    if (!record)
        throw (0, error_1.createError)({ statusCode: 404, message: "User not found" });
    const settings = { ...(record.settings || {}) };
    const merged = {
        ...(settings.terminal || {}),
    };
    for (const [key, value] of Object.entries(incoming)) {
        if (value === null || value === undefined) {
            delete merged[key];
            continue;
        }
        merged[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    const updatedAt = Date.now();
    merged.__updatedAt = String(updatedAt);
    const size = Buffer.byteLength(JSON.stringify(merged), "utf8");
    if (size > MAX_BYTES) {
        throw (0, error_1.createError)({
            statusCode: 413,
            message: `Preferences too large (${size} bytes, limit ${MAX_BYTES})`,
        });
    }
    settings.terminal = merged;
    await db_1.models.user.update({ settings }, { where: { id: user.id } });
    return {
        message: "Preferences saved",
        updatedAt,
        count: Object.keys(merged).length - 1,
    };
};
