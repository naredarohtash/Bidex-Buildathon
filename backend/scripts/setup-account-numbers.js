/**
 * Short account numbers — idempotent, safe to re-run.
 *
 * `user.id` is a UUID and stays one. It is the primary key, and wallets,
 * transactions, KYC applications and sign-in activity all carry it as a foreign
 * key; changing it would not be a rename but a rewrite of every referencing row,
 * with orphaned records as the failure mode. This adds the number people
 * actually quote alongside it.
 *
 * Three steps, each skipped when already done:
 *
 *  1. add `user.accountId` — eight characters, nullable at first because the
 *     backfill has not run yet;
 *  2. give every existing account a number, in batches, retrying on a clash;
 *  3. add the unique index, once no duplicates can exist.
 *
 * The index goes on last on purpose. Adding it before the backfill would make
 * the first batch of NULLs fine (MySQL allows many NULLs in a unique index) but
 * would give a partial run nothing to protect it from a duplicate arriving
 * between two batches.
 *
 * Run once per database:  node backend/scripts/setup-account-numbers.js
 */

const path = require("path");
const fs = require("fs");

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

/* Eight digits, never a leading zero — 90 million possibilities, and no
   ambiguity about whether the string form lost a character. */
const generate = () => String(10000000 + Math.floor(Math.random() * 90000000));

(async () => {
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [columns] = await connection.query("SHOW COLUMNS FROM `user` LIKE 'accountId'");
    if (columns.length === 0) {
      await connection.query(
        "ALTER TABLE `user` ADD COLUMN `accountId` VARCHAR(8) NULL AFTER `id`"
      );
      console.log("user.accountId: column added");
    } else {
      console.log("user.accountId: column already present");
    }

    /* Every account without one, including soft-deleted rows — a deleted user
       still owns transactions somebody may quote a number against. */
    const [pending] = await connection.query(
      "SELECT id FROM `user` WHERE accountId IS NULL OR accountId = ''"
    );

    let assigned = 0;
    for (const row of pending) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = generate();
        const [clash] = await connection.execute(
          "SELECT id FROM `user` WHERE accountId = ? LIMIT 1",
          [candidate]
        );
        if (clash.length) continue;
        await connection.execute("UPDATE `user` SET accountId = ? WHERE id = ?", [
          candidate,
          row.id,
        ]);
        assigned++;
        break;
      }
    }
    console.log(
      pending.length === 0
        ? "user.accountId: every account already numbered"
        : `user.accountId: numbered ${assigned} of ${pending.length} accounts`
    );

    const [indexes] = await connection.query(
      "SHOW INDEX FROM `user` WHERE Key_name = 'accountId'"
    );
    if (indexes.length === 0) {
      const [dupes] = await connection.query(
        "SELECT accountId, COUNT(*) n FROM `user` WHERE accountId IS NOT NULL GROUP BY accountId HAVING n > 1"
      );
      if (dupes.length) {
        console.log(
          `user.accountId: ${dupes.length} duplicate(s) found — index NOT added. Re-run after clearing them.`
        );
      } else {
        await connection.query("ALTER TABLE `user` ADD UNIQUE INDEX `accountId` (`accountId`)");
        console.log("user.accountId: unique index added");
      }
    } else {
      console.log("user.accountId: unique index already present");
    }
  } finally {
    await connection.end();
  }
})().catch((error) => {
  console.error("setup-account-numbers failed:", error.message);
  process.exit(1);
});
