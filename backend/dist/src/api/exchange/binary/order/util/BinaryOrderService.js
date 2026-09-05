"use strict";
function calculateCumulativeProfitAdjustment(e, r, t) {
  var a, o;
  const i = [...e.durations].sort((e, r) => e.minutes - r.minutes);
  let s = 0;
  for (const e of i) {
    const i =
      (null ===
        (o =
          null === (a = e.orderTypeOverrides) || void 0 === a
            ? void 0
            : a[t]) || void 0 === o
        ? void 0
        : o.profitAdjustment) || 0;
    0 !== i && (s += i);
    if (e.minutes >= r) break;
  }
  return s;
}
function applyFinalPayout(e, r) {
  switch (e.status) {
    case "WIN":
      return r + e.amount + e.profit;
    case "LOSS":
      return 0 === e.profit ? r : r + e.amount + e.profit;
    case "DRAW":
      return r + e.amount;
    default:
      return r;
  }
}
function determineRiseFallStatus(e, r, t) {
  const a = e.profitPercentage || 85;
  const isUp = ["RISE", "CALL", "HIGHER", "UP"].includes(String(e.side).toUpperCase());
  if (isUp) {
    if (r > e.price) {
      t.status = "WIN";
      t.profit = e.amount * (a / 100);
    } else if (r === e.price) t.status = "DRAW";
    else {
      t.status = "LOSS";
      t.profit = 0;
    }
  } else {
    if (r < e.price) {
      t.status = "WIN";
      t.profit = e.amount * (a / 100);
    } else if (r === e.price) t.status = "DRAW";
    else {
      t.status = "LOSS";
      t.profit = 0;
    }
  }
  return t;
}
function determineHigherLowerStatus(e, r, t) {
  const a = e.profitPercentage || 85,
    o = e.barrier || e.price;
  const isUp = ["HIGHER", "RISE", "CALL", "UP"].includes(String(e.side).toUpperCase());
  if (isUp) {
    if (r > o) {
      t.status = "WIN";
      t.profit = e.amount * (a / 100);
    } else if (r === o) t.status = "DRAW";
    else {
      t.status = "LOSS";
      t.profit = 0;
    }
  } else {
    if (r < o) {
      t.status = "WIN";
      t.profit = e.amount * (a / 100);
    } else if (r === o) t.status = "DRAW";
    else {
      t.status = "LOSS";
      t.profit = 0;
    }
  }
  return t;
}
function determineTouchNoTouchStatus(e, r, t) {
  const a = e.profitPercentage || 85;
  if ("TOUCH" === e.side)
    if (r) {
      t.status = "WIN";
      t.profit = e.amount * (a / 100);
    } else {
      t.status = "LOSS";
      t.profit = 0;
    }
  else if (r) {
    t.status = "LOSS";
    t.profit = 0;
  } else {
    t.status = "WIN";
    t.profit = e.amount * (a / 100);
  }
  return t;
}
function determineCallPutStatus(e, r, t) {
  const a = e.profitPercentage || 85;
  const o = e.strikePrice || e.barrier || e.price;
  const isUp = ["CALL", "RISE", "HIGHER", "UP"].includes(String(e.side).toUpperCase());
  if (isUp) {
    if (r > o) {
      t.status = "WIN";
      t.profit = e.amount * (a / 100);
    } else if (r === o) t.status = "DRAW";
    else {
      t.status = "LOSS";
      t.profit = 0;
    }
  } else {
    if (r < o) {
      t.status = "WIN";
      t.profit = e.amount * (a / 100);
    } else if (r === o) t.status = "DRAW";
    else {
      t.status = "LOSS";
      t.profit = 0;
    }
  }
  return t;
}
function determineTurboStatus(e, r, t, a) {
  const { barrier: o, payoutPerPoint: i } = e;
  if (!o || !i) {
    console_1.logger.error(
      "BINARY",
      `TURBO order ${e.id} missing barrier or payoutPerPoint. Defaulting to LOSS.`,
    );
    a.status = "LOSS";
    a.profit = -e.amount;
    return a;
  }
  if (t) {
    a.status = "LOSS";
    a.profit = -e.amount;
    return a;
  }
  let s = 0;
  if ("UP" === e.side)
    if (r > o) {
      s = (r - o) * i;
      if (s > e.amount) {
        a.status = "WIN";
        a.profit = s - e.amount;
      } else if (s === e.amount) a.status = "DRAW";
      else {
        a.status = "LOSS";
        a.profit = s - e.amount;
      }
    } else if (r === o) a.status = "DRAW";
    else {
      a.status = "LOSS";
      a.profit = -e.amount;
    }
  else if (r < o) {
    s = (o - r) * i;
    if (s > e.amount) {
      a.status = "WIN";
      a.profit = s - e.amount;
    } else if (s === e.amount) a.status = "DRAW";
    else {
      a.status = "LOSS";
      a.profit = s - e.amount;
    }
  } else if (r === o) a.status = "DRAW";
  else {
    a.status = "LOSS";
    a.profit = -e.amount;
  }
  return a;
}
function validateIsPositiveNumber(e, r, t) {
  ("number" != typeof e || isNaN(e) || e <= 0) &&
    t.push(`${r} is required and must be a positive number`);
}
function validateNumberInRange(e, r, t, a, o) {
  ("number" != typeof e || isNaN(e) || e < t || e > a) &&
    o.push(`${r} must be between ${t} and ${a}`);
}
function validateAllowedValues(e, r, t, a) {
  r.includes(e) || a.push(`Invalid ${t}: ${e}`);
}
function validateCreateOrderInput(e) {
  const {
      side: r,
      type: t,
      barrier: a,
      strikePrice: o,
      payoutPerPoint: i,
      durationType: s,
    } = e,
    n = [];
  if (!(t in typeConfig))
    throw (0, error_1.createError)({
      statusCode: 400,
      message: `Invalid type: ${t}`,
    });
  const d = typeConfig[t];
  validateAllowedValues(r, d.validSides, "side", n);
  d.requiresBarrier && validateIsPositiveNumber(a, "barrier", n);
  d.requiresStrikePrice && validateIsPositiveNumber(o, "strikePrice", n);
  d.requiresPayoutPerPoint &&
    validateNumberInRange(i, "payoutPerPoint", 0.01, 1e3, n);
  d.requiresDurationType
    ? s
      ? validateAllowedValues(s, d.requiresDurationType, "durationType", n)
      : n.push("durationType is required")
    : s &&
      "TIME" !== s &&
      n.push(
        `durationType "${s}" is not valid for ${t} orders. Only TURBO orders support TICKS duration type.`,
      );
  if (n.length > 0) {
    const e = n.join(", ");
    throw (0, error_1.createError)({ statusCode: 400, message: e });
  }
}
var __createBinding =
    (this && this.__createBinding) ||
    (Object.create
      ? function (e, r, t, a) {
          void 0 === a && (a = t);
          var o = Object.getOwnPropertyDescriptor(r, t);
          (o && !("get" in o ? !r.__esModule : o.writable || o.configurable)) ||
            (o = {
              enumerable: !0,
              get: function () {
                return r[t];
              },
            });
          Object.defineProperty(e, a, o);
        }
      : function (e, r, t, a) {
          void 0 === a && (a = t);
          e[a] = r[t];
        }),
  __setModuleDefault =
    (this && this.__setModuleDefault) ||
    (Object.create
      ? function (e, r) {
          Object.defineProperty(e, "default", { enumerable: !0, value: r });
        }
      : function (e, r) {
          e.default = r;
        }),
  __importStar =
    (this && this.__importStar) ||
    (function () {
      var e = function (r) {
        e =
          Object.getOwnPropertyNames ||
          function (e) {
            var r = [];
            for (var t in e)
              Object.prototype.hasOwnProperty.call(e, t) && (r[r.length] = t);
            return r;
          };
        return e(r);
      };
      return function (r) {
        if (r && r.__esModule) return r;
        var t = {};
        if (null != r)
          for (var a = e(r), o = 0; o < a.length; o++)
            "default" !== a[o] && __createBinding(t, r, a[o]);
        __setModuleDefault(t, r);
        return t;
      };
    })();
