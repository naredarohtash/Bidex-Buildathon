import { models } from "@b/db";
import { Op, fn, col } from "sequelize";

/**
 * The demo balance, derived from the orders the server already recorded.
 *
 * It used to exist only in the browser: order creation debits a wallet solely
 * when isDemo is false, so the figure was arithmetic done client-side and saved
 * to that browser's localStorage. Two devices on one account each kept their own
 * copy and drifted apart with every trade — one showing $68,551.14 while the
 * other showed $77,840.00 for the same user, with nothing correct to refresh
 * from.
 *
 * Nothing new is stored per trade. Every demo order is already in the database,
 * so the balance is a function of them, and a function cannot disagree with
 * itself across devices.
 *
 * How a binary order moves the balance, taken from the recorded data rather than
 * assumed — WIN rows carry the net winnings in `profit` (averaging 489.79 on a
 * 663.76 stake, about 74%), while LOSS and DRAW rows carry 0:
 *
 *   WIN      + profit          stake returned plus winnings
 *   LOSS     - amount          the stake is the loss, and profit is 0
 *   DRAW       0               stake returned
 *   PENDING  - amount          stake held while the trade is open
 */

export const DEMO_DEFAULT_BALANCE = 50000;

/**
 * Reset grants the same as a new account.
 *
 * It used to grant 10000 against a default of 50000, so pressing reset left a
 * user with a fifth of what they started with — the opposite of what a reset
 * means. Deliberately defined as the default rather than repeating the number,
 * so the two cannot drift apart again.
 */
export const DEMO_RESET_BALANCE = DEMO_DEFAULT_BALANCE;

/**
 * What a practice balance may be set to.
 *
 * Somebody practising a strategy at the size they actually trade needs to be
 * able to say so — a fixed 50,000 makes every position either trivial or
 * impossible for them. The bounds exist because this figure feeds the same
 * position-size and payout arithmetic the real account uses: below a hundred
 * the smallest allowed stake is already the whole balance, and above a million
 * the numbers stop resembling anything the account could hold.
 */
export const DEMO_MIN_BALANCE = 100;
export const DEMO_MAX_BALANCE = 1_000_000;

/** The requested amount, or null where it is not a number we would accept. */
export function readRequestedBalance(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded < DEMO_MIN_BALANCE || rounded > DEMO_MAX_BALANCE) return null;
  return rounded;
}

export type DemoSettings = {
  startingBalance?: number;
  resetAt?: string;
};

export function readDemoSettings(settings: any): DemoSettings {
  const demo = settings?.demo;
  return demo && typeof demo === "object" ? demo : {};
}

export async function computeDemoBalance(userId: string): Promise<number> {
  const record = await models.user.findOne({
    where: { id: userId },
    attributes: ["id", "settings"],
  });

  const demo = readDemoSettings(record?.settings);
  const starting =
    typeof demo.startingBalance === "number"
      ? demo.startingBalance
      : DEMO_DEFAULT_BALANCE;

  // A reset does not delete history — it marks a point after which orders
  // count. Anything placed before it belongs to the previous run.
  const since = demo.resetAt ? new Date(demo.resetAt) : null;

  const rows: any[] = await models.binaryOrder.findAll({
    where: {
      userId,
      isDemo: true,
      ...(since && !isNaN(since.getTime())
        ? { createdAt: { [Op.gt]: since } }
        : {}),
    },
    attributes: [
      "status",
      [fn("SUM", col("amount")), "totalAmount"],
      [fn("SUM", col("profit")), "totalProfit"],
    ],
    group: ["status"],
    raw: true,
  });

  let balance = starting;
  for (const row of rows) {
    const amount = Number(row.totalAmount) || 0;
    const profit = Number(row.totalProfit) || 0;

    switch (row.status) {
      case "WIN":
        balance += profit;
        break;
      case "LOSS":
      case "PENDING":
        balance -= amount;
        break;
      // DRAW returns the stake and changes nothing.
    }
  }

  // Guard against a negative display. A stake is refused when it exceeds the
  // balance, so this should not arise, but a balance is not a thing to render
  // as negative if some historic row disagrees.
  return Math.max(0, Number(balance.toFixed(2)));
}
