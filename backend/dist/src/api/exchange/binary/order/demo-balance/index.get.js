"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const demoBalance_1 = require("../util/demoBalance");
exports.metadata = {
    summary: "Get Demo Balance",
    operationId: "getBinaryDemoBalance",
    tags: ["Exchange", "Binary"],
    description: "Returns the authenticated user's demo balance, derived from their recorded demo orders. Server-side so that every device sees the same figure.",
    responses: {
        200: {
            description: "The demo balance",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            balance: { type: "number", description: "Demo balance" },
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
        throw new Error("Unauthorized");
    return { balance: await (0, demoBalance_1.computeDemoBalance)(user.id) };
};
