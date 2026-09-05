"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = exports.deletionKey = exports.DELETION_RESEND_SECONDS = exports.DELETION_CODE_TTL_SECONDS = void 0;
const crypto_1 = require("crypto");
const error_1 = require("@b/utils/error");
const redis_1 = require("@b/utils/redis");
const query_1 = require("@b/utils/query");
exports.DELETION_CODE_TTL_SECONDS = 10 * 60;
exports.DELETION_RESEND_SECONDS = 60;
const deletionKey = (userId) => `account-deletion:${userId}`;
exports.deletionKey = deletionKey;
exports.metadata = {
    summary: "Send an account-deletion code",
    operationId: "sendAccountDeletionCode",
    tags: ["User", "Account"],
    description: "Emails a six-digit code to the address on the account. The code authorises one account deletion, expires in ten minutes, and is destroyed as soon as it is used.",
    logModule: "USER",
    logTitle: "Account deletion code",
    responses: {
        200: {
            description: "Code sent, or an existing one left in place",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            sent: { type: "boolean" },
                            email: { type: "string", description: "The masked address it went to" },
                            expiresIn: { type: "number" },
                            retryIn: { type: "number", description: "Seconds before another can be requested" },
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
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const { models } = require("@b/db");
    const row = await models.user.findByPk(user.id, {
        attributes: ["email", "firstName"],
        raw: true,
    });
    const email = (row === null || row === void 0 ? void 0 : row.email) || user.email;
    if (!email) {
        throw (0, error_1.createError)({
            statusCode: 400,
            message: "This account has no email address, so a code cannot be sent.",
        });
    }
    const redis = redis_1.RedisSingleton.getInstance();
    const key = (0, exports.deletionKey)(String(user.id));
    const existingRaw = await redis.get(key);
    if (existingRaw) {
        try {
            const existing = JSON.parse(existingRaw);
            const age = Math.round((Date.now() - Number(existing.sentAt || 0)) / 1000);
            if (age >= 0 && age < exports.DELETION_RESEND_SECONDS) {
                return {
                    sent: false,
                    email: maskEmail(email),
                    expiresIn: Math.max(0, exports.DELETION_CODE_TTL_SECONDS - age),
                    retryIn: exports.DELETION_RESEND_SECONDS - age,
                };
            }
        }
        catch (_a) {
        }
    }
    const code = String((0, crypto_1.randomInt)(0, 1000000)).padStart(6, "0");
    await redis.set(key, JSON.stringify({ code, sentAt: Date.now(), attempts: 0 }), "EX", exports.DELETION_CODE_TTL_SECONDS);
    try {
        const { emailQueue } = require("@b/utils/emails");
        await emailQueue.add({
            emailData: {
                TO: email,
                FIRSTNAME: (row === null || row === void 0 ? void 0 : row.firstName) || user.firstName || "there",
                CODE: code,
                MINUTES: String(Math.round(exports.DELETION_CODE_TTL_SECONDS / 60)),
                CREATED_AT: new Date().toLocaleString(),
            },
            emailType: "AccountDeletionCode",
        });
    }
    catch (error) {
        await redis.del(key);
        const { logger } = require("@b/utils/console");
        logger.error("USER", "Account deletion code could not be queued", error);
        throw (0, error_1.createError)({
            statusCode: 500,
            message: "The code could not be sent. Please try again in a moment.",
        });
    }
    return {
        sent: true,
        email: maskEmail(email),
        expiresIn: exports.DELETION_CODE_TTL_SECONDS,
        retryIn: exports.DELETION_RESEND_SECONDS,
    };
};
function maskEmail(email) {
    const [name, domain] = String(email).split("@");
    if (!domain)
        return email;
    const head = name.slice(0, 2);
    return `${head}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
}
