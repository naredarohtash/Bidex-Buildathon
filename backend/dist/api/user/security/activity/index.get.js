"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
exports.metadata = {
    summary: "Sign-in activity",
    operationId: "getSignInActivity",
    tags: ["User", "Security"],
    description: "Devices that have signed into this account, most recent first, each marked active or ended.",
    responses: {
        200: {
            description: "Recorded sign-ins",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            devices: { type: "array", items: { type: "object" } },
                            activeCount: { type: "number" },
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
const LIMIT = 20;
exports.default = async (data) => {
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const [rows, sessions] = await Promise.all([
        db_1.models.loginActivity.findAll({
            where: { userId: user.id },
            order: [["lastSeenAt", "DESC"]],
            limit: LIMIT,
            raw: true,
        }),
        (0, utils_1.liveSessions)(user.id),
    ]);
    const live = new Set(sessions.map((s) => s.sid));
    const thisSid = (0, utils_1.currentSid)(sessions, data);
    const devices = rows.map((row) => {
        const active = !!row.sid && live.has(row.sid) && !row.revokedAt;
        return {
            id: row.id,
            current: !!thisSid && row.sid === thisSid,
            active,
            ip: row.ip || null,
            browser: row.browser || null,
            os: row.os || null,
            deviceType: row.deviceType || null,
            deviceName: row.deviceName || null,
            city: row.city || null,
            region: row.region || null,
            country: row.country || null,
            countryCode: row.countryCode || null,
            signedInAt: row.createdAt || null,
            lastSeenAt: row.lastSeenAt || row.updatedAt || null,
            endedReason: active ? null : row.revokedAt ? "revoked" : row.sid ? "expired" : null,
        };
    });
    devices.sort((a, b) => {
        if (a.current !== b.current)
            return a.current ? -1 : 1;
        if (a.active !== b.active)
            return a.active ? -1 : 1;
        return new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime();
    });
    return {
        devices,
        activeCount: devices.filter((d) => d.active).length,
        unrecordedSessions: Math.max(0, sessions.length - devices.filter((d) => d.active).length),
    };
};
