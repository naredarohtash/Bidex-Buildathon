/**
 * Deposit bonuses — eligibility and value.
 *
 * The single place that decides whether a code applies and what it pays.
 * Everything else asks: the preview endpoint the amount step calls, and the
 * credit path that actually pays it. Two implementations of these rules would
 * eventually disagree, and the disagreement would be money.
 *
 * Every condition is checked in both places, not just at preview. A preview is
 * a courtesy shown while the trader can still act on it; the check that counts
 * runs when the deposit settles, because everything can have changed in between
 * — the code may have expired, hit its global limit, or been switched off.
 */

import { models } from "@b/db";

export interface BonusCheck {
  code: any;
  amount: number;
}

/** Why a code does not apply, in words a trader can act on. */
export type BonusFailure = { ok: false; error: string };
export type BonusSuccess = { ok: true; code: any; amount: number };

/** Look up an active code by its string. Case and padding are forgiven. */
export async function findBonusCode(raw: string): Promise<any | null> {
  const code = String(raw || "").trim().toUpperCase();
  if (!code) return null;
  return await models.bonusCode.findOne({ where: { code } });
}

export async function bonusesConfigured(): Promise<boolean> {
  try {
    return (await models.bonusCode.count({ where: { status: true } })) > 0;
  } catch {
    // The table may not exist yet on a server that has not synced. Reporting
    // "no bonuses" hides the field, which is better than a 500 on the deposit
    // screen for a feature nobody has set up.
    return false;
  }
}

/** What one claim would pay on a given deposit, before eligibility. */
function valueOf(code: any, deposit: number): number {
  const raw =
    code.type === "FIXED" ? Number(code.value) : (deposit * Number(code.value)) / 100;
  const capped = Number(code.maxBonus) > 0 ? Math.min(raw, Number(code.maxBonus)) : raw;
  /* Floored to two decimals. Rounding a bonus up invents money, and it
     compounds across every deposit the code is ever used on. */
  return Math.floor(capped * 100) / 100;
}

/**
 * Can this user claim this code, on this deposit, right now?
 *
 * `userId` and `methodId` are optional so the same rules can answer a preview
 * before a method is chosen. Anything that cannot be evaluated is not treated
 * as passing — it is simply not checked yet, and the settlement path always has
 * both.
 */
export async function evaluateBonus(args: {
  rawCode: string;
  deposit: number;
  userId?: string;
  methodId?: string;
}): Promise<BonusSuccess | BonusFailure> {
  const { rawCode, deposit, userId, methodId } = args;

  const code = await findBonusCode(rawCode);
  if (!code) return { ok: false, error: "That code is not valid." };
  if (!code.status) return { ok: false, error: "That code is no longer active." };

  const now = Date.now();
  if (code.startsAt && new Date(code.startsAt).getTime() > now) {
    return { ok: false, error: "That code is not active yet." };
  }
  if (code.expiresAt && new Date(code.expiresAt).getTime() < now) {
    return { ok: false, error: "That code has expired." };
  }

  const amount = Number(deposit);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter your deposit amount first." };
  }
  if (Number(code.minDeposit) > 0 && amount < Number(code.minDeposit)) {
    return { ok: false, error: `This code needs a deposit of at least ${code.minDeposit} USDT.` };
  }

  if (methodId && Array.isArray(code.allowedMethods) && code.allowedMethods.length > 0) {
    if (!code.allowedMethods.includes(methodId)) {
      return { ok: false, error: "This code cannot be used with that payment method." };
    }
  }

  // Global ceiling. Checked before the per-user one so a sold-out promotion
  // says so, rather than telling one person they have used it up.
  if (Number(code.maxUsesTotal) > 0 && Number(code.usedCount) >= Number(code.maxUsesTotal)) {
    return { ok: false, error: "This code has reached its limit." };
  }

  if (userId) {
    if (Number(code.maxUsesPerUser) > 0) {
      const mine = await models.bonusRedemption.count({
        where: { bonusCodeId: code.id, userId },
      });
      if (mine >= Number(code.maxUsesPerUser)) {
        return {
          ok: false,
          error:
            Number(code.maxUsesPerUser) === 1
              ? "You have already used this code."
              : `You have already used this code ${code.maxUsesPerUser} times.`,
        };
      }
    }

    if (code.firstDepositOnly) {
      /* "First deposit" means no deposit has ever completed, not that none is
         pending — otherwise someone could start a second deposit while the
         first is still confirming and claim a new-customer offer twice. */
      const completed = await models.transaction.count({
        where: { userId, type: "DEPOSIT", status: "COMPLETED" },
      });
      if (completed > 0) {
        return { ok: false, error: "This code is only for your first deposit." };
      }
    }
  }

  const payout = valueOf(code, amount);
  if (payout <= 0) return { ok: false, error: "This code adds nothing to that amount." };

  return { ok: true, code, amount: payout };
}

/**
 * Record a claim and move the counters.
 *
 * Called only from the credit path, inside its database transaction, so a
 * bonus and the balance it belongs to commit or fail together.
 *
 * Returns false when the claim could not be recorded — which includes the
 * unique constraint on transactionId firing because this deposit has already
 * been redeemed. The caller must treat that as "no bonus", never as an error
 * worth aborting the deposit for: the money the trader actually sent is not
 * conditional on the promotion.
 */
export async function recordRedemption(args: {
  code: any;
  userId: string;
  transactionId: string;
  amount: number;
  depositAmount: number;
  transaction: any;
}): Promise<boolean> {
  const { code, userId, transactionId, amount, depositAmount, transaction } = args;
  try {
    await models.bonusRedemption.create(
      { bonusCodeId: code.id, userId, transactionId, amount, depositAmount },
      { transaction }
    );
    await models.bonusCode.update(
      {
        usedCount: Number(code.usedCount || 0) + 1,
        totalPaidOut: Number(code.totalPaidOut || 0) + amount,
      },
      { where: { id: code.id }, transaction }
    );
    return true;
  } catch (err: any) {
    console.error(`[BONUS] could not record redemption for ${transactionId}: ${err?.message}`);
    return false;
  }
}
