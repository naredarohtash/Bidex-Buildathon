// Early close ("cash out") for a binary position.
//
// This endpoint did not exist. The terminal has always POSTed to
// /api/exchange/binary/order/{id}/close, and there was no route directory for
// it, so every attempt 404'd and the panel showed "Cash Out Failed" — the
// feature had never worked, rather than having broken.
//
// It is modelled on index.del.ts (cancel), which already does a price-dependent
// partial return, and on index.post.ts (entry) for the money handling: the
// price is resolved server-side, and the wallet is credited inside a single DB
// transaction. Nothing about the payout is taken from the request body.

import { models, sequelize } from "@b/db";
import { literal } from "sequelize";
import { createError } from "@b/utils/error";
import ExchangeManager from "@b/utils/exchange";
import { handleBanStatus, loadBanStatus } from "@b/api/exchange/utils";
import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import { orderIntervals, fetchOtcCurrentPrice } from "../../index.post";
import { writeAuditLog, captureException } from "../../util/audit";

/* The policy, with env overrides. The defaults match the figures the terminal
   has always shown so a trader sees the same numbers it quoted them:
   a 10% fee on winnings that decays to nothing as expiry approaches, a 30s
   minimum hold, and a 10s dead zone before expiry. */
const EARLY_CLOSE_FEE_PERCENT = parseFloat(
  process.env.BINARY_EARLY_CLOSE_FEE_PERCENT || "10"
);
const MIN_SECONDS_AFTER_ENTRY = parseInt(
  process.env.BINARY_EARLY_CLOSE_MIN_SECONDS || "30",
  10
);
const MIN_SECONDS_BEFORE_EXPIRY = parseInt(
  process.env.BINARY_EARLY_CLOSE_EXPIRY_GUARD_SECONDS || "10",
  10
);

const BULLISH = new Set(["RISE", "HIGHER", "TOUCH", "CALL", "UP"]);

