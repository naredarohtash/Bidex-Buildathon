/**
 * Signup email setup — idempotent, safe to re-run.
 *
 * Two pieces of database state the signup flow needs and did not have:
 *
 *  1. `verifyEmailStatus`. The registration route already sends a verification
 *     email, but only when this setting reads "true" — and the row did not
 *     exist, so `getSetting` returned undefined, the comparison failed, and
 *     every account was created with `emailVerified: false` and no way for the
 *     owner to change that. The template, the token, the /login?token= handler
 *     and the endpoint that flips the flag were all already in place. Nothing
 *     was wired to start it.
 *
 *  2. A `NewUserWelcome` template. The queue resolves `emailType` to a row in
 *     `notification_template` by name, so an email nobody has written a row for
 *     is an email that throws when it is sent.
 *
 * It also drops the cached settings hash in Redis. Settings are read through
 * CacheManager, which loads from Redis first and only falls back to the
 * database when that is empty — so a row written straight into MySQL is
 * invisible to the running server until the cache is cleared. Writing the row
 * and not clearing the cache looks exactly like the setting not working.
 *
 * Run once per database:  node backend/scripts/setup-signup-emails.js
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

/* No %SITE_NAME% here, deliberately. The mailer substitutes that one into the
   wrapper template only — a subject line goes through a different pass that
   never sees it, so it would arrive in the inbox as the literal characters
   "%SITE_NAME%". */
const WELCOME_SUBJECT = "Welcome — your account is ready";

/* Written in the same vocabulary as the templates already in the table:
   generalTemplate.html supplies .btn, .highlight-box and .alert, so this is
   only the middle of the message. */
const WELCOME_BODY = `
<h1>Welcome, %FIRSTNAME%</h1>
<p>Your account is created. One thing is left before you can trade: confirm the email address you signed up with. We have sent that link in a separate message — open it and you are in.</p>

<div class="highlight-box">
  <div class="highlight-label">Your account</div>
  <div class="highlight-value">%EMAIL%</div>
</div>

<p>Once your email is confirmed you can:</p>
<ul>
  <li>Practise on a demo balance with live prices, at no risk</li>
  <li>Verify your identity, which is required before a withdrawal</li>
  <li>Fund the account and place your first real trade</li>
</ul>

<p style="text-align: center;">
  <a href="%URL%/terminal" class="btn">Open the terminal</a>
</p>

<div class="alert alert-warning">
  We will never ask you for your password or a verification code. If a message does, it is not from us.
</div>

<p>If you did not create this account, ignore both emails and nothing further will happen.</p>
`.trim();

const HANDOFF_SUBJECT = "Finish your verification on your phone";

const HANDOFF_BODY = `
<h1>Continue on your phone</h1>
<p>Hello %FIRSTNAME%, you asked to finish the photo steps of your identity check on your phone. Open this on the phone you want to use:</p>

<p style="text-align: center;">
  <a href="%URL%" class="btn">Take the photos</a>
</p>

<div class="alert alert-warning">
  This link works for <strong>fifteen minutes</strong> and only for the photos you were asked for. It cannot sign anyone in or change your account.
</div>

<p>Once the photos are taken, go back to the computer you started on to finish. If you did not ask for this link, ignore it — nothing happens.</p>
`.trim();

async function main() {
  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  try {
    const [settingRows] = await conn.execute(
      "SELECT value FROM settings WHERE `key` = 'verifyEmailStatus'"
    );
    if (settingRows.length === 0) {
      await conn.execute(
        "INSERT INTO settings (`key`, value) VALUES ('verifyEmailStatus', 'true')"
      );
      console.log("settings.verifyEmailStatus: created as true");
    } else if (String(settingRows[0].value) !== "true") {
      await conn.execute(
        "UPDATE settings SET value = 'true' WHERE `key` = 'verifyEmailStatus'"
      );
      console.log(`settings.verifyEmailStatus: ${settingRows[0].value} -> true`);
    } else {
      console.log("settings.verifyEmailStatus: already true");
    }

    await upsertTemplate(conn, "NewUserWelcome", WELCOME_SUBJECT, WELCOME_BODY, ["FIRSTNAME", "EMAIL", "CREATED_AT"]);
    await upsertTemplate(conn, "KycPhoneHandoff", HANDOFF_SUBJECT, HANDOFF_BODY, ["FIRSTNAME", "URL"]);

  } finally {
    await conn.end();
  }

  await clearSettingsCache();
}

/** Best-effort: the row is written either way, this only makes it visible. */
async function clearSettingsCache() {
  try {
    const Redis = require("ioredis");
    const redis = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    await redis.del("settings");
    await redis.quit();
    console.log("redis: settings cache cleared");
  } catch (e) {
    console.log(
      `redis: could not clear the settings cache (${e.message}). Restart the backend to pick the setting up.`
    );
  }
}

/** Create it or bring it up to date; safe to run as often as you like. */
async function upsertTemplate(conn, name, subject, body, shortCodes) {
  const codes = JSON.stringify(shortCodes);
  const [rows] = await conn.execute("SELECT id FROM notification_template WHERE name = ?", [name]);
  if (rows.length === 0) {
    await conn.execute(
      `INSERT INTO notification_template (name, subject, emailBody, shortCodes, email, sms, push)
       VALUES (?, ?, ?, ?, 1, 0, 0)`,
      [name, subject, body, codes]
    );
    console.log(`notification_template.${name}: created`);
  } else {
    await conn.execute(
      `UPDATE notification_template SET subject = ?, emailBody = ?, shortCodes = ?, email = 1 WHERE name = ?`,
      [subject, body, codes, name]
    );
    console.log(`notification_template.${name}: updated`);
  }
}

main().catch((e) => {
  console.error("setup-signup-emails failed:", e.message);
  process.exit(1);
});
