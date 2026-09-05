/**
 * Abandoning a deposit must never make it uncreditable.
 *
 * The whole risk in this feature is one line in ipn.post.ts:
 *
 *     if (deposit.status !== "PENDING") return { ignored: "already settled" };
 *
 * A trader who was shown an address, copied it, closed the window and paid an
 * hour later has sent real money to an address we issued them. If abandoning
 * had marked that row CANCELLED, their payment would arrive, be signed, be
 * matched to them — and then be silently discarded by our own bookkeeping. So
 * the assertion that matters here is not "abandon works", it is "abandon leaves
 * the row exactly as creditable as it was".
 *
 * Runs against the real database and the real compiled handler. No mocks: a
 * mocked transaction model would happily agree with whatever the code does.
 *
 *   node owned-engine/test-deposit-abandon.mjs
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const envText = readFileSync(join(REPO, ".env"), "utf8");
const readEnv = (k) => (envText.match(new RegExp(`^${k}="?([^"\\n]+)"?`, "m")) || [])[1];

process.env.DB_HOST ||= "127.0.0.1";
process.env.DB_PORT ||= "3306";
process.env.DB_USER ||= "root";
process.env.DB_PASSWORD ||= "";
process.env.DB_NAME ||= "v4_parity";
for (const k of ["APP_ACCESS_TOKEN_SECRET", "REDIS_HOST", "REDIS_PORT", "REDIS_PASSWORD"]) {
  const v = readEnv(k);
  if (v && !process.env[k]) process.env[k] = v;
}

const { setupCompat } = await import("./lib/compat.mjs");
const compat = setupCompat();
const { models } = compat;

const abandon = (await compat.loadHandler("api/finance/deposit/abandon.post")).default;
const status = (await compat.loadHandler("api/finance/deposit/status.get")).default;

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const meta = (row) => {
  try {
    return typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {};
  } catch {
    return {};
  }
};

// Two real users and a real wallet — walletId is NOT NULL, and a fixture that
// invents one would pass here and fail in production.
const owner = await models.user.findOne({ order: [["createdAt", "ASC"]] });
if (!owner) throw new Error("need a user in the database");
/* The impostor need not exist. The route compares the caller's id against the
   deposit's owner and refuses before it touches anything else, so a second real
   account would test nothing extra and would leave a user row behind. */
const other = { id: "11111111-2222-3333-4444-555555555555" };

const wallet = await models.wallet.findOne({ where: { userId: owner.id } })
  || await models.wallet.create({ userId: owner.id, type: "SPOT", currency: "USDT", balance: 0 });

const created = [];
async function openDeposit(status = "PENDING", extra = {}) {
  const row = await models.transaction.create({
    userId: owner.id,
    walletId: wallet.id,
    type: "DEPOSIT",
    status,
    amount: 0,
    fee: 0,
    description: "abandon test",
    metadata: JSON.stringify({ methodId: "USDT_TRC20", payAddress: "TTestAddress", ...extra }),
  });
  created.push(row.id);
  return row;
}

console.log("\nAbandoning a deposit\n");

