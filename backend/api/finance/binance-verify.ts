/**
 * Confirming crypto deposits against the exchange's own record.
 *
 * A trader pays to one of our addresses and tells us the transaction hash. That
 * claim is worth nothing on its own — anyone can type a hash — so nothing is
 * credited until the exchange itself reports having received that exact
 * transfer, to the address we published, with enough confirmations. This module
 * is the only thing that decides a deposit was real.
 *
 * Read-only by construction. The keys this uses cannot withdraw, trade or
 * transfer; if they leak, the worst an attacker learns is our deposit history.
 * Nothing here should ever need a key that can move money — if a future change
 * seems to, that is the change to question.
 *
 * Degrades rather than breaks: with no keys configured every call returns null,
 * deposits stay PENDING, and an operator approves them by hand. The platform
 * keeps working, it just stops being automatic.
 */

import crypto from "crypto";

const API = "https://api.binance.com";
const TIMEOUT_MS = 15000;

export const binanceConfigured = (): boolean =>
  Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);

/** A signed GET. Returns null on any failure — callers treat that as "unknown". */
async function signedGet<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) return null;

  try {
    const query = new URLSearchParams({
      ...params,
      timestamp: String(Date.now()),
      // Generous: a clock a few seconds out must not silently stop deposits.
      recvWindow: "20000",
    }).toString();
    const signature = crypto.createHmac("sha256", secret).update(query).digest("hex");

    const res = await fetch(`${API}${path}?${query}&signature=${signature}`, {
      headers: { "X-MBX-APIKEY": key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[BINANCE] ${path} -> HTTP ${res.status}`);
      return null;
    }
    const body: any = await res.json();
    // Binance reports errors as a 200 carrying { code, msg }.
    if (body && typeof body === "object" && !Array.isArray(body) && body.code && body.msg) {
      console.error(`[BINANCE] ${path} -> ${body.code} ${body.msg}`);
      return null;
    }
    return body as T;
  } catch (err: any) {
    console.error(`[BINANCE] ${path} failed: ${err?.name || err}`);
    return null;
  }
}

/* Deposit addresses do not change, so they are fetched once and kept. Asking
   the exchange on every page view would put a network round trip — and a rate
   limit we share with everything else — in front of the deposit screen. */
const addressCache = new Map<string, { address: string; tag?: string; at: number }>();
const ADDRESS_TTL_MS = 6 * 60 * 60 * 1000;

export async function getDepositAddress(
  asset: string,
  network: string
): Promise<{ address: string; tag?: string } | null> {
  const cacheKey = `${asset}:${network}`;
  const hit = addressCache.get(cacheKey);
  if (hit && Date.now() - hit.at < ADDRESS_TTL_MS) {
    return { address: hit.address, tag: hit.tag };
  }

  const body = await signedGet<{ address: string; tag?: string }>(
    "/sapi/v1/capital/deposit/address",
    network ? { coin: asset, network } : { coin: asset }
  );
  if (!body?.address) return null;

  addressCache.set(cacheKey, { address: body.address, tag: body.tag, at: Date.now() });
  return { address: body.address, tag: body.tag || undefined };
}

/** Binance deposit status codes, named. */
const STATUS_PENDING = 0;
const STATUS_SUCCESS = 1;
const STATUS_CREDITED_CANNOT_WITHDRAW = 6;

export interface ExchangeDeposit {
  amount: number;
  asset: string;
  network: string;
  address: string;
  txId: string;
  confirmations: number;
  /** True only when the exchange says the funds are actually there. */
  credited: boolean;
  insertTime: number;
}

/**
 * Find a specific transfer in our incoming deposit record.
 *
 * Matched on transaction hash, which is the only field the trader supplies and
 * the only one that uniquely identifies a transfer. Asset and network are
 * checked too: a hash is unique per chain, but confirming that the deposit we
 * found is the asset the trader claimed closes the gap where someone pastes a
 * real hash for a different, cheaper coin and asks to be credited for it.
 */
export async function findDepositByTxId(
  txId: string,
  asset: string,
  network: string
): Promise<ExchangeDeposit | null> {
  const wanted = txId.trim().toLowerCase();
  if (!wanted) return null;

  /* 90 days back. The exchange defaults to a 90-day window and silently returns
     nothing outside it, so this is stated rather than assumed — a deposit made
     before the window would otherwise look to us exactly like one that never
     happened. */
  const rows = await signedGet<any[]>("/sapi/v1/capital/deposit/hisrec", {
    coin: asset,
    startTime: String(Date.now() - 90 * 24 * 60 * 60 * 1000),
    limit: "1000",
  });
  if (!Array.isArray(rows)) return null;

  const row = rows.find((r) => String(r?.txId || "").trim().toLowerCase() === wanted);
  if (!row) return null;

  // A hash is unique per chain; a mismatch here means the claim does not
  // describe the transfer that was actually received.
  if (String(row.coin).toUpperCase() !== asset.toUpperCase()) return null;
  if (network && row.network && String(row.network).toUpperCase() !== network.toUpperCase()) {
    return null;
  }

  return {
    amount: Number(row.amount) || 0,
    asset: String(row.coin).toUpperCase(),
    network: String(row.network || network).toUpperCase(),
    address: String(row.address || ""),
    txId: String(row.txId),
    confirmations: Number(row.confirmTimes?.split("/")?.[0] ?? row.confirmTimes ?? 0) || 0,
    credited: row.status === STATUS_SUCCESS || row.status === STATUS_CREDITED_CANNOT_WITHDRAW,
    insertTime: Number(row.insertTime) || 0,
  };
}

/* Prices, for turning a deposit into the USDT a balance is held in.
   Cached briefly: several deposits confirming in the same minute should not
   each cost a call, but a rate stale by more than a minute is not one we should
   be crediting against. */
const priceCache = new Map<string, { price: number; at: number }>();
const PRICE_TTL_MS = 60 * 1000;

/**
 * What one unit of `asset` is worth in USDT.
 *
 * Returns null rather than guessing. A deposit whose value we cannot establish
 * must not be credited at an invented rate — it waits for an operator, which is
 * slower and correct, instead of fast and wrong.
 */
export async function priceInUsdt(asset: string): Promise<number | null> {
  const symbol = asset.toUpperCase();
  if (symbol === "USDT") return 1;

  const hit = priceCache.get(symbol);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.price;

  try {
    // Public endpoint: no key, and it works even when none is configured.
    const res = await fetch(`${API}/api/v3/ticker/price?symbol=${symbol}USDT`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    const price = Number(body?.price);
    if (!Number.isFinite(price) || price <= 0) return null;

    priceCache.set(symbol, { price, at: Date.now() });
    return price;
  } catch {
    return null;
  }
}

/** Test hook — the caches would otherwise outlive a key change or a rate move. */
export function __clearBinanceCaches(): void {
  addressCache.clear();
  priceCache.clear();
}
