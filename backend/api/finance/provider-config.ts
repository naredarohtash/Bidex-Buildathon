/**
 * Payment provider credentials, set from the admin screen.
 *
 * These are the most dangerous values the platform holds. The API key can open
 * payments; the IPN secret SIGNS THE CALLBACKS THAT CREDIT BALANCES. Anyone who
 * obtains the latter can open a deposit, forge a "payment finished" callback for
 * any amount, and credit themselves real money. Everything below follows from
 * that.
 *
 *   Encrypted at rest. A database dump — a backup on a laptop, a restored
 *   staging copy, a leaked export — is not enough on its own. The key lives in
 *   the environment, so an attacker needs the database AND the server.
 *
 *   Never sent to a browser. The screen shows whether a value is set and its
 *   last four characters, nothing more. There is no endpoint that returns a
 *   secret, so no session, XSS or over-broad admin role can retrieve one.
 *
 *   Environment wins. A value in .env overrides the database, so a compromised
 *   admin account cannot repoint payments by saving a new key, and the safest
 *   deployment (secrets never in the database at all) stays available.
 */

import crypto from "crypto";
import { models } from "@b/db";

const SETTING_KEY = "bidex_payment_provider";

/* Derived from an existing secret rather than adding another to configure.
   The label keeps this key distinct from anything else derived from the same
   source, so a leak here cannot be replayed against sessions. */
function encryptionKey(): Buffer | null {
  const source = process.env.SETTINGS_ENCRYPTION_KEY || process.env.APP_ACCESS_TOKEN_SECRET;
  if (!source) return null;
  return crypto.createHash("sha256").update(`bidex:provider:${source}`).digest();
}

/** AES-256-GCM. The tag is what makes tampering detectable rather than silent. */
function encrypt(plain: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

function decrypt(payload: string): string | null {
  const key = encryptionKey();
  if (!key) return null;
  try {
    const [iv, tag, data] = payload.split(".");
    if (!iv || !tag || !data) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    /* Wrong key or altered ciphertext. Returning null means "not configured",
       which disables deposits — the safe direction. Treating a failed decrypt
       as a usable value is how a corrupted secret becomes a silent outage that
       looks like a provider problem. */
    return null;
  }
}

export interface ProviderConfig {
  apiKey: string | null;
  ipnSecret: string | null;
  ipnUrl: string | null;
  /** Where each value came from, for the screen to explain itself. */
  source: "env" | "database" | "none";
}

let cache: { at: number; value: ProviderConfig } | null = null;
const CACHE_MS = 30_000;

/**
 * The credentials in force.
 *
 * Cached briefly because this is read on every deposit and every callback, and
 * a database round trip plus a decrypt on each would be a real cost on the
 * hottest path in the system. Thirty seconds is short enough that saving new
 * keys takes effect while the admin is still on the screen.
 */
export async function getProviderConfig(): Promise<ProviderConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const envKey = (process.env.NOWPAYMENTS_API_KEY || "").trim();
  const envSecret = (process.env.NOWPAYMENTS_IPN_SECRET || "").trim();
  const envUrl = (process.env.NOWPAYMENTS_IPN_URL || "").trim();

  if (envKey && envSecret) {
    const value: ProviderConfig = {
      apiKey: envKey,
      ipnSecret: envSecret,
      ipnUrl: envUrl || null,
      source: "env",
    };
    cache = { at: Date.now(), value };
    return value;
  }

  let stored: any = null;
  try {
    const row = await models.settings.findOne({ where: { key: SETTING_KEY } });
    if (row?.value) {
      const plain = decrypt(String(row.value));
      if (plain) stored = JSON.parse(plain);
    }
  } catch {
    stored = null;
  }

  const value: ProviderConfig = {
    apiKey: envKey || stored?.apiKey || null,
    ipnSecret: envSecret || stored?.ipnSecret || null,
    ipnUrl: envUrl || stored?.ipnUrl || null,
    source: stored?.apiKey ? "database" : envKey ? "env" : "none",
  };
  cache = { at: Date.now(), value };
  return value;
}

/**
 * Save credentials.
 *
 * A blank field leaves the stored value alone rather than clearing it. The
 * screen cannot show a secret, so an admin editing only the API key would have
 * to retype a secret they cannot see — and would otherwise wipe it by saving.
 */
export async function saveProviderConfig(input: {
  apiKey?: string;
  ipnSecret?: string;
  ipnUrl?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!encryptionKey()) {
    return {
      ok: false,
      error: "Cannot store credentials securely: no encryption key is configured on the server.",
    };
  }

  const current = await getProviderConfig();
  const next = {
    apiKey: (input.apiKey || "").trim() || current.apiKey || null,
    ipnSecret: (input.ipnSecret || "").trim() || current.ipnSecret || null,
    ipnUrl: (input.ipnUrl || "").trim() || current.ipnUrl || null,
  };

  const sealed = encrypt(JSON.stringify(next));
  if (!sealed) return { ok: false, error: "Could not encrypt the credentials." };

  const existing = await models.settings.findOne({ where: { key: SETTING_KEY } });
  if (existing) await models.settings.update({ value: sealed }, { where: { key: SETTING_KEY } });
  else await models.settings.create({ key: SETTING_KEY, value: sealed });

  cache = null;
  return { ok: true };
}

export async function clearProviderConfig(): Promise<void> {
  await models.settings.destroy({ where: { key: SETTING_KEY } });
  cache = null;
}

/** Last four characters only — enough to recognise a key, useless to steal. */
export function maskTail(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value);
  return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
}

/** Test hook and post-save invalidation. */
export function __resetProviderCache(): void {
  cache = null;
}