try {
  /* 1 — the one that matters */
  {
    const d = await openDeposit();
    await abandon({ user: { id: owner.id }, body: { id: d.id } });
    const after = await models.transaction.findByPk(d.id);
    check("status stays PENDING, so a late payment still credits", after.status === "PENDING", `got ${after.status}`);
    check("abandonedAt is recorded", Boolean(meta(after).abandonedAt));
    check("the address is not thrown away", meta(after).payAddress === "TTestAddress");
    check("the method survives for the operator queue", meta(after).methodId === "USDT_TRC20");
  }

  /* 2 — the IPN's own gate, run against an abandoned row */
  {
    const d = await openDeposit();
    await abandon({ user: { id: owner.id }, body: { id: d.id } });
    const after = await models.transaction.findByPk(d.id);
    // This is the exact condition ipn.post.ts:70 evaluates.
    const ipnWouldIgnore = after.status !== "PENDING";
    check("the callback would NOT ignore an abandoned deposit", ipnWouldIgnore === false);
  }

  /* 3 — idempotency: a back-click and a close can both fire */
  {
    const d = await openDeposit();
    const first = await abandon({ user: { id: owner.id }, body: { id: d.id } });
    const at = meta(await models.transaction.findByPk(d.id)).abandonedAt;
    await new Promise((r) => setTimeout(r, 15));
    const second = await abandon({ user: { id: owner.id }, body: { id: d.id } });
    const stillAt = meta(await models.transaction.findByPk(d.id)).abandonedAt;
    check("twice is not an error", first.ok === true && second.ok === true);
    check("the first timestamp is kept", at === stillAt, `${at} -> ${stillAt}`);
  }

  /* 4 — ownership */
  {
    const d = await openDeposit();
    let code = 0;
    try {
      await abandon({ user: { id: other.id }, body: { id: d.id } });
    } catch (e) {
      code = e.statusCode;
    }
    check("someone else's deposit is refused", code === 403, `status ${code}`);
    const after = await models.transaction.findByPk(d.id);
    check("and is left untouched", !meta(after).abandonedAt);
  }

  /* 5 — already settled */
  {
    const d = await openDeposit("COMPLETED");
    const res = await abandon({ user: { id: owner.id }, body: { id: d.id } });
    check("a credited deposit reports its real status", res.status === "COMPLETED", JSON.stringify(res));
    check("and is not stamped abandoned", !meta(await models.transaction.findByPk(d.id)).abandonedAt);
  }

  /* 6 — the calls that arrive from navigation and unload */
  {
    const gone = await abandon({ user: { id: owner.id }, body: { id: "00000000-0000-0000-0000-000000000000" } });
    check("an unknown id is a success, not a 404", gone.ok === true && gone.status === "GONE");

    let code = 0;
    try {
      await abandon({ user: { id: owner.id }, body: {} });
    } catch (e) {
      code = e.statusCode;
    }
    check("a missing id is rejected", code === 400);

    let anonCode = 0;
    try {
      await abandon({ body: { id: "whatever" } });
    } catch (e) {
      anonCode = e.statusCode;
    }
    check("an anonymous caller is rejected", anonCode === 401);
  }

  /* 7 — a non-deposit row must not be reachable through this route */
  {
    const trade = await models.transaction.create({
      userId: owner.id,
      walletId: wallet.id,
      type: "BINARY_ORDER",
      status: "PENDING",
      amount: 10,
      fee: 0,
      description: "abandon test — not a deposit",
    });
    created.push(trade.id);
    const res = await abandon({ user: { id: owner.id }, body: { id: trade.id } });
    check("a binary order is not abandonable as a deposit", res.status === "GONE");
    const after = await models.transaction.findByPk(trade.id);
    check("and the order is untouched", after.status === "PENDING" && !meta(after).abandonedAt);
  }
  /* ── The status endpoint the payment screen polls ── */
  console.log("\nPolling a deposit's progress\n");

  /* 8 — the ordinary case: nothing has happened yet */
  {
    const d = await openDeposit();
    const res = await status({ user: { id: owner.id }, query: { id: d.id } });
    check("a fresh deposit reads PENDING", res.status === "PENDING", res.status);
    check("no balance is read while pending", res.balance === null);
    check("no payment progress yet", res.paymentStatus === null);
  }

  /* 9 — the processor has seen it but it is not confirmed */
  {
    const d = await openDeposit("PENDING", { paymentStatus: "confirming" });
    const res = await status({ user: { id: owner.id }, query: { id: d.id } });
    check("progress is reported so the screen can say 'confirming'", res.paymentStatus === "confirming");
    check("and it is still not credited", res.status === "PENDING");
  }

  /* 10 — credited: the case the success screen is built on */
  {
    const d = await openDeposit("PENDING", { depositAmount: 15, bonusAmount: 1.5 });
    await d.update({ status: "COMPLETED", amount: 16.5 });
    const res = await status({ user: { id: owner.id }, query: { id: d.id } });
    check("a credited deposit reads COMPLETED", res.status === "COMPLETED");
    check("the credited figure is what reached the balance", res.credited === 16.5, String(res.credited));
    check("the deposit and bonus are separable", res.depositAmount === 15 && res.bonusAmount === 1.5);
    check("the new balance is returned", typeof res.balance === "number", String(res.balance));
    check("in the balance currency", res.currency === "USDT", res.currency);
  }

  /* 11 — an abandoned deposit that was paid anyway still reports COMPLETED */
  {
    const d = await openDeposit();
    await abandon({ user: { id: owner.id }, body: { id: d.id } });
    await d.update({ status: "COMPLETED", amount: 20 });
    const res = await status({ user: { id: owner.id }, query: { id: d.id } });
    check("abandoning does not hide a later credit", res.status === "COMPLETED" && res.credited === 20);
  }

  /* 12 — it must not become a way to read other people's deposits */
  {
    const d = await openDeposit();
    let code = 0;
    try {
      await status({ user: { id: other.id }, query: { id: d.id } });
    } catch (e) {
      code = e.statusCode;
    }
    check("someone else's deposit is refused", code === 403, `status ${code}`);

    let anonCode = 0;
    try {
      await status({ query: { id: d.id } });
    } catch (e) {
      anonCode = e.statusCode;
    }
    check("an anonymous caller is refused", anonCode === 401);

    let missingCode = 0;
    try {
      await status({ user: { id: owner.id }, query: { id: "00000000-0000-0000-0000-000000000000" } });
    } catch (e) {
      missingCode = e.statusCode;
    }
    check("an unknown deposit is a 404", missingCode === 404, `status ${missingCode}`);
  }

  /* 13 — polling must never be what moves money */
  {
    const d = await openDeposit();
    const before = await models.transaction.findByPk(d.id);
    for (let i = 0; i < 5; i++) await status({ user: { id: owner.id }, query: { id: d.id } });
    const after = await models.transaction.findByPk(d.id);
    check(
      "five polls change nothing about the deposit",
      after.status === before.status && Number(after.amount) === Number(before.amount)
    );
  }
} finally {
  if (created.length) {
    await models.transaction.destroy({ where: { id: created } });
    console.log(`\n  (cleaned up ${created.length} test rows)`);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
