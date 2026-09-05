"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = exports.handoffKey = exports.HANDOFF_TTL_SECONDS = void 0;
const crypto_1 = require("crypto");
const error_1 = require("@b/utils/error");
const redis_1 = require("@b/utils/redis");
const query_1 = require("@b/utils/query");
exports.HANDOFF_TTL_SECONDS = 15 * 60;
const handoffKey = (token) => `kyc-handoff:${token}`;
exports.handoffKey = handoffKey;
exports.metadata = {
    summary: "Start a phone handoff",
    operationId: "startKycHandoff",
    tags: ["KYC"],
    description: "Issues a short-lived token so the camera steps of verification can be finished on a phone. Returns the link to encode as a QR code, and emails the same link on request.",
    requestBody: {
        required: false,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        email: { type: "boolean", description: "Also email the link to the account holder" },
                        needs: {
                            type: "array",
                            items: { type: "string" },
                            description: "Which photos are still wanted: front, back, selfie",
                        },
                        documentLabel: { type: "string" },
                    },
                },
            },
        },
    },
    responses: {
        200: {
            description: "Handoff started",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            token: { type: "string" },
                            url: { type: "string" },
                            expiresIn: { type: "number" },
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
    const token = (0, crypto_1.randomBytes)(24).toString("base64url");
    const needs = Array.isArray(body === null || body === void 0 ? void 0 : body.needs)
        ? body.needs.filter((n) => ["front", "back", "selfie"].includes(n))
        : ["front", "back", "selfie"];
    const session = {
        userId: user.id,
        needs,
        documentLabel: String((body === null || body === void 0 ? void 0 : body.documentLabel) || "your document"),
        photos: {},
        createdAt: Date.now(),
    };
    const redis = redis_1.RedisSingleton.getInstance();
    await redis.set((0, exports.handoffKey)(token), JSON.stringify(session), "EX", exports.HANDOFF_TTL_SECONDS);
    const base = process.env.NEXT_PUBLIC_SITE_URL || "";
    const url = `${base}/kyc/phone/${token}`;
    if (body === null || body === void 0 ? void 0 : body.email) {
        try {
            const { emailQueue } = require("@b/utils/emails");
            await emailQueue.add({
                emailData: {
                    TO: user.email,
                    FIRSTNAME: user.firstName || "there",
                    URL: url,
                    CREATED_AT: new Date().toLocaleString(),
                    LEVEL: "Identity Verification",
                    STATUS: "Continue on your phone",
                },
                emailType: "KycPhoneHandoff",
            });
        }
        catch (e) {
            const { logger } = require("@b/utils/console");
            logger.error("KYC", "Handoff email could not be queued", e);
        }
    }
    return { token, url, expiresIn: exports.HANDOFF_TTL_SECONDS };
};
