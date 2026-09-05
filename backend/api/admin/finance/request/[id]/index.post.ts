/**
 * Approving or rejecting a pending request.
 *
 * Four outcomes, and they are not symmetrical — which is the thing to hold on
 * to when reading this:
 *
 *   approve a deposit    -> money enters the wallet
 *   reject  a deposit    -> nothing moves; it never arrived
 *   approve a withdrawal -> nothing moves; the balance was debited on request
 *   reject  a withdrawal -> money returns to the wallet
 *
 * So the two operations that touch a balance are "approve a deposit" and
 * "reject a withdrawal", and both are the reversal-shaped ones an operator is
 * least likely to expect. Both go through a locked, status-guarded path so that
 * a double click, two operators on the same queue, or the sweeper arriving at
 * the same moment cannot pay twice.
 */

import { models, sequelize } from "@b/db";
import { createError } from "@b/utils/error";
import {
  creditWallet,
  announceBalance,
  BALANCE_CURRENCY,
  BALANCE_WALLET_TYPE,
} from "../../../../finance/wallet-credit";

export const metadata: OperationObject = {
  summary: "Approve or reject a deposit or withdrawal",
  operationId: "decideFinanceRequest",
  tags: ["Admin", "Finance"],
  description:
    "Approves or rejects a pending request. Approving a deposit credits the wallet; rejecting a withdrawal returns the held funds.",
  requiresAuth: true,
  permission: "edit.deposit",
  parameters: [
    { name: "id", in: "path", required: true, schema: { type: "string" } },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["approve", "reject"] },
            amount: {
              type: "number",
              description: "Deposit approvals only: the amount actually received, in USDT.",
            },
            note: { type: "string", description: "Reason, shown to nobody but recorded." },
            reference: { type: "string", description: "Payout reference for a completed withdrawal." },
          },
          required: ["action"],
        },
      },
    },
  },
  responses: {
    200: { description: "Decision applied" },
    400: { description: "Invalid request" },
    404: { description: "Request not found" },
    409: { description: "Already decided" },
  },
};

export default async (data: { user?: { id: string }; params?: any; body?: any }) => {
  const operator = data?.user;
  if (!operator?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = String(data.params?.id || "");
  const action = String(data.body?.action || "").toLowerCase();
  const note = String(data.body?.note || "").slice(0, 500);

  if (action !== "approve" && action !== "reject") {
    throw createError({ statusCode: 400, message: "action must be approve or reject." });
  }

  const row = await models.transaction.findByPk(id);
  if (!row) throw createError({ statusCode: 404, message: "Request not found." });
  if (row.status !== "PENDING") {
    throw createError({ statusCode: 409, message: `This request is already ${row.status}.` });
  }

  let meta: Record<string, any> = {};
  try {
    meta = typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : row.metadata || {};
  } catch {
    meta = {};
  }
  const decidedBy = { decidedBy: operator.id, decidedAt: new Date().toISOString(), note };

  /* ── Deposit: approve ──────────────────────────────────────────────────
     The operator states the amount, because this path exists precisely for
     deposits the exchange could not confirm — there is no verified figure to
     fall back on. It routes through creditWallet rather than writing a balance
     here, so manual and automatic credits share one lock and one idempotency
     guard instead of two implementations that drift. */
  if (row.type === "DEPOSIT" && action === "approve") {
    const amount = Number(data.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createError({
        statusCode: 400,
        message: `Enter the amount actually received, in ${BALANCE_CURRENCY}.`,
      });
    }

    const outcome = await creditWallet({
      transactionId: id,
      userId: row.userId,
      amount,
      settledMeta: { ...meta, ...decidedBy, verifiedBy: "MANUAL" },
    });

    if (outcome.status === "ALREADY_SETTLED") {
      throw createError({ statusCode: 409, message: "This deposit was already credited." });
    }
    if (outcome.status !== "CREDITED") {
      throw createError({
        statusCode: 400,
        message: (outcome as any).reason || "Could not credit this deposit.",
      });
    }

    await announceBalance(row.userId, BALANCE_CURRENCY, outcome.balance);
    return {
      id,
      status: "COMPLETED",
      message: `Credited ${outcome.amount.toFixed(2)} ${BALANCE_CURRENCY}.`,
    };
  }

  /* ── Deposit: reject ───────────────────────────────────────────────────
     Nothing to undo — a pending deposit never reached the balance. */
  if (row.type === "DEPOSIT" && action === "reject") {
    await models.transaction.update(
      { status: "REJECTED", metadata: JSON.stringify({ ...meta, ...decidedBy }) },
      { where: { id, status: "PENDING" } }
    );
    return { id, status: "REJECTED", message: "Deposit rejected." };
  }

  /* ── Withdrawal: approve ───────────────────────────────────────────────
     The balance was already reduced when the request was made, so approving
     records that the payout happened and changes no balance. */
  if (row.type === "WITHDRAW" && action === "approve") {
    const reference = String(data.body?.reference || "").slice(0, 191);
    const [updated] = await models.transaction.update(
      {
        status: "COMPLETED",
        ...(reference ? { referenceId: reference } : {}),
        metadata: JSON.stringify({ ...meta, ...decidedBy, paidAt: new Date().toISOString() }),
      },
      // Status in the WHERE, not just checked above: two operators clicking at
      // once must not both mark it paid.
      { where: { id, status: "PENDING" } }
    );
    if (!updated) throw createError({ statusCode: 409, message: "This request was already decided." });
    return { id, status: "COMPLETED", message: "Marked as paid." };
  }

  /* ── Withdrawal: reject ────────────────────────────────────────────────
     The money must come back. Amount plus fee, because the fee was held with
     it and a rejected payout should cost the trader nothing. */
  const refund = Number(row.amount || 0) + Number(row.fee || 0);
  const result = await sequelize.transaction(async (t: any) => {
    // The status guard lives inside the lock: without it, two rejections could
    // each refund the same held amount.
    const [claimed] = await models.transaction.update(
      { status: "REJECTED", metadata: JSON.stringify({ ...meta, ...decidedBy, refunded: refund }) },
      { where: { id, status: "PENDING" }, transaction: t }
    );
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

  if (!result.ok) throw createError({ statusCode: 409, message: "This request was already decided." });

  await announceBalance(row.userId, BALANCE_CURRENCY, result.balance);
  return {
    id,
    status: "REJECTED",
    message: `Rejected. ${refund.toFixed(2)} ${BALANCE_CURRENCY} returned to the account.`,
  };
};
