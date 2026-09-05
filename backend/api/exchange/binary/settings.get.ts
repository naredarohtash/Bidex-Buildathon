import { getBinarySettings } from "@b/utils/binary-settings-cache";

export const metadata: OperationObject = {
  summary: "Get Binary Trading Settings",
  description: "Returns binary trading configuration for the trading interface",
  operationId: "getBinarySettings",
  tags: ["Binary", "Settings"],
  responses: {
    200: {
      description: "Binary settings retrieved successfully",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              settings: {
                type: "object",
                description: "Binary trading settings",
              },
            },
          },
        },
      },
    },
  },
};

export default async () => {
  const e = await getBinarySettings();
  return {
    settings: {
      global: {
        enabled: e.global.enabled,
        practiceEnabled: e.global.practiceEnabled,
        maxConcurrentOrders: e.global.maxConcurrentOrders,
        maxDailyOrders: e.global.maxDailyOrders,
        cooldownSeconds: e.global.cooldownSeconds,
        orderExpirationBuffer: e.global.orderExpirationBuffer,
        cancelExpirationBuffer: e.global.cancelExpirationBuffer,
      },
      display: e.display,
      orderTypes: e.orderTypes,
      durations: e.durations,
      cancellation: e.cancellation,
    },
  };
};
