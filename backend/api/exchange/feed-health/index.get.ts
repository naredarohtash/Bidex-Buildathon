import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { OtcWebSocketSubscriber } from "../market/index.ws";

export const metadata: OperationObject = {
  summary: "Market Feed Health",
  operationId: "getMarketFeedHealth",
  tags: ["Exchange", "Market"],
  description:
    "Reports the state of the upstream OTC price feed — the single connection every chart on the platform is fed from. Returns healthy:false while subscribers are waiting on a feed that is not delivering.",
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
                description:
                  "False when something is subscribed but no data is arriving.",
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
    401: unauthorizedResponse,
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async () => {
  return OtcWebSocketSubscriber.getInstance().getHealth();
};
