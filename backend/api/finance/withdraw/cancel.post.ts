/**
 * Taking back a withdrawal request that has not been paid yet.
 *
 * The balance was reduced the moment the request was made — see index.post.ts,
 * which holds amount *plus* fee so a claim on the balance stops it being
 * spendable immediately. So cancelling is not a matter of deleting a row: the
 * money has to come back, and it has to come back exactly once.
 *
 * This is the same reversal the operator's reject path performs, and it is
 * written the same way on purpose:
 *
 *   - The status guard lives in the WHERE of the update, inside the database
 *     transaction, not in an `if` above it. Two cancels racing each other — a
 *     double click, or a cancel and an operator's rejection landing together —
 *     must not both refund the same held amount. The second one updates zero
 *     rows and refunds nothing.
 *   - The wallet row is locked before it is read, so the refund is added to a
 *     balance nobody else is mid-way through changing.
 *   - Amount and fee both return. The fee was held against a payout that never
 *     happened, and a withdrawal somebody called off should cost them nothing.
 *
 * Only PENDING can be cancelled, and that is the whole safety story: once an
 * operator marks a payout COMPLETED the money is gone from our side, and a
 * cancel arriving a second later must fail loudly rather than hand back funds
 * that have already been sent.
 */

import { models, sequelize } from "@b/db";
import { createError } from "@b/utils/error";
import { announceBalance, BALANCE_CURRENCY, BALANCE_WALLET_TYPE } from "../wallet-credit";

export const metadata: OperationObject = {
  summary: "Cancel your own pending withdrawal",
  operationId: "cancelWithdrawal",
  tags: ["Finance", "Withdraw"],
  description:
    "Cancels a withdrawal that has not been paid out yet and returns the held amount and fee to the balance. Only the person who made the request can cancel it, and only while it is still pending.",
  requiresAuth: true,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { id: { type: "string", description: "The withdrawal to cancel." } },
          required: ["id"],
        },
      },
    },
  },
  responses: {
    200: { description: "Cancelled and refunded" },
    400: { description: "Invalid request" },
    401: { description: "Unauthorized" },
    403: { description: "Not your withdrawal" },
    404: { description: "Not found" },
    409: { description: "Already decided" },
  },
};

export default async (data: { user?: { id: string }; body?: any }) => {
  const user = data?.user;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = String(data?.body?.id || "").trim();
  if (!id) throw createError({ statusCode: 400, message: "Which withdrawal?" });

  const row = await models.transaction.findByPk(id);
  if (!row || row.type !== "WITHDRAW") {
    throw createError({ statusCode: 404, message: "Withdrawal not found." });
  }

  /* Someone else's request. A real authorisation failure, and it says so rather
     than hiding behind a 404 — this should be visible as one in the logs. */
  if (row.userId !== user.id) throw createError({ statusCode: 403, message: "Forbidden" });

  if (row.status !== "PENDING") {
    throw createError({
      statusCode: 409,
      message:
        row.status === "COMPLETED"
          ? "This withdrawal has already been paid out and cannot be cancelled."
          : `This withdrawal is already ${String(row.status).toLowerCase()}.`,
    });
  }

  let meta: Record<string, any> = {};
  try {
    meta = typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : row.metadata || {};
  } catch {
    meta = {};
  }

  const refund = Number(row.amount || 0) + Number(row.fee || 0);
  const cancelled = {
    cancelledAt: new Date().toISOString(),
    /* Who called it off, because "cancelled" on its own does not say whether
       the trader changed their mind or an operator turned it down, and the
       queue and the support desk both need to know which. */
    cancelledBy: "USER",
    refunded: refund,
  };

  const result = await sequelize.transaction(async (t: any) => {
    const [claimed] = await models.transaction.update(
      { status: "CANCELLED", metadata: JSON.stringify({ ...meta, ...cancelled }) },
      { where: { id, status: "PENDING" }, transaction: t }
    );
    // Lost the race: something else decided this row between the read above and
    // this write. It has been dealt with, and not by us.
    if (!claimed) return { ok: false as const };

    const wallet = await models.wallet.findOne({
      where: { userId: row.userId, currency: BALANCE_CURRENCY, type: BALANCE_WALLET_TYPE },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!wallet) {
      // The wallet is gone but the funds are owed. Recreate rather than
      // silently swallow a refund.
      const created = await models.wallet.create(
        { userId: row.userId, type: BALANCE_WALLET_TYPE, currency: BALANCE_CURRENCY, balance: refund },
        { transaction: t }
      );
      return { ok: true as const, balance: Number(created.balance) };
    }

    const balance = Number(wallet.balance || 0) + refund;
    await models.wallet.update({ balance }, { where: { id: wallet.id }, transaction: t });
    return { ok: true as const, balance };
  });

  if (!result.ok) {
    throw createError({
      statusCode: 409,
      message: "This withdrawal was just decided by our team. Refresh to see where it stands.",
    });
  }

  // Outside the transaction — see wallet-credit.ts.
  await announceBalance(user.id, BALANCE_CURRENCY, result.balance);

  return {
    id,
    status: "CANCELLED",
    balance: result.balance,
    refunded: refund,
    message: `Withdrawal cancelled. ${refund.toFixed(2)} ${BALANCE_CURRENCY} is back in your balance.`,
  };
};
