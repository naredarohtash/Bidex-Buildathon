/**
 * Binary Options Settlement Engine — owned, readable replacement for
 * BinaryOrderService.js (1,637 lines of partially-obfuscated vendor code).
 *
 * This file decides win/loss/draw for every binary options order and moves
 * user balances accordingly. It is the single most money-sensitive file in
 * the platform.
 *
 * Mapping source: backend/dist/src/api/exchange/binary/order/util/BinaryOrderService.js
 * Model:          backend/models/exchange/binaryOrder.ts
 *
 * Dependencies are injected so this module is testable without a database.
 */

// ─── Type config (maps order type → valid sides + required fields) ──────────

export const TYPE_CONFIG = {
  RISE_FALL:     { validSides: ["RISE", "FALL"] },
  HIGHER_LOWER:  { validSides: ["HIGHER", "LOWER"], requiresBarrier: true },
  TOUCH_NO_TOUCH:{ validSides: ["TOUCH", "NO_TOUCH"], requiresBarrier: true },
  CALL_PUT:      { validSides: ["CALL", "PUT"], requiresStrikePrice: true, requiresPayoutPerPoint: true },
  TURBO:         { validSides: ["UP", "DOWN"], requiresBarrier: true, requiresPayoutPerPoint: true, requiresDurationType: ["TIME", "TICKS"] },
};

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const DEFAULT_PROFIT_PERCENTAGE = 85;

// ─── Pure determination functions (no I/O, fully testable) ──────────────────

/**
 * Walk the sorted duration-based profit adjustments from the binary settings
 * and accumulate a total adjustment for the given duration and order type.
 *
 * settings.profitAdjustments = [
 *   { minDuration: 1,  maxDuration: 5,   adjustment: -5,  orderTypes: ["RISE_FALL"] },
 *   { minDuration: 5,  maxDuration: 15,  adjustment: 0,   orderTypes: ["RISE_FALL"] },
 *   ...
 * ]
 */
export function calculateCumulativeProfitAdjustment(settings, durationMinutes, orderType) {
  if (!settings?.profitAdjustments?.length) return 0;

  const sorted = [...settings.profitAdjustments].sort(
    (a, b) => (a.minDuration || 0) - (b.minDuration || 0)
  );

  let total = 0;
  for (const adj of sorted) {
    if (adj.minDuration > durationMinutes) break;
    if (!adj.orderTypes || adj.orderTypes.includes(orderType)) {
      total += adj.adjustment || 0;
    }
  }
  return total;
}

/**
 * RISE_FALL / basic directionality.
 * UP sides (RISE, CALL, HIGHER, UP): closePrice > entryPrice → WIN
 * DOWN sides (FALL, PUT, LOWER, DOWN): closePrice < entryPrice → WIN
 * Equal → DRAW.  Profit = amount * (profitPercentage / 100).
 */
export function determineRiseFallStatus(order, closePrice) {
  const result = { status: "PENDING", profit: 0 };
  const entry = order.price;
  const upSides = ["RISE", "CALL", "HIGHER", "UP"];
  const isUp = upSides.includes(order.side);

  if ((isUp && closePrice > entry) || (!isUp && closePrice < entry)) {
    result.status = "WIN";
    result.profit = order.amount * ((order.profitPercentage || DEFAULT_PROFIT_PERCENTAGE) / 100);
  } else if (closePrice === entry) {
    result.status = "DRAW";
    result.profit = 0;
  } else {
    result.status = "LOSS";
    result.profit = 0;
  }
  return result;
}

/**
 * HIGHER_LOWER — same logic as RISE_FALL but uses barrier (or price) as
 * the reference instead of entry price.
 */
export function determineHigherLowerStatus(order, closePrice) {
  const result = { status: "PENDING", profit: 0 };
  const ref = order.barrier || order.price;
  const isHigher = order.side === "HIGHER";

  if ((isHigher && closePrice > ref) || (!isHigher && closePrice < ref)) {
    result.status = "WIN";
    result.profit = order.amount * ((order.profitPercentage || DEFAULT_PROFIT_PERCENTAGE) / 100);
  } else if (closePrice === ref) {
    result.status = "DRAW";
    result.profit = 0;
  } else {
    result.status = "LOSS";
    result.profit = 0;
  }
  return result;
}

/**
 * TOUCH_NO_TOUCH — barrier-touch based.
 * TOUCH side:    barrier was touched during lifetime → WIN
 * NO_TOUCH side: barrier was NOT touched → WIN
 */
