/**
 * The operator's queue: everything waiting on a person.
 *
 * Two things land here. Bank and UPI withdrawals, which no API can confirm and
 * which therefore always need someone to actually send the money and say so.
 * And deposits the exchange could not settle on its own — a hash that never
 * appeared, an asset with no price feed — which would otherwise sit unpaid with
 * nobody aware of them.
 *
 * Sorted oldest first, deliberately. A queue worked newest-first strands the
 * requests that have already been waiting longest, which are exactly the ones
 * someone is about to complain about.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";

export const metadata: OperationObject = {
  summary: "Pending deposits and withdrawals",
  operationId: "listFinanceRequests",
  tags: ["Admin", "Finance"],
  description: "Lists deposits and withdrawals awaiting an operator decision.",
  requiresAuth: true,
  permission: "view.deposit",
  parameters: [
    {
      name: "kind",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["deposit", "withdraw"] },
    },
    {
      name: "status",
      in: "query",
      required: false,
      description: "Defaults to PENDING.",
      schema: { type: "string" },
    },
  ],
  responses: {
    200: { description: "Pending requests" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
};

function parseMeta(raw: unknown): Record<string, any> {
  try {
    return typeof raw === "string" ? JSON.parse(raw || "{}") : (raw as any) || {};
  } catch {
    return {};
  }
}

export default async (data: { user?: { id: string }; query?: any }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const kind = String(data.query?.kind || "").toLowerCase();
  const types =
    kind === "deposit" ? ["DEPOSIT"] : kind === "withdraw" ? ["WITHDRAW"] : ["DEPOSIT", "WITHDRAW"];
  const status = String(data.query?.status || "PENDING").toUpperCase();

  const rows = await models.transaction.findAll({
    where: { type: types, status },
    order: [["createdAt", "ASC"]],
    limit: 200,
    include: [
      {
        model: models.user,
        as: "user",
        attributes: ["id", "firstName", "lastName", "email"],
      },
    ],
  });

  /* Crypto deposits nobody has paid yet are not work.
     Every abandoned deposit — a rate that lapsed, a window someone closed —
     leaves a PENDING row, and each one would sit in this queue asking to be
     looked at. There is nothing to look at: no money has arrived, and if it
     ever does the callback credits it without anyone here. Anything further
     along than "waiting" stays, because a part-paid or stuck payment IS work. */
  const actionable = rows.filter((row: any) => {
    if (row.type !== "DEPOSIT") return true;
    const meta = parseMeta(row.metadata);
    if (meta.kind !== "CRYPTO") return true; // UPI and bank always need a person
    const state = String(meta.paymentStatus || "").toLowerCase();
    return state !== "" && state !== "waiting";
  });

  return {
    items: actionable.map((row: any) => {
      const meta = parseMeta(row.metadata);
      return {
        id: row.id,
        kind: row.type === "DEPOSIT" ? "deposit" : "withdraw",
        status: row.status,
        amount: Number(row.amount) || 0,
        /* For a pending deposit `amount` is 0 — nothing is verified yet — so
           what the trader said they sent is carried alongside it. An operator
           comparing the two is the whole point of this screen. */
        claimedAmount: meta.claimedAmount ?? null,
        fee: Number(row.fee) || 0,
        methodId: meta.methodId || null,
        methodLabel: row.description || null,
        networkLabel: meta.networkLabel || null,
        payoutCurrency: meta.payoutCurrency || null,
        /* Where to send it. Present only on withdrawals, and the reason this
           endpoint is permission-gated: it is a bank account number. */
        details: row.type === "WITHDRAW" ? meta.details || null : null,
        reference: row.referenceId || null,
        /* Who ended it, and when.

           Null on everything in the default PENDING queue, and the point of
           the endpoint's `status` parameter: asked for CANCELLED, this list
           would otherwise be a set of rows that stopped for no stated reason.
           A withdrawal the trader called off and one an operator turned down
           are different events with different follow-ups — the first needs
           nobody, the second may need an explanation — and only these fields
           tell them apart. `USER` is written by the trader's own cancel route;
           an operator's decision carries their id instead. */
        endedBy: meta.cancelledBy || (meta.decidedBy ? "OPERATOR" : null),
        endedAt: meta.cancelledAt || meta.decidedAt || null,
        operatorId: meta.decidedBy || null,
        operatorNote: meta.note || null,
        refunded: meta.refunded ?? null,
        user: row.user
          ? {
              id: row.user.id,
              name: [row.user.firstName, row.user.lastName].filter(Boolean).join(" "),
              email: row.user.email,
            }
          : null,
        createdAt: row.createdAt,
        waitingHours: Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 3_600_000),
      };
    }),
  };
};
