/**
 * Requesting a withdrawal.
 *
 * Money leaves the balance the moment the request is accepted, not when it is
 * paid out. Holding the funds only at payout time would let someone request the
 * whole balance repeatedly and trade with money that is already on its way out
 * — the balance has to stop being spendable at the point the claim on it is
 * made. If the request is later rejected, the amount is returned.
 *
 * Nothing is actually sent from here. Every payout, crypto or fiat, is released
 * by an operator; the keys this platform holds cannot withdraw, by design.
 */

import { models, sequelize } from "@b/db";
import { createError } from "@b/utils/error";
import { findWithdrawMethod, validateWithdrawDetails } from "../wallet-methods";
import { announceBalance, BALANCE_CURRENCY, BALANCE_WALLET_TYPE } from "../wallet-credit";

export const metadata: OperationObject = {
  summary: "Request a withdrawal",
  operationId: "createWithdrawal",
  tags: ["Finance", "Withdraw"],
  description:
    "Places a withdrawal request and puts the amount plus fee on hold. Payout is released by an operator.",
  requiresAuth: true,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            methodId: { type: "string" },
            amount: { type: "number", description: `Amount in ${BALANCE_CURRENCY}` },
            details: { type: "object", description: "Payout destination fields for the method" },
          },
          required: ["methodId", "amount", "details"],
        },
      },
    },
  },
  responses: {
    200: { description: "Withdrawal requested" },
    400: { description: "Invalid request" },
    401: { description: "Unauthorized" },
    402: { description: "Insufficient balance" },
  },
};

export default async (data: { user?: { id: string }; body?: any }) => {
  const user = data?.user;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const { methodId, amount, details } = data.body || {};

  const method = findWithdrawMethod(String(methodId || ""));
  if (!method) throw createError({ statusCode: 400, message: "Choose a withdrawal method." });

  const requested = Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw createError({ statusCode: 400, message: "Enter a valid amount." });
  }
  if (requested < method.min) {
    throw createError({
      statusCode: 400,
      message: `The minimum withdrawal for ${method.label} is ${method.min} ${BALANCE_CURRENCY}.`,
    });
  }

  const checked = validateWithdrawDetails(method, details);
  if (!checked.ok) throw createError({ statusCode: 400, message: checked.error });

  const total = requested + method.fee;

  /* Balance check and debit in one locked step.
     Checking first and debiting after leaves a window in which two requests
     both read the same balance and both pass — the classic way an account goes
     negative. The lock closes it: the second request waits, then re-reads a
     balance the first has already reduced. */
  const result = await sequelize.transaction(async (t: any) => {
    const wallet = await models.wallet.findOne({
      where: { userId: user.id, currency: BALANCE_CURRENCY, type: BALANCE_WALLET_TYPE },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const balance = Number(wallet?.balance || 0);
    if (!wallet || balance < total) {
      return { ok: false as const, balance, needed: total };
    }

    const remaining = balance - total;
    await models.wallet.update({ balance: remaining }, { where: { id: wallet.id }, transaction: t });

    const tx = await models.transaction.create(
      {
        userId: user.id,
        walletId: wallet.id,
        type: "WITHDRAW",
        status: "PENDING",
        amount: requested,
        fee: method.fee,
        description: `${method.label} withdrawal`,
        metadata: JSON.stringify({
          methodId: method.id,
          kind: method.kind,
          payoutCurrency: method.payoutCurrency,
          networkLabel: method.networkLabel,
          settlement: method.settlement,
          details: checked.details,
          requestedAt: new Date().toISOString(),
        }),
      },
      { transaction: t }
    );

    return { ok: true as const, id: tx.id, remaining };
  });

  if (!result.ok) {
    throw createError({
      statusCode: 402,
      message: `Not enough balance. You need ${result.needed.toFixed(2)} ${BALANCE_CURRENCY} including the fee, and have ${result.balance.toFixed(2)}.`,
    });
  }

  // Outside the transaction — see wallet-credit.ts.
  await announceBalance(user.id, BALANCE_CURRENCY, result.remaining);

  return {
    id: result.id,
    status: "PENDING",
    balance: result.remaining,
    message:
      method.settlement === "MANUAL"
        ? `Withdrawal requested. Payouts to ${method.label} are checked by our team and usually take ${method.eta}.`
        : `Withdrawal requested. It is usually released within ${method.eta}.`,
  };
};
