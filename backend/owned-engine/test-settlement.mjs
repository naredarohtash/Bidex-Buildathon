/**
 * Tests for the binary options settlement engine.
 * Run: node backend/owned-engine/test-settlement.mjs
 */

import { strict as assert } from "node:assert";

import {
  TYPE_CONFIG,
  calculateCumulativeProfitAdjustment,
  determineRiseFallStatus,
  determineHigherLowerStatus,
  determineTouchNoTouchStatus,
  determineCallPutStatus,
  determineTurboStatus,
  determineOrderStatus,
  computePayout,
  validateCreateOrderInput,
  computeCancelPenalty,
  checkBarrierTouched,
  checkTurboBarrierBreach,
  createSettlementService,
} from "./lib/settlement-engine.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ─── TYPE_CONFIG ────────────────────────────────────────────────────────────

console.log("\n— TYPE_CONFIG —");

test("has all 5 order types", () => {
  const types = Object.keys(TYPE_CONFIG);
  assert.deepStrictEqual(types.sort(), ["CALL_PUT", "HIGHER_LOWER", "RISE_FALL", "TOUCH_NO_TOUCH", "TURBO"]);
});

test("RISE_FALL has RISE and FALL sides", () => {
  assert.deepStrictEqual(TYPE_CONFIG.RISE_FALL.validSides, ["RISE", "FALL"]);
});

test("TURBO requires barrier, payoutPerPoint, and durationType", () => {
  assert.ok(TYPE_CONFIG.TURBO.requiresBarrier);
  assert.ok(TYPE_CONFIG.TURBO.requiresPayoutPerPoint);
  assert.deepStrictEqual(TYPE_CONFIG.TURBO.requiresDurationType, ["TIME", "TICKS"]);
});

// ─── calculateCumulativeProfitAdjustment ────────────────────────────────────

console.log("\n— calculateCumulativeProfitAdjustment —");

test("returns 0 for no settings", () => {
  assert.strictEqual(calculateCumulativeProfitAdjustment(null, 5, "RISE_FALL"), 0);
});

test("returns 0 for empty adjustments", () => {
  assert.strictEqual(calculateCumulativeProfitAdjustment({ profitAdjustments: [] }, 5, "RISE_FALL"), 0);
});

test("accumulates adjustments up to the duration", () => {
  const settings = {
    profitAdjustments: [
      { minDuration: 0, adjustment: -10, orderTypes: ["RISE_FALL"] },
      { minDuration: 5, adjustment: 5, orderTypes: ["RISE_FALL"] },
      { minDuration: 15, adjustment: 3, orderTypes: ["RISE_FALL"] },
    ],
  };
  assert.strictEqual(calculateCumulativeProfitAdjustment(settings, 10, "RISE_FALL"), -5); // -10 + 5
  assert.strictEqual(calculateCumulativeProfitAdjustment(settings, 20, "RISE_FALL"), -2); // -10 + 5 + 3
});

test("skips adjustments for non-matching order types", () => {
  const settings = {
    profitAdjustments: [
      { minDuration: 0, adjustment: -10, orderTypes: ["HIGHER_LOWER"] },
      { minDuration: 0, adjustment: 5, orderTypes: ["RISE_FALL"] },
    ],
  };
  assert.strictEqual(calculateCumulativeProfitAdjustment(settings, 10, "RISE_FALL"), 5);
});

// ─── determineRiseFallStatus ────────────────────────────────────────────────

console.log("\n— determineRiseFallStatus —");

test("RISE + close > entry → WIN", () => {
  const r = determineRiseFallStatus({ price: 100, amount: 50, side: "RISE", profitPercentage: 85 }, 105);
  assert.strictEqual(r.status, "WIN");
  assert.strictEqual(r.profit, 42.5);
});

test("RISE + close < entry → LOSS", () => {
  const r = determineRiseFallStatus({ price: 100, amount: 50, side: "RISE" }, 95);
  assert.strictEqual(r.status, "LOSS");
  assert.strictEqual(r.profit, 0);
});

