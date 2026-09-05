"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const redis_1 = require("@b/utils/redis");
const query_1 = require("@b/utils/query");
const index_post_1 = require("./index.post");
exports.metadata = {
    summary: "Poll a phone handoff",
    operationId: "pollKycHandoff",
    tags: ["KYC"],
    description: "Returns the photos uploaded from the phone for this handoff token.",
    parameters: [
        { name: "token", in: "query", required: true, description: "Handoff token", schema: { type: "string" } },
    ],
    responses: {
        200: {
            description: "Photos so far",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            alive: { type: "boolean" },
                            photos: { type: "object", additionalProperties: { type: "string" } },
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
    const { user, query } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const token = String((query === null || query === void 0 ? void 0 : query.token) || "");
    if (!token)
        return { alive: false, photos: {} };
    const redis = redis_1.RedisSingleton.getInstance();
    const raw = await redis.get((0, index_post_1.handoffKey)(token));
    if (!raw)
        return { alive: false, photos: {} };
    const session = JSON.parse(raw);
    if (session.userId !== user.id)
        return { alive: false, photos: {} };
    return { alive: true, photos: session.photos || {} };
};