export const metadata: OperationObject = {
  summary: "Close Binary Order Early",
  operationId: "closeBinaryOrderEarly",
  tags: ["Binary", "Orders"],
  description:
    "Closes a pending binary order before expiry at the current market price, returning the stake plus any winnings less an early-close fee.",
  parameters: [
    {
      name: "id",
      in: "path",
      description: "ID of the binary order to close early.",
      required: true,
      schema: { type: "string" },
    },
  ],
  requestBody: {
    description:
      "Optional. No field here affects the payout — the price is resolved server-side.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            isDemo: { type: "boolean" },
          },
        },
      },
    },
    required: false,
  },
  responses: {
    200: {
      description: "Binary order closed early",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string" },
              cashoutAmount: { type: "number" },
              penalty: { type: "number" },
              profit: { type: "number" },
              closePrice: { type: "number" },
              status: { type: "string" },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Binary Order"),
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user, params } = data;
  const { id } = params;

  if (!user?.id) throw createError(401, "Unauthorized");

  // Scoped to the caller. Looking up by id alone would let anyone close another
  // user's position by guessing an id, and the payout would land in their wallet.
  const order = await models.binaryOrder.findOne({
    where: { id, userId: user.id },
  });

  if (!order) throw createError(404, "Order not found");
  if (order.status !== "PENDING")
    throw createError(400, "Order is no longer open");

  const now = Date.now();
  const createdAt = new Date(order.createdAt as any).getTime();
  const expiryAt = new Date(order.closedAt as any).getTime();

  const heldFor = now - createdAt;
  if (heldFor < MIN_SECONDS_AFTER_ENTRY * 1000) {
    const wait = Math.ceil((MIN_SECONDS_AFTER_ENTRY * 1000 - heldFor) / 1000);
    throw createError(400, `Please wait ${wait}s before closing this position`);
  }

  const untilExpiry = expiryAt - now;
  if (untilExpiry < MIN_SECONDS_BEFORE_EXPIRY * 1000) {
    throw createError(400, "Too close to expiry to close early");
  }

  const isDemo = Boolean(order.isDemo);

  try {
    const unblockTime = await loadBanStatus();
    if (await handleBanStatus(unblockTime)) {
      throw createError(
        503,
        "Service temporarily unavailable. Please try again later."
      );
    }

    /* The close price is resolved here, never accepted from the client. The
       terminal used to send its own currentPrice, which is both spoofable — a
       PUT closes as a winner at any price below entry, and 0 is below every
       entry — and frequently 0 in good faith, because the panel reads the
       chart's price and the chart may be showing a different instrument than
       the position. */
    let closePrice = 0;
    if (String(order.symbol).toUpperCase().includes("OTC")) {
      closePrice = await fetchOtcCurrentPrice(order.symbol);
    } else {
      const exchange = await ExchangeManager.startExchange();
      if (!exchange) {
        throw createError(
          503,
          "Service temporarily unavailable. Please try again later."
        );
      }
      const ticker = await exchange.fetchTicker(order.symbol);
      closePrice = Number(ticker?.last) || 0;
    }

    if (!(closePrice > 0)) {
      throw createError(503, "No live price for this market right now");
    }

    const entryPrice = Number(order.price);
    const stake = Number(order.amount);
    const profitPercentage = Number(order.profitPercentage) || 87;

    const isWinning = BULLISH.has(String(order.side))
      ? closePrice > entryPrice
      : closePrice < entryPrice;

    /* The fee decays with time held, so closing seconds after entry costs the
       full percentage and closing near expiry costs almost nothing. It applies
       to winnings only — there are no winnings to charge against on a loser. */
    const totalDuration = Math.max(1, expiryAt - createdAt);
    const progress = Math.min(1, heldFor / totalDuration);

    let netProfit: number;
    let penalty = 0;
    if (isWinning) {
      const grossProfit = (stake * profitPercentage) / 100;
      penalty = (grossProfit * (EARLY_CLOSE_FEE_PERCENT * (1 - progress))) / 100;
      netProfit = grossProfit - penalty;
    } else {
      // Closing a losing position surrenders the stake, as letting it expire
      // would. Early close is an exit, not an insurance policy.
      netProfit = -stake;
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    netProfit = round(netProfit);
    penalty = round(penalty);

    // What lands back in the wallet: the stake plus net winnings on a winner,
    // nothing on a loser (the stake was already debited at entry).
    const cashoutAmount = isWinning ? round(stake + netProfit) : 0;

    /* WIN/LOSS rather than a dedicated status: the column is an enum of
       PENDING/WIN/LOSS/DRAW/CANCELED/ERROR, and adding a value needs a
       migration. It also keeps the demo balance correct for free — that figure
       is derived from these rows (WIN adds `profit`, LOSS subtracts `amount`),
       so an early close settles through the same arithmetic as an expiry. */
    const finalStatus = isWinning ? "WIN" : "LOSS";

    const dbTx = await sequelize.transaction();
    try {
      /* Conditional on still being PENDING, at the database. Settlement runs
         from timers and a sweeper, so an order can expire between the check
         above and this write; without the guard a position could pay out twice
         — once here and once at expiry. Zero rows affected means someone else
         settled it first, and we defer to them. */
      const [affected] = await models.binaryOrder.update(
        {
          status: finalStatus,
          closePrice,
          profit: isWinning ? netProfit : 0,
          closedAt: new Date(),
        } as any,
        { where: { id: order.id, status: "PENDING" }, transaction: dbTx }
      );

      if (affected === 0) {
        await dbTx.rollback();
        throw createError(409, "This position has already been settled");
      }

      if (!isDemo && cashoutAmount > 0) {
        const transaction = await models.transaction.findOne({
          where: { referenceId: order.id },
          transaction: dbTx,
        });
        const wallet = transaction
          ? await models.wallet.findOne({
              where: { id: transaction.walletId },
              transaction: dbTx,
            })
          : null;

        if (!wallet) {
          await dbTx.rollback();
          throw createError(404, "Wallet not found");
        }

        // Atomic increment, matching entry. A read-modify-write here would race
        // with settlement and with the user's other positions closing.
        await models.wallet.update(
          { balance: literal(`balance + ${cashoutAmount}`) } as any,
          { where: { id: wallet.id }, transaction: dbTx }
        );

        if (transaction) {
          await models.transaction.update(
            {
              status: "COMPLETED",
              description: `Binary Position closed early | Market: ${order.symbol} | Stake: ${stake} USDT | Close: ${closePrice} | Fee: ${penalty} USDT | Returned: ${cashoutAmount} USDT`,
            } as any,
            { where: { id: transaction.id }, transaction: dbTx }
          );
        }

        writeAuditLog({
          action: "BINARY_ORDER_CLOSED_EARLY",
          userId: user.id,
          walletId: wallet.id,
          orderId: order.id,
          amount: cashoutAmount,
          price: closePrice,
          side: String(order.side),
          detail: `stake=${stake} fee=${penalty} profit=${netProfit} status=${finalStatus}`,
        });
      } else {
        writeAuditLog({
          action: "BINARY_ORDER_CLOSED_EARLY",
          userId: user.id,
          orderId: order.id,
          amount: cashoutAmount,
          price: closePrice,
          side: String(order.side),
          detail: `demo=${isDemo} stake=${stake} fee=${penalty} profit=${netProfit} status=${finalStatus}`,
        });
      }

      await dbTx.commit();
    } catch (err) {
      // rollback() throws if the transaction already finished, which it has on
      // every path above that rolls back before rethrowing.
      await dbTx.rollback().catch(() => {});
      throw err;
    }

    // Stop the settlement timer; the order is no longer PENDING.
    if (orderIntervals.has(id)) {
      clearTimeout(orderIntervals.get(id));
      orderIntervals.delete(id);
    }

    return {
      message: "Position closed",
      cashoutAmount,
      penalty,
      profit: netProfit,
      closePrice,
      status: finalStatus,
    };
  } catch (error: any) {
    // Deliberate refusals (wait 30s, too close to expiry, already settled, no
    // price) carry their own status and message and must reach the trader
    // intact — collapsing them into a 500 is what made every failure read as
    // the same unexplained "Cash Out Failed".
    if (error?.statusCode) throw error;
    captureException(error, { path: "binary.order.closeEarly", orderId: id });
    console.error("Error closing binary order early:", error);
    throw createError(500, "An error occurred while closing the position");
  }
};