test("FALL + close < entry → WIN", () => {
  const r = determineRiseFallStatus({ price: 100, amount: 50, side: "FALL", profitPercentage: 90 }, 95);
  assert.strictEqual(r.status, "WIN");
  assert.strictEqual(r.profit, 45);
});

test("close === entry → DRAW", () => {
  const r = determineRiseFallStatus({ price: 100, amount: 50, side: "RISE" }, 100);
  assert.strictEqual(r.status, "DRAW");
  assert.strictEqual(r.profit, 0);
});

test("defaults to 85% profit when profitPercentage missing", () => {
  const r = determineRiseFallStatus({ price: 100, amount: 100, side: "RISE" }, 110);
  assert.strictEqual(r.profit, 85);
});

// ─── determineHigherLowerStatus ─────────────────────────────────────────────

console.log("\n— determineHigherLowerStatus —");

test("HIGHER + close > barrier → WIN", () => {
  const r = determineHigherLowerStatus({ price: 100, barrier: 105, amount: 50, side: "HIGHER", profitPercentage: 80 }, 110);
  assert.strictEqual(r.status, "WIN");
  assert.strictEqual(r.profit, 40);
});

test("LOWER + close < barrier → WIN", () => {
  const r = determineHigherLowerStatus({ price: 100, barrier: 95, amount: 50, side: "LOWER", profitPercentage: 80 }, 90);
  assert.strictEqual(r.status, "WIN");
});

test("uses price as fallback when no barrier", () => {
  const r = determineHigherLowerStatus({ price: 100, amount: 50, side: "HIGHER", profitPercentage: 80 }, 105);
  assert.strictEqual(r.status, "WIN");
});

// ─── determineTouchNoTouchStatus ────────────────────────────────────────────

console.log("\n— determineTouchNoTouchStatus —");

test("TOUCH + barrier touched → WIN", () => {
  const r = determineTouchNoTouchStatus({ amount: 50, side: "TOUCH", profitPercentage: 85 }, true);
  assert.strictEqual(r.status, "WIN");
  assert.strictEqual(r.profit, 42.5);
});

test("TOUCH + barrier not touched → LOSS", () => {
  const r = determineTouchNoTouchStatus({ amount: 50, side: "TOUCH" }, false);
  assert.strictEqual(r.status, "LOSS");
});

test("NO_TOUCH + barrier not touched → WIN", () => {
  const r = determineTouchNoTouchStatus({ amount: 50, side: "NO_TOUCH", profitPercentage: 85 }, false);
  assert.strictEqual(r.status, "WIN");
});

test("NO_TOUCH + barrier touched → LOSS", () => {
  const r = determineTouchNoTouchStatus({ amount: 50, side: "NO_TOUCH" }, true);
  assert.strictEqual(r.status, "LOSS");
});

// ─── determineCallPutStatus ─────────────────────────────────────────────────

console.log("\n— determineCallPutStatus —");

test("CALL + close > strikePrice → WIN", () => {
  const r = determineCallPutStatus({ price: 100, strikePrice: 102, amount: 50, side: "CALL", profitPercentage: 85 }, 105);
  assert.strictEqual(r.status, "WIN");
});

test("PUT + close < strikePrice → WIN", () => {
  const r = determineCallPutStatus({ price: 100, strikePrice: 98, amount: 50, side: "PUT", profitPercentage: 85 }, 95);
  assert.strictEqual(r.status, "WIN");
});

test("uses barrier as fallback when no strikePrice", () => {
  const r = determineCallPutStatus({ price: 100, barrier: 103, amount: 50, side: "CALL", profitPercentage: 85 }, 105);
  assert.strictEqual(r.status, "WIN");
});

// ─── determineTurboStatus ───────────────────────────────────────────────────

console.log("\n— determineTurboStatus —");

