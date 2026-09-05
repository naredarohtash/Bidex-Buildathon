/**
 * What the deposit and withdrawal screens are allowed to offer.
 *
 * The modals used to carry their own hard-coded lists, which is how the deposit
 * screen came to advertise five coins while its submit button posted to a fiat
 * endpoint that knew nothing about any of them. Both screens now render exactly
 * what this returns and nothing else.
 *
 * Deposit addresses are resolved here rather than sent with the form, so an
 * address only ever reaches a browser having just been confirmed live. A method
 * whose address cannot be fetched is returned as unavailable instead of being
 * hidden: a trader who came to pay in Bitcoin needs to be told it is
 * temporarily off, not left wondering where it went.
 */

import { models } from "@b/db";
import { DEPOSIT_METHODS, WITHDRAW_METHODS } from "../wallet-methods";
import { nowPaymentsConfigured } from "../nowpayments";
import { bonusesConfigured } from "../deposit-bonus";
import { BALANCE_CURRENCY, BALANCE_WALLET_TYPE } from "../wallet-credit";

export const metadata: OperationObject = {
  summary: "Deposit and withdrawal methods",
  operationId: "getFinanceGateways",
  tags: ["Finance"],
  description:
    "Lists the deposit methods (with live deposit addresses) and withdrawal methods available to the caller.",
  requiresAuth: true,
  responses: {
    200: {
      description: "Available methods",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              balanceCurrency: { type: "string" },
              deposit: { type: "array", items: { type: "object" } },
              withdraw: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
    },
    401: { description: "Unauthorized" },
  },
};

export default async (data: { user?: { id: string } }) => {
  if (!data?.user?.id) {
    throw new Error("Unauthorized");
  }

  const configured = await nowPaymentsConfigured();

  /* The spendable balance travels with the catalogue rather than needing its
     own call. The withdrawal screen cannot render a single sensible thing
     without it — minimums, "withdraw everything", whether the amount fits —
     so fetching it separately only means the screen briefly shows a balance of
     zero on a funded account, which is the exact thing the old modal did. */
  const wallet = await models.wallet.findOne({
    where: { userId: data.user.id, currency: BALANCE_CURRENCY, type: BALANCE_WALLET_TYPE },
    attributes: ["balance"],
  });

  /* Fetched together rather than one after another. Six sequential calls to the
     exchange would put several seconds in front of a screen the trader has
     already opened, and they do not depend on each other. */
  const deposit = await Promise.all(
    DEPOSIT_METHODS.map(async (m) => {
      /* Two ways of knowing where to pay. Crypto asks the exchange; UPI and
         bank read the configured payee details. Both can be missing, and both
         mean the same thing to a trader — there is nowhere to send — so they
         produce the same unavailable state rather than two different ones. */
      if (m.kind !== "CRYPTO") {
        const payTo: { field: string; label: string; value: string }[] = [];
        for (const spec of m.payToEnv || []) {
          const value = (process.env[spec.env] || "").trim();
          if (value) payTo.push({ field: spec.field, label: spec.label, value });
        }
        // Partial details are worse than none: a bank transfer missing the IFSC
        // is a payment that bounces or lands somewhere unrecoverable.
        const complete = payTo.length === (m.payToEnv || []).length && payTo.length > 0;
        return {
          id: m.id,
          label: m.label,
          kind: m.kind,
          asset: m.asset,
          network: m.network,
          networkLabel: m.networkLabel,
          min: m.min,
          confirmations: m.confirmations,
          eta: m.eta,
          settlement: m.settlement,
          referenceLabel: m.referenceLabel,
          referenceHint: m.referenceHint,
          address: null,
          tag: null,
          payTo: complete ? payTo : null,
          available: complete,
          unavailableReason: complete ? null : `${m.label} deposits are not set up yet.`,
        };
      }

      /* No address here any more. Each deposit gets its own from the processor
         when it is opened, so there is nothing to publish in a catalogue — and
         showing a shared address alongside per-payment ones would be the worst
         of both. Availability is simply whether the processor is configured. */
      return {
        id: m.id,
        label: m.label,
        kind: m.kind,
        asset: m.asset,
        network: m.network,
        networkLabel: m.networkLabel,
        min: m.min,
        confirmations: m.confirmations,
        eta: m.eta,
        settlement: m.settlement,
        referenceLabel: m.referenceLabel,
        referenceHint: m.referenceHint,
        payTo: null,
        address: null,
        tag: null,
        available: configured,
        unavailableReason: configured ? null : "Crypto deposits are not configured yet.",
      };
    })
  );

  return {
    balanceCurrency: BALANCE_CURRENCY,
    balance: Number(wallet?.balance || 0),
    /* Deposits are verified against the exchange; without keys they can still
       be submitted but wait for an operator. The UI says which, so nobody is
       promised an instant credit the server cannot deliver. */
    automaticDeposits: configured,
    /* Whether any bonus code exists. Offering the field with nothing behind it
       invites someone to hunt for a code that was never issued. */
    bonusesEnabled: await bonusesConfigured(),
    deposit,
    withdraw: WITHDRAW_METHODS.map((m) => ({
      id: m.id,
      label: m.label,
      kind: m.kind,
      payoutCurrency: m.payoutCurrency,
      networkLabel: m.networkLabel,
      min: m.min,
      fee: m.fee,
      eta: m.eta,
      settlement: m.settlement,
      fields: m.fields,
    })),
  };
};
