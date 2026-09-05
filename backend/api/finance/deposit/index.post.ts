/**
 * Opening a deposit.
 *
 * Crypto and the rupee rails work differently here, and the difference is the
 * whole reason a processor was introduced.
 *
 * Crypto: a payment is opened with the processor, which returns an address
 * belonging to THIS deposit and no other. The trader pays it and nothing more
 * is asked of them — no transaction hash, because the address already says who
 * they are. The callback credits them.
 *
 * UPI and bank: unchanged, and unchangeable by us. No API will report that
 * rupees reached an account, so the trader supplies the UTR and an operator
 * confirms it against the statement.
 *
 * The hash this used to demand was never a design choice — it was the only way
 * to attribute a payment when every user shared one address. That constraint is
 * gone for crypto, so the field is too.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { walletCreationService } from "@b/services/wallet";
import { findDepositMethod } from "../wallet-methods";
import { BALANCE_CURRENCY, BALANCE_WALLET_TYPE } from "../wallet-credit";
import { createPayment, nowPaymentsConfigured } from "../nowpayments";

export const metadata: OperationObject = {
  summary: "Open a deposit",
  operationId: "createDeposit",
  tags: ["Finance", "Deposit"],
  description:
    "Opens a deposit. Crypto returns a payment address unique to this deposit; UPI and bank record a reference for an operator.",
  requiresAuth: true,
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            methodId: { type: "string" },
            amount: { type: "number" },
            txId: { type: "string", description: "UPI/bank reference. Not used for crypto." },
            bonusCode: { type: "string" },
          },
          required: ["methodId", "amount"],
        },
      },
    },
  },
  responses: {
    200: { description: "Deposit opened" },
    400: { description: "Invalid request" },
    401: { description: "Unauthorized" },
    409: { description: "Reference already submitted" },
    503: { description: "Payment provider unavailable" },
  },
};

export default async (data: { user?: { id: string }; body?: any }) => {
  const user = data?.user;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const { methodId, amount, txId, bonusCode } = data.body || {};

  const method = findDepositMethod(String(methodId || ""));
  if (!method) throw createError({ statusCode: 400, message: "Choose a deposit method." });

  const requested = Number(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw createError({ statusCode: 400, message: "Enter a valid amount." });
  }
  if (requested < method.min) {
    throw createError({
      statusCode: 400,
      message: `The minimum deposit for ${method.label} is ${method.min} ${
        method.kind === "CRYPTO" ? method.asset : "INR"
      }.`,
    });
  }

  const reference = String(txId || "").trim();

  /* One reference, one deposit — across every user, not just this one. Scoping
     it to the caller would let a second account claim a UTR the first had
     already been credited for. Crypto has no reference at this point; its
     uniqueness comes from the address. */
  if (reference) {
    const clash = await models.transaction.findOne({
      where: { referenceId: reference, type: "DEPOSIT" },
    });
    if (clash) {
      throw createError({ statusCode: 409, message: "That reference has already been submitted." });
    }
  } else if (method.kind !== "CRYPTO") {
    throw createError({
      statusCode: 400,
      message: `Enter the ${method.referenceLabel.toLowerCase()} so we can find your payment.`,
    });
  }

  const { wallet } = await walletCreationService.getOrCreateWallet(
    user.id,
    BALANCE_WALLET_TYPE,
    BALANCE_CURRENCY
  );

  const baseMeta = {
    methodId: method.id,
    kind: method.kind,
    asset: method.asset,
    network: method.network,
    networkLabel: method.networkLabel,
    claimedAmount: requested,
    bonusCode:
      typeof bonusCode === "string" && bonusCode.trim() ? bonusCode.trim().toUpperCase() : null,
    submittedAt: new Date().toISOString(),
  };

  const created = await models.transaction.create({
    userId: user.id,
    walletId: wallet.id,
    type: "DEPOSIT",
    status: "PENDING",
    // Set from what the processor confirms received; never from the request.
    amount: 0,
    fee: 0,
    referenceId: reference || null,
    description: `${method.label} deposit via ${method.networkLabel}`,
    metadata: JSON.stringify(baseMeta),
  });

  /* ── Rupee rails: nothing to open, someone will look ── */
  if (method.kind !== "CRYPTO") {
    return {
      id: created.id,
      status: "PENDING",
      message: `We have your ${method.label} deposit. Our team confirms these against the account, usually within ${method.eta}.`,
    };
  }

  /* ── Crypto: open a payment and hand back its address ── */
  if (!(await nowPaymentsConfigured())) {
    await models.transaction.update(
      { status: "FAILED" },
      { where: { id: created.id, status: "PENDING" } }
    );
    throw createError({
      statusCode: 503,
      message: "Crypto deposits are not available right now. Please try again shortly.",
    });
  }

  const payment = await createPayment({
    priceAmount: requested,
    // The processor's code for this rail, not the bare ticker — see
    // wallet-methods.ts. Sending "usdt" opens a payment on the wrong chain.
    payCurrency: method.processorCurrency || method.asset,
    // Our own id, returned on every callback — how a webhook is tied to a user
    // without trusting anything in its payload to say who they are.
    orderId: created.id,
    description: `${method.label} deposit`,
  });

  if (!payment) {
    /* Failed rather than left pending. A deposit with no address is one the
       trader cannot pay into, and leaving it open would put an unpayable row in
       the operator queue for someone to puzzle over later. */
    await models.transaction.update(
      { status: "FAILED" },
      { where: { id: created.id, status: "PENDING" } }
    );
    /* Usually a below-minimum amount, and the processor's floor moves with
       network fees — so this cannot always be caught by the catalogue's static
       minimum, and a generic "try again" would send someone round the loop
       with the same number. */
    throw createError({
      statusCode: 503,
      message: `Could not open a payment for that amount. The minimum for ${method.label} changes with network fees — try a little more, or another method.`,
    });
  }

  await models.transaction.update(
    {
      metadata: JSON.stringify({
        ...baseMeta,
        paymentId: payment.paymentId,
        payAddress: payment.payAddress,
        payAmount: payment.payAmount,
        payCurrency: payment.payCurrency,
        validUntil: payment.validUntil,
      }),
    },
    { where: { id: created.id } }
  );

  return {
    id: created.id,
    status: "AWAITING_PAYMENT",
    /* Unique to this deposit and reused by nobody, so the payment identifies
       the payer without a hash — the entire reason this path exists. */
    payAddress: payment.payAddress,
    payinExtraId: payment.payinExtraId,
    payAmount: payment.payAmount,
    payCurrency: payment.payCurrency,
    /* The address stops accepting after this. Not shown as a countdown clock —
       it is a week away, and a ticking timer on something that generous reads
       as pressure rather than information. */
    validUntil: payment.validUntil,
    creditAmount: payment.priceAmount,
    message: `Send exactly ${payment.payAmount} ${payment.payCurrency} to the address shown. Your balance updates on its own once it confirms.`,
  };
};
