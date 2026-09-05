"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Get Terminal Preferences",
    operationId: "getTerminalPreferences",
    tags: ["User", "Preferences"],
    description: "Returns the authenticated user's account-level terminal preferences: pinned asset tabs, trading settings, chart view options and active indicators. The terminal mirrors these into browser storage on load so a workspace follows the user between devices. Pass `since` (epoch ms) to poll cheaply: when nothing has been written after that instant the preferences map is omitted and `unchanged` is true.",
    parameters: [
        {
            name: "since",
            in: "query",
            required: false,
            description: "Epoch ms the caller already holds. When the stored copy is not newer, the response omits the map.",
            schema: { type: "string" },
        },
    ],
    responses: {
        200: {
            description: "Stored preferences as a map of storage key to value",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            preferences: {
                                type: "object",
                                description: "Map of storage key to serialized value",
                                additionalProperties: { type: "string" },
                            },
                            updatedAt: {
                                type: "number",
                                description: "Epoch ms of the last write, or 0 if nothing is stored yet",
                            },
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
    var _a;
    const { user, query } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const record = await db_1.models.user.findByPk(user.id, {
        attributes: ["id", "settings"],
    });
    const terminal = (_a = record === null || record === void 0 ? void 0 : record.settings) === null || _a === void 0 ? void 0 : _a.terminal;
    if (!terminal || typeof terminal !== "object") {
        return { preferences: {}, updatedAt: 0 };
    }
    const { __updatedAt, ...preferences } = terminal;
    const updatedAt = Number(__updatedAt) || 0;
    const since = Number(query === null || query === void 0 ? void 0 : query.since);
    if (Number.isFinite(since) && since > 0 && updatedAt <= since) {
        return { unchanged: true, updatedAt };
    }
    return {
        preferences,
        updatedAt,
    };
};
