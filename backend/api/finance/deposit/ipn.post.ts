/**
 * The processor's callback: "this payment moved".
 *
 * Deliberately the only unauthenticated route in the finance system, because it
 * has to be — the processor has no session and no token. That makes it the one
 * endpoint an attacker can reach freely, and the only thing separating it from
 * a way to mint balance is the signature check. Nothing here reads the payload
 * until `verifyCallback` has returned true.
 *
 * Two further rules follow from not trusting the caller:
 *
 *   Who the money belongs to comes from OUR record, looked up by the order id
 *   we supplied when the payment was opened. The callback carries user-ish
 *   fields; none of them are used. A forged callback naming someone else's
 *   account gets nowhere even in the impossible case that it passes signing.
 *
 *   How much is credited comes from what the processor says was actually
 *   received, converted to USDT, never from anything the trader typed.
 *
 * Retries are expected and safe: the credit path locks the row and refuses a
 * second payment, so the same callback arriving five times credits once.
 */

import { models } from "@b/db";
import { verifyCallback, classify } from "../nowpayments";
import { creditWallet, announceBalance, BALANCE_CURRENCY } from "../wallet-credit";
import { evaluateBonus } from "../deposit-bonus";

export const metadata: OperationObject = {
  summary: "Payment processor callback",
  operationId: "depositIpn",
  tags: ["Finance", "Deposit"],
  description:
    "Receives payment status callbacks from NOWPayments. Public by necessity; every request is signature-verified.",
  requiresAuth: false,
  responses: {
    200: { description: "Acknowledged" },
    401: { description: "Signature missing or invalid" },
  },
};

export default async (data: { body?: any; headers?: Record<string, any> }) => {
  const body = data?.body;
  const signature =
    data?.headers?.["x-nowpayments-sig"] || data?.headers?.["X-NOWPAYMENTS-SIG"];

  if (!(await verifyCallback(body, signature))) {
    console.error("[NOWPAY] rejected an unsigned or badly signed callback");
    // Deliberately terse. An attacker probing this should learn nothing about
    // why they failed.
    return { statusCode: 401, ok: false };
  }

  const orderId = String(body?.order_id || "").trim();
  const paymentId = String(body?.payment_id || "").trim();
  const state = classify(body?.payment_status);

  if (!orderId) {
    console.error(`[NOWPAY] callback with no order_id (payment ${paymentId})`);
    return { ok: true, ignored: "no order id" };
  }

  const deposit = await models.transaction.findByPk(orderId);
  if (!deposit || deposit.type !== "DEPOSIT") {
    console.error(`[NOWPAY] callback for unknown deposit ${orderId}`);
    return { ok: true, ignored: "unknown deposit" };
  }
  // Already dealt with. Callbacks continue after a payment finishes, and this
  // is the ordinary case, not an error.
  if (deposit.status !== "PENDING") return { ok: true, ignored: "already settled" };

  let meta: any = {};
  try {
    meta = typeof deposit.metadata === "string" ? JSON.parse(deposit.metadata) : deposit.metadata || {};
  } catch {
    meta = {};
  }

  if (state === "FAILED") {
    await models.transaction.update(
      {
        status: "FAILED",
        metadata: JSON.stringify({ ...meta, paymentStatus: body?.payment_status, paymentId }),
      },
      { where: { id: orderId, status: "PENDING" } }
    );
    return { ok: true, status: "FAILED" };
  }

  if (state !== "CREDIT") {
    // Still confirming. Recorded so the operator queue can show how far along
    // a slow payment is rather than only "pending".
    await models.transaction.update(
      { metadata: JSON.stringify({ ...meta, paymentStatus: body?.payment_status, paymentId }) },
      { where: { id: orderId, status: "PENDING" } }
    );
    return { ok: true, status: "PENDING" };
  }

  /* What was actually received, in the currency balances are held in.
     `actually_paid` is what arrived; `price_amount` is what was asked for. They
     differ on an underpayment, and the smaller of the two is what the trader
     is owed — crediting the requested figure for a short payment would hand out
     the difference. */
  const outcome = Number(body?.outcome_amount);
  const requested = Number(body?.price_amount);
  const credited = Number.isFinite(outcome) && outcome > 0 ? outcome : requested;

  if (!Number.isFinite(credited) || credited <= 0) {
    console.error(`[NOWPAY] callback for ${orderId} carried no usable amount`);
    return { ok: true, ignored: "no amount" };
  }

  // The bonus is decided here for the same reason as everywhere else: against
  // the amount that arrived, and re-checked in case the code has since expired
  // or been claimed elsewhere.
  let bonusAmount = 0;
  let bonusRecord: any = null;
  if (meta.bonusCode) {
    const applied = await evaluateBonus({
      rawCode: String(meta.bonusCode),
      deposit: credited,
      userId: deposit.userId,
      methodId: meta.methodId,
    });
    if (applied.ok) {
      bonusAmount = applied.amount;
      bonusRecord = applied.code;
    }
  }

  const result = await creditWallet({
    transactionId: orderId,
    userId: deposit.userId,
    amount: credited + bonusAmount,
    bonus: bonusRecord
      ? { code: bonusRecord, amount: bonusAmount, depositAmount: credited }
      : null,
    settledMeta: {
      ...meta,
      verifiedBy: "NOWPAYMENTS",
      verifiedAt: new Date().toISOString(),
      paymentId,
      paymentStatus: body?.payment_status,
      actuallyPaid: body?.actually_paid ?? null,
      payCurrency: body?.pay_currency ?? null,
      depositAmount: credited,
      bonusAmount,
    },
  });

  if (result.status === "CREDITED") {
    await announceBalance(deposit.userId, BALANCE_CURRENCY, result.balance);
    console.log(
      `[NOWPAY] credited ${result.amount.toFixed(2)} to user ${deposit.userId} (payment ${paymentId})`
    );
  }

  return { ok: true, status: result.status };
};
