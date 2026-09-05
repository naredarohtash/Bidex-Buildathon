/**
 * Create the login_activity table.
 *
 * Sign-in activity needs somewhere to live and this repo has no migration
 * runner for app tables, so the DDL lives here and is safe to run repeatedly.
 * It is plain SQL on purpose: local is MySQL and the live server is MariaDB,
 * and the two disagree about enough (JSON casts, notably) that anything
 * cleverer would need two versions.
 *
 *   node backend/scripts/setup-login-activity.js
 *
 * The foreign key deliberately matches user.id's charset and collation —
 * utf8mb4/utf8mb4_bin — because MySQL rejects the constraint outright when
 * they differ, with an error that names neither.
 *
 * It also writes the NewDeviceSignIn email template. The queue resolves an
 * emailType to a row in notification_template by name, so the alert would
 * throw on send without one.
 */

const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

/* No %SITE_NAME% in the subject: the mailer substitutes that into the wrapper
   template only, and a subject goes through a pass that never sees it — it
   would arrive in the inbox as the literal characters. */
const ALERT_SUBJECT = "New sign-in to your account";

/* generalTemplate.html supplies .btn, .highlight-box and .alert, so this is
   only the middle of the message. The facts come first and the reassurance
   second: somebody opening this while worried should not have to read a
   paragraph to find out where the sign-in was. */
const ALERT_BODY = `
<h1>New sign-in to your account</h1>
<p>Hello %FIRSTNAME%, your account was just signed into from a device we have not seen before.</p>

<div class="highlight-box">
  <div class="highlight-label">Device</div>
  <div class="highlight-value">%DEVICE%</div>
</div>

<div class="highlight-box">
  <div class="highlight-label">Location</div>
  <div class="highlight-value">%LOCATION%</div>
</div>

<div class="highlight-box">
  <div class="highlight-label">IP address</div>
  <div class="highlight-value">%IP%</div>
</div>

<div class="highlight-box">
  <div class="highlight-label">Time</div>
  <div class="highlight-value">%TIME%</div>
</div>

<p><strong>If this was you</strong>, there is nothing to do. Sign-ins from a new browser, a new phone or a new country all look like this one.</p>

<div class="alert alert-warning">
  <strong>If this was not you</strong>, act now: open your security settings, sign out of all other devices, and change your password. Turn on two-factor authentication while you are there — it is what stops a stolen password on its own.
</div>

<p style="text-align: center;">
  <a href="%URL%/user/profile?tab=security" class="btn">Open security settings</a>
</p>

<p>We will never ask you for your password or a verification code. If a message does, it is not from us.</p>
`.trim();

const DDL = `
CREATE TABLE IF NOT EXISTS login_activity (
  id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  userId CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  sid VARCHAR(191) NULL,
  ip VARCHAR(64) NULL,
  userAgent VARCHAR(512) NULL,
  browser VARCHAR(64) NULL,
  os VARCHAR(64) NULL,
  deviceType VARCHAR(32) NULL,
  deviceName VARCHAR(128) NULL,
  city VARCHAR(96) NULL,
  region VARCHAR(96) NULL,
  country VARCHAR(96) NULL,
  countryCode VARCHAR(8) NULL,
  lastSeenAt DATETIME NULL,
  revokedAt DATETIME NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY loginActivityUserIdIdx (userId),
  KEY loginActivitySidIdx (sid),
  CONSTRAINT loginActivityUserFk FOREIGN KEY (userId) REFERENCES user(id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

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
    await connection.query(DDL);
    const [columns] = await connection.query("SHOW COLUMNS FROM login_activity");
    console.log(`login_activity is ready — ${columns.length} columns.`);

    await upsertTemplate(connection, "NewDeviceSignIn", ALERT_SUBJECT, ALERT_BODY, [
      "FIRSTNAME",
      "DEVICE",
      "LOCATION",
      "IP",
      "TIME",
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
  console.error("Could not create login_activity:", error.message);
  process.exit(1);
});