test("barrier breached → instant LOSS", () => {
  const r = determineTurboStatus({ price: 100, barrier: 95, amount: 50, side: "UP", payoutPerPoint: 10 }, 110, true);
  assert.strictEqual(r.status, "LOSS");
  assert.strictEqual(r.profit, -50);
});

test("UP + positive spread → WIN", () => {
  const r = determineTurboStatus({ price: 100, barrier: 100, amount: 50, side: "UP", payoutPerPoint: 10 }, 110, false);
  // rawProfit = (110 - 100) * 10 = 100; net = 100 - 50 = 50
  assert.strictEqual(r.status, "WIN");
  assert.strictEqual(r.profit, 50);
});

test("DOWN + price drops below barrier → WIN", () => {
  const r = determineTurboStatus({ price: 100, barrier: 100, amount: 50, side: "DOWN", payoutPerPoint: 10 }, 90, false);
  // rawProfit = (100 - 90) * 10 = 100; net = 100 - 50 = 50
  assert.strictEqual(r.status, "WIN");
  assert.strictEqual(r.profit, 50);
});

test("net profit === 0 → DRAW", () => {
  const r = determineTurboStatus({ price: 100, barrier: 100, amount: 50, side: "UP", payoutPerPoint: 10 }, 105, false);
  // rawProfit = 5 * 10 = 50; net = 50 - 50 = 0
  assert.strictEqual(r.status, "DRAW");
  assert.strictEqual(r.profit, 0);
});

test("negative net profit → LOSS (partial)", () => {
  const r = determineTurboStatus({ price: 100, barrier: 100, amount: 50, side: "UP", payoutPerPoint: 10 }, 102, false);
  // rawProfit = 2 * 10 = 20; net = 20 - 50 = -30
  assert.strictEqual(r.status, "LOSS");
  assert.strictEqual(r.profit, -30);
});

// ─── determineOrderStatus dispatcher ────────────────────────────────────────

console.log("\n— determineOrderStatus —");

test("dispatches RISE_FALL", () => {
  const r = determineOrderStatus({ type: "RISE_FALL", price: 100, amount: 50, side: "RISE", profitPercentage: 85 }, 110, false, false);
  assert.strictEqual(r.status, "WIN");
});

test("dispatches TOUCH_NO_TOUCH", () => {
  const r = determineOrderStatus({ type: "TOUCH_NO_TOUCH", amount: 50, side: "TOUCH", profitPercentage: 85 }, 0, true, false);
  assert.strictEqual(r.status, "WIN");
});

test("unknown type → ERROR", () => {
  const r = determineOrderStatus({ type: "UNKNOWN" }, 100, false, false);
  assert.strictEqual(r.status, "ERROR");
});

// ─── computePayout ──────────────────────────────────────────────────────────

console.log("\n— computePayout —");

test("WIN → amount + profit", () => {
  const p = computePayout({ status: "WIN", amount: 100, profit: 85 });
  assert.strictEqual(p.payoutAmount, 185);
  assert.strictEqual(p.operationType, "BINARY_ORDER_WIN");
});

test("LOSS with 0 profit → no payout", () => {
  const p = computePayout({ status: "LOSS", amount: 100, profit: 0 });
  assert.strictEqual(p.payoutAmount, 0);
});

test("LOSS with negative profit (turbo) but positive payout → partial", () => {
  const p = computePayout({ status: "LOSS", amount: 100, profit: -30 });
  assert.strictEqual(p.payoutAmount, 70);
  assert.strictEqual(p.operationType, "BINARY_ORDER_LOSS");
});

test("LOSS with profit draining full amount → no payout", () => {
  const p = computePayout({ status: "LOSS", amount: 50, profit: -50 });
  assert.strictEqual(p.payoutAmount, 0);
});

test("DRAW → refund amount", () => {
  const p = computePayout({ status: "DRAW", amount: 100, profit: 0 });
  assert.strictEqual(p.payoutAmount, 100);
  assert.strictEqual(p.operationType, "REFUND");
});

