/**
 * Deposit and withdrawal history.
 *
 * The screens used to read /api/finance/transaction?type=DEPOSIT, which does
 * not filter on transaction type at all — it reads `walletType` and passes the
 * rest to a generic filter that ignores what it does not recognise. So the
 * "Deposit history" panel returned every transaction on the account, and since
 * a binary payout is booked as REFUND, what a trader actually saw under
 * "Deposits" was their trading history.
 *
 * This answers one question only: what money has entered and left this account.
 * Trades are not money entering or leaving — they are the account's own balance
 * moving — and they live in the terminal where they belong.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { BALANCE_CURRENCY } from "../wallet-credit";

export const metadata: OperationObject = {
  summary: "Deposit and withdrawal history",
  operationId: "getFinanceLedger",
  tags: ["Finance"],
  description: "Returns the caller's deposits and withdrawals, newest first.",
  requiresAuth: true,
  parameters: [
    {
      name: "kind",
      in: "query",
      required: false,
      description: "Limit to deposits or withdrawals. Omit for both.",
      schema: { type: "string", enum: ["deposit", "withdraw"] },
    },
    {
      name: "limit",
      in: "query",
      required: false,
      schema: { type: "integer", default: 50 },
    },
  ],
  responses: {
    200: { description: "History" },
    401: { description: "Unauthorized" },
  },
};

/* The only two types this endpoint will ever return. Written out rather than
   derived, so that adding a transaction type elsewhere in the platform can
   never quietly start showing up in someone's deposit history. */
const KINDS = { deposit: "DEPOSIT", withdraw: "WITHDRAW" } as const;

function parseMeta(raw: unknown): Record<string, any> {
  try {
    return typeof raw === "string" ? JSON.parse(raw || "{}") : (raw as any) || {};
  } catch {
    return {};
  }
}

export default async (data: { user?: { id: string }; query?: any }) => {
  const user = data?.user;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const kind = String(data.query?.kind || "").toLowerCase();
  const types = kind in KINDS ? [KINDS[kind as keyof typeof KINDS]] : [KINDS.deposit, KINDS.withdraw];

  // Capped: this feeds a panel, and an account with years of history should not
  // be able to ask the database for all of it in one go.
  const requested = Number(data.query?.limit);
  const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 50, 200);

  const rows = await models.transaction.findAll({
    where: { userId: user.id, type: types },
    order: [["createdAt", "DESC"]],
    limit,
  });

  const items = rows.map((row: any) => {
    const meta = parseMeta(row.metadata);
    const isDeposit = row.type === "DEPOSIT";
    return {
      id: row.id,
      kind: isDeposit ? "deposit" : "withdraw",
      status: row.status,
      /* A pending deposit has an amount of 0 because nothing has been verified
         yet. Showing that as "0.00" reads as a failed deposit, so the amount the
         trader said they sent is shown until there is a real one. */
      amount: Number(row.amount) || 0,
      claimedAmount: meta.claimedAmount ?? null,
      fee: Number(row.fee) || 0,
      currency: BALANCE_CURRENCY,
      methodId: meta.methodId || null,
      methodLabel: row.description || null,
      networkLabel: meta.networkLabel || null,
      /* Present for deposits (the hash the trader gave us) and absent for
         withdrawals until an operator records the payout reference. */
      reference: row.referenceId || null,
      payoutCurrency: meta.payoutCurrency || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  /* Only what has actually settled counts towards a total. A pending withdrawal
     has left the balance but not reached the trader, and a pending deposit has
     reached neither — counting either would misstate both numbers. */
  const settled = items.filter((i) => i.status === "COMPLETED");
  return {
    currency: BALANCE_CURRENCY,
    items,
    totals: {
      deposited: settled.filter((i) => i.kind === "deposit").reduce((n, i) => n + i.amount, 0),
      withdrawn: settled.filter((i) => i.kind === "withdraw").reduce((n, i) => n + i.amount, 0),
      pendingDeposits: items.filter((i) => i.kind === "deposit" && i.status === "PENDING").length,
      pendingWithdrawals: items.filter((i) => i.kind === "withdraw" && i.status === "PENDING").length,
    },
  };
};
