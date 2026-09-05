/**
 * Settling a guest's trades in the browser.
 *
 * A guest has no account, so nothing they do is written anywhere — no order
 * row, no wallet, no settlement cron. That is the point, and it is also the
 * problem: settlement on this platform is entirely server-driven, arriving as
 * an ORDER_COMPLETED over the WebSocket. A trade nobody stored will never get
 * one, so a guest's position would sit PENDING for ever.
 *
 * This is the same determination the server would have made, kept deliberately
 * close to `backend/owned-engine/lib/settlement-engine.mjs` so the demo cannot
 * quietly teach a different game from the one a real account plays:
 *
 *   up side   (RISE) wins when close  >  entry
 *   down side (FALL) wins when close  <  entry
 *   equal            is a DRAW and the stake comes back
 *
 * Only RISE_FALL. Guests are held to that one type on purpose — every other
 * type would need its own rules duplicated here, and a second copy of a payout
 * rule is a place for the demo and the real thing to disagree about money.
 */

export const DEFAULT_PROFIT_PERCENTAGE = 85;

export type GuestOrderStatus = "WIN" | "LOSS" | "DRAW";

export interface GuestSettleInput {
  side: string;
  /** Entry price. */
  price: number;
  amount: number;
  profitPercentage?: number;
}

export interface GuestSettleResult {
  status: GuestOrderStatus;
  profit: number;
  /** What to add back to the demo balance, stake included. */
  balanceChange: number;
  /** What this trade did to net P&L. */
  netPL: number;
}

const UP_SIDES = ["RISE", "CALL", "HIGHER", "UP"];

export function settleGuestOrder(
  order: GuestSettleInput,
  closePrice: number
): GuestSettleResult {
  const entry = order.price;
  const isUp = UP_SIDES.includes(String(order.side).toUpperCase());
  const pct = order.profitPercentage ?? DEFAULT_PROFIT_PERCENTAGE;

  let status: GuestOrderStatus;
  let profit = 0;

  if ((isUp && closePrice > entry) || (!isUp && closePrice < entry)) {
    status = "WIN";
    profit = order.amount * (pct / 100);
  } else if (closePrice === entry) {
    status = "DRAW";
  } else {
    status = "LOSS";
  }

  /* The same credit convention the live ORDER_COMPLETED handler uses:
     WIN returns the stake plus the profit, DRAW returns the stake, and a LOSS
     returns nothing because the stake was taken when the trade was placed. */
  const balanceChange =
    status === "WIN" ? order.amount + profit : status === "DRAW" ? order.amount : 0;

  const netPL = status === "WIN" ? profit : status === "DRAW" ? 0 : -order.amount;

  return { status, profit, balanceChange, netPL };
}
