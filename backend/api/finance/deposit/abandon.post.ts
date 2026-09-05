/**
 * "I am not going to pay that one."
 *
 * Called when a trader who has been shown a payment address walks away from it
 * — going back to change the coin, closing the drawer, or asking for a fresh
 * address after the rate window lapsed. Without it, every address ever issued
 * stayed open forever and the operator queue filled with rows nobody would ever
 * pay.
 *
 * The important part is what this deliberately does NOT do: it does not change
 * the deposit's status.
 *
 * The address is real and the processor keeps accepting into it for about a
 * week, whatever our screen says. A trader who copied it, closed the window and
 * paid an hour later has sent actual money to an address we issued them, and we
 * owe them the balance. But the callback in ipn.post.ts ignores any deposit that
 * is not PENDING — so marking this row CANCELLED would mean their payment
 * arrived, was signed, was matched to them, and was then thrown away by our own
 * bookkeeping. Nobody would find out until they complained.
 *
 * So abandoning is recorded in metadata and the row stays PENDING and fully
 * creditable. What changes is what the operator queue can tell you: an
 * `abandonedAt` row is one nobody is waiting on, not one that is stuck.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";

export const metadata: OperationObject = {
  summary: "Abandon an unpaid deposit",
  operationId: "abandonDeposit",
  tags: ["Finance", "Deposit"],
  description:
    "Marks a deposit the trader walked away from. The address stays live and anything sent to it is still credited; this only records that nobody is waiting on it.",
  requiresAuth: true,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: { id: { type: "string", description: "The deposit to abandon." } },
          required: ["id"],
        },
      },
    },
  },
  responses: {
    200: { description: "Recorded" },
    400: { description: "Invalid request" },
    401: { description: "Unauthorized" },
    403: { description: "Not your deposit" },
  },
};

export default async (data: { user?: { id: string }; body?: any }) => {
  const user = data?.user;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const id = String(data?.body?.id || "").trim();
  if (!id) throw createError({ statusCode: 400, message: "Which deposit?" });

  const deposit = await models.transaction.findByPk(id);

  /* A row that is not there is a client tidying up after something already
     gone. That is the desired end state, so it is a success, not a 404 — this
     is called from navigation and a browser leaving a page, and neither has
     anywhere useful to put an error. */
  if (!deposit || deposit.type !== "DEPOSIT") return { ok: true, status: "GONE" };

  if (deposit.userId !== user.id) {
    // Someone else's deposit. Not "not found" — this is a real authorisation
    // failure and should be visible as one in the logs.
    throw createError({ statusCode: 403, message: "Forbidden" });
  }

  // Already paid, already failed, already credited. Nothing to abandon, and
  // saying so is more useful than pretending we did something.
  if (deposit.status !== "PENDING") return { ok: true, status: deposit.status };

  let meta: any = {};
  try {
    meta =
      typeof deposit.metadata === "string"
        ? JSON.parse(deposit.metadata)
        : deposit.metadata || {};
  } catch {
    meta = {};
  }

  // Idempotent: the drawer can fire this from a back-click and a close in the
  // same gesture, and the first timestamp is the honest one.
  if (meta.abandonedAt) return { ok: true, status: "ABANDONED" };

  await models.transaction.update(
    { metadata: JSON.stringify({ ...meta, abandonedAt: new Date().toISOString() }) },
    // Re-checking PENDING in the WHERE closes the gap between the read above
    // and this write: a callback crediting this deposit in between must win.
    { where: { id, status: "PENDING" } }
  );

  return { ok: true, status: "ABANDONED" };
};
