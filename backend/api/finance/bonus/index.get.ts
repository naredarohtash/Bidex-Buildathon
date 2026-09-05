/**
 * Checking a bonus code before the deposit is made.
 *
 * Lets the amount step show what a code is worth while the trader can still
 * change the figure — the alternative is discovering after payment that the
 * code needed a larger deposit, which is the one moment it is too late to act
 * on. Nothing here grants anything: the bonus is recomputed from the verified
 * amount when the deposit actually settles.
 */

import { createError } from "@b/utils/error";
import { evaluateBonus, bonusesConfigured } from "../deposit-bonus";

export const metadata: OperationObject = {
  summary: "Check a deposit bonus code",
  operationId: "checkDepositBonus",
  tags: ["Finance", "Deposit"],
  description: "Validates a bonus code against an intended deposit amount and returns its value.",
  requiresAuth: true,
  parameters: [
    { name: "code", in: "query", required: true, schema: { type: "string" } },
    { name: "amount", in: "query", required: true, schema: { type: "number" } },
    { name: "methodId", in: "query", required: false, schema: { type: "string" } },
  ],
  responses: {
    200: { description: "Result of the check" },
    401: { description: "Unauthorized" },
  },
};

export default async (data: { user?: { id: string }; query?: any }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  if (!(await bonusesConfigured())) {
    return { valid: false, enabled: false, error: "No bonus codes are active right now." };
  }

  /* The caller is passed through so per-user limits and first-deposit-only are
     evaluated here too. A preview that ignored them would tell someone their
     code is good and then pay nothing when the deposit lands — the exact
     surprise this screen exists to prevent. */
  const result = await evaluateBonus({
    rawCode: String(data.query?.code || ""),
    deposit: Number(data.query?.amount),
    userId: data.user.id,
    methodId: data.query?.methodId ? String(data.query.methodId) : undefined,
  });

  /* 200 either way. A code that does not apply is an ordinary answer to a
     question, not a failed request — returning 4xx makes the client's error
     path fire and turns "that code needs a bigger deposit" into "something went
     wrong". */
  if (!result.ok) return { valid: false, enabled: true, error: result.error };

  return {
    valid: true,
    enabled: true,
    code: result.code.code,
    type: result.code.type,
    percent: result.code.type === "PERCENTAGE" ? Number(result.code.value) : null,
    amount: result.amount,
  };
};
