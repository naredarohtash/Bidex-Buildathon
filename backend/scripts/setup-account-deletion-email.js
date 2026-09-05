/**
 * Write the AccountDeletionCode email template.
 *
 * The email queue resolves an `emailType` to a row in `notification_template`
 * by name, and throws on send if there is no row — so the deletion code route
 * would fail at the last step without this. Same shape and the same idempotent
 * upsert as scripts/setup-login-activity.js, kept separate so each feature
 * carries its own template.
 *
 *   node backend/scripts/setup-account-deletion-email.js
 */

const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

/* No %SITE_NAME% in the subject — the mailer substitutes that into the wrapper
   template only, and a subject goes through a pass that never sees it. */
const SUBJECT = "Your account deletion code";

/* generalTemplate.html supplies .btn, .highlight-box and .alert, so this is
   only the middle of the message.

   The code is not the first thing on the page, deliberately. Every other code
   we send is a step in something the person is already doing; this one ends an
   account, and somebody who did not ask for it needs to understand that before
   they read six digits and assume they are meant to type them somewhere. */
const BODY = `
<h1>Confirm you want to delete your account</h1>
<p>Hello %FIRSTNAME%, we received a request to permanently delete your account. Enter this code to confirm it:</p>

<div class="highlight-box">
  <div class="highlight-label">Your code</div>
  <div class="highlight-value" style="font-size:28px;letter-spacing:6px;font-weight:700;">%CODE%</div>
</div>

<p>The code works once and expires in %MINUTES% minutes.</p>

<div class="alert alert-warning">
  <strong>Deleting your account cannot be undone.</strong> Your balances and open positions are forfeited, your trade history stops being available to you, your verified identity is closed, and this email address cannot be used to sign back into the account. If you have a balance, withdraw it first — nothing is paid out afterwards.
</div>

<p><strong>If you did not ask for this</strong>, do not enter the code. Someone else may have your password: change it now and sign out of all other devices.</p>

<p style="text-align: center;">
  <a href="%URL%/user/profile?tab=security" class="btn">Open security settings</a>
</p>

<p>We will never ask you for your password or a verification code.</p>
`.trim();

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  try {
    await upsertTemplate(connection, "AccountDeletionCode", SUBJECT, BODY, [
      "FIRSTNAME",
      "CODE",
      "MINUTES",
      "URL",
    ]);
  } finally {
    await connection.end();
  }

  /** Create it or bring it up to date; safe to run as often as you like. */
  async function upsertTemplate(connection, name, subject, body, shortCodes) {
    const codes = JSON.stringify(shortCodes);
    const [rows] = await connection.execute(
      "SELECT id FROM notification_template WHERE name = ?",
      [name]
    );
    if (rows.length === 0) {
      await connection.execute(
        `INSERT INTO notification_template (name, subject, emailBody, shortCodes, email, sms, push)
         VALUES (?, ?, ?, ?, 1, 0, 0)`,
        [name, subject, body, codes]
      );
      console.log(`notification_template.${name}: created`);
    } else {
      await connection.execute(
        `UPDATE notification_template SET subject = ?, emailBody = ?, shortCodes = ?, email = 1 WHERE name = ?`,
        [subject, body, codes, name]
      );
      console.log(`notification_template.${name}: updated`);
    }
  }
})().catch((error) => {
  console.error("Could not write the AccountDeletionCode template:", error.message);
  process.exit(1);
});
