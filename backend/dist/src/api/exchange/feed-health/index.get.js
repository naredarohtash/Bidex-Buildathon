"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const query_1 = require("@b/utils/query");
const index_ws_1 = require("../market/index.ws");
exports.metadata = {
    summary: "Market Feed Health",
    operationId: "getMarketFeedHealth",
    tags: ["Exchange", "Market"],
    description: "Reports the state of the upstream OTC price feed — the single connection every chart on the platform is fed from. Returns healthy:false while subscribers are waiting on a feed that is not delivering.",
    responses: {
        200: {
            description: "Feed health",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            healthy: {
                                type: "boolean",
                                description: "False when something is subscribed but no data is arriving.",
                            },
                            connected: { type: "boolean", description: "Socket is open" },
                            listening: {
                                type: "boolean",
                                description: "Anything is subscribed to the feed",
                            },
                            symbols: {
                                type: "number",
                                description: "Symbols currently subscribed",
                            },
                            silentForMs: {
                                type: "number",
                                nullable: true,
                                description: "Milliseconds since the last frame arrived",
                            },
                            reconnectAttempts: {
                                type: "number",
                                description: "Consecutive reconnects since the last success",
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
exports.default = async () => {
    return index_ws_1.OtcWebSocketSubscriber.getInstance().getHealth();
};
