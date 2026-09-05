import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { computeDemoBalance } from "../util/demoBalance";

export const metadata: OperationObject = {
  summary: "Get Demo Balance",
  operationId: "getBinaryDemoBalance",
  tags: ["Exchange", "Binary"],
  description:
    "Returns the authenticated user's demo balance, derived from their recorded demo orders. Server-side so that every device sees the same figure.",
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
    401: unauthorizedResponse,
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user } = data;
  if (!user?.id) throw new Error("Unauthorized");

  return { balance: await computeDemoBalance(user.id) };
};
