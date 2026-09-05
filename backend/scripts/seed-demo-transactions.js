/**
 * Ten deposits and withdrawals on the Super Admin account, for local work only.
 *
 * The transactions panel is one of the harder screens to develop against,
 * because a fresh database gives it nothing to draw: no month groups, no
 * summary strip, no failed row to open, no pending withdrawal to cancel. The
 * only rows a local account accumulates on its own are binary settlements, and
 * the panel deliberately excludes those — so it renders its empty state
 * forever, and every change to it has to be checked on the live server against
 * somebody's real money.
 *
 * These ten cover what the panel actually has to handle:
 *
 *   - both directions, so the summary strip has an in, an out and a net;
 *   - two calendar months, so the rows group and each group's header counts;
 *   - COMPLETED, PENDING, FAILED, EXPIRED, REJECTED and CANCELLED, which is
 *     every one of the three status tones plus the "in flight" branch;
 *   - a pending WITHDRAW, which is the single state that shows the cancel
 *     control, and the only way to exercise it without a real payout;
 *   - a deposit whose amount is still 0 with a `claimedAmount` beside it,
 *     which is the shape a crypto gateway leaves behind before it confirms;
 *   - the metadata the detail panel curates — deposit address, payment id,
 *     bonus code, tx hash — including one row with a bonus code, because that
 *     field only ever appears on some rows and is easy to break unnoticed;
 *   - `asset` and `network` alongside `chain`, so the row draws its coin with
 *     the right chain badge. A USDT row with no badge is the one thing that
 *     mark exists to prevent: USDT on Tron and USDT on Ethereum are two
 *     different places to send money.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 *
 * It does not move money. Not one of these rows touches `wallet.balance`, so
 * the account's balance stays whatever trading left it at. A seeded COMPLETED
 * deposit is a drawing of a deposit; crediting it would leave the ledger and
 * the wallet telling different stories the moment anybody re-ran the script,
 * and this exists to fill a screen, not to test accounting.
 *
 * ── Re-running it ─────────────────────────────────────────────────────────
 *
 * Every row it writes is stamped `metadata.demoSeed`, and a run deletes its own
 * previous rows before inserting. Run it as often as you like; it will not
 * stack up duplicates, and it can never delete a real transaction, because the
 * stamp is the only thing it matches on.
 *
 *   node backend/scripts/seed-demo-transactions.js
 *   node backend/scripts/seed-demo-transactions.js --clean   (remove, seed nothing)
 *
 * It refuses to run against anything but a local database. Pass --force if you
 * genuinely mean to point it elsewhere, and read that sentence again first.
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

for (const candidate of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../.env"),
]) {
  if (fs.existsSync(candidate)) {
    require("dotenv").config({ path: candidate });
    break;
  }
}

/* The one string that says a row came from here. Matched with a LIKE against
   the metadata JSON, so it has to be distinctive enough that it cannot occur
   in a gateway's own payload. */
const STAMP = "bidex-local-demo";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", ""];
const force = process.argv.includes("--force");
const cleanOnly = process.argv.includes("--clean");

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms);

const hex = (n) => crypto.randomBytes(n).toString("hex");
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
/* Not a real address on any chain — 34 base58-ish characters after the T, which
   is the shape the UI truncates and the copy button lifts. */
const tronAddress = () =>
  "T" + crypto.randomBytes(25).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 33);

/**
 * The ten rows.
 *
 * `amount` is what the ledger booked, which is 0 on a deposit nothing has
 * confirmed yet — `claimedAmount` in metadata carries what the person said they
 * sent, and the panel falls back to it. `fee` is only ever set on withdrawals
 * here: whether a deposit fee is taken off the top is the gateway's convention,
 * and inventing one would put a number in front of a trader that no gateway
 * agreed to.
 */
