"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
exports.metadata = {
    summary: "Sign out other devices",
    operationId: "revokeOtherSessions",
    tags: ["User", "Security"],
    description: "Deletes this account's sessions. Keeps the calling session unless includeCurrent is true.",
    requestBody: {
        required: false,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        includeCurrent: {
                            type: "boolean",
                            description: "Also end the session making this request",
                        },
                        deviceId: {
                            type: "string",
                            description: "End only this device's session — a loginActivity row id from the activity list",
                        },
                    },
                },
            },
        },
    },
    responses: {
        200: {
            description: "Sessions ended",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            revoked: { type: "number" },
                            keptCurrent: { type: "boolean" },
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
    const includeCurrent = !!(body === null || body === void 0 ? void 0 : body.includeCurrent);
    const sessions = await (0, utils_1.liveSessions)(user.id);
    const keep = includeCurrent ? null : (0, utils_1.currentSid)(sessions, data);
    const deviceId = (body === null || body === void 0 ? void 0 : body.deviceId) ? String(body.deviceId) : null;
    if (deviceId) {
        const row = await db_1.models.loginActivity.findOne({
            where: { id: deviceId, userId: user.id },
            raw: true,
        });
        if (!(row === null || row === void 0 ? void 0 : row.sid) || !sessions.some((s) => s.sid === row.sid)) {
            return {
                revoked: 0,
                keptCurrent: !!keep,
                message: "That device is already signed out.",
            };
        }
        if (row.sid === keep) {
            throw (0, error_1.createError)({
                statusCode: 400,
                message: "That is this device. Use Log out to end this session.",
            });
        }
        await (0, utils_1.dropSession)(row.sid);
        await db_1.models.loginActivity.update({ revokedAt: new Date() }, { where: { userId: user.id, sid: row.sid } });
        return { revoked: 1, keptCurrent: !!keep, message: "Device signed out." };
    }
    const doomed = sessions.filter((s) => s.sid !== keep).map((s) => s.sid);
    await Promise.all(doomed.map((sid) => (0, utils_1.dropSession)(sid)));
    if (doomed.length) {
        await db_1.models.loginActivity.update({ revokedAt: new Date() }, { where: { userId: user.id, sid: doomed } });
    }
    return {
        revoked: doomed.length,
        keptCurrent: !!keep,
        message: doomed.length
            ? `Signed out of ${doomed.length} ${doomed.length === 1 ? "device" : "devices"}.`
            : "There were no other devices signed in.",
    };
};