// ─── validateCreateOrderInput ───────────────────────────────────────────────

console.log("\n— validateCreateOrderInput —");

test("valid RISE_FALL passes", () => {
  const errs = validateCreateOrderInput({ type: "RISE_FALL", side: "RISE", amount: 50 });
  assert.strictEqual(errs.length, 0);
});

test("invalid type", () => {
  const errs = validateCreateOrderInput({ type: "NOPE", side: "RISE", amount: 50 });
  assert.ok(errs.some((e) => e.includes("Invalid order type")));
});

test("wrong side for type", () => {
  const errs = validateCreateOrderInput({ type: "RISE_FALL", side: "CALL", amount: 50 });
  assert.ok(errs.some((e) => e.includes("Invalid side")));
});

test("HIGHER_LOWER requires barrier", () => {
  const errs = validateCreateOrderInput({ type: "HIGHER_LOWER", side: "HIGHER", amount: 50 });
  assert.ok(errs.some((e) => e.includes("barrier")));
});

test("TURBO requires barrier, payoutPerPoint, durationType", () => {
  const errs = validateCreateOrderInput({ type: "TURBO", side: "UP", amount: 50 });
  assert.ok(errs.some((e) => e.includes("barrier")));
  assert.ok(errs.some((e) => e.includes("payoutPerPoint")));
  assert.ok(errs.some((e) => e.includes("durationType")));
});

test("TURBO with valid durationType passes", () => {
  const errs = validateCreateOrderInput({ type: "TURBO", side: "UP", amount: 50, barrier: 100, payoutPerPoint: 10, durationType: "TIME" });
  assert.strictEqual(errs.length, 0);
});

test("negative amount fails", () => {
  const errs = validateCreateOrderInput({ type: "RISE_FALL", side: "RISE", amount: -10 });
  assert.ok(errs.some((e) => e.includes("amount")));
});

// ─── computeCancelPenalty ───────────────────────────────────────────────────

console.log("\n— computeCancelPenalty —");

test("cancellation disabled → null", () => {
  assert.strictEqual(computeCancelPenalty({ cancelation: { enabled: false } }, 120), null);
});

test("too close to expiry → null", () => {
  assert.strictEqual(computeCancelPenalty({ cancelation: { enabled: true, minTimeBeforeExpiry: 30 } }, 15), null);
});

test("> 60s → above60s tier", () => {
  const settings = { cancelation: { enabled: true, minTimeBeforeExpiry: 10, penaltyTiers: { above60s: 5, above30s: 10, below30s: 20 } } };
  assert.strictEqual(computeCancelPenalty(settings, 90), 5);
});

test("31-60s → above30s tier", () => {
  const settings = { cancelation: { enabled: true, minTimeBeforeExpiry: 10, penaltyTiers: { above60s: 5, above30s: 10, below30s: 20 } } };
  assert.strictEqual(computeCancelPenalty(settings, 45), 10);
});

test("< 30s → below30s tier", () => {
  const settings = { cancelation: { enabled: true, minTimeBeforeExpiry: 10, penaltyTiers: { above60s: 5, above30s: 10, below30s: 20 } } };
  assert.strictEqual(computeCancelPenalty(settings, 25), 20);
});

// ─── checkBarrierTouched ────────────────────────────────────────────────────

console.log("\n— checkBarrierTouched —");

test("no candles → false", () => {
  assert.strictEqual(checkBarrierTouched([], 100), false);
});

test("barrier within candle range → true", () => {
  const candles = [[0, 98, 102, 97, 101, 1000]]; // [ts, open, high, low, close, vol]
  assert.strictEqual(checkBarrierTouched(candles, 100), true);
});

test("barrier outside all candles → false", () => {
  const candles = [[0, 98, 99, 97, 98.5, 1000]];
  assert.strictEqual(checkBarrierTouched(candles, 105), false);
});