function rows() {
  return [
    {
      key: "deposit-completed-recent",
      type: "DEPOSIT",
      status: "COMPLETED",
      amount: 500,
      fee: 0,
      createdAt: ago(2 * DAY),
      updatedAt: ago(2 * DAY - 6 * MINUTE),
      description: "Tether (USDT) deposit via Tron (TRC-20)",
      referenceId: digits(10),
      trxId: hex(32),
      metadata: { asset: "USDT", networkLabel: "Tron (TRC-20)", chain: "TRX", network: "TRX", payAddress: tronAddress(), paymentId: digits(10) },
    },
    {
      key: "deposit-completed-large",
      type: "DEPOSIT",
      status: "COMPLETED",
      amount: 1250,
      fee: 0,
      createdAt: ago(9 * DAY),
      updatedAt: ago(9 * DAY - 11 * MINUTE),
      description: "Tether (USDT) deposit via BNB Smart Chain (BEP-20)",
      referenceId: digits(10),
      trxId: "0x" + hex(32),
      metadata: { asset: "USDT", networkLabel: "BNB Smart Chain (BEP-20)", chain: "BSC", network: "BSC", payAddress: "0x" + hex(20), paymentId: digits(10) },
    },
    {
      key: "deposit-pending",
      type: "DEPOSIT",
      status: "PENDING",
      /* Nothing confirmed, so nothing booked. The panel reads claimedAmount. */
      amount: 0,
      fee: 0,
      createdAt: ago(40 * MINUTE),
      updatedAt: ago(38 * MINUTE),
      description: "Tether (USDT) deposit via Tron (TRC-20)",
      referenceId: digits(10),
      trxId: null,
      metadata: { asset: "USDT", networkLabel: "Tron (TRC-20)", chain: "TRX", network: "TRX", payAddress: tronAddress(), paymentId: digits(10), claimedAmount: 300 },
    },
    {
      key: "deposit-failed-with-bonus",
      type: "DEPOSIT",
      status: "FAILED",
      amount: 100,
      fee: 0,
      createdAt: ago(5 * DAY),
      updatedAt: ago(5 * DAY - 10 * MINUTE),
      description: "Tether (USDT) deposit via Tron (TRC-20)",
      referenceId: digits(10),
      trxId: null,
      /* The one row carrying a bonus code: that field is conditional in the
         detail grid, so without it here the branch never renders locally. */
      metadata: { asset: "USDT", networkLabel: "Tron (TRC-20)", chain: "TRX", network: "TRX", payAddress: tronAddress(), paymentId: digits(10), bonusCode: "TEST50" },
    },
    {
      key: "deposit-expired",
      type: "DEPOSIT",
      status: "EXPIRED",
      amount: 250,
      fee: 0,
      createdAt: ago(14 * DAY),
      updatedAt: ago(14 * DAY - 30 * MINUTE),
      description: "Tether (USDT) deposit via Ethereum (ERC-20)",
      referenceId: digits(10),
      trxId: null,
      metadata: { asset: "USDT", networkLabel: "Ethereum (ERC-20)", chain: "ETH", network: "ETH", payAddress: "0x" + hex(20), paymentId: digits(10) },
    },
    {
      key: "withdraw-completed-recent",
      type: "WITHDRAW",
      status: "COMPLETED",
      amount: 400,
      fee: 1.5,
      createdAt: ago(3 * DAY),
      updatedAt: ago(3 * DAY - 22 * MINUTE),
      description: "Tether (USDT) withdrawal via Tron (TRC-20)",
      referenceId: digits(10),
      trxId: hex(32),
      metadata: { asset: "USDT", networkLabel: "Tron (TRC-20)", chain: "TRX", network: "TRX", address: tronAddress() },
    },
    {
      key: "withdraw-pending-cancellable",
      type: "WITHDRAW",
      status: "PENDING",
      /* Exactly PENDING. The cancel control in the expanded row appears for this
         status and no other, and this is the row it exists to be tried on. */
      amount: 750,
      fee: 1.5,
      createdAt: ago(20 * MINUTE),
      updatedAt: ago(20 * MINUTE),
      description: "Tether (USDT) withdrawal via Tron (TRC-20)",
      referenceId: digits(10),
      trxId: null,
      metadata: { asset: "USDT", networkLabel: "Tron (TRC-20)", chain: "TRX", network: "TRX", address: tronAddress() },
    },
    {
      key: "withdraw-rejected",
      type: "WITHDRAW",
      status: "REJECTED",
      amount: 2000,
      fee: 0,
      createdAt: ago(7 * DAY),
      updatedAt: ago(7 * DAY - 4 * 60 * MINUTE),
      description: "Tether (USDT) withdrawal via BNB Smart Chain (BEP-20)",
      referenceId: digits(10),
      trxId: null,
      metadata: { asset: "USDT", networkLabel: "BNB Smart Chain (BEP-20)", chain: "BSC", network: "BSC", address: "0x" + hex(20) },
    },
    {
      key: "withdraw-cancelled",
      type: "WITHDRAW",
      status: "CANCELLED",
      amount: 120,
      fee: 1.5,
      createdAt: ago(11 * DAY),
      updatedAt: ago(11 * DAY - 45 * MINUTE),
      description: "Tether (USDT) withdrawal via Tron (TRC-20)",
      referenceId: digits(10),
      trxId: null,
      metadata: { asset: "USDT", networkLabel: "Tron (TRC-20)", chain: "TRX", network: "TRX", address: tronAddress() },
    },
    {
      key: "withdraw-completed-old",
      type: "WITHDRAW",
      status: "COMPLETED",
      /* Three weeks back on purpose: it lands in the previous calendar month, so
         the ledger renders two month groups instead of one. */
      amount: 90,
      fee: 1.5,
      createdAt: ago(21 * DAY),
      updatedAt: ago(21 * DAY - 18 * MINUTE),
      description: "Tether (USDT) withdrawal via Tron (TRC-20)",
      referenceId: digits(10),
      trxId: hex(32),
      metadata: { asset: "USDT", networkLabel: "Tron (TRC-20)", chain: "TRX", network: "TRX", address: tronAddress() },
    },
  ];
}