Object.defineProperty(exports, "__esModule", { value: !0 });
exports.BinaryOrderService = void 0;
exports.validateCreateOrderInput = validateCreateOrderInput;
const db_1 = require("@b/db"),
  sequelize_1 = require("sequelize"),
  error_1 = require("@b/utils/error"),
  emails_1 = require("@b/utils/emails"),
  notifications_1 = require("@b/utils/notifications"),
  Websocket_1 = require("@b/handler/Websocket"),
  utils_1 = require("../utils"),
  broadcast_1 = require("@b/cron/broadcast"),
  console_1 = require("@b/utils/console"),
  binary_settings_cache_1 = require("@b/utils/binary-settings-cache"),
  wallet_1 = require("@b/services/wallet"),
  ORDER_CONFIG = {
    DUPLICATE_CHECK_WINDOW_MS: 5e3,
    REDLOCK_TTL_MS: 5e3,
    MIN_PRICE_VALUE: 1e-8,
    MAX_PRICE_VALUE: 1e9,
    DEFAULT_MIN_AMOUNT: 1,
    DEFAULT_MAX_AMOUNT: 1e5,
    MS_PER_MINUTE: 6e4,
    CANDLE_LOOKBACK_MS: 12e4,
    BATCH_SIZE: 10,
    DELAY_BETWEEN_BATCHES_MS: 1e3,
  };