// ─── checkTurboBarrierBreach ────────────────────────────────────────────────

console.log("\n— checkTurboBarrierBreach —");

test("UP side + low <= barrier → breached", () => {
  const candles = [[0, 100, 102, 94, 96, 1000]];
  assert.strictEqual(checkTurboBarrierBreach(candles, 95, "UP"), true);
});

test("DOWN side + high >= barrier → breached", () => {
  const candles = [[0, 100, 106, 99, 105, 1000]];
  assert.strictEqual(checkTurboBarrierBreach(candles, 105, "DOWN"), true);
});

test("no breach → false", () => {
  const candles = [[0, 100, 102, 99, 101, 1000]];
  assert.strictEqual(checkTurboBarrierBreach(candles, 95, "UP"), false);
});

// ─── createSettlementService (integration with mocks) ───────────────────────

console.log("\n— createSettlementService —");

function makeMockDeps(overrides = {}) {
  const credited = [];
  const updated = [];
  const broadcasted = [];
  const notified = [];

  const mockOrder = {
    id: "order-1", userId: "user-1", symbol: "BTC/USDT", price: 50000,
    amount: 100, profit: 0, side: "RISE", type: "RISE_FALL",
    profitPercentage: 85, status: "PENDING", isDemo: false,
    closedAt: new Date("2025-01-01T01:00:00Z"), createdAt: new Date("2025-01-01T00:00:00Z"),
    closePrice: null, barrier: null, strikePrice: null, payoutPerPoint: null,
  };

  const orders = new Map([["order-1", { ...mockOrder }]]);
  const wallets = new Map([["wallet-1", { id: "wallet-1", balance: 1000, currency: "USDT" }]]);

  return {
    deps: {
      models: {
        binaryOrder: {
          findOne: async ({ where }) => {
            const o = orders.get(where.id);
            return o && (!where.userId || o.userId === where.userId) && (!where.status || o.status === where.status) ? { ...o } : null;
          },
          findAll: async ({ where }) => {
            return [...orders.values()].filter((o) => o.status === where.status);
          },
          update: async (data, { where }) => {
            const o = orders.get(where.id);
            if (o) { Object.assign(o, data); updated.push({ id: where.id, ...data }); }
          },
        },
        wallet: {
          findOne: async ({ where }) => {
            if (where.id) return wallets.get(where.id) || null;
            return { id: "wallet-1", balance: 1000, currency: "USDT" };
          },
        },
        transaction: {
          findOne: async () => ({ id: "tx-1", walletId: "wallet-1" }),
          update: async () => {},
        },
        user: {
          findOne: async () => ({ id: "user-1", email: "test@test.com" }),
        },
      },
      sequelize: {
        transaction: async (fn) => {
          const t = { LOCK: { UPDATE: "UPDATE" } };
          return fn(t);
        },
        literal: (s) => s,
        Sequelize: { Op: { lte: Symbol("lte"), and: Symbol("and") } },
      },
      walletService: {
        credit: async (opts) => { credited.push(opts); },
      },
      messageBroker: {
        broadcastToSubscribedClients: async (...args) => { broadcasted.push(args); },
      },
      sendBinaryOrderEmail: async () => {},
      createNotification: async (opts) => { notified.push(opts); },
      createError: ({ statusCode, message }) => { const e = new Error(message); e.statusCode = statusCode; return e; },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      getSettings: async () => ({
        cancelation: { enabled: true, minTimeBeforeExpiry: 10, penaltyTiers: { above60s: 5, above30s: 10, below30s: 20 } },
      }),
      fetchClosePrice: async () => 51000,
      fetchOHLCV: async () => [],
      ...overrides,
    },
    state: { orders, wallets, credited, updated, broadcasted, notified },
  };
}