(async () => {
  const host = String(process.env.DB_HOST || "").toLowerCase();
  if (!LOCAL_HOSTS.includes(host) && !force) {
    console.error(`Refusing to run: DB_HOST is "${process.env.DB_HOST}", which is not a local database.`);
    console.error("This writes fake deposits and withdrawals. Pass --force only if that is what you want.");
    process.exit(1);
  }

  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    /* By role, not by email. "superadmin@example.com" is a seed default that any
       given database may well have been set up without. */
    const [admins] = await connection.query(
      "SELECT u.id, u.email FROM user u JOIN role r ON r.id = u.roleId WHERE r.name = 'Super Admin' LIMIT 1"
    );
    if (admins.length === 0) {
      console.error("No user holds the 'Super Admin' role in this database — nothing to seed.");
      process.exit(1);
    }
    const admin = admins[0];

    /* Deposits and withdrawals are money in and out of a spendable wallet, and
       the panel prints the wallet's own currency beside every figure. Prefer the
       SPOT wallet the account actually trades from. */
    const [wallets] = await connection.query(
      "SELECT id, type, currency FROM wallet WHERE userId = ? ORDER BY FIELD(type, 'SPOT', 'ECO', 'FIAT'), currency",
      [admin.id]
    );
    if (wallets.length === 0) {
      console.error(`${admin.email} has no wallet — a transaction has to belong to one. Nothing seeded.`);
      process.exit(1);
    }
    const wallet = wallets[0];

    const [removed] = await connection.query(
      "DELETE FROM transaction WHERE userId = ? AND metadata LIKE ?",
      [admin.id, `%${STAMP}%`]
    );
    if (removed.affectedRows > 0) {
      console.log(`Removed ${removed.affectedRows} row(s) from a previous run.`);
    }

    if (cleanOnly) {
      console.log("--clean: seeded nothing.");
      return;
    }

    const list = rows();
    for (const row of list) {
      await connection.query(
        "INSERT INTO transaction (id, userId, walletId, type, status, amount, fee, description, metadata, referenceId, trxId, createdAt, updatedAt) " +
          "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          crypto.randomUUID(),
          admin.id,
          wallet.id,
          row.type,
          row.status,
          row.amount,
          row.fee,
          row.description,
          JSON.stringify({ ...row.metadata, demoSeed: STAMP, seedKey: row.key }),
          row.referenceId,
          row.trxId,
          row.createdAt,
          row.updatedAt,
        ]
      );
    }

    const deposits = list.filter((r) => r.type === "DEPOSIT").length;
    console.log(
      `Seeded ${list.length} transactions (${deposits} deposits, ${list.length - deposits} withdrawals) ` +
        `for ${admin.email} on the ${wallet.type} · ${wallet.currency} wallet.`
    );
    console.log("Balances were not touched. Re-run any time; --clean removes them again.");
  } finally {
    await connection.end();
  }
})().catch((e) => {
  console.error("Seeding failed:", e.message);
  process.exit(1);
});
