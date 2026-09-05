"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const redis_1 = require("@b/utils/redis");
const query_1 = require("@b/utils/query");
const index_post_1 = require("../../../user/kyc/handoff/index.post");
exports.metadata = {
    summary: "Read a phone handoff",
    operationId: "readKycHandoff",
    tags: ["KYC"],
    description: "Returns which photos the desktop is still waiting for. Requires only the handoff token.",
    parameters: [
        { name: "token", in: "path", required: true, description: "Handoff token", schema: { type: "string" } },
    ],
    responses: {
        200: {
            description: "Handoff state",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            alive: { type: "boolean" },
                            needs: { type: "array", items: { type: "string" } },
                            done: { type: "array", items: { type: "string" } },
                            documentLabel: { type: "string" },
                        },
                    },
                },
            },
        },
        500: query_1.serverErrorResponse,
    },
    requiresAuth: false,
};
exports.default = async (data) => {
    const { params } = data;
    const redis = redis_1.RedisSingleton.getInstance();
    const raw = await redis.get((0, index_post_1.handoffKey)(String((params === null || params === void 0 ? void 0 : params.token) || "")));
    if (!raw)
        return { alive: false, needs: [], done: [], documentLabel: "" };
    const session = JSON.parse(raw);
    return {
        alive: true,
        needs: session.needs || [],
        done: Object.keys(session.photos || {}),
        documentLabel: session.documentLabel || "your document",
    };
};