class BinaryOrderService {
  static userQueues = new Map();
  static enqueue(userId, fn) {
    let queue = this.userQueues.get(userId);
    if (!queue) {
      queue = Promise.resolve();
    }
    const next = queue.then(async () => {
      try {
        await fn();
      } catch (err) {
        console_1.logger.error(
          "BINARY",
          `Queue error processing task for user ${userId}: ${err.message}`,
          err,
        );
      }
    });
    this.userQueues.set(userId, next);
    next.finally(() => {
      if (this.userQueues.get(userId) === next) {
        this.userQueues.delete(userId);
      }
    });
    return next;
  }
  static async createOrder({
    userId: e,
    currency: r,
    pair: t,
    amount: a,
    side: o,
    type: i,
    durationId: s,
    durationType: n = "TIME",
    barrier: d,
    barrierLevelId: c,
    strikePrice: l,
    strikeLevelId: u,
    payoutPerPoint: f,
    closedAt: m,
    isDemo: _,
    idempotencyKey: p,
  }) {
    var g, O, b, y, h, w, E, I, T;
    validateCreateOrderInput({
      side: o,
      type: i,
      barrier: d,
      strikePrice: l,
      payoutPerPoint: f,
      durationType: n,
    });
    if (p) {
      const r = await db_1.models.binaryOrder.findOne({
        where: { userId: e, metadata: { idempotencyKey: p } },
      });
      if (r) {
        console_1.logger.info(
          "BINARY",
          `Idempotent request detected for user ${e} with key ${p}. Returning existing order ${r.id}`,
        );
        return r;
      }
    }
    let C = await db_1.models.exchangeMarket.findOne({
      where: { currency: r, pair: t },
    });
    if (!C) {
      const B_m = await db_1.models.binaryMarket.findOne({
        where: { currency: r, pair: t },
      });
      if (B_m) {
        C = { currency: r, pair: t, metadata: null };
      }
    }
    if (!C || (!C.metadata && !(r.includes("OTC") || t.includes("OTC"))))
      throw (0, error_1.createError)({
        statusCode: 404,
        message: "Market data not found",
      });
    const A =
        "string" == typeof C.metadata ? JSON.parse(C.metadata) : C.metadata,
      N = Number(
        null !==
          (b =
            null ===
              (O =
                null === (g = null == A ? void 0 : A.limits) || void 0 === g
                  ? void 0
                  : g.amount) || void 0 === O
              ? void 0
              : O.min) && void 0 !== b
          ? b
          : ORDER_CONFIG.DEFAULT_MIN_AMOUNT,
      ),
      S = Number(
        null !==
          (w =
            null ===
              (h =
                null === (y = null == A ? void 0 : A.limits) || void 0 === y
                  ? void 0
                  : y.amount) || void 0 === h
              ? void 0
              : h.max) && void 0 !== w
          ? w
          : ORDER_CONFIG.DEFAULT_MAX_AMOUNT,
      );
    if (N <= 0 || S <= 0 || S < N)
      throw (0, error_1.createError)({
        statusCode: 500,
        message:
          "Market configuration error: Invalid amount limits in market metadata",
      });
    if (a < N || a > S)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `Amount must be between ${N} and ${S} ${t}`,
      });
    const $ = new Date(m),
      P = Date.now();
    if ($.getTime() <= P)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: "closedAt must be a future time",
      });
    const R = await (0, binary_settings_cache_1.getBinarySettings)();
    if (!R.global.enabled)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: "Binary trading is currently disabled",
      });
    const v = R.orderTypes[i];
    if (!v || !v.enabled)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `Order type ${i} is not currently available`,
      });
    const L = R.durations.find((e) => e.id === s);
    if (!L || !L.enabled) {
      const e = R.durations
        .filter((e) => e.enabled)
        .map((e) => `${e.minutes}m`)
        .join(", ");
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `Invalid or inactive duration selected. Available durations: ${e || "none"}`,
      });
    }
    const D =
      null === (E = L.orderTypeOverrides) || void 0 === E ? void 0 : E[i];
    if (!1 === (null == D ? void 0 : D.enabled))
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `Duration ${L.minutes}m is not available for ${i} orders`,
      });
    const B = R.durations.filter((e) => e.enabled),
      U = Math.max(...B.map((e) => e.minutes)),
      k = 60 * U * 1e3;
    if ($.getTime() - P > k)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `Order duration cannot exceed ${U} minutes (maximum configured duration)`,
      });
    const W = L.minutes,
      M = $.getMinutes(),
      H = $.getSeconds(),
      q = $.getMilliseconds(),
      Y = M % W === 0 && H <= 5 && q <= 1e3,
      x = $.getTime() - P,
      F = 1e3 * R.global.orderExpirationBuffer;
    if (!Y)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `closedAt timestamp must align to ${W}-minute boundaries (e.g., ${Array.from({ length: Math.floor(60 / W) }, (e, r) => `:${String(r * W).padStart(2, "0")}`).join(", ")})`,
      });
    if (x < F)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `Order must be placed at least ${R.global.orderExpirationBuffer} seconds before expiry. Time until expiry: ${Math.round(x / 1e3)} seconds`,
      });
    const K = _ ? "demo" : "live";
    if (v.tradingModes && !v.tradingModes[K])
      throw (0, error_1.createError)({
        statusCode: 400,
        message: `Order type ${i} is not available in ${K} mode`,
      });
    if (a <= 0)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: "Amount must be positive",
      });
    let G = v.profitPercentage,
      V = null,
      z = null;
    if ("HIGHER_LOWER" === i || "TOUCH_NO_TOUCH" === i || "TURBO" === i) {
      const e =
        (null === (I = v.barrierLevels) || void 0 === I
          ? void 0
          : I.filter((e) => e.enabled)) || [];
      if (0 === e.length)
        throw (0, error_1.createError)({
          statusCode: 400,
          message: `No barrier levels are configured for ${i} orders`,
        });
      if (null == d)
        throw (0, error_1.createError)({
          statusCode: 400,
          message: `Barrier price is required for ${i} orders`,
        });
      if (!c)
        throw (0, error_1.createError)({
          statusCode: 400,
          message: `Barrier level selection is required for ${i} orders`,
        });
      V = e.find((e) => e.id === c) || null;
      if (!V)
        throw (0, error_1.createError)({
          statusCode: 400,
          message:
            "Invalid barrier level selected. Please choose from available levels.",
        });
      G = V.profitPercent;
      if ("TOUCH_NO_TOUCH" === i) {
        const e = v;
        "TOUCH" === o
          ? (G *= e.touchProfitMultiplier || 1)
          : "NO_TOUCH" === o && (G *= e.noTouchProfitMultiplier || 1);
      }
      if ("TURBO" === i) {
        const e = v;
        if (null == f)
          throw (0, error_1.createError)({
            statusCode: 400,
            message: "Payout per point is required for TURBO orders",
          });
        const { min: r, max: t } = e.payoutPerPointRange || {
          min: 0.1,
          max: 10,
        };
        if (f < r || f > t)
          throw (0, error_1.createError)({
            statusCode: 400,
            message: `Payout per point must be between ${r} and ${t}`,
          });
        const a = e.maxDuration || 5;
        if (L.minutes > a)
          throw (0, error_1.createError)({
            statusCode: 400,
            message: `TURBO orders cannot exceed ${a} minute duration`,
          });
      }
    }
    if ("CALL_PUT" === i) {
      const e =
        (null === (T = v.strikeLevels) || void 0 === T
          ? void 0
          : T.filter((e) => e.enabled)) || [];
      if (0 === e.length)
        throw (0, error_1.createError)({
          statusCode: 400,
          message: "No strike levels are configured for CALL_PUT orders",
        });
      if (null == l)
        throw (0, error_1.createError)({
          statusCode: 400,
          message: "Strike price is required for CALL_PUT orders",
        });
      if (!u)
        throw (0, error_1.createError)({
          statusCode: 400,
          message: "Strike level selection is required for CALL_PUT orders",
        });
      z = e.find((e) => e.id === u) || null;
      if (!z)
        throw (0, error_1.createError)({
          statusCode: 400,
          message:
            "Invalid strike level selected. Please choose from available levels.",
        });
      G = z.profitPercent;
    }
    const j = calculateCumulativeProfitAdjustment(R, L.minutes, i);
    G += (G * j) / 100;
    if (G < 0 || G > 1e3)
      throw (0, error_1.createError)({
        statusCode: 400,
        message: "Profit percentage must be between 0% and 1000%",
      });
    /* Duplicate check bypassed */ await (0, utils_1.ensureNotBanned)();
    return await db_1.sequelize.transaction(async (c) => {
      let u;
      if (!_) {
        u = await db_1.models.wallet.findOne({
          where: { userId: e, currency: "USDT", type: "SPOT" },
          transaction: c,
          lock: c.LOCK.UPDATE,
        });
        if (!u)
          throw (0, error_1.createError)({
            statusCode: 404,
            message: `Wallet not found for currency USDT. Please ensure you have a USDT wallet.`,
          });
        if (u.balance < a)
          throw (0, error_1.createError)({
            statusCode: 400,
            message: "Insufficient balance",
          });
      }
      const g = await (0, utils_1.ensureExchange)();
      await (0, utils_1.ensureNotBanned)();
      let O, b;
      if ((r + "/" + t).toUpperCase().includes("OTC") || t === "OTC") {
        const Redis = require("ioredis");
        const otcRedis = new Redis({
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
          maxRetriesPerRequest: 1,
          connectTimeout: 1000,
        });
        try {
          const symbol = r + "/" + t;
          const cleanSym = symbol.replace(/\s*\(OTC\)/gi, "").replace(/_OTC/gi, "").replace(/\/OTC/gi, "").trim();
          const pStr1 = await otcRedis.get("otc:" + cleanSym + " (OTC):last_price");
          const pStr2 = await otcRedis.get("otc:" + cleanSym + ":last_price");
          const pStr3 = await otcRedis.get("otc:" + symbol + ":last_price");
          const pStr = pStr1 || pStr2 || pStr3;
          if (pStr) b = parseFloat(pStr);
        } catch (e) {
          console_1.logger.error(
            "BINARY",
            "Error fetching OTC price: " + e.message,
          );
        } finally {
          await otcRedis.quit().catch(() => {});
        }
        if (!b)
          throw (0, error_1.createError)({
            statusCode: 500,
            message: "Error fetching OTC price data",
          });
      } else {
        try {
          O = await g.fetchTicker(`${r}/${t}`);
        } catch (e) {
          console_1.logger.error(
            "BINARY",
            `Error fetching market data for ${r}/${t}: ${e.message}`,
          );
          throw (0, error_1.createError)({
            statusCode: 500,
            message: "Error fetching market data from exchange",
          });
        }
        b = null == O ? void 0 : O.last;
      }
      if (!b || b <= 0 || isNaN(b) || !isFinite(b))
        throw (0, error_1.createError)({
          statusCode: 500,
          message: "Invalid price data from exchange. Please try again.",
        });
      if (b < ORDER_CONFIG.MIN_PRICE_VALUE || b > ORDER_CONFIG.MAX_PRICE_VALUE)
        throw (0, error_1.createError)({
          statusCode: 500,
          message:
            "Price data from exchange is outside acceptable range. Please contact support.",
        });
      if ("CALL_PUT" === i && void 0 !== l) {
        const e = 1e-4 * b;
        if (Math.abs(l - b) < e)
          throw (0, error_1.createError)({
            statusCode: 400,
            message:
              "Strike price must be at least 0.01% away from current price to avoid guaranteed DRAW",
          });
        const r = 0.5 * b;
        if (Math.abs(l - b) > r)
          throw (0, error_1.createError)({
            statusCode: 400,
            message:
              "Strike price must be within 50% of current price for risk management",
          });
      }
      const y = await db_1.models.binaryOrder.create(
        {
          userId: e,
          symbol: `${r}/${t}`,
          type: i,
          side: o,
          status: "PENDING",
          price: b,
          profit: 0,
          amount: a,
          isDemo: _,
          closedAt: $,
          profitPercentage: G,
          barrier: ["HIGHER_LOWER", "TOUCH_NO_TOUCH", "TURBO"].includes(i)
            ? d
            : void 0,
          strikePrice: "CALL_PUT" === i ? l : void 0,
          payoutPerPoint: "CALL_PUT" === i || "TURBO" === i ? f : void 0,
          durationType: "TURBO" === i ? n : "TIME",
          metadata: p ? { idempotencyKey: p } : void 0,
        },
        { transaction: c },
      );
      if (!_ && u) {
        const n = p
          ? `binary_order_debit_${p}`
          : `binary_order_debit_${e}_${r}_${t}_${m}`;
        await wallet_1.walletService.debit({
          idempotencyKey: n,
          userId: e,
          walletId: u.id,
          walletType: "SPOT",
          currency: "USDT",
          amount: a,
          operationType: "BINARY_ORDER",
          referenceId: y.id,
          description: `Binary ${i} order: ${r}/${t}`,
          metadata: {
            orderType: i,
            currency: r,
            pair: t,
            side: o,
            durationId: s,
            orderId: y.id,
          },
          transaction: c,
        });
      }
      this.scheduleOrderProcessing(y, e);
      return y;
    });
  }
  static async processOrder(e, r, t) {
    return this.enqueue(e, () => this.executeOrderProcessing(e, r, t));
  }
  static async executeOrderProcessing(e, r, t) {
    const { redlock: a } = await Promise.resolve().then(() =>
      __importStar(require("@b/utils/redis")),
    );
    let o;
    try {
      o = await a.acquire([`binary:order:${r}`], ORDER_CONFIG.REDLOCK_TTL_MS);
    } catch (e) {
      console_1.logger.warn(
        "BINARY",
        `Could not acquire lock for order ${r}. Another process is handling it.`,
      );
      return;
    }
    try {
      await (0, utils_1.ensureNotBanned)();
      const a = await (0, utils_1.ensureExchange)();
      let o, i;
      const cleanSym = t.replace(/\s*\(OTC\)/gi, "").replace(/_OTC/gi, "").replace(/\/OTC/gi, "").trim();
      const Redis = require("ioredis");
      const otcRedis = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
      });
      try {
        const pStr1 = await otcRedis.get("otc:" + cleanSym + " (OTC):last_price");
        const pStr2 = await otcRedis.get("otc:" + cleanSym + ":last_price");
        const pStr3 = await otcRedis.get("otc:" + t + ":last_price");
        const pStr = pStr1 || pStr2 || pStr3;
        if (pStr) i = parseFloat(pStr);
      } catch (e) {
        console_1.logger.error(
          "BINARY",
          "Error fetching OTC price for processing: " + e.message,
        );
      } finally {
        await otcRedis.quit().catch(() => {});
      }
      if (!i) {
        try {
          o = await a.fetchTicker(t);
          i = null == o ? void 0 : o.last;
        } catch (err) {}
      }
      if (null == i) {
        console_1.logger.error(
          "BINARY",
          `No close price found for ${t}. Order: ${r}`,
        );
        return;
      }
      await db_1.sequelize.transaction(
        {
          isolationLevel:
            sequelize_1.Transaction.ISOLATION_LEVELS.REPEATABLE_READ,
        },
        async (t) => {
          const o = await db_1.models.binaryOrder.findOne({
            where: { id: r, userId: e, status: "PENDING" },
            transaction: t,
            lock: t.LOCK.UPDATE,
          });
          if (!o) {
            console_1.logger.warn(
              "BINARY",
              `Order ${r} already processed or not found. Skipping.`,
            );
            return;
          }
          let s = !1;
          "TOUCH_NO_TOUCH" === o.type &&
            null != o.barrier &&
            o.createdAt &&
            (s = await this.checkIfBarrierTouched(
              a,
              o.symbol,
              o.createdAt,
              o.closedAt,
              o.barrier,
            ));
          let n = !1;
          "TURBO" !== o.type ||
            null == o.barrier ||
            ("UP" !== o.side && "DOWN" !== o.side) ||
            !o.createdAt ||
            (n = await this.checkTurboBarrierBreach(
              a,
              o.symbol,
              o.createdAt,
              o.closedAt,
              o.barrier,
              o.side,
            ));
          const d = this.determineOrderStatus(o, i, s, n);
          await this.updateBinaryOrderWithTransaction(o.id, d, t);
          this.orderIntervals.delete(o.id);
        },
      );
    } catch (e) {
      console_1.logger.error("BINARY", `Error processing order ${r}: ${e}`);
    } finally {
      if (o)
        try {
          await o.release();
        } catch (e) {
          console_1.logger.error(
            "BINARY",
            `Error releasing lock for order ${r}: ${e}`,
          );
        }
    }
  }
  static async checkTurboBarrierBreach(e, r, t, a, o, i) {
    const s = t.getTime(),
      n = a.getTime();
    let d = !1,
      c = s;
    try {
      for (; !d && c < n; ) {
        const t = await e.fetchOHLCV(r, "1m", c, 1e3);
        if (!t || 0 === t.length) {
          console_1.logger.warn(
            "BINARY",
            `No OHLCV data for ${r} between ${new Date(c)} and ${new Date(n)}. Assuming no more data.`,
          );
          break;
        }
        for (const e of t) {
          const [r, , t, a] = e;
          if ("UP" === i && a < o) {
            d = !0;
            break;
          }
          if ("DOWN" === i && t > o) {
            d = !0;
            break;
          }
          if (r >= n) break;
        }
        const a = t[t.length - 1][0];
        if (a <= c) {
          console_1.logger.warn(
            "BINARY",
            "No progress in OHLCV time. Stopping fetch loop.",
          );
          break;
        }
        c = a + 6e4;
      }
    } catch (e) {
      console_1.logger.error(
        "BINARY",
        `Error fetching OHLC data for TURBO barrier check: ${e}`,
      );
      throw (0, error_1.createError)({
        statusCode: 500,
        message: `Failed to check TURBO barrier: ${e}`,
      });
    }
    return d;
  }
  static async checkIfBarrierTouched(e, r, t, a, o) {
    const i = t.getTime(),
      s = a.getTime();
    let n = !1,
      d = i;
    try {
      for (; !n && d < s; ) {
        const t = await e.fetchOHLCV(r, "1m", d, 1e3);
        if (!t || 0 === t.length) {
          console_1.logger.warn(
            "BINARY",
            `No OHLCV data for ${r} between ${new Date(d)} and ${new Date(s)}.`,
          );
          break;
        }
        for (const e of t) {
          const [r, , t, a] = e;
          if (t >= o && a <= o) {
            n = !0;
            break;
          }
          if (r >= s) break;
        }
        const a = t[t.length - 1][0];
        if (a <= d) {
          console_1.logger.warn(
            "BINARY",
            "No progress in OHLCV time. Stopping fetch loop.",
          );
          break;
        }
        d = a + 6e4;
      }
    } catch (e) {
      console_1.logger.error(
        "BINARY",
        `Error fetching OHLC data for TOUCH_NO_TOUCH barrier check: ${e}`,
      );
      throw (0, error_1.createError)({
        statusCode: 500,
        message: `Failed to check barrier touch: ${e}`,
      });
    }
    return n;
  }
  static async cancelOrder(e, r, t) {
    var a, o;
    const i = await (0, utils_1.getBinaryOrder)(e, r);
    if (!i) throw (0, error_1.createError)(404, "Order not found");
    if (["CANCELED", "WIN", "LOSS", "DRAW"].includes(i.status)) {
      console_1.logger.error(
        "BINARY",
        `Order ${r} is already ${i.status}. Cannot cancel again.`,
      );
      return { message: "Order already processed or canceled." };
    }
    await (0, utils_1.ensureNotBanned)();
    const s = await (0, utils_1.ensureExchange)();
    let n;
    if (i.symbol.toUpperCase().includes("OTC")) {
      const Redis = require("ioredis");
      const otcRedis = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
      });
      try {
        const cleanSym = i.symbol.replace(/\s*\(OTC\)/gi, "").replace(/_OTC/gi, "").replace(/\/OTC/gi, "").trim();
        const pStr1 = await otcRedis.get("otc:" + cleanSym + " (OTC):last_price");
        const pStr2 = await otcRedis.get("otc:" + cleanSym + ":last_price");
        const pStr3 = await otcRedis.get("otc:" + i.symbol + ":last_price");
        const pStr = pStr1 || pStr2 || pStr3;
        if (pStr) n = parseFloat(pStr);
      } catch (e) {
        console_1.logger.error(
          "BINARY",
          "Error fetching OTC price for cancellation: " + e.message,
        );
      } finally {
        await otcRedis.quit().catch(() => {});
      }
      if (!n)
        throw (0, error_1.createError)({
          statusCode: 500,
          message: "Error fetching OTC price data",
        });
    } else {
      n = (await s.fetchTicker(i.symbol)).last;
    }
    if (!n)
      throw (0, error_1.createError)(
        500,
        "Error fetching current price for the order symbol",
      );
    const d = await (0, binary_settings_cache_1.getBinarySettings)();
    if (!(null === (a = d.cancellation) || void 0 === a ? void 0 : a.enabled))
      throw (0, error_1.createError)(400, "Order cancellation is disabled");
    const c =
      null === (o = d.cancellation.rules) || void 0 === o ? void 0 : o[i.type];
    if (!c || !c.enabled)
      throw (0, error_1.createError)(
        400,
        `Cancellation is not available for ${i.type} orders`,
      );
    const l = Date.now(),
      u = new Date(i.closedAt).getTime() - l,
      f = u / 1e3;
    if (u <= 1e3 * c.minTimeBeforeExpirySeconds)
      throw (0, error_1.createError)(
        400,
        `Cannot cancel ${i.type} order within ${c.minTimeBeforeExpirySeconds} seconds of expiry. Time remaining: ${Math.round(f)} seconds`,
      );
    if ("TOUCH_NO_TOUCH" === i.type && i.barrier && i.createdAt)
      try {
        if (
          await this.checkIfBarrierTouched(
            s,
            i.symbol,
            i.createdAt,
            new Date(),
            i.barrier,
          )
        )
          throw (0, error_1.createError)(
            400,
            "Cannot cancel TOUCH_NO_TOUCH order: barrier has been touched",
          );
      } catch (e) {
        console_1.logger.warn(
          "BINARY",
          `Could not check barrier touch status for order ${r}: ${e.message}`,
        );
      }
    if (
      "TURBO" === i.type &&
      i.barrier &&
      i.createdAt &&
      ("UP" === i.side || "DOWN" === i.side)
    ) {
      if ("TICKS" === i.durationType)
        throw (0, error_1.createError)(
          400,
          "Cannot sell a TURBO contract with TICKS duration early.",
        );
      try {
        if (
          await this.checkTurboBarrierBreach(
            s,
            i.symbol,
            i.createdAt,
            new Date(),
            i.barrier,
            i.side,
          )
        )
          throw (0, error_1.createError)(
            400,
            "Cannot cancel TURBO order: barrier has been breached",
          );
      } catch (e) {
        console_1.logger.warn(
          "BINARY",
          `Could not check barrier breach status for order ${r}: ${e.message}`,
        );
      }
    }
    let m = c.penaltyPercentage;
    if (c.penaltyByTimeRemaining) {
      const e = c.penaltyByTimeRemaining;
      m =
        f > 60
          ? e.above60Seconds
          : f > 30
            ? e.above30Seconds
            : e.below30Seconds;
    }
    const _ = null != t ? t : m;
    await this.processStandardCancel(i, n, _);
    return {
      message: "Order cancelled",
      penaltyApplied: _,
      refundPercentage: 100 - _,
    };
  }
  static async processStandardCancel(e, r, t) {
    await db_1.sequelize.transaction(async (a) => {
      if (!e.isDemo) {
        let r,
          o = await db_1.models.transaction.findOne({
            where: { referenceId: e.id },
            transaction: a,
            lock: a.LOCK.UPDATE,
          });
        o ||
          (o = await db_1.models.transaction.findOne({
            where: {
              userId: e.userId,
              type: "BINARY",
              status: "COMPLETED",
              amount: e.amount,
              [sequelize_1.Op.and]: db_1.sequelize.literal(
                `JSON_EXTRACT(metadata, '$.orderId') = '${e.id}'`,
              ),
            },
            transaction: a,
            lock: a.LOCK.UPDATE,
          }));
        if (o)
          r = await db_1.models.wallet.findOne({
            where: { id: o.walletId },
            transaction: a,
            lock: a.LOCK.UPDATE,
          });
        else {
          console_1.logger.warn(
            "BINARY",
            `Transaction not found for cancelled order ${e.id}. Looking up wallet directly.`,
          );
          const [, t] = e.symbol.split("/");
          r = await db_1.models.wallet.findOne({
            where: { userId: e.userId, currency: "USDT", type: "SPOT" },
            transaction: a,
            lock: a.LOCK.UPDATE,
          });
        }
        if (!r) throw (0, error_1.createError)(404, "Wallet not found");
        let i = e.amount;
        if (void 0 !== t) {
          const r = e.amount * (Math.abs(t) / 100);
          i = e.amount - r;
          i < 0 && (i = 0);
        }
        if (i > 0) {
          const o = `binary_cancel_${e.id}`;
          await wallet_1.walletService.credit({
            idempotencyKey: o,
            userId: e.userId,
            walletId: r.id,
            walletType: "SPOT",
            currency: r.currency,
            amount: i,
            operationType: "REFUND",
            referenceId: e.id,
            description: `Binary order cancelled - refund ${i} ${r.currency}`,
            metadata: {
              orderId: e.id,
              refundPercentage: t || 100,
              originalAmount: e.amount,
            },
            transaction: a,
          });
        }
        o &&
          (await db_1.models.transaction.update(
            {
              status: "CANCELLED",
              metadata: JSON.stringify({
                cancelledAt: Date.now(),
                refundPercentage: t || 100,
                refundAmount: i,
                reason: "Order cancelled by user",
              }),
            },
            { where: { id: o.id }, transaction: a },
          ));
      }
      if (this.orderIntervals.has(e.id)) {
        clearTimeout(this.orderIntervals.get(e.id));
        this.orderIntervals.delete(e.id);
      }
      await db_1.models.binaryOrder.update(
        { status: "CANCELED", closePrice: r, profit: 0 },
        { where: { id: e.id }, transaction: a },
      );
    });
  }
  static async processPendingOrders(e = !0) {
    const r = "processPendingOrders",
      { redlock: t } = await Promise.resolve().then(() =>
        __importStar(require("@b/utils/redis")),
      );
    try {
      const a = await (0, utils_1.getBinaryOrdersByStatus)("PENDING"),
        o = Date.now(),
        i = a.filter(
          (e) =>
            new Date(e.closedAt).getTime() <= o &&
            !this.orderIntervals.has(e.id),
        ),
        s = await (0, utils_1.ensureExchange)(),
        n = ORDER_CONFIG.BATCH_SIZE,
        d = ORDER_CONFIG.DELAY_BETWEEN_BATCHES_MS;
      for (let a = 0; a < i.length; a += n) {
        const o = i.slice(a, a + n);
        await Promise.all(
          o.map(async (a) => {
            let o;
            try {
              o = await t.acquire(
                [`binary:order:${a.id}`],
                ORDER_CONFIG.REDLOCK_TTL_MS,
              );
            } catch (t) {
              e &&
                (0, broadcast_1.broadcastLog)(
                  r,
                  `Order ${a.id} is being processed by another instance. Skipping.`,
                  "info",
                );
              return;
            }
            try {
              if ("PENDING" !== a.status) {
                e &&
                  (0, broadcast_1.broadcastLog)(
                    r,
                    `Order ${a.id} already processed as ${a.status}. Skipping.`,
                    "error",
                  );
                return;
              }
              const t = "1m";
              let o;
              if (a.symbol.toUpperCase().includes("OTC")) {
                const Redis = require("ioredis");
                const otcRedis = new Redis({
                  host: process.env.REDIS_HOST || "127.0.0.1",
                  port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
                  maxRetriesPerRequest: 1,
                  connectTimeout: 1000,
                });
                try {
                  const redisSymbol = a.symbol.replace("/", "").toUpperCase();
                  const expiryTime = new Date(a.closedAt).getTime();
                  const rawCandles = await otcRedis.zrangebyscore(
                    `otc:history:${redisSymbol}`,
                    expiryTime - 60000,
                    expiryTime,
                  );
                  if (rawCandles && rawCandles.length > 0) {
                    const parsed = rawCandles.map(JSON.parse);
                    const exactCandle =
                      parsed.find(
                        (c) => Number(c.timestamp) === expiryTime - 60000,
                      ) || parsed[parsed.length - 1];
                    if (exactCandle) {
                      o = parseFloat(exactCandle.close);
                    }
                  }
                  if (void 0 === o) {
                    const bidexSymbol = a.symbol.toUpperCase().endsWith("/OTC")
                      ? a.symbol.slice(0, -4) + " (OTC)"
                      : a.symbol.replace("_OTC", " (OTC)");
                    const pStr = await otcRedis.get(
                      "otc:" + bidexSymbol + ":last_price",
                    );
                    if (pStr) o = parseFloat(pStr);
                  }
                } catch (err) {
                  console_1.logger.error(
                    "BINARY",
                    "Error fetching OTC price from Redis: " + err.message,
                  );
                } finally {
                  await otcRedis.quit().catch(() => {});
                }
              } else {
                try {
                  const i = Number(a.closedAt),
                    n = await s.fetchOHLCV(
                      a.symbol,
                      t,
                      i - ORDER_CONFIG.CANDLE_LOOKBACK_MS,
                      3,
                    );
                  if (n && n.length > 0) {
                    const t = n.find((e) => {
                      const r = e[0];
                      return i >= r && i < r + ORDER_CONFIG.MS_PER_MINUTE;
                    });
                    if (t) o = t[4];
                    else {
                      e &&
                        (0, broadcast_1.broadcastLog)(
                          r,
                          `No candle found containing expiry time for order ${a.id}. Using ticker.`,
                          "warning",
                        );
                      o = (await s.fetchTicker(a.symbol)).last;
                    }
                  } else {
                    e &&
                      (0, broadcast_1.broadcastLog)(
                        r,
                        `Not enough OHLCV data for order ${a.id} to determine closePrice. Using ticker.`,
                        "warning",
                      );
                    o = (await s.fetchTicker(a.symbol)).last;
                  }
                } catch (t) {
                  e &&
                    (0, broadcast_1.broadcastLog)(
                      r,
                      `Error fetching OHLCV for pending order ${a.id}: ${t.message}`,
                      "error",
                    );
                  o = (await s.fetchTicker(a.symbol)).last;
                }
              }
              if (void 0 === o) {
                e &&
                  (0, broadcast_1.broadcastLog)(
                    r,
                    `Unable to determine closePrice for order ${a.id}. Skipping.`,
                    "error",
                  );
                return;
              }
              const i = this.determineOrderStatus(a, o);
              await this.updateBinaryOrder(a.id, i);
            } finally {
              if (o)
                try {
                  await o.release();
                } catch (t) {
                  e &&
                    (0, broadcast_1.broadcastLog)(
                      r,
                      `Error releasing lock for order ${a.id}: ${t}`,
                      "error",
                    );
                }
            }
          }),
        );
        a + n < i.length && (await new Promise((e) => setTimeout(e, d)));
      }
    } catch (t) {
      e &&
        (0, broadcast_1.broadcastLog)(
          r,
          `Error in processPendingOrders: ${t.message}`,
          "error",
        );
      throw t;
    }
  }
  static determineOrderStatus(e, r, t, a) {
    const o = { closePrice: r, profit: 0 };
    switch (e.type) {
      case "RISE_FALL":
        return determineRiseFallStatus(e, r, o);
      case "HIGHER_LOWER":
        return determineHigherLowerStatus(e, r, o);
      case "TOUCH_NO_TOUCH":
        return determineTouchNoTouchStatus(e, t, o);
      case "CALL_PUT":
        return determineCallPutStatus(e, r, o);
      case "TURBO":
        return determineTurboStatus(e, r, a, o);
      default:
        o.status = "LOSS";
        return o;
    }
  }
  static async updateBinaryOrderWithTransaction(e, r, t) {
    const a = await db_1.models.binaryOrder.findOne({
      where: { id: e },
      transaction: t,
    });
    a &&
      r.status &&
      console_1.logger.info(
        "BINARY",
        `Order ${e} state transition: ${a.status} -> ${r.status} | Entry Price: ${a.price} | Close Price: ${r.closePrice || "N/A"} | Profit: ${void 0 !== r.profit ? r.profit : "N/A"} | Type: ${a.type} | Side: ${a.side} | Amount: ${a.amount}`,
      );
    await db_1.models.binaryOrder.update(r, {
      where: { id: e },
      transaction: t,
    });
    const o = await db_1.models.binaryOrder.findOne({
      where: { id: e },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!o)
      throw (0, error_1.createError)({
        statusCode: 404,
        message: "Order not found after update",
      });
    if (!o.isDemo && ["WIN", "LOSS", "DRAW"].includes(o.status)) {
      let r,
        a = await db_1.models.transaction.findOne({
          where: { referenceId: e },
          transaction: t,
        });
      a ||
        (a = await db_1.models.transaction.findOne({
          where: {
            userId: o.userId,
            type: "BINARY",
            status: "COMPLETED",
            amount: o.amount,
            [sequelize_1.Op.and]: db_1.sequelize.literal(
              `JSON_EXTRACT(metadata, '$.orderId') = '${e}'`,
            ),
          },
          transaction: t,
        }));
      if (a) {
        await db_1.models.transaction.update(
          { status: "COMPLETED" },
          { where: { id: a.id }, transaction: t },
        );
        r = await db_1.models.wallet.findOne({
          where: { id: a.walletId },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      } else {
        console_1.logger.warn(
          "BINARY",
          `Transaction not found for completed order ${e}. Looking up wallet directly.`,
        );
        const [, a] = o.symbol.split("/");
        r = await db_1.models.wallet.findOne({
          where: { userId: o.userId, currency: "USDT", type: "SPOT" },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
      }
      if (!r)
        throw (0, error_1.createError)({
          statusCode: 404,
          message: "Wallet not found to update balance",
        });
      let i = 0,
        s = "REFUND";
      if ("WIN" === o.status) {
        i = o.amount + o.profit;
        s = "BINARY_ORDER_WIN";
      } else if ("LOSS" === o.status) {
        if (0 !== o.profit) {
          i = o.amount + o.profit;
          i > 0 && (s = "BINARY_ORDER_LOSS");
        }
      } else if ("DRAW" === o.status) {
        i = o.amount;
        s = "REFUND";
      }
      if (i > 0) {
        const a = `binary_finalize_${e}_${o.status}`;
        console_1.logger.info(
          "BINARY",
          `Crediting wallet for order ${e}: amount=${o.amount}, profit=${o.profit}, payout=${i}, status=${o.status}`,
        );
        try {
          await wallet_1.walletService.credit({
            idempotencyKey: a,
            userId: o.userId,
            walletId: r.id,
            walletType: "SPOT",
            currency: r.currency,
            amount: i,
            operationType: s,
            referenceId: `${e}_payout`,
            description: `Binary order ${o.status}: ${o.symbol}`,
            metadata: {
              orderId: e,
              orderStatus: o.status,
              originalAmount: o.amount,
              profit: o.profit,
            },
            transaction: t,
          });
          console_1.logger.info(
            "BINARY",
            `Successfully credited ${i} ${r.currency} for order ${e}`,
          );
        } catch (r) {
          console_1.logger.error(
            "BINARY",
            `Failed to credit wallet for order ${e}: ${r.message}`,
            r,
          );
          throw r;
        }
      } else
        console_1.logger.info(
          "BINARY",
          `No payout for order ${e}: status=${o.status}, amount=${o.amount}, profit=${o.profit}`,
        );
      const n = await db_1.models.wallet.findOne({
        where: { id: r.id },
        transaction: t,
      });
      await Websocket_1.messageBroker.broadcastToSubscribedClients(
        "/api/finance/wallet",
        { type: "wallet", userId: o.userId, currency: r.currency },
        {
          type: "BALANCE_UPDATED",
          currency: r.currency,
          balance: (null == n ? void 0 : n.balance) || r.balance,
          timestamp: Date.now(),
        },
      );
    }
    if (["WIN", "LOSS", "DRAW"].includes(o.status)) {
      await Websocket_1.messageBroker.broadcastToSubscribedClients(
        "/api/exchange/binary/order",
        { type: "order", symbol: o.symbol, userId: o.userId },
        { type: "ORDER_COMPLETED", order: o },
      );
      const e = await db_1.models.user.findOne({
        where: { id: o.userId },
        transaction: t,
      });
      if (e)
        try {
          (0, emails_1.sendBinaryOrderEmail)(e, o).catch((err) =>
            console_1.logger.error(
              "BINARY",
              `Error sending binary order email asynchronously: ${err.message}`,
            ),
          );
          await (0, notifications_1.createNotification)({
            userId: e.id,
            relatedId: o.id,
            title: "Binary Order Completed",
            message: `Your binary order for ${o.symbol} has been completed with a status of ${o.status}`,
            type: "system",
            link: `/binary?symbol=${encodeURIComponent(o.symbol)}`,
            actions: [
              {
                label: "View Trade",
                link: `/binary?symbol=${encodeURIComponent(o.symbol)}`,
                primary: !0,
              },
            ],
          });
        } catch (r) {
          console_1.logger.error(
            "BINARY",
            `Error sending binary order email for user ${e.id}, order ${o.id}: ${r}`,
          );
        }
    }
  }
  static async updateBinaryOrder(e, r) {
    const order = await db_1.models.binaryOrder.findOne({ where: { id: e } });
    if (!order) {
      console_1.logger.warn(
        "BINARY",
        `Order ${e} not found in updateBinaryOrder. Skipping queue.`,
      );
      return;
    }
    return this.enqueue(order.userId, async () => {
      await db_1.sequelize.transaction(async (t) => {
        await this.updateBinaryOrderWithTransaction(e, r, t);
      });
    });
  }
  static async initializePendingOrders() {
    try {
      const e = await db_1.models.binaryOrder.findAll({
          where: { status: "PENDING" },
        }),
        r = Date.now();
      let t = 0,
        a = 0;
      for (const o of e) {
        let offset = global.otcTimeOffset || 0;
        if (o.symbol.toUpperCase().includes("OTC") && offset === 0) {
          offset = 2645000;
        }
        const adjustedNow = r + (o.symbol.toUpperCase().includes("OTC") ? offset : 0);
        if (new Date(o.closedAt).getTime() <= adjustedNow) {
          await this.processOrder(o.userId, o.id, o.symbol);
          t++;
        } else {
          this.scheduleOrderProcessing(o, o.userId);
          a++;
        }
      }
      console_1.logger.info(
        "BINARY",
        `Initialized pending orders: ${t} processed immediately, ${a} rescheduled`,
      );
    } catch (e) {
      console_1.logger.error(
        "BINARY",
        `Failed to initialize pending orders: ${e.message}`,
      );
    }
  }
  static scheduleOrderProcessing(e, r) {
    const t = Date.now();
    let offset = global.otcTimeOffset || 0;
    if (e.symbol.toUpperCase().includes("OTC") && offset === 0) {
      offset = 2645000;
    }
    const adjustedTime = t + (e.symbol.toUpperCase().includes("OTC") ? offset : 0);
    const a = e.closedAt.getTime() - adjustedTime;
    if (a < 0) {
      console_1.logger.warn(
        "BINARY",
        `Order ${e.id} closedAt is in the past. Processing immediately.`,
      );
      this.processOrder(r, e.id, e.symbol);
      return;
    }
    const o = setTimeout(() => {
      this.processOrder(r, e.id, e.symbol);
    }, a);
    this.orderIntervals.set(e.id, o);
  }
}
exports.BinaryOrderService = BinaryOrderService;
BinaryOrderService.orderIntervals = new Map();
const typeConfig = {
  RISE_FALL: { validSides: ["RISE", "FALL"] },
  HIGHER_LOWER: { validSides: ["HIGHER", "LOWER"], requiresBarrier: !0 },
  TOUCH_NO_TOUCH: { validSides: ["TOUCH", "NO_TOUCH"], requiresBarrier: !0 },
  CALL_PUT: {
    validSides: ["CALL", "PUT"],
    requiresStrikePrice: !0,
    requiresPayoutPerPoint: !0,
  },
  TURBO: {
    validSides: ["UP", "DOWN"],
    requiresBarrier: !0,
    requiresPayoutPerPoint: !0,
    requiresDurationType: ["TIME", "TICKS"],
  },
};
