"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
exports.metadata = {
    summary: "Record this device",
    operationId: "recordSignInActivity",
    tags: ["User", "Security"],
    description: "Records the calling device against its current session so it appears in sign-in activity. Idempotent per session.",
    requestBody: { required: false, content: { "application/json": { schema: { type: "object" } } } },
    responses: {
        200: {
            description: "Recorded",
            content: {
                "application/json": {
                    schema: { type: "object", properties: { recorded: { type: "boolean" } } },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, headers } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const sessions = await (0, utils_1.liveSessions)(user.id);
    const sid = (0, utils_1.currentSid)(sessions, data);
    const ip = (0, utils_1.clientIp)(data);
    const userAgent = String((headers === null || headers === void 0 ? void 0 : headers["user-agent"]) || "").slice(0, 512) || null;
    const uaHint = String((headers === null || headers === void 0 ? void 0 : headers["sec-ch-ua"]) || "").slice(0, 256) || null;
    const device = (0, utils_1.parseUserAgent)(userAgent, uaHint);
    const now = new Date();
    const existing = sid
        ? await db_1.models.loginActivity.findOne({ where: { userId: user.id, sid } })
        : await db_1.models.loginActivity.findOne({
            where: {
                userId: user.id,
                ip,
                userAgent,
            },
            order: [["lastSeenAt", "DESC"]],
        });
    if (existing) {
        const stale = !existing.lastSeenAt || now.getTime() - new Date(existing.lastSeenAt).getTime() > 60000;
        if (stale)
            await existing.update({ lastSeenAt: now, sid: sid || existing.sid });
        return { recorded: true, sid: sid || null };
    }
    const place = await (0, utils_1.locateIp)(ip);
    const previous = await db_1.models.loginActivity.findAll({
        where: { userId: user.id },
        attributes: ["userAgent", "countryCode"],
        raw: true,
    });
    await db_1.models.loginActivity.create({
        userId: user.id,
        sid: sid || null,
        ip,
        userAgent,
        browser: device.browser,
        os: device.os,
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        city: place.city,
        region: place.region,
        country: place.country,
        countryCode: place.countryCode,
        lastSeenAt: now,
        revokedAt: null,
    });
    void (0, utils_1.alertNewDevice)({
        user,
        previous,
        device,
        place,
        ip,
        userAgent,
        at: now,
    });
    return { recorded: true, sid: sid || null };
};