export function determineTouchNoTouchStatus(order, barrierTouched) {
  const result = { status: "PENDING", profit: 0 };
  const isTouchSide = order.side === "TOUCH";

  if ((isTouchSide && barrierTouched) || (!isTouchSide && !barrierTouched)) {
    result.status = "WIN";
    result.profit = order.amount * ((order.profitPercentage || DEFAULT_PROFIT_PERCENTAGE) / 100);
  } else {
    result.status = "LOSS";
    result.profit = 0;
  }
  return result;
}

/**
 * CALL_PUT — uses strikePrice (or barrier, or price) as reference.
 * Same directionality as RISE_FALL.
 */
export function determineCallPutStatus(order, closePrice) {
  const result = { status: "PENDING", profit: 0 };
  const ref = order.strikePrice || order.barrier || order.price;
  const isCall = order.side === "CALL";

  if ((isCall && closePrice > ref) || (!isCall && closePrice < ref)) {
    result.status = "WIN";
    result.profit = order.amount * ((order.profitPercentage || DEFAULT_PROFIT_PERCENTAGE) / 100);
  } else if (closePrice === ref) {
    result.status = "DRAW";
    result.profit = 0;
  } else {
    result.status = "LOSS";
    result.profit = 0;
  }
  return result;
}

/**
 * TURBO — payout-per-point calculation. Can produce negative profit.
 * Barrier breach during lifetime → instant LOSS.
 * profit = (closePrice - barrier) * payoutPerPoint  [for UP side]
 * profit = (barrier - closePrice) * payoutPerPoint  [for DOWN side]
 * Net = profit - amount  (can be negative = partial loss)
 */
export function determineTurboStatus(order, closePrice, barrierBreached) {
  const result = { status: "PENDING", profit: 0 };

  if (barrierBreached) {
    result.status = "LOSS";
    result.profit = -order.amount;
    return result;
  }

  const barrier = order.barrier || order.price;
  const ppp = order.payoutPerPoint || 1;
  const isUp = order.side === "UP";

  const rawProfit = isUp
    ? (closePrice - barrier) * ppp
    : (barrier - closePrice) * ppp;

  const netProfit = rawProfit - order.amount;

  if (netProfit > 0) {
    result.status = "WIN";
    result.profit = netProfit;
  } else if (netProfit === 0) {
    result.status = "DRAW";
    result.profit = 0;
  } else {
    result.status = "LOSS";
    result.profit = netProfit; // negative — partial loss
  }
  return result;
}

/**
 * Dispatcher: routes to the correct type-specific determination function.
 */
export function determineOrderStatus(order, closePrice, barrierTouched, turboBreached) {
  switch (order.type) {
    case "RISE_FALL":       return determineRiseFallStatus(order, closePrice);
    case "HIGHER_LOWER":    return determineHigherLowerStatus(order, closePrice);
    case "TOUCH_NO_TOUCH":  return determineTouchNoTouchStatus(order, barrierTouched);
    case "CALL_PUT":        return determineCallPutStatus(order, closePrice);
    case "TURBO":           return determineTurboStatus(order, closePrice, turboBreached);
    default:
      return { status: "ERROR", profit: 0 };
  }
}

/**
 * Compute the wallet credit amount and operation type for a settled order.
 *   WIN:  amount + profit → "BINARY_ORDER_WIN"
 *   LOSS: if profit !== 0 (turbo partial loss), amount + profit if > 0 → "BINARY_ORDER_LOSS"
 *   DRAW: amount (refund) → "REFUND"
 * Returns { payoutAmount, operationType } where payoutAmount <= 0 means no credit.
 */
export function computePayout(order) {
  let payoutAmount = 0;
  let operationType = "REFUND";

  if (order.status === "WIN") {
    payoutAmount = order.amount + order.profit;
    operationType = "BINARY_ORDER_WIN";
  } else if (order.status === "LOSS") {
    if (order.profit !== 0) {
      payoutAmount = order.amount + order.profit;
      if (payoutAmount > 0) {
        operationType = "BINARY_ORDER_LOSS";
      }
    }
  } else if (order.status === "DRAW") {
    payoutAmount = order.amount;
    operationType = "REFUND";
  }

  return { payoutAmount, operationType };
}

// ─── Validation (mirrors vendor validateCreateOrderInput) ───────────────────