await testAsync("processOrder settles a RISE_FALL WIN", async () => {
  const { deps, state } = makeMockDeps();
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");
  const order = state.orders.get("order-1");
  assert.strictEqual(order.status, "WIN");
  assert.strictEqual(order.profit, 85);
  assert.strictEqual(order.closePrice, 51000);
  assert.strictEqual(state.credited.length, 1);
  assert.strictEqual(state.credited[0].amount, 185); // 100 + 85
});

await testAsync("processOrder settles a LOSS when close < entry", async () => {
  const { deps, state } = makeMockDeps({ fetchClosePrice: async () => 49000 });
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");
  const order = state.orders.get("order-1");
  assert.strictEqual(order.status, "LOSS");
  assert.strictEqual(state.credited.length, 0);
});

await testAsync("processOrder settles a DRAW when close === entry", async () => {
  const { deps, state } = makeMockDeps({ fetchClosePrice: async () => 50000 });
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");
  const order = state.orders.get("order-1");
  assert.strictEqual(order.status, "DRAW");
  assert.strictEqual(state.credited.length, 1);
  assert.strictEqual(state.credited[0].amount, 100); // refund
});

await testAsync("processOrder ERROR when close price unavailable", async () => {
  const { deps, state } = makeMockDeps({ fetchClosePrice: async () => null });
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");
  assert.strictEqual(state.orders.get("order-1").status, "ERROR");
});

await testAsync("demo orders skip wallet credit", async () => {
  const { deps, state } = makeMockDeps();
  state.orders.get("order-1").isDemo = true;
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");
  assert.strictEqual(state.orders.get("order-1").status, "WIN");
  assert.strictEqual(state.credited.length, 0);
});

// A demo trade moves no money, but the terminal still has to be told it
// resolved — that broadcast is what draws the result and fires the toast.
await testAsync("demo orders still broadcast ORDER_COMPLETED", async () => {
  const { deps, state } = makeMockDeps();
  state.orders.get("order-1").isDemo = true;
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");

  const completed = state.broadcasted.filter(
    ([route, , payload]) =>
      route === "/api/exchange/binary/order" && payload?.type === "ORDER_COMPLETED"
  );
  assert.strictEqual(completed.length, 1);
  assert.deepStrictEqual(completed[0][1], {
    type: "order",
    symbol: "BTC/USDT",
    userId: "user-1",
  });

  // No wallet balance broadcast — demo touches no wallet.
  const balance = state.broadcasted.filter(([route]) => route === "/api/finance/wallet");
  assert.strictEqual(balance.length, 0);
});

await testAsync("real orders broadcast balance AND completion", async () => {
  const { deps, state } = makeMockDeps();
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");

  const routes = state.broadcasted.map(([route]) => route);
  assert.ok(routes.includes("/api/finance/wallet"));
  assert.ok(routes.includes("/api/exchange/binary/order"));
});

await testAsync("processOrder queries transaction by referenceId first", async () => {
  const queries = [];
  const { deps, state } = makeMockDeps();
  deps.models.transaction.findOne = async ({ where }) => {
    queries.push(where);
    if (where.referenceId === "order-1") {
      return { id: "tx-1", walletId: "wallet-1" };
    }
    return null;
  };
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");

  assert.strictEqual(queries.length, 1);
  assert.strictEqual(queries[0].referenceId, "order-1");
  assert.strictEqual(state.credited.length, 1);
});

await testAsync("processOrder queries transaction by metadata fallback if referenceId not found", async () => {
  const queries = [];
  const { deps, state } = makeMockDeps();
  deps.models.transaction.findOne = async ({ where }) => {
    queries.push(where);
    if (where.referenceId === "order-1") {
      return null;
    }
    return { id: "tx-legacy", walletId: "wallet-1" };
  };
  const svc = createSettlementService(deps);
  await svc.processOrder("user-1", "order-1", "BTC/USDT");

  assert.strictEqual(queries.length, 2);
  assert.strictEqual(queries[0].referenceId, "order-1");
  assert.ok(queries[1].userId === "user-1");
  assert.strictEqual(state.credited.length, 1);
});

// ─── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
