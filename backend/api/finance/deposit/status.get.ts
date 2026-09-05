/**
 * "Has my payment landed yet?"
 *
 * The screen showing a QR code had no way to find out. It told the trader their
 * balance would update on its own and then sat there — true, but indistinguishable
 * from a page that had stopped working. So the moment anyone paid, they were left
 * staring at the same address wondering whether to send it again. That is the
 * state that produces double payments and support tickets.
 *
 * This is what the address screen polls. It answers only about the caller's own
 * deposit, and it answers from our record — the same row the callback credits —
 * so "COMPLETED" here means the money is genuinely in the balance, not that a
 * processor said something encouraging.
 *
 * Read-only by design. It settles nothing, credits nothing and retries nothing:
 * a screen being open must never be what causes money to move. The callback in
 * ipn.post.ts and the sweeper do that, and this only reports what they did.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { BALANCE_CURRENCY, BALANCE_WALLET_TYPE } from "../wallet-credit";

export const metadata: OperationObject = {
  summary: "Check a deposit's progress",
  operationId: "depositStatus",
  tags: ["Finance", "Deposit"],
  description:
    "Reports whether a deposit has been credited yet. Read-only — polled by the payment screen.",
  requiresAuth: true,
  parameters: [
    {
      name: "id",
      in: "query",
      required: true,
      description: "The deposit to check.",
      schema: { type: "string" },
    },
  ],
  responses: {
    200: { description: "Current state" },
    400: { description: "Invalid request" },
    401: { description: "Unauthorized" },
    403: { description: "Not your deposit" },
    404: { description: "No such deposit" },
  },
};

export default async (data: { user?: { id: string }; query?: any }) => {
  const user = data?.user;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = String(data?.query?.id || "").trim();
  if (!id) throw createError({ statusCode: 400, message: "Which deposit?" });

  const deposit = await models.transaction.findByPk(id);
  if (!deposit || deposit.type !== "DEPOSIT") {
    throw createError({ statusCode: 404, message: "No such deposit." });
  }
  if (deposit.userId !== user.id) throw createError({ statusCode: 403, message: "Forbidden" });

  let meta: any = {};
  try {
    meta =
      typeof deposit.metadata === "string"
        ? JSON.parse(deposit.metadata)
        : deposit.metadata || {};
  } catch {
    meta = {};
  }

  /* Only read once it is worth reading. A pending deposit polled every few
     seconds by every open payment screen would otherwise be a wallet query per
     tick for a number that cannot have changed. */
  let balance: number | null = null;
  if (deposit.status === "COMPLETED") {
    const wallet = await models.wallet.findOne({
      where: { userId: user.id, type: BALANCE_WALLET_TYPE, currency: BALANCE_CURRENCY },
    });
    balance = wallet ? Number(wallet.balance) : null;
  }

  return {
    id: deposit.id,
    status: deposit.status,
    /* What actually reached the balance, which is not what they typed: an
       underpayment credits what arrived, and a bonus adds to it. The screen
       shows this figure, so it has to be the real one. */
    credited: Number(deposit.amount) || 0,
    depositAmount: Number(meta.depositAmount) || null,
    bonusAmount: Number(meta.bonusAmount) || 0,
    /* Where the processor thinks it is — "waiting", "confirming", "sending".
       Lets the screen say "seen on the network, confirming" instead of leaving
       someone who has definitely paid looking at an unchanged page. */
    paymentStatus: meta.paymentStatus || null,
    balance,
    currency: BALANCE_CURRENCY,
  };
};