function validateIsPositiveNumber(value, fieldName, errors) {
  if (value == null || typeof value !== "number" || value <= 0 || !isFinite(value)) {
    errors.push(`${fieldName} is required and must be a positive number`);
    return false;
  }
  return true;
}

function validateNumberInRange(value, min, max, fieldName, errors) {
  if (value == null || typeof value !== "number" || value < min || value > max) {
    errors.push(`${fieldName} must be between ${min} and ${max}`);
    return false;
  }
  return true;
}

function validateAllowedValues(value, allowed, fieldName, errors) {
  if (!allowed.includes(value)) {
    errors.push(`${fieldName} must be one of: ${allowed.join(", ")}`);
    return false;
  }
  return true;
}

export function validateCreateOrderInput({ type, side, amount, barrier, strikePrice, payoutPerPoint, durationType }) {
  const errors = [];
  const cfg = TYPE_CONFIG[type];
  if (!cfg) { errors.push("Invalid order type"); return errors; }

  if (!cfg.validSides.includes(side)) {
    errors.push(`Invalid side '${side}' for order type '${type}'`);
  }
  validateIsPositiveNumber(amount, "amount", errors);

  if (cfg.requiresBarrier) validateIsPositiveNumber(barrier, "barrier", errors);
  if (cfg.requiresStrikePrice) validateIsPositiveNumber(strikePrice, "strikePrice", errors);
  if (cfg.requiresPayoutPerPoint) validateIsPositiveNumber(payoutPerPoint, "payoutPerPoint", errors);
  if (cfg.requiresDurationType) {
    if (durationType) {
      validateAllowedValues(durationType, cfg.requiresDurationType, "durationType", errors);
    } else {
      errors.push("durationType is required");
    }
  }
  return errors;
}

// ─── Cancellation penalty (mirrors vendor cancelOrder logic) ────────────────

/**
 * Compute the cancellation penalty percentage based on how much time is left
 * before order expiry, using the binary settings thresholds.
 *
 * settings.cancelation = {
 *   enabled: true,
 *   minTimeBeforeExpiry: 30,  // seconds
 *   penaltyTiers: { above60s: 5, above30s: 10, below30s: 20 }
 * }
 */
export function computeCancelPenalty(settings, secondsBeforeExpiry) {
  const cancel = settings?.cancelation;
  if (!cancel?.enabled) return null; // cancellation disabled
  if (secondsBeforeExpiry < (cancel.minTimeBeforeExpiry || 30)) return null; // too close to expiry

  const tiers = cancel.penaltyTiers || {};
  if (secondsBeforeExpiry > 60) return tiers.above60s || 0;
  if (secondsBeforeExpiry > 30) return tiers.above30s || 0;
  return tiers.below30s || 0;
}

// ─── Barrier checking (scans OHLCV candles for price crossing) ──────────────

/**
 * Check if the barrier was touched during the order's lifetime by scanning
 * OHLCV candles. The barrier is "touched" if any candle's high >= barrier
 * (for TOUCH side) or low <= barrier (for NO_TOUCH side looking down).
 * Generic: checks both directions — any candle containing the barrier.
 */
export function checkBarrierTouched(candles, barrier) {
  if (!candles?.length || barrier == null) return false;
  for (const c of candles) {
    const [, , high, low] = c; // [timestamp, open, high, low, close, volume]
    if (high >= barrier && low <= barrier) return true;
  }
  return false;
}

/**
 * TURBO-specific: barrier is breached when price crosses it.
 * UP side: breached if any candle low <= barrier
 * DOWN side: breached if any candle high >= barrier
 */
export function checkTurboBarrierBreach(candles, barrier, side) {
  if (!candles?.length || barrier == null) return false;
  for (const c of candles) {
    const [, , high, low] = c;
    if (side === "UP" && low <= barrier) return true;
    if (side === "DOWN" && high >= barrier) return true;
  }
  return false;
}

// ─── The Settlement Service (stateful, needs injected deps) ─────────────────

