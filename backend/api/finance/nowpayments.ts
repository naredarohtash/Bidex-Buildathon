/**
 * NOWPayments — the deposit processor.
 *
 * Solves the problem the shared Binance address could not: every payment gets
 * its own address, so an arriving transfer identifies the payer by itself. No
 * transaction hash, no matching on amounts, no queue of collisions when four
 * people deposit 100 USDT in the same minute.
 *
 * The trust model is inverted from the Binance path and that is the thing to
 * hold on to. There we asked the exchange a question and believed the answer
 * because we had authenticated the request. Here the processor calls US, and
 * anyone on the internet can call the same endpoint. A callback saying "payment
 * finished, credit this user" is worth nothing until its signature is checked
 * — that check is the only thing standing between a webhook URL and free money.
 */

import crypto from "crypto";
import { getProviderConfig } from "./provider-config";

const API = "https://api.nowpayments.io/v1";
const TIMEOUT_MS = 20000;

/* Credentials come from the admin screen or the environment — see
   provider-config.ts. Async because the stored pair lives in the database;
   every caller was already async, so nothing had to be restructured. */
export async function nowPaymentsConfigured(): Promise<boolean> {
  const config = await getProviderConfig();
  return Boolean(config.apiKey && config.ipnSecret);
}

async function call<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T | null> {
  const key = (await getProviderConfig()).apiKey;
  if (!key) return null;

  try {
    const res = await fetch(`${API}${path}`, {
      method: init.method || "GET",
      headers: {
        "x-api-key": key,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body: any = await res.json().catch(() => null);
    if (!res.ok) {
      /* Logged with the processor's own wording. "Amount is too small" and
         "currency not supported" are different problems with the same generic
         failure, and only one of them is the trader's to fix. */
      console.error(`[NOWPAY] ${path} -> HTTP ${res.status} ${body?.message || ""}`);
      return null;
    }
    return body as T;
  } catch (err: any) {
    console.error(`[NOWPAY] ${path} failed: ${err?.name || err}`);
    return null;
  }
}

/** Is the processor reachable and accepting payments? */
export async function isUp(): Promise<boolean> {
  const body = await call<{ message: string }>("/status");
  return body?.message === "OK";
}

export interface CreatedPayment {
  paymentId: string;
  /** The address unique to THIS payment — the whole point of using a processor. */
  payAddress: string;
  /** Some chains need a memo alongside the address. */
  payinExtraId: string | null;
  /** How much of the pay currency the trader must send. */
  payAmount: number;
  payCurrency: string;
  /** What we expect to receive, in the currency balances are held in. */
  priceAmount: number;
  priceCurrency: string;
  /** When the address stops accepting this payment. */
  validUntil: string | null;
}

/**
 * Open a payment and get its address.
 *
 * `orderId` is our own transaction id and comes back on every callback, which
 * is how a webhook is tied to a user without trusting anything in the payload
 * to tell us who they are.
 */
export async function createPayment(args: {
  priceAmount: number;
  payCurrency: string;
  orderId: string;
  description?: string;
}): Promise<CreatedPayment | null> {
  const callbackUrl = (await getProviderConfig()).ipnUrl || "";

  const body = await call<any>("/payment", {
    method: "POST",
    body: {
      price_amount: args.priceAmount,
      /* USD, not USDT. The processor refuses USDT as a price currency —
         "Price currency USDT is not allowed" — and every crypto deposit would
         have failed on that. USDT tracks the dollar, so a deposit priced in USD
         credits the same figure; the exact amount received still comes from the
         callback, never from this number. */
      price_currency: "usd",
      pay_currency: args.payCurrency.toLowerCase(),
      order_id: args.orderId,
      order_description: args.description || "Bidex deposit",
      /* The depositor covers the processor fee, so we receive the full amount
         and can credit exactly what they asked for. With this false the fee
         came out of what WE received, meaning someone who asked to deposit 15
         would be credited about 14.9 — a screen promising 15.00 would then be
         wrong every single time, and wrong in the direction people notice. */
      is_fee_paid_by_user: true,
      ...(callbackUrl ? { ipn_callback_url: callbackUrl } : {}),
    },
  });

  if (!body?.pay_address || !body?.payment_id) return null;

  return {
    paymentId: String(body.payment_id),
    payAddress: String(body.pay_address),
    payinExtraId: body.payin_extra_id ? String(body.payin_extra_id) : null,
    payAmount: Number(body.pay_amount) || 0,
    payCurrency: String(body.pay_currency || args.payCurrency).toUpperCase(),
    priceAmount: Number(body.price_amount) || args.priceAmount,
    priceCurrency: String(body.price_currency || "USD").toUpperCase(),
    validUntil: body.valid_until ? String(body.valid_until) : null,
  };
}

/** Ask the processor directly what a payment's state is. */
export async function getPayment(paymentId: string): Promise<any | null> {
  return await call(`/payment/${encodeURIComponent(paymentId)}`);
}

/** The smallest payment the processor will accept for a currency pair. */
export async function minimumFor(payCurrency: string): Promise<number | null> {
  const body = await call<{ min_amount: number }>(
    `/min-amount?currency_from=${encodeURIComponent(payCurrency.toLowerCase())}&currency_to=usdttrc20`
  );
  const min = Number(body?.min_amount);
  return Number.isFinite(min) && min > 0 ? min : null;
}

/* ── Callback verification ────────────────────────────────────────────────
   The signature is an HMAC-SHA512 over the payload with its keys sorted, so it
   can be recomputed from the parsed body rather than needing the raw bytes.
   Sorting has to be recursive: a nested object left in its original key order
   produces a different digest and every callback would be rejected. */

function sortDeep(value: any): any {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((out: Record<string, any>, key) => {
        out[key] = sortDeep(value[key]);
        return out;
      }, {});
  }
  return value;
}

/**
 * Is this callback really from the processor?
 *
 * Everything downstream credits money on the strength of this returning true,
 * so it fails closed in every direction: no secret configured, no signature
 * header, malformed input — all false. A misconfigured server that accepted
 * unsigned callbacks would be indistinguishable from a working one right up
 * until someone noticed their balance growing on its own.
 */
export async function verifyCallback(body: unknown, signature: string | undefined): Promise<boolean> {
  const secret = (await getProviderConfig()).ipnSecret;
  if (!secret) {
    console.error("[NOWPAY] callback rejected: NOWPAYMENTS_IPN_SECRET is not set");
    return false;
  }
  if (!signature || typeof signature !== "string") return false;

  try {
    const expected = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(sortDeep(body)))
      .digest("hex");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature.trim(), "utf8");
    // Length-checked first: timingSafeEqual throws on a mismatch rather than
    // returning false, and a thrown error here would read as a server fault
    // instead of a rejected forgery.
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err: any) {
    console.error(`[NOWPAY] signature check failed: ${err?.message}`);
    return false;
  }
}

/**
 * What a payment status means for us.
 *
 * `partially_paid` is money that genuinely arrived, just less than was asked
 * for, and it is credited for what it is — refusing it would leave a trader
 * out of pocket with funds sitting at the processor. Everything unrecognised
 * is treated as still in progress rather than as a failure, because guessing
 * "failed" on a status we have not seen before could close a deposit that was
 * about to succeed.
 */
export function classify(status: string): "CREDIT" | "PENDING" | "FAILED" {
  switch (String(status || "").toLowerCase()) {
    case "finished":
    case "confirmed":
    case "partially_paid":
      return "CREDIT";
    case "failed":
    case "refunded":
    case "expired":
      return "FAILED";
    default:
      return "PENDING";
  }
}
