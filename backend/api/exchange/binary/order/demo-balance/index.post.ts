import { models } from "@b/db";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import {
  computeDemoBalance,
  DEMO_MAX_BALANCE,
  DEMO_MIN_BALANCE,
  DEMO_RESET_BALANCE,
  readDemoSettings,
  readRequestedBalance,
} from "../util/demoBalance";

export const metadata: OperationObject = {
  summary: "Set or reset the demo balance",
  operationId: "resetBinaryDemoBalance",
  tags: ["Exchange", "Binary"],
  description:
    "Sets the authenticated user's demo balance to `amount`, or resets it to the default when no amount is given. Recorded on the account, so it applies on every device rather than only the browser it was pressed in.",
  requestBody: {
    required: false,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            amount: {
              type: "number",
              description: `The practice balance to start from, between ${DEMO_MIN_BALANCE} and ${DEMO_MAX_BALANCE}. Omitted, the balance resets to the default.`,
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "The demo balance after the reset",
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
  const { user, body } = data;
  if (!user?.id) throw new Error("Unauthorized");

  /* An amount, or a reset. A figure outside the bounds is not an error worth a
     round trip — it is a slider somebody dragged too far — so it falls back to
     the reset rather than refusing the whole request. */
  const requested =
    body && Object.prototype.hasOwnProperty.call(body, "amount")
      ? readRequestedBalance(body.amount)
      : null;

  const record = await models.user.findOne({
    where: { id: user.id },
    attributes: ["id", "settings"],
  });

  // Merged, not replaced: `settings` also carries the terminal preferences that
  // sync across devices, and overwriting the object would wipe them.
  const settings: any = { ...((record?.settings as any) || {}) };
  settings.demo = {
    ...readDemoSettings(settings),
    startingBalance: requested ?? DEMO_RESET_BALANCE,
    // Orders already placed belong to the previous run and stop counting from
    // here, whether the balance was reset or set to a figure of somebody's own.
    // History is kept — the trade list is still the user's record — it simply
    // no longer contributes to the balance.
    resetAt: new Date().toISOString(),
  };

  await models.user.update({ settings }, { where: { id: user.id } });

  return { balance: await computeDemoBalance(user.id) };
};
