/**
 * Money that arrived with nobody's name on it.
 *
 * A trader pays to our address and then closes the tab without submitting the
 * hash. The funds are in the exchange account and there is no record of them in
 * the platform at all — no pending row, nothing in a queue, no way for anyone to
 * notice short of someone writing in to say they paid. Without this screen that
 * money is invisible until it is complained about.
 *
 * So this asks the exchange what it received, subtracts everything a trader has
 * already claimed, and shows the remainder. It is read-only and decides nothing:
 * crediting an unclaimed transfer means naming the account it belongs to, and
 * only a person can do that.
 */

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { binanceConfigured } from "../../../finance/binance-verify";
import { DEPOSIT_METHODS } from "../../../finance/wallet-methods";
import crypto from "crypto";

export const metadata: OperationObject = {
  summary: "Deposits received but not claimed by any user",
  operationId: "listUnclaimedDeposits",
  tags: ["Admin", "Finance"],
  description:
    "Transfers the exchange has received that no submitted deposit accounts for. Read-only.",
  requiresAuth: true,
  permission: "view.deposit",
  parameters: [
    {
      name: "days",
      in: "query",
      required: false,
      description: "How far back to look. Defaults to 30, maximum 90.",
      schema: { type: "integer", default: 30 },
    },
  ],
  responses: {
    200: { description: "Unclaimed transfers" },
    401: { description: "Unauthorized" },
    403: { description: "Forbidden" },
  },
};

/* Deliberately not reusing binance-verify's helper: that one searches for a
   known hash, this one enumerates. Sharing a signature helper is fine; sharing
   a query shape would make one of the two callers awkward. */
async function recentDeposits(coin: string, startTime: number): Promise<any[]> {
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (!key || !secret) return [];

  try {
    const query = new URLSearchParams({
      coin,
      startTime: String(startTime),
      limit: "1000",
      timestamp: String(Date.now()),
      recvWindow: "20000",
    }).toString();
    const signature = crypto.createHmac("sha256", secret).update(query).digest("hex");
    const res = await fetch(
      `https://api.binance.com/sapi/v1/capital/deposit/hisrec?${query}&signature=${signature}`,
      { headers: { "X-MBX-APIKEY": key }, signal: AbortSignal.timeout(15000) }
    );
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

export default async (data: { user?: { id: string }; query?: any }) => {
  if (!data?.user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  if (!binanceConfigured()) {
    return { configured: false, items: [], message: "Exchange keys are not configured." };
  }

  const requested = Number(data.query?.days);
  const days = Math.min(Number.isFinite(requested) && requested > 0 ? requested : 30, 90);
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  /* One call per distinct coin, not per method — USDT appears twice in the
     catalogue (TRC-20 and ERC-20) and the exchange returns both networks from a
     single query, so asking twice would double every USDT row on the screen. */
  const coins = [...new Set(DEPOSIT_METHODS.map((m) => m.asset))];
  const batches = await Promise.all(coins.map((coin) => recentDeposits(coin, since)));
  const received = batches.flat();

  /* What has already been spoken for. Matched on hash, and includes REJECTED
     rows on purpose: a deposit an operator has already looked at and turned
     down must not reappear here as though nobody had seen it. */
  const hashes = received.map((r) => String(r.txId || "")).filter(Boolean);
  const claimedRows = hashes.length
    ? await models.transaction.findAll({
        where: { type: "DEPOSIT", referenceId: hashes },
        attributes: ["referenceId"],
      })
    : [];
  const claimed = new Set(claimedRows.map((r: any) => String(r.referenceId).toLowerCase()));

  const items = received
    .filter((r) => r.txId && !claimed.has(String(r.txId).toLowerCase()))
    // Credited only. A transfer still confirming is not unclaimed, it is in
    // flight, and listing it invites an operator to pay out money that has not
    // actually settled.
    .filter((r) => r.status === 1 || r.status === 6)
    .map((r) => ({
      txId: String(r.txId),
      asset: String(r.coin).toUpperCase(),
      network: String(r.network || "").toUpperCase(),
      amount: Number(r.amount) || 0,
      address: String(r.address || ""),
      receivedAt: Number(r.insertTime) || 0,
      ageHours: Math.floor((Date.now() - (Number(r.insertTime) || Date.now())) / 3_600_000),
    }))
    .sort((a, b) => b.receivedAt - a.receivedAt);

  return {
    configured: true,
    days,
    items,
    total: items.reduce((n, i) => n + i.amount, 0),
    /* Crediting one of these means choosing whose it is, which this endpoint
       deliberately cannot do. The operator records the hash against a user
       through the normal deposit route, and it settles the ordinary way. */
    note:
      "These transfers reached the exchange with no matching deposit request. Confirm who sent each one before crediting.",
  };
};