/**
 * @param {object} deps
 * @param {object} deps.models          Sequelize models { binaryOrder, wallet, transaction, user, binaryMarket }
 * @param {object} deps.sequelize       Sequelize instance (for transactions, Op, literal)
 * @param {object} deps.walletService   { debit(), credit() }
 * @param {object} deps.messageBroker   { broadcastToSubscribedClients() }
 * @param {Function} deps.sendBinaryOrderEmail  async (user, order) => void
 * @param {Function} deps.createNotification    async (opts) => void
 * @param {Function} deps.createError           ({ statusCode, message }) => Error
 * @param {object} deps.logger          { info, warn, error }(tag, msg, ...args)
 * @param {Function} deps.getSettings   async () => settings (binary settings cache)
 * @param {Function} deps.fetchClosePrice  async (symbol, closedAt) => number | null
 * @param {Function} deps.fetchOHLCV       async (symbol, since, until) => candle[]
 * @param {Function} [deps.acquireLock]    async (key, ttl, fn) => result (Redlock)
 */
export function createSettlementService(deps) {
  const {
    models, sequelize, walletService, messageBroker,
    sendBinaryOrderEmail, createNotification, createError,
    logger, getSettings, fetchClosePrice, fetchOHLCV, acquireLock,
  } = deps;

  const Op = sequelize.constructor?.Op || sequelize.Sequelize?.Op || sequelize.Op || { lte: Symbol("lte"), and: Symbol("and") };
  const orderIntervals = new Map();
  const userQueues = new Map();

  function enqueue(userId, fn) {
    if (!userQueues.has(userId)) userQueues.set(userId, Promise.resolve());
    const chain = userQueues.get(userId).then(fn).catch((e) => {
      logger.error("BINARY", `User queue error for ${userId}: ${e.message}`);
    });
    userQueues.set(userId, chain);
    return chain;
  }

  // ── Order processing (settlement) ──────────────────────────────────────

  async function executeOrderProcessing(orderId, symbol) {
    const lockKey = `binary:order:${orderId}`;
    const doProcess = async () => {
      await sequelize.transaction(async (t) => {
        const order = await models.binaryOrder.findOne({
          where: { id: orderId, status: "PENDING" },
          transaction: t,
          lock: t.LOCK?.UPDATE,
        });
        if (!order) return;

        const closePrice = await fetchClosePrice(symbol, order.closedAt);
        if (closePrice == null) {
          logger.error("BINARY", `Could not fetch close price for order ${orderId}, symbol ${symbol}`);
          await models.binaryOrder.update({ status: "ERROR" }, { where: { id: orderId }, transaction: t });
          return;
        }

        let barrierTouched = false;
        let turboBreached = false;

        if (order.type === "TOUCH_NO_TOUCH" && order.barrier != null) {
          const candles = await fetchOHLCV(symbol, order.createdAt, order.closedAt);
          barrierTouched = checkBarrierTouched(candles, order.barrier);
        }

        if (order.type === "TURBO" && order.barrier != null) {
          const candles = await fetchOHLCV(symbol, order.createdAt, order.closedAt);
          turboBreached = checkTurboBarrierBreach(candles, order.barrier, order.side);
        }

        const result = determineOrderStatus(order, closePrice, barrierTouched, turboBreached);

        await updateBinaryOrderWithTransaction(orderId, {
          status: result.status,
          profit: result.profit,
          closePrice,
        }, t);
      });

      orderIntervals.delete(orderId);
    };

    if (acquireLock) {
      await acquireLock(lockKey, 30000, doProcess);
    } else {
      await doProcess();
    }
  }

  function processOrder(userId, orderId, symbol) {
    return enqueue(userId, () => executeOrderProcessing(orderId, symbol));
  }

  // ── Update order + wallet credit (the money movement) ──────────────────

  async function updateBinaryOrderWithTransaction(orderId, updates, transaction) {
    const t = transaction;
    const prevOrder = await models.binaryOrder.findOne({ where: { id: orderId }, transaction: t });
    if (!prevOrder) return;

    const prevStatus = prevOrder.status;

    await models.binaryOrder.update(updates, { where: { id: orderId }, transaction: t });
    const order = await models.binaryOrder.findOne({ where: { id: orderId }, transaction: t });

    logger.info("BINARY", `Order ${orderId}: ${prevStatus} → ${order.status} (profit=${order.profit}, close=${order.closePrice})`);

    /* Demo trades skip the money side but NOT the completion broadcast.
       This used to be `if (order.isDemo) return;`, which returned before the
       ORDER_COMPLETED broadcast below — so a demo trade settled silently and
       the terminal showed no result and fired no toast until the next refresh.
       The vendor guards only the wallet block (`!o.isDemo && settled`) and
       broadcasts completion for demo and real alike. */
    const isSettled = ["WIN", "LOSS", "DRAW"].includes(order.status);

    if (!order.isDemo && isSettled) {
      // Find the wallet — preferably via the original debit transaction, fallback to USDT SPOT
      let wallet = null;
      let debitTx = await models.transaction.findOne({
        where: { referenceId: orderId },
        transaction: t,
      });

      if (!debitTx) {
        debitTx = await models.transaction.findOne({
          where: {
            userId: order.userId,
            type: "BINARY",
            status: "COMPLETED",
            amount: order.amount,
            [Op.and]: sequelize.literal(`JSON_EXTRACT(metadata, '$.orderId') = '${orderId}'`),
          },
          transaction: t,
        });
      }

      if (debitTx) {
        await models.transaction.update({ status: "COMPLETED" }, { where: { id: debitTx.id }, transaction: t });
        wallet = await models.wallet.findOne({
          where: { id: debitTx.walletId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      } else {
        logger.warn("BINARY", `Transaction not found for completed order ${orderId}. Looking up wallet directly.`);
        wallet = await models.wallet.findOne({
          where: { userId: order.userId, currency: "USDT", type: "SPOT" },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      }

      if (!wallet) {
        throw createError({ statusCode: 404, message: "Wallet not found to update balance" });
      }

      const { payoutAmount, operationType } = computePayout(order);

      if (payoutAmount > 0) {
        const idempotencyKey = `binary_finalize_${orderId}_${order.status}`;
        logger.info("BINARY", `Crediting wallet for order ${orderId}: amount=${order.amount}, profit=${order.profit}, payout=${payoutAmount}, status=${order.status}`);
        try {
          await walletService.credit({
            idempotencyKey,
            userId: order.userId,
            walletId: wallet.id,
            walletType: "SPOT",
            currency: wallet.currency,
            amount: payoutAmount,
            operationType,
            referenceId: `${orderId}_payout`,
            description: `Binary order ${order.status}: ${order.symbol}`,
            metadata: { orderId, orderStatus: order.status, originalAmount: order.amount, profit: order.profit },
            transaction: t,
          });
          logger.info("BINARY", `Successfully credited ${payoutAmount} ${wallet.currency} for order ${orderId}`);
        } catch (err) {
          logger.error("BINARY", `Failed to credit wallet for order ${orderId}: ${err.message}`, err);
          throw err;
        }
      } else {
        logger.info("BINARY", `No payout for order ${orderId}: status=${order.status}, amount=${order.amount}, profit=${order.profit}`);
      }

      // Broadcast updated balance
      const updatedWallet = await models.wallet.findOne({ where: { id: wallet.id }, transaction: t });
      await messageBroker.broadcastToSubscribedClients(
        "/api/finance/wallet",
        { type: "wallet", userId: order.userId, currency: wallet.currency },
        { type: "BALANCE_UPDATED", currency: wallet.currency, balance: updatedWallet?.balance || wallet.balance, timestamp: Date.now() },
      );
    }

    // Broadcast order completion + send email/notification (demo included)
    if (isSettled) {
      await messageBroker.broadcastToSubscribedClients(
        "/api/exchange/binary/order",
        { type: "order", symbol: order.symbol, userId: order.userId },
        { type: "ORDER_COMPLETED", order },
      );

      const user = await models.user.findOne({ where: { id: order.userId }, transaction: t });
      if (user) {
        try {
          sendBinaryOrderEmail(user, order).catch((err) =>
            logger.error("BINARY", `Error sending binary order email asynchronously: ${err.message}`)
          );
          await createNotification({
            userId: user.id,
            relatedId: order.id,
            title: "Binary Order Completed",
            message: `Your binary order for ${order.symbol} has been completed with a status of ${order.status}`,
            type: "system",
            link: `/binary?symbol=${encodeURIComponent(order.symbol)}`,
            actions: [{ label: "View Trade", link: `/binary?symbol=${encodeURIComponent(order.symbol)}`, primary: true }],
          });
        } catch (err) {
          logger.error("BINARY", `Error sending binary order email for user ${user.id}, order ${order.id}: ${err}`);
        }
      }
    }
  }

  async function updateBinaryOrder(orderId, updates) {
    const order = await models.binaryOrder.findOne({ where: { id: orderId } });
    if (!order) {
      logger.warn("BINARY", `Order ${orderId} not found in updateBinaryOrder. Skipping queue.`);
      return;
    }
    return enqueue(order.userId, async () => {
      await sequelize.transaction(async (t) => {
        await updateBinaryOrderWithTransaction(orderId, updates, t);
      });
    });
  }

  // ── Scheduling (setTimeout per order) ──────────────────────────────────

  function scheduleOrderProcessing(order, userId) {
    const now = Date.now();
    let offset = global.otcTimeOffset || 0;
    if (order.symbol.toUpperCase().includes("OTC") && offset === 0) offset = 2645000;
    const adjustedNow = now + (order.symbol.toUpperCase().includes("OTC") ? offset : 0);
    const delay = order.closedAt.getTime() - adjustedNow;

    if (delay < 0) {
      logger.warn("BINARY", `Order ${order.id} closedAt is in the past. Processing immediately.`);
      processOrder(userId, order.id, order.symbol);
      return;
    }

    const timer = setTimeout(() => {
      processOrder(userId, order.id, order.symbol);
    }, delay);
    orderIntervals.set(order.id, timer);
  }

  // ── Init: reschedule all pending orders on startup ─────────────────────

  async function initializePendingOrders() {
    try {
      const pending = await models.binaryOrder.findAll({ where: { status: "PENDING" } });
      const now = Date.now();
      let processed = 0, scheduled = 0;

      for (const order of pending) {
        let offset = global.otcTimeOffset || 0;
        if (order.symbol.toUpperCase().includes("OTC") && offset === 0) offset = 2645000;
        const adjustedNow = now + (order.symbol.toUpperCase().includes("OTC") ? offset : 0);

        if (new Date(order.closedAt).getTime() <= adjustedNow) {
          await processOrder(order.userId, order.id, order.symbol);
          processed++;
        } else {
          scheduleOrderProcessing(order, order.userId);
          scheduled++;
        }
      }
      logger.info("BINARY", `Initialized pending orders: ${processed} processed immediately, ${scheduled} rescheduled`);
    } catch (err) {
      logger.error("BINARY", `Failed to initialize pending orders: ${err.message}`);
    }
  }

  // ── Cron: batch-process all expired PENDING orders ─────────────────────

  async function processPendingOrders(broadcast = true) {
    const now = new Date();
    let offset = global.otcTimeOffset || 0;

    const pending = await models.binaryOrder.findAll({
      where: {
        status: "PENDING",
        closedAt: { [Op.lte]: now },
      },
      order: [["closedAt", "ASC"]],
    });

    if (!pending.length) return;
    logger.info("BINARY", `Processing ${pending.length} expired pending orders`);

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (order) => {
        const lockKey = `binary:order:${order.id}`;
        const doSettle = async () => {
          const fresh = await models.binaryOrder.findOne({ where: { id: order.id } });
          if (!fresh || fresh.status !== "PENDING") return;

          const closePrice = await fetchClosePrice(fresh.symbol, fresh.closedAt);
          if (closePrice == null) {
            logger.error("BINARY", `Could not fetch close price for order ${order.id}`);
            await models.binaryOrder.update(
              { status: "ERROR" },
              { where: { id: order.id } }
            );
            return;
          }

          let barrierTouched = false;
          let turboBreached = false;

          if (fresh.type === "TOUCH_NO_TOUCH" && fresh.barrier != null) {
            const candles = await fetchOHLCV(fresh.symbol, fresh.createdAt, fresh.closedAt);
            barrierTouched = checkBarrierTouched(candles, fresh.barrier);
          }
          if (fresh.type === "TURBO" && fresh.barrier != null) {
            const candles = await fetchOHLCV(fresh.symbol, fresh.createdAt, fresh.closedAt);
            turboBreached = checkTurboBarrierBreach(candles, fresh.barrier, fresh.side);
          }

          const result = determineOrderStatus(fresh, closePrice, barrierTouched, turboBreached);

          await sequelize.transaction(async (t) => {
            await updateBinaryOrderWithTransaction(order.id, {
              status: result.status,
              profit: result.profit,
              closePrice,
            }, t);
          });
        };

        try {
          if (acquireLock) {
            await acquireLock(lockKey, 30000, doSettle);
          } else {
            await doSettle();
          }
        } catch (err) {
          logger.error("BINARY", `Failed to process order ${order.id}: ${err.message}`);
        }
      }));

      if (i + BATCH_SIZE < pending.length) {
        await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }
    }
  }

  // ── Cancellation ───────────────────────────────────────────────────────

  async function cancelOrder(orderId, userId) {
    const order = await models.binaryOrder.findOne({
      where: { id: orderId, userId, status: "PENDING" },
    });
    if (!order) {
      throw createError({ statusCode: 404, message: "Order not found or not cancellable" });
    }

    const settings = await getSettings();
    const cancelConfig = settings?.cancelation;
    if (!cancelConfig?.enabled) {
      throw createError({ statusCode: 400, message: "Cancellation is disabled" });
    }

    const now = Date.now();
    let offset = global.otcTimeOffset || 0;
    if (order.symbol.toUpperCase().includes("OTC") && offset === 0) offset = 2645000;
    const adjustedNow = now + (order.symbol.toUpperCase().includes("OTC") ? offset : 0);
    const secondsLeft = (order.closedAt.getTime() - adjustedNow) / 1000;

    if (secondsLeft < (cancelConfig.minTimeBeforeExpiry || 30)) {
      throw createError({ statusCode: 400, message: "Too close to expiry to cancel" });
    }

    // For barrier types, check if barrier was already touched (can't cancel)
    if (["TOUCH_NO_TOUCH", "TURBO"].includes(order.type) && order.barrier != null) {
      const candles = await fetchOHLCV(order.symbol, order.createdAt, new Date(adjustedNow));
      if (order.type === "TOUCH_NO_TOUCH") {
        if (checkBarrierTouched(candles, order.barrier) && order.side === "TOUCH") {
          throw createError({ statusCode: 400, message: "Barrier already touched — cannot cancel" });
        }
      }
      if (order.type === "TURBO") {
        if (checkTurboBarrierBreach(candles, order.barrier, order.side)) {
          throw createError({ statusCode: 400, message: "Barrier already breached — cannot cancel" });
        }
      }
    }

    const penaltyPct = computeCancelPenalty(settings, secondsLeft);
    if (penaltyPct == null) {
      throw createError({ statusCode: 400, message: "Cancellation not allowed at this time" });
    }

    return enqueue(userId, async () => {
      await processStandardCancel(order, penaltyPct);
    });
  }

  async function processStandardCancel(order, penaltyPct) {
    await sequelize.transaction(async (t) => {
      const penaltyAmount = order.amount * (penaltyPct / 100);
      const refundAmount = order.amount - penaltyAmount;

      await models.binaryOrder.update(
        { status: "CANCELED", profit: -penaltyAmount },
        { where: { id: order.id }, transaction: t }
      );

      // Clear the scheduled timer
      const timer = orderIntervals.get(order.id);
      if (timer) { clearTimeout(timer); orderIntervals.delete(order.id); }

      if (refundAmount > 0 && !order.isDemo) {
        // Find wallet via debit transaction or fallback to USDT SPOT
        let wallet = null;
        let debitTx = await models.transaction.findOne({
          where: { referenceId: order.id },
          transaction: t,
        });

        if (!debitTx) {
          debitTx = await models.transaction.findOne({
            where: {
              userId: order.userId,
              type: "BINARY",
              amount: order.amount,
              [Op.and]: sequelize.literal(`JSON_EXTRACT(metadata, '$.orderId') = '${order.id}'`),
            },
            transaction: t,
          });
        }

        if (debitTx) {
          await models.transaction.update({ status: "COMPLETED" }, { where: { id: debitTx.id }, transaction: t });
          wallet = await models.wallet.findOne({ where: { id: debitTx.walletId }, transaction: t, lock: t.LOCK.UPDATE });
        } else {
          wallet = await models.wallet.findOne({
            where: { userId: order.userId, currency: "USDT", type: "SPOT" },
            transaction: t, lock: t.LOCK.UPDATE,
          });
        }

        if (wallet) {
          await walletService.credit({
            idempotencyKey: `binary_cancel_${order.id}`,
            userId: order.userId,
            walletId: wallet.id,
            walletType: "SPOT",
            currency: wallet.currency,
            amount: refundAmount,
            operationType: "REFUND",
            referenceId: `${order.id}_cancel`,
            description: `Binary order CANCELED: ${order.symbol} (penalty ${penaltyPct}%)`,
            metadata: { orderId: order.id, penaltyPct, penaltyAmount, refundAmount },
            transaction: t,
          });
        }
      }
    });
  }

  return {
    processOrder,
    processPendingOrders,
    cancelOrder,
    updateBinaryOrder,
    scheduleOrderProcessing,
    initializePendingOrders,
    orderIntervals,
  };
}
