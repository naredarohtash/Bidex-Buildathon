/**
 * Moving money into a wallet.
 *
 * Everything that credits a deposit goes through here — the submit path, the
 * background sweeper and an operator's manual approval — so there is exactly
 * one place that can increase a balance and exactly one set of rules about when
 * it may. Three separate code paths each doing their own version of this is how
 * a platform ends up double-crediting.
 *
 * The rules, in order of how much damage getting them wrong would do:
 *
 *   1. Credit at most once. The transaction row is locked and re-read inside
 *      the database transaction, and if it is no longer PENDING by then the
 *      work is abandoned. Two concurrent callers therefore cannot both pass:
 *      the second one blocks on the lock, wakes up, sees COMPLETED and stops.
 *
 *   2. Credit what arrived, never what was claimed. The amount comes from the
 *      exchange's record of the transfer. The number the trader typed is kept
 *      only so a mismatch can be shown to an operator.
 *
 *   3. If the value cannot be established, do not guess. A deposit whose rate
 *      we cannot fetch stays PENDING for a human rather than being credited at
 *      an invented one.
 */

import { models, sequelize } from "@b/db";
import { findDepositByTxId, priceInUsdt } from "./binance-verify";
import { findDepositMethod } from "./wallet-methods";
import { evaluateBonus, recordRedemption } from "./deposit-bonus";

/** Balances are held in USDT — see wallet-methods.ts. */
const BALANCE_CURRENCY = "USDT";
const BALANCE_WALLET_TYPE = "SPOT";

export type CreditOutcome =
  | { status: "CREDITED"; amount: number; balance: number }
  | { status: "PENDING"; reason: string }
  | { status: "REJECTED"; reason: string }
  | { status: "ALREADY_SETTLED" };

/**
 * Tell the trader's open terminal their balance moved.
 *
 * Same channel the settlement engine uses when a trade pays out, so a deposit
 * lands live exactly the way a win does. Best-effort and never fatal: a credit
 * that succeeded must not be reported as failed because a socket was closed.
 */
async function announceBalance(userId: string, currency: string, balance: number): Promise<void> {
  try {
    const ws = require("@b/handler/Websocket");
    const broker = ws?.default?.messageBroker ?? ws?.messageBroker;
    if (!broker?.broadcastToSubscribedClients) return;
    await broker.broadcastToSubscribedClients(
      "/api/finance/wallet",
      { type: "wallet", userId, currency },
      { type: "BALANCE_UPDATED", currency, balance, timestamp: Date.now() }
    );
  } catch (err: any) {
    console.error(`[DEPOSIT] balance broadcast failed: ${err?.message || err}`);
  }
}

/**
 * Settle one pending deposit.
 *
 * Safe to call repeatedly and from anywhere; if the deposit has already been
 * dealt with it reports that and changes nothing.
 */
export async function settleDeposit(transactionId: string): Promise<CreditOutcome> {
  // Verification talks to the network, so it happens BEFORE the database
  // transaction is opened. Holding a row lock across an HTTP call would let one
  // slow exchange response block every other deposit behind it.
  const pending = await models.transaction.findByPk(transactionId);
  if (!pending) return { status: "REJECTED", reason: "Deposit not found." };
  if (pending.status !== "PENDING") return { status: "ALREADY_SETTLED" };

  let meta: any = {};
  try {
    meta = typeof pending.metadata === "string" ? JSON.parse(pending.metadata) : pending.metadata || {};
  } catch {
    meta = {};
  }

  const method = findDepositMethod(meta.methodId);
  if (!method) return { status: "PENDING", reason: "Unknown deposit method — needs review." };

  /* UPI and bank payments are never settled here. Nothing we hold can confirm
     that rupees reached an account, so asking the exchange about them would
     mean a pointless call per row per sweep — forever, since the answer can
     never change — against a rate limit shared with the deposits that do
     settle automatically. They wait for the operator queue by design. */
  if (method.kind !== "CRYPTO") {
    return { status: "PENDING", reason: "Waiting for our team to confirm the payment." };
  }

  /* Matched on the transaction hash alone. Amount matching lived here and was
     removed: with one shared deposit address per coin it can only distinguish
     payments while their amounts are unique, and at volume they are not. It
     refused ambiguous matches rather than guessing, so nothing was ever
     mis-credited — but every collision became manual work, and collisions on
     round numbers are the common case, not the edge one. */
  const txId = String(pending.referenceId || "").trim();
  if (!txId) return { status: "PENDING", reason: "No transaction hash to check." };

  const found = await findDepositByTxId(txId, method.asset, method.network);

  if (!found) {
    // Not proof of fraud: an unconfirmed transfer is simply not visible yet.
    return { status: "PENDING", reason: "Not yet visible on the network." };
  }
  if (!found.credited) {
    return {
      status: "PENDING",
      reason: `Waiting for confirmations (${found.confirmations}/${method.confirmations}).`,
    };
  }
  if (found.confirmations < method.confirmations) {
    return {
      status: "PENDING",
      reason: `Waiting for confirmations (${found.confirmations}/${method.confirmations}).`,
    };
  }

  // What arrived, converted to the currency balances are held in.
  const rate = await priceInUsdt(found.asset);
  if (rate === null) {
    return { status: "PENDING", reason: `Could not price ${found.asset} — needs review.` };
  }
  const credit = found.amount * rate;
  if (!Number.isFinite(credit) || credit <= 0) {
    return { status: "REJECTED", reason: "Deposit amount is not valid." };
  }

  /* The bonus, worked out now — from what actually arrived.
     Computing it when the deposit was submitted would have paid a percentage of
     whatever figure the trader typed, which anyone could have set to anything.
     A code that no longer qualifies (the deposit came in under its minimum)
     simply pays nothing; the deposit itself is unaffected, because a promotion
     failing must never hold up money someone actually sent. */
  let bonusAmount = 0;
  let bonusCode: string | null = null;
  let bonusRecord: any = null;
  if (meta.bonusCode) {
    /* Re-evaluated in full, not just recalculated. Everything can have moved
       since the deposit was submitted: the code may have expired, been switched
       off, hit its global limit, or the trader may have claimed it on another
       deposit that settled first. */
    const applied = await evaluateBonus({
      rawCode: String(meta.bonusCode),
      deposit: credit,
      userId: pending.userId,
      methodId: method.id,
    });
    if (applied.ok) {
      bonusAmount = applied.amount;
      bonusCode = applied.code.code;
      bonusRecord = applied.code;
    }
  }

  return await creditWallet({
    transactionId,
    userId: pending.userId,
    amount: credit + bonusAmount,
    bonus: bonusRecord ? { code: bonusRecord, amount: bonusAmount, depositAmount: credit } : null,
    settledMeta: {
      ...meta,
      verifiedBy: "BINANCE",
      verifiedAt: new Date().toISOString(),
      receivedAmount: found.amount,
      receivedAsset: found.asset,
      rateUsdt: rate,
      confirmations: found.confirmations,
      depositAddress: found.address,
      // Recorded separately so a balance can always be explained: this much was
      // sent, this much was promotional.
      depositAmount: credit,
      bonusCode,
      bonusAmount,
    },
  });
}

/**
 * The credit itself: the only function in the platform that adds to a balance
 * as a result of a deposit.
 *
 * Exported so an operator approving a bank or UPI payment — which no API can
 * confirm — reaches the balance through the same locked, idempotent path as an
 * automatic one, rather than a second implementation that drifts from this.
 */
export async function creditWallet(args: {
  transactionId: string;
  userId: string;
  amount: number;
  settledMeta?: Record<string, unknown>;
  /** Present only when a bonus is being paid as part of this credit. */
  bonus?: { code: any; amount: number; depositAmount: number } | null;
}): Promise<CreditOutcome> {
  const { transactionId, userId, amount, settledMeta, bonus } = args;

  try {
    return await sequelize.transaction(async (t: any) => {
      /* Re-read under a write lock. Everything decided before this point was
         decided on data that could since have changed, and the only fact that
         matters — has this already been credited — has to be established while
         holding the row, or two callers can both read PENDING and both pay. */
      const tx = await models.transaction.findByPk(transactionId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!tx) return { status: "REJECTED", reason: "Deposit not found." } as CreditOutcome;
      if (tx.status !== "PENDING") return { status: "ALREADY_SETTLED" } as CreditOutcome;

      const wallet = await models.wallet.findOne({
        where: { userId, currency: BALANCE_CURRENCY, type: BALANCE_WALLET_TYPE },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      let balance: number;
      let walletId: string;
      if (wallet) {
        balance = Number(wallet.balance || 0) + amount;
        walletId = wallet.id;
        await models.wallet.update({ balance }, { where: { id: wallet.id }, transaction: t });
      } else {
        // First deposit on a fresh account — the wallet is created by it.
        const created = await models.wallet.create(
          { userId, type: BALANCE_WALLET_TYPE, currency: BALANCE_CURRENCY, balance: amount },
          { transaction: t }
        );
        balance = amount;
        walletId = created.id;
      }

      await models.transaction.update(
        {
          status: "COMPLETED",
          amount,
          walletId,
          metadata: JSON.stringify(settledMeta || {}),
        },
        { where: { id: transactionId }, transaction: t }
      );

      /* The claim is written inside this transaction, so the bonus and the
         balance it produced commit together — a redemption recorded against a
         credit that rolled back would burn a use of the code for nothing.
         A refusal here (the unique constraint firing because this deposit was
         already redeemed) is logged and ignored: the deposit is real money and
         must not be held up by a promotion. */
      if (bonus) {
        await recordRedemption({
          code: bonus.code,
          userId,
          transactionId,
          amount: bonus.amount,
          depositAmount: bonus.depositAmount,
          transaction: t,
        });
      }

      return { status: "CREDITED", amount, balance } as CreditOutcome;
    });
  } catch (err: any) {
    console.error(`[DEPOSIT] credit failed for ${transactionId}: ${err?.message || err}`);
    return { status: "PENDING", reason: "Could not complete right now." };
  }
}

/**
 * Credit and then announce, in that order.
 *
 * The broadcast is deliberately outside the database transaction: telling a
 * terminal a balance changed before the change has committed would show a
 * figure that a rollback then takes away.
 */
export async function settleDepositAndAnnounce(transactionId: string): Promise<CreditOutcome> {
  const result = await settleDeposit(transactionId);
  if (result.status === "CREDITED") {
    const tx = await models.transaction.findByPk(transactionId);
    if (tx) await announceBalance(tx.userId, BALANCE_CURRENCY, result.balance);
  }
  return result;
}

export { announceBalance, BALANCE_CURRENCY, BALANCE_WALLET_TYPE };
