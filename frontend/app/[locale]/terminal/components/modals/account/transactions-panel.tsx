"use client";

/**
 * Deposits and withdrawals.
 *
 * Only money entering or leaving the account — not trades, not payouts, not
 * internal transfers. Someone opening this wants the record of what they paid
 * in and what they took out; mixing several thousand binary settlements into
 * that buries it. Trades live in the terminal's own history.
 *
 * Reads the user's own transactions from /api/finance/transaction, which scopes
 * to the caller server-side, and offers the same rows as CSV for a bank or an
 * accountant.
 *
 * Shape: a summary strip, a filter bar, then a full-width ledger grouped by
 * month. Every row opens to the detail the server actually holds — ids you can
 * copy, the wallet it moved through, when it was created and last touched, and
 * whatever the gateway attached as metadata. Nothing on this page is derived
 * from a guess: the fee is shown as its own figure rather than folded into a
 * "net", because whether a fee is taken out of a deposit or added to a
 * withdrawal is the payment provider's convention, not ours to invent.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  Search,
  SearchX,
  Undo2,
  X,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AssetLogo } from "@/components/finance/asset-logo";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { CopyValue } from "./copy-value";
import { DepositMark, NetFlowMark, PendingMark, WithdrawMark } from "./transaction-marks";
/* The same two tables the header converts its own balance with. Imported
   rather than copied: a second rate table is a table that drifts, and the one
   number this page must agree with is the balance in the header. */
import { CURRENCY_SYMBOLS, EXCHANGE_RATES } from "../../header/header";

/* Deposits and withdrawals only.
   REFUND, PAYMENT and the TRANSFER types were in here and should not have been:
   a binary payout is booked as REFUND, so a page meant to answer "what have I
   put in and taken out" filled up with trade results — 143 refunds against
   zero real deposits on the account this was first seen on. Transfers are
   money moving between a user's own wallets, which is not money entering or
   leaving either. */
const MONEY_IN = ["DEPOSIT", "FOREX_DEPOSIT"];
const MONEY_OUT = ["WITHDRAW", "FOREX_WITHDRAW"];
const SHOWN = [...MONEY_IN, ...MONEY_OUT];

type Dir = "all" | "in" | "out";
type StatusFilter = "all" | "COMPLETED" | "PENDING" | "UNSETTLED";

/* Everything that is neither completed nor still in flight: the money never
   moved. One chip covers them because a trader wants "did it go through" split
   three ways, not nine. */
const UNSETTLED = ["FAILED", "CANCELLED", "REJECTED", "EXPIRED", "TIMEOUT", "REFUNDED"];
const IN_FLIGHT = ["PENDING", "PROCESSING", "FROZEN"];

/* A filled pill with a mark in it, not a hairline and a word.

   These were outlined chips, on the reasoning that a settled ledger — which is
   what a ledger mostly is — should not read as a column of coloured tablets
   announcing that nothing had gone wrong. What that missed is that the status
   is the one thing on a row somebody scans *for*: whether it went through. An
   outline and 11px of text is not something you find at a glance down a column
   of twenty rows, and the three outcomes were three shades of the same
   weight.

   So: a solid pill, a white disc, and the pill's own colour as the mark inside
   it — a tick, a cross, a clock. The disc is what makes the mark legible at
   10px; a white glyph straight onto the fill loses its shape at that size.

   Three groups, not ten statuses. It is the same three-way split the filter
   chips offer, because "did my money move" has three answers and a trader
   should not have to work out which of REJECTED and EXPIRED is worse.

   The `-solid` end of each token, never the ink end. `--danger`, `--verified`
   and `--attention` are all mixed to be read *as text* — which on the dark
   themes means light enough to show on near-black, and a green at 55%
   lightness cannot hold white text on top of it. `--danger-solid` already
   existed for the one filled button an irreversible action gets;
   `--verified-solid` and `--attention-solid` are its two siblings, added for
   these pills. `--destructive` is not used here either: it is a 30%-lightness
   maroon in the dark themes, heavier than a status chip should be. */
const STATUS_TONE: Record<string, { pill: string; mark: string; icon: typeof Check }> = {
  COMPLETED: { pill: "bg-verified-solid", mark: "text-verified-solid", icon: Check },
  PENDING: { pill: "bg-attention-solid", mark: "text-attention-solid", icon: Clock },
  PROCESSING: { pill: "bg-attention-solid", mark: "text-attention-solid", icon: Clock },
  FROZEN: { pill: "bg-attention-solid", mark: "text-attention-solid", icon: Clock },
  FAILED: { pill: "bg-danger-solid", mark: "text-danger-solid", icon: X },
  REJECTED: { pill: "bg-danger-solid", mark: "text-danger-solid", icon: X },
  TIMEOUT: { pill: "bg-danger-solid", mark: "text-danger-solid", icon: X },
  CANCELLED: { pill: "bg-danger-solid", mark: "text-danger-solid", icon: X },
  EXPIRED: { pill: "bg-danger-solid", mark: "text-danger-solid", icon: X },
  REFUNDED: { pill: "bg-danger-solid", mark: "text-danger-solid", icon: X },
};

/**
 * The status of one row, as a pill you can find without reading it.
 *
 * `compact` is the narrow card layout, where the pill sits under the amount
 * rather than in a column of its own — one step down in every dimension, so
 * that it stays a pill rather than becoming the widest thing in the card.
 *
 * Exported, because the support desk's payment picker lists the same rows and
 * was drawing their status as coloured text of its own. A payment that is
 * `Pending` in the ledger and `Pending` in the ticket it is attached to is one
 * fact, and one fact gets one appearance.
 */
export function StatusChip({ status, compact = false }: { status: string; compact?: boolean }) {
  const tone = STATUS_TONE[status];
  const Icon = tone?.icon;
  return (
    <span
      className={cn(
        /* `rounded-md`, the radius every other box on the site uses. A capsule
           reads as a tag you can click. */
        "inline-flex items-center rounded-md font-semibold",
        /* Trimmed on every axis from where this started. A filled pill draws
           far more attention than the outline it replaced, so it needs less
           room to do the same job — the fill is what finds it down a column,
           not its size. The padding came off first and the disc after it; the
           text is only half a point down, because the word still has to be
           read once the pill has been found. */
        compact ? "gap-1 px-1 py-[1px] text-[9.5px]" : "gap-1 px-1.5 py-[1.5px] text-[10.5px]",
        tone ? `${tone.pill} text-white` : "bg-muted text-muted-foreground"
      )}
    >
      {Icon && (
        <span
          className={cn(
            "grid shrink-0 place-items-center rounded-full bg-white",
            compact ? "h-2.5 w-2.5" : "h-3 w-3",
            tone.mark
          )}
        >
          {/* Stroke comes down with the box. 3.5 was mixed for a 10px glyph;
              held at that weight on a 7px one, a tick closes up into a blob. */}
          <Icon className={compact ? "h-[7px] w-[7px]" : "h-2 w-2"} strokeWidth={3} />
        </span>
      )}
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/* Words a trader uses, not the enum. */
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  PENDING: "Pending",
  PROCESSING: "Processing",
  FROZEN: "On hold",
  FAILED: "Failed",
  REJECTED: "Rejected",
  TIMEOUT: "Timed out",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
};

const CARD = "rounded-xl border border-border bg-muted/20";

/* Crypto amounts die at two decimals, fiat looks wrong with eight. Decide per
   value rather than per account. */
function fmtNum(n: number) {
  const v = Math.abs(Number(n) || 0);
  return v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: v > 0 && v < 1 ? 8 : 2,
  });
}

/**
 * What is still in flight, in as few words as it takes.
 *
 * It said "2 transactions awaiting confirmation", which is six words to report
 * one number and the number was the wrong one to report: a deposit and a payout
 * are both "pending" and neither tells you anything about the other. The two
 * counts side by side answer what someone opening this tile actually wants —
 * is my money on the way in, or is my withdrawal still sitting there.
 *
 * A side with nothing on it is left out rather than written as a zero, so the
 * common case is three words, not "2 deposits · 0 withdrawals".
 *
 * Both counts are amber rather than one green and one red. The tile is not
 * reporting direction — it is reporting that neither of them has happened yet,
 * and that is what its colour has to say.
 */
function pendingWords(deposits: number, withdrawals: number) {
  const parts: string[] = [];
  if (deposits > 0) parts.push(`${deposits} deposit${deposits === 1 ? "" : "s"}`);
  if (withdrawals > 0) parts.push(`${withdrawals} withdrawal${withdrawals === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing in flight";
}

function PendingNote({ deposits, withdrawals }: { deposits: number; withdrawals: number }) {
  if (deposits === 0 && withdrawals === 0) return <>Nothing in flight</>;
  return (
    <>
      {deposits > 0 && (
        <>
          <Count n={deposits} tone="waiting" /> deposit{deposits === 1 ? "" : "s"}
        </>
      )}
      {deposits > 0 && withdrawals > 0 && " · "}
      {withdrawals > 0 && (
        <>
          <Count n={withdrawals} tone="waiting" /> withdrawal{withdrawals === 1 ? "" : "s"}
        </>
      )}
    </>
  );
}

function fmtDay(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}


function monthLabel(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Undated";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const isIn = (r: any) => MONEY_IN.includes(r.type);
const currencyOf = (r: any) => r.wallet?.currency || r.currency || "";

/**
 * The currency this page counts in, and how to write it.
 *
 * Every figure here used to be labelled with the currency the *wallet rows*
 * are denominated in — "USDT", on all of them — while the balance in the
 * header above said USD: one screen, two answers to "what am I looking at".
 * The header's picker is the one that wins. It is a display setting over a
 * wallet that is really kept in USDT (see withdraw-modal), and a statement
 * that disagrees with the balance it is supposed to explain is the wrong half
 * of the pair.
 *
 * `rate` comes from the same table the header converts with, so the two also
 * agree at INR, where the picker is more than a relabelling. `symbol` is what
 * goes in front of the figures — see `fmtMoney`.
 *
 * Kept in `preferred_currency`, announced on `currency-changed` when it is
 * switched here and on `storage` when it is switched in another tab.
 */
type Money = { code: string; symbol: string; rate: number };

function useDisplayCurrency(): Money {
  const [code, setCode] = useState("USDT");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => setCode(localStorage.getItem("preferred_currency") || "USDT");
    read();
    window.addEventListener("currency-changed", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("currency-changed", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return useMemo(
    () => ({ code, symbol: CURRENCY_SYMBOLS[code] || "", rate: EXCHANGE_RATES[code] || 1 }),
    [code]
  );
}

/* The wallet currencies the display currency is a restatement of.

   The trading wallet is USDT and the picker renames it, so those rows follow
   the picker. A row in any other asset keeps its own units: `EXCHANGE_RATES`
   has no BTC in it, and 0.01 BTC redrawn as "$0.01" is a worse error than a
   label the reader has to translate. */
const BASE_CURRENCIES = ["USDT", "USD"];

/** How to write one row's figures: in the display currency, or in its own. */
function moneyFor(rowCurrency: string, display: Money): Money {
  const code = String(rowCurrency || "").toUpperCase();
  if (!code || BASE_CURRENCIES.includes(code)) return display;
  return { code, symbol: CURRENCY_SYMBOLS[code] || "", rate: 1 };
}

/* `$1,234.00` where the currency has a symbol, `0.01 BTC` where it does not.

   The symbol replaces the code rather than joining it. A column of figures
   each trailed by four capitals is four letters of noise on every row, set
   against the one thing anybody is scanning the column for. */
function fmtMoney(n: number, m: Money) {
  return m.symbol ? `${m.symbol}${fmtNum(n)}` : `${fmtNum(n)} ${m.code}`;
}
const referenceOf = (r: any) => r.referenceId || r.trxId || metaRef(r) || r.id;

/**
 * What to put in the amount column.
 *
 * A deposit that expired or failed books zero, because nothing moved — and a
 * page of "+0.00 USDT" rows tells you nothing about which attempt was which.
 * The figure the person actually asked for is in the gateway's metadata, so it
 * is shown instead and flagged as attempted. Only a completed row is coloured
 * as money; an attempted one is muted, because it never arrived.
 */
function amountOf(r: any): { value: number; attempted: boolean } {
  const booked = Number(r.amount || 0);
  if (booked > 0) return { value: booked, attempted: false };
  const m = readMetadata(r) || {};
  const claimed = Number(m.claimedAmount ?? m.amount ?? m.payAmount ?? 0);
  if (claimed > 0) return { value: claimed, attempted: true };
  return { value: 0, attempted: false };
}

/* Crypto gateways hand back their own identifier and never populate the
   column, which left the reference cell empty on every row of a real account. */
function metaRef(r: any) {
  const m = readMetadata(r);
  return (
    m?.paymentId || m?.invoiceId || m?.txHash || m?.transactionHash || m?.reference || ""
  );
}

/* The internal row id is not a reference — nobody quotes it to their bank, and
   printing a 36-character UUID in the column made every row without a real
   gateway reference look like the important one. Only show what the payment
   provider actually gave back; the id is one click away in the detail. */
const visibleRef = (r: any) => r.referenceId || r.trxId || metaRef(r) || "";

function shortHash(s: string) {
  return s.length > 28 ? `${s.slice(0, 12)}…${s.slice(-8)}` : s;
}

/* The gateway writes its own shape into metadata, so read the names it might
   have used rather than assuming one. */
function methodOf(r: any) {
  const m = readMetadata(r);
  /* "Tron (TRC-20)" before "TRX": the label is what the person chose on the
     deposit screen, the chain code is what the integration calls it. */
  const named =
    m?.networkLabel || m?.method || m?.gateway || m?.provider || m?.paymentMethod || m?.chain || m?.network;
  if (named && typeof named === "string") return named;
  return r.wallet?.type || "";
}

/**
 * The metadata worth reading.
 *
 * Gateways write their whole working state into this column — methodId, kind,
 * asset, payCurrency, submittedAt, validUntil, abandonedAt — and rendering all
 * of it turned the detail into a debug dump. These are the fields that answer a
 * question someone actually has; everything else is dropped rather than
 * relabelled, because a friendlier name for "abandonedAt" is still a timestamp
 * nobody needs.
 */
const META_FIELDS: { keys: string[]; label: string }[] = [
  { keys: ["payAddress", "depositAddress", "address"], label: "Deposit address" },
  { keys: ["paymentId", "invoiceId"], label: "Payment reference" },
  { keys: ["bonusCode"], label: "Bonus code" },
];

/* Two fields left this list rather than being relabelled.

   **Network.** The row above already reads "Deposit / Tron (TRC-20) · USDT",
   and the detail printed "Network: Tron (TRC-20)" underneath it — the same
   eleven characters a second time, with the chain logo drawn twice on one
   screen. A detail panel is for what the row could not fit.

   **Payment status.** It rendered the gateway's own enum, in the gateway's own
   lower case: a row marked "Failed" carried a field reading "expired", which
   is either a contradiction or a second status to work out, and neither is
   something to hand a trader. Whether a row settled is already on the row
   itself, as its status chip. */

function curatedMeta(r: any): { label: string; value: string }[] {
  const m = readMetadata(r);
  if (!m) return [];
  const out: { label: string; value: string }[] = [];
  for (const field of META_FIELDS) {
    const key = field.keys.find(
      (k) => m[k] !== null && m[k] !== undefined && typeof m[k] !== "object" && String(m[k]) !== ""
    );
    if (key) out.push({ label: field.label, value: String(m[key]) });
  }
  return out;
}

function readMetadata(r: any): Record<string, any> | null {
  const raw = r?.metadata;
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toCsv(rows: any[]) {
  const head = ["Date", "Type", "Direction", "Amount", "Currency", "Fee", "Status", "Reference"];
  const cell = (v: any) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Quote anything that would otherwise break a column.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      new Date(r.createdAt).toISOString().slice(0, 10),
      r.type,
      isIn(r) ? "Deposit" : "Withdrawal",
      amountOf(r).value,
      currencyOf(r),
      r.fee ?? 0,
      r.status,
      referenceOf(r),
    ]
      .map(cell)
      .join(",")
  );
  return [head.join(","), ...lines].join("\n");
}

export const TransactionsPanel = memo(function TransactionsPanel() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [dir, setDir] = useState<Dir>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const refreshWallet = useBinaryStore((s) => s.fetchWalletData);

  /* The fetch on its own, without the spinner.

     `load` flips `loading`, which throws the whole panel away and rebuilds it —
     right on first mount, wrong after a cancel, where it would collapse the row
     the person is still looking at and lose their place in the ledger. This
     refills the rows underneath them instead, so the only thing that visibly
     changes is the status chip on the row they just acted on. */
  const refetch = useCallback(async () => {
    const { data } = await $fetch({
      url: "/api/finance/transaction?perPage=200&sortField=createdAt&sortOrder=desc",
      silent: true,
      silentSuccess: true,
    });
    const items = Array.isArray(data) ? data : data?.items || [];
    setRows(items.filter((r: any) => SHOWN.includes(r.type)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    await refetch();
    setLoading(false);
  }, [refetch]);

  useEffect(() => {
    load();
  }, [load]);

  /* A cancelled withdrawal puts money back, so the header has to stop showing
     the old figure at the same moment the row changes.

     The server does broadcast a balance over the wallet socket, but nothing on
     this client subscribes to it — so relying on that push would leave the
     header stale until something else happened to refresh it. This takes the
     path the withdraw drawer already takes on submit: drop the cached wallet
     and re-read it. The `sessionStorage` line is not optional; `fetchWalletData`
     serves a 30-second cache and would otherwise hand back the balance from
     before the refund. */
  const onRowChanged = useCallback(async () => {
    if (typeof window !== "undefined") sessionStorage.removeItem("wallet_USDT");
    await Promise.all([refetch(), refreshWallet("USDT", true, true)]);
  }, [refetch, refreshWallet]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (dir === "in" && !isIn(r)) return false;
      if (dir === "out" && isIn(r)) return false;
      if (status === "COMPLETED" && r.status !== "COMPLETED") return false;
      if (status === "PENDING" && !IN_FLIGHT.includes(r.status)) return false;
      if (status === "UNSETTLED" && !UNSETTLED.includes(r.status)) return false;
      if (!q) return true;
      const haystack = [
        r.id,
        r.referenceId,
        r.trxId,
        r.description,
        r.type,
        r.status,
        currencyOf(r),
        methodOf(r),
        String(r.amount ?? ""),
        fmtDay(r.createdAt),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, dir, status, query]);

  /* Only COMPLETED counts towards a total — a pending withdrawal has not left
     the account and showing it as though it had would misstate the balance.
     Summed per currency, because adding 400 USD to 0.01 BTC produces a number
     that means nothing; the strip reports the currency the account mostly
     moves in and says plainly when there are others. */
  const display = useDisplayCurrency();

  const totals = useMemo(() => {
    const byCurrency = new Map<
      string,
      { count: number; inTotal: number; outTotal: number; inCount: number; outCount: number }
    >();
    let pendingCount = 0;
    let pendingTotal = 0;
    /* Split by direction, because "2 pending" answers a different question from
       the one people have. Money on its way in and money on its way out are two
       different kinds of waiting: one is a balance about to go up, the other is
       a payout that has not landed and may still be cancelled. */
    let pendingIn = 0;
    let pendingOut = 0;

    for (const r of rows) {
      const cur = currencyOf(r);
      const slot =
        byCurrency.get(cur) ||
        { count: 0, inTotal: 0, outTotal: 0, inCount: 0, outCount: 0 };
      slot.count += 1;
      const amount = Number(r.amount || 0);
      if (isIn(r)) {
        slot.inCount += 1;
        if (r.status === "COMPLETED") slot.inTotal += amount;
      } else {
        slot.outCount += 1;
        if (r.status === "COMPLETED") slot.outTotal += amount;
      }
      byCurrency.set(cur, slot);
      if (IN_FLIGHT.includes(r.status)) {
        pendingCount += 1;
        pendingTotal += amountOf(r).value;
        if (isIn(r)) pendingIn += 1;
        else pendingOut += 1;
      }
    }

    const ranked = [...byCurrency.entries()].sort((a, b) => b[1].count - a[1].count);
    const [currency, primary] = ranked[0] || ["", { count: 0, inTotal: 0, outTotal: 0, inCount: 0, outCount: 0 }];
    /* The rows are summed in the units they are booked in and converted once,
       here — the ledger's own currency while it has one, and the account's
       otherwise, so that nought is nought of something on a new account. */
    const money = moneyFor(currency, display);
    return {
      money,
      ...primary,
      inTotal: primary.inTotal * money.rate,
      outTotal: primary.outTotal * money.rate,
      net: (primary.inTotal - primary.outTotal) * money.rate,
      pendingCount,
      pendingTotal: pendingTotal * money.rate,
      pendingIn,
      pendingOut,
      otherCurrencies: ranked.slice(1).map(([c]) => c).filter(Boolean),
    };
  }, [rows, display]);

  /* Grouped by month so a year of history reads as a statement rather than a
     wall. The month's net is only shown when every movement in it shares one
     currency — otherwise the figure would be a sum of unlike things. */
  const groups = useMemo(() => {
    const out: Group[] = [];
    for (const r of shown) {
      const d = new Date(r.createdAt);
      const key = Number.isNaN(d.getTime())
        ? "undated"
        : `${d.getFullYear()}-${d.getMonth()}`;
      let group = out[out.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: monthLabel(r.createdAt), rows: [], net: 0, settled: 0, currency: currencyOf(r) };
        out.push(group);
      }
      group.rows.push(r);
    }
    for (const g of out) {
      const settled = g.rows.filter((r) => r.status === "COMPLETED");
      g.settled = settled.length;
      const currencies = new Set(g.rows.map(currencyOf));
      if (currencies.size > 1) {
        g.net = null;
        continue;
      }
      /* "net +0.00" on a month of seven failed deposits is arithmetically true
         and reads as a bug. Nothing settled is the thing to say. */
      if (settled.length === 0) {
        g.net = null;
        continue;
      }
      g.net = settled.reduce(
        (n, r) => n + (isIn(r) ? Number(r.amount || 0) : -Number(r.amount || 0)),
        0
      );
    }
    return out;
  }, [shown]);

  const download = useCallback(() => {
    const blob = new Blob([toCsv(shown)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [shown]);

  const filtered = dir !== "all" || status !== "all" || query.trim() !== "";
  const clearFilters = useCallback(() => {
    setDir("all");
    setStatus("all");
    setQuery("");
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 px-5 py-6 md:px-8">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cn(CARD, "h-[86px] animate-pulse")} />
          ))}
        </div>
        <div className={cn(CARD, "grid min-h-[220px] place-items-center")}>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 py-6 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Transaction history</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Deposits and withdrawals on your account. Trade activity is in the terminal.
          </p>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={shown.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.97] active:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50 disabled:active:scale-100"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </header>

      {/* Two across on a phone rather than four stacked cards to scroll past
          before reaching the ledger itself. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard
          art={DepositMark}
          tone="in"
          label="Total deposits"
          value={fmtMoney(totals.inTotal, totals.money)}
          /* "completed", not "completed only". The word was there to warn that
             the total excludes rows that did not settle — but the count beside
             it is the count of what was summed, so "only" was qualifying a
             figure nobody had been given. */
          note={
            <>
              <Count n={totals.inCount} tone="in" />{" "}
              {totals.inCount === 1 ? "transaction" : "transactions"} · completed
            </>
          }
          noteTitle={`${totals.inCount} ${totals.inCount === 1 ? "transaction" : "transactions"} · completed`}
        />
        <StatCard
          art={WithdrawMark}
          tone="out"
          label="Total withdrawals"
          value={fmtMoney(totals.outTotal, totals.money)}
          note={
            <>
              <Count n={totals.outCount} tone="out" />{" "}
              {totals.outCount === 1 ? "transaction" : "transactions"} · completed
            </>
          }
          noteTitle={`${totals.outCount} ${totals.outCount === 1 ? "transaction" : "transactions"} · completed`}
        />
        <StatCard
          art={NetFlowMark}
          /* The one tile whose colour is a result rather than a label: net flow
             is green or red depending on which way the account actually went. */
          tone={totals.net < 0 ? "out" : "in"}
          label="Net flow"
          value={`${totals.net < 0 ? "−" : "+"}${fmtMoney(totals.net, totals.money)}`}
          note={totals.net >= 0 ? "Deposits exceed withdrawals" : "Withdrawals exceed deposits"}
          noteTitle={totals.net >= 0 ? "Deposits exceed withdrawals" : "Withdrawals exceed deposits"}
        />
        <StatCard
          art={PendingMark}
          /* Nothing waiting is not a state worth a colour, so the hourglass
             goes grey and quiet rather than sitting there in amber implying
             something is in flight — and the figure goes back to ink with it,
             since a nought does not need announcing either. */
          dimmed={totals.pendingCount === 0}
          /* The amber of the Pending status chip, so the tile and the rows it
             is counting are recognisably the same thing. This is the one tile
             whose colour is a state rather than a direction, which is also why
             it can have one at all: it holds deposits and withdrawals at once,
             and green or red would have to pick one of them. */
          tone={totals.pendingCount > 0 ? "waiting" : "neutral"}
          label="Pending"
          value={fmtMoney(totals.pendingCount > 0 ? totals.pendingTotal : 0, totals.money)}
          note={<PendingNote deposits={totals.pendingIn} withdrawals={totals.pendingOut} />}
          noteTitle={pendingWords(totals.pendingIn, totals.pendingOut)}
        />
      </div>

      {totals.otherCurrencies.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Totals are in {totals.money.code}. Transactions in{" "}
          {totals.otherCurrencies.join(", ")} are listed below but not included in these figures.
        </p>
      )}

      {/* No box around it. A bordered card holding a search field and two
          segmented controls is a border drawn around three controls that
          already have their own — three nested rectangles before you reach a
          word. The row is just a row. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by reference, amount or network…"
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Segmented
          value={dir}
          onChange={setDir}
          options={[
            ["all", "All"],
            ["in", "Deposits"],
            ["out", "Withdrawals"],
          ]}
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            ["all", "All status"],
            ["COMPLETED", "Completed"],
            ["PENDING", "Pending"],
            ["UNSETTLED", "Failed"],
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <div className={cn(CARD, "flex flex-col items-center gap-3 px-6 py-12 text-center")}>
          {/* Two states, two marks. "Nothing has happened yet" and "nothing
              matches what you asked for" are different news, and a single grey
              receipt for both left the second one looking like the first — as
              though the filters had emptied the account. Arrows for a ledger
              with no movement in it; a struck-through search for a filter that
              found nothing.

              And it sits in a tile. A 24px glyph alone in 200px of empty card
              is a speck; the tile gives it a size that matches the sentence
              under it. */}
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            {filtered ? (
              <SearchX className="h-6 w-6" strokeWidth={1.8} />
            ) : (
              <ArrowDownUp className="h-6 w-6" strokeWidth={1.8} />
            )}
          </span>
          <p className="text-[14px] font-semibold text-foreground">
            {filtered ? "No transactions match these filters" : "No transactions yet"}
          </p>
          <p className="max-w-[380px] text-[12.5px] leading-[18px] text-muted-foreground">
            {filtered
              ? "Adjust the status or type filter, or clear the search."
              : "Your deposits and withdrawals will appear here with their reference and status."}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-1 inline-flex h-9 items-center rounded-lg border border-border bg-muted px-3.5 text-[12.5px] font-semibold text-foreground hover:opacity-90 active:scale-[0.97]"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Phones get the same rows stacked. Five columns on a 390px screen is
              a table you scroll sideways to read the one number you came for. */}
          {/* Gutter and scrollbar styling — see the note on the desktop ledger
              below. Same reflow, same fix. */}
          <div className="max-h-[min(58vh,680px)] overflow-y-auto [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/40 [scrollbar-width:thin] md:hidden">
            <MobileLedger
              groups={groups}
              openId={openId}
              setOpenId={setOpenId}
              onChanged={onRowChanged}
              display={display}
            />
          </div>

          {/* The ledger scrolls inside itself.

              A year of transactions used to grow the panel and push the totals,
              the search field and the filters off the top of it — so the row
              you were looking for was found by scrolling past the controls you
              would need to narrow it down. Capped at the viewport, the four
              figures and the filters stay put and the list moves under them,
              which is what a ledger is supposed to do.

              The header row goes sticky with it, because a table you scroll
              with its column names gone is a grid of unlabelled numbers.

              `scrollbar-gutter: stable` is what stops that cap from jolting the
              layout. A short ledger fits inside it with no scrollbar; expanding
              one row pushes it past the cap, the vertical scrollbar appears and
              takes its width out of the content — and because the table carries
              `min-w-[680px]`, losing that width can drop it under its own
              minimum and bring a *horizontal* scrollbar with it. One click to
              read a reference id, and the box narrows and gains a second
              scrollbar it can be dragged sideways in. Reserving the gutter from
              the start means the width never changes and an expand is just an
              expand.

              The scrollbar is restyled here because of what reserving a gutter
              costs. The app's default bar is 8px with a painted `#f4f4f5`
              track, so an empty reserved gutter is a light grey rail down the
              inside of a bordered card — a gap, on a panel that has no other
              gaps. Six pixels with a transparent track and a `--border` thumb
              reserves space that reads as padding when there is nothing to
              scroll, and as a scrollbar when there is. */}
          <div className="hidden max-h-[min(58vh,680px)] overflow-auto [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/40 [scrollbar-width:thin] rounded-xl border border-border bg-card md:block">
          <table className="w-full min-w-[680px] text-left">
            {/* Sticky sits on the cells rather than here — see `Th`. */}
            <thead>
              <tr className="bg-muted">
                <Th className="w-[150px]">Date</Th>
                <Th>Type</Th>
                <Th className="hidden lg:table-cell">Reference</Th>
                <Th className="text-right">Amount</Th>
                <Th className="hidden text-right md:table-cell">Fee</Th>
                <Th className="w-[140px]">Status</Th>
                <Th className="w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <MonthGroup
                  key={g.key}
                  group={g}
                  openId={openId}
                  setOpenId={setOpenId}
                  onChanged={onRowChanged}
                  display={display}
                />
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Showing {shown.length} of {rows.length}{" "}
            {rows.length === 1 ? "transaction" : "transactions"} · newest first · select a row for full
            details.
          </p>
          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * The movement's mark.
 *
 * The same `AssetLogo` the deposit and withdrawal screens draw, with the same
 * chain badge — so the row in this history looks like the method it was made
 * with. It briefly used /img/blockchains, which is a different, darker set of
 * five files that matches nothing else on the site.
 */
function MovementMark({ row, size = 32 }: { row: any; size?: number }) {
  const m = readMetadata(row) || {};
  const asset = String(m.asset || currencyOf(row) || "");
  /* `network` or `chain`, whichever the gateway wrote. Reading only the first
     lost the TRC-20 badge on every row from a provider that calls the field
     `chain` — and a USDT row with no badge on it is the one thing this mark
     exists to prevent, since USDT on Tron and USDT on Ethereum are two
     different places to send money. `methodOf` above already reads both. */
  const raw = m.network || m.chain;
  const network = raw ? String(raw) : undefined;
  return <AssetLogo asset={asset} network={network} size={size} showChain={!!network} />;
}

/** One month's net, written in the currency that month was booked in. */
function groupNet(g: Group, display: Money) {
  const m = moneyFor(g.currency, display);
  return fmtMoney((g.net || 0) * m.rate, m);
}

type Group = {
  key: string;
  label: string;
  rows: any[];
  net: number | null;
  settled: number;
  currency: string;
};

function MobileLedger({
  groups,
  openId,
  setOpenId,
  onChanged,
  display,
}: {
  groups: Group[];
  openId: string | null;
  setOpenId: (id: string | null) => void;
  /** Re-read the ledger and the balance after a row acts on itself. */
  onChanged: () => void;
  /** What the account is shown in, from the header's own picker. */
  display: Money;
}) {
  return (
    <div className="space-y-4 md:hidden">
      {groups.map((g) => (
        <div key={g.key} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 px-0.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
              {g.label}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {g.net !== null ? (
                <>
                  {"net "}
                  <span className={cn("font-medium", g.net >= 0 ? "text-emerald-500" : "text-foreground")}>
                    {g.net < 0 ? "−" : "+"}
                    {groupNet(g, display)}
                  </span>
                </>
              ) : g.settled === 0 ? (
                "none completed"
              ) : (
                `${g.rows.length} ${g.rows.length === 1 ? "transaction" : "transactions"}`
              )}
            </span>
          </div>

          {g.rows.map((r) => {
            const open = openId === r.id;
            const deposit = isIn(r);
            const money = moneyFor(currencyOf(r), display);
            const fee = Number(r.fee || 0) * money.rate;
            const { value: booked, attempted } = amountOf(r);
            const amount = booked * money.rate;
            const settled = r.status === "COMPLETED";
            return (
              <div key={r.id} className="overflow-hidden rounded-xl border border-border bg-muted/20">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <MovementMark row={r} size={32} />

                  <div className="min-w-0 flex-1">
                    {/* The word takes the direction's colour, the same green
                        and red the figure on the right of this row is set in —
                        one row, one answer to which way the money went. */}
                    <p
                      className={cn(
                        "text-[13px] font-medium",
                        deposit ? "text-verified" : "text-danger"
                      )}
                    >
                      {deposit ? "Deposit" : "Withdrawal"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {fmtDay(r.createdAt)} · {fmtTime(r.createdAt)}
                      {methodOf(r) ? ` · ${methodOf(r)}` : ""}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
                        settled
                          ? deposit
                            ? "text-verified"
                            : "text-danger"
                          : "text-muted-foreground"
                      )}
                      title={
                        attempted
                          ? "Requested amount. This transaction did not complete, so nothing was credited."
                          : undefined
                      }
                    >
                      {settled ? (deposit ? "+" : "−") : ""}
                      {fmtMoney(amount, money)}
                    </p>
                    <span className="mt-0.5 inline-flex">
                      <StatusChip status={r.status} compact />
                    </span>
                  </div>

                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    style={{
                      transition: "transform 160ms ease",
                      transform: open ? "rotate(180deg)" : "none",
                    }}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <RowDetail row={r} onChanged={onChanged} />
                    </motion.div>
                  )}
                </AnimatePresence>

                {fee > 0 && !open && (
                  <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                    Fee {fmtMoney(fee, money)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MonthGroup({
  group,
  openId,
  setOpenId,
  onChanged,
  display,
}: {
  group: Group;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  onChanged: () => void;
  display: Money;
}) {
  return (
    <>
      <tr className="border-b border-border bg-muted/40">
        <td colSpan={7} className="px-3 py-1.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/80">
              {group.label}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {group.rows.length} {group.rows.length === 1 ? "transaction" : "transactions"}
              {group.net !== null ? (
                <>
                  {" · net "}
                  <span
                    className={cn(
                      "font-medium",
                      group.net >= 0 ? "text-emerald-500" : "text-foreground"
                    )}
                  >
                    {group.net < 0 ? "−" : "+"}
                    {groupNet(group, display)}
                  </span>
                </>
              ) : group.settled === 0 ? (
                " · none completed"
              ) : null}
            </span>
          </div>
        </td>
      </tr>
      {group.rows.map((r) => (
        <LedgerRow
          key={r.id}
          row={r}
          open={openId === r.id}
          onToggle={() => setOpenId(openId === r.id ? null : r.id)}
          onChanged={onChanged}
          display={display}
        />
      ))}
    </>
  );
}

function LedgerRow({
  row,
  open,
  onToggle,
  onChanged,
  display,
}: {
  row: any;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
  display: Money;
}) {
  const deposit = isIn(row);
  const money = moneyFor(currencyOf(row), display);
  const method = methodOf(row);
  const fee = Number(row.fee || 0) * money.rate;
  const { value: booked, attempted } = amountOf(row);
  const amount = booked * money.rate;
  const settled = row.status === "COMPLETED";

  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          "cursor-pointer border-b border-border last:border-0",
          open ? "bg-muted/40" : "hover:bg-muted/20"
        )}
      >
        <td className="whitespace-nowrap px-3 py-2.5">
          <p className="text-[13px] text-foreground">{fmtDay(row.createdAt)}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground">{fmtTime(row.createdAt)}</p>
        </td>

        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <MovementMark row={row} size={30} />
            <div className="min-w-0">
              {/* Green in, red out — the same pair the figure at the other end
                  of the row is set in, so the direction is stated once and read
                  twice rather than being a word at one end and a colour at the
                  other. It is not conditioned on the row having settled the way
                  the figure is: a failed withdrawal is still a withdrawal, and
                  what the muting on the figure is there to say is that no money
                  moved, which is a different claim from which way it was going. */}
              <p
                className={cn(
                  "text-[13px] font-medium",
                  deposit ? "text-verified" : "text-danger"
                )}
              >
                {deposit ? "Deposit" : "Withdrawal"}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {method || (deposit ? "Deposit" : "Withdrawal")}
                {money.code ? ` · ${money.code}` : ""}
              </p>
            </div>
          </div>
        </td>

        <td className="hidden max-w-[240px] px-3 py-2.5 lg:table-cell">
          {visibleRef(row) ? (
            <p
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={String(visibleRef(row))}
            >
              {shortHash(String(visibleRef(row)))}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">—</p>
          )}
        </td>

        <td
          className={cn(
            "whitespace-nowrap px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums",
            /* Green is money that arrived. An attempted or in-flight figure is
               muted, so colour never claims a balance changed. */
            /* Both directions are coloured, or neither means anything. A
               credit was green and a debit was plain white, so the only row on
               the page whose figure had no colour was the one where money left
               — read at a glance as the neutral case. `--danger`, the ink red
               the status chips use, not a fill colour. */
            settled ? (deposit ? "text-verified" : "text-danger") : "text-muted-foreground"
          )}
          title={
            attempted
              ? "Requested amount. This transaction did not complete, so nothing was credited."
              : undefined
          }
        >
          {/* The sign is a claim about a balance. An attempt that failed did not
              add anything, so it carries no sign — the direction is in the
              Movement column either way. */}
          {settled ? (deposit ? "+" : "−") : ""}
          {fmtMoney(amount, money)}
        </td>

        <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-[13px] tabular-nums text-muted-foreground md:table-cell">
          {fee > 0 ? fmtMoney(fee, money) : "—"}
        </td>

        <td className="px-3 py-2.5">
          <StatusChip status={row.status} />
        </td>

        <td className="px-3 py-2.5 text-right">
          <ChevronDown
            className="h-4 w-4 text-muted-foreground"
            style={{ transition: "transform 160ms ease", transform: open ? "rotate(180deg)" : "none" }}
          />
        </td>
      </tr>

      <AnimatePresence initial={false}>
        {open && (
          <tr>
            <td colSpan={7} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                style={{ overflow: "hidden" }}
              >
                <RowDetail row={row} onChanged={onChanged} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * What an expanded row holds: three things worth copying, and nothing else.
 *
 * It used to open onto a grid of facts — started, last update, credited, fee,
 * which wallet — and every one of them was either already on the row that was
 * clicked to get here or a restatement of its status chip. A disclosure that
 * answers a question nobody asked is a disclosure people stop opening.
 *
 * What is left is the three values that cannot be read off the row and cannot
 * be retyped from memory: the address the money went to or came from, the
 * reference to quote at support, and the platform's own id for the record.
 * Each is a copy control, because copying is the only thing anyone does with
 * them. The cancel button stays below, since it is an action rather than a
 * fact — it is the one thing here that is not just something to read.
 */
function RowDetail({ row, onChanged }: { row: any; onChanged: () => void }) {
  const deposit = isIn(row);
  const all = curatedMeta(row);
  const address = all.find((f) => f.label === "Deposit address")?.value || "";
  const metaRefValue = all.find((f) => f.label === "Payment reference")?.value || "";
  /* Exactly PENDING, not "in flight".
     `IN_FLIGHT` also covers PROCESSING and FROZEN, and the server will only
     cancel a PENDING row — a payout an operator has already picked up is past
     the point where the trader gets to change their mind. Offering the button
     for those two would be offering a click that always fails. */
  const cancellable = !deposit && String(row.status || "").toUpperCase() === "PENDING";

  /* The same string was printed under three different captions.

     A crypto deposit arrives with the gateway's payment id in metadata, and the
     platform stores it as the row's own referenceId too — so "Payment
     reference" and "Reference" were the identical ten digits, one above the
     other, and the reader is left wondering which one to quote. Each distinct
     value is shown once, under the name that says what it is for. */
  const refs: { label: string; value: string; hint?: string }[] = [];
  const seen = new Set<string>();
  const addRef = (label: string, value: any, hint?: string) => {
    const v = value ? String(value) : "";
    if (!v || seen.has(v)) return;
    seen.add(v);
    refs.push({ label, value: v, hint });
  };
  addRef("Payment reference", row.referenceId || metaRefValue, "Quote this if you contact support");
  addRef("Support ID", row.id, "Our internal record of this transaction");
  /* `row.trxId` — the on-chain hash — is deliberately not a fourth card. It is
     the one value here a trader can look up somewhere other than this platform,
     which is exactly why it was worth showing and exactly why it belongs on a
     screen of its own rather than in a row that is meant to be three things
     long. If it comes back, it comes back as its own thing, not as a fourth. */

  return (
    <div className="border-b border-border bg-background/60 px-4 py-4">
      {(address || refs.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {address && <CopyValue label={deposit ? "Deposit address" : "Sent to address"} value={address} />}
          {refs.map((r) => (
            <CopyValue key={r.label} label={r.label} value={r.value} hint={r.hint} />
          ))}
        </div>
      )}

      {/* `row.description` is not rendered, and that is the point.

          It is the gateway's own one-line summary of the row — "Tether (USDT)
          deposit via Tron (TRC-20)" — and every word of it is already on the
          row above: the type, the asset, the network, the direction. Set under
          a rule at the foot of the panel it read as a closing remark, which is
          why it kept being reported as the sentence that was supposed to have
          gone. Nothing here restates the row. */}

      {cancellable && (
        <div className="mt-4 border-t border-border pt-4">
          <CancelWithdrawal id={row.id} onDone={onChanged} />
        </div>
      )}
    </div>
  );
}

/**
 * Calling off a withdrawal that has not been paid out yet.
 *
 * ── Why it asks twice ──────────────────────────────────────────────────────
 *
 * This is the one control in an expanded row that moves money, and it sits
 * directly under a block of copy-to-clipboard fields somebody is likely to be
 * clicking through. A single-press cancel there is a mis-click that withdraws a
 * withdrawal. The second press is the confirmation, in the same place as the
 * first — not a modal, because a dialog over a row that is already an expanded
 * disclosure is a second layer to dismiss for a decision this small.
 *
 * ── Why the button says what happens to the money ──────────────────────────
 *
 * "Cancel" alone leaves the important question open: the balance was already
 * debited when the request was made, so the person is not calling off a plan,
 * they are asking for held funds back. The confirm line says the amount and the
 * fee return, because a fee that is silently kept on a cancelled payout is
 * exactly the kind of thing that gets found out later.
 *
 * ── Why it does not update the row itself ──────────────────────────────────
 *
 * On success it calls `onDone` and nothing else: the panel re-reads the ledger
 * and the wallet, and the row re-renders from what the server actually says.
 * Writing "Cancelled" into the row here as well would be this component's
 * guess about a state the next fetch is about to report anyway, and the two
 * would disagree the first time the request half-succeeded.
 */
function CancelWithdrawal({ id, onDone }: { id: string; onDone: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const cancel = useCallback(async () => {
    setBusy(true);
    setProblem(null);
    const { data, error } = await $fetch<{ message: string }>({
      url: "/api/finance/withdraw/cancel",
      method: "POST",
      body: { id },
      silent: true,
      silentSuccess: true,
    });
    setBusy(false);

    if (error || !data) {
      /* The server's own words, when it has any. A 409 here is not a fault to
         apologise for in the abstract — it means an operator got to the request
         first, and saying which is the difference between "try again" and
         "there is nothing left to cancel". */
      setProblem(typeof error === "string" ? error : "Could not cancel this withdrawal. Please try again.");
      setAsking(false);
      return;
    }
    onDone();
  }, [id, onDone]);

  if (!asking) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] leading-[17px] text-muted-foreground">
          Changed your mind? This has not been paid out yet.
        </p>
        <button
          type="button"
          onClick={() => {
            setProblem(null);
            setAsking(true);
          }}
          /* Tinted, not neutral. This was `--border` and `--foreground`, which
             is the same button the panel uses for Export CSV — so the one
             control in an expanded row that moves money looked exactly like the
             one that downloads a file. It is not the loud step, though: that is
             the confirm below. This one only has to say what kind of thing it
             is about to start. */
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-danger/35 bg-danger/[0.06] px-3 text-[12.5px] font-semibold text-danger transition-colors hover:bg-danger/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          <Undo2 className="h-3.5 w-3.5" />
          Cancel this withdrawal
        </button>
        {problem && <p className="w-full text-[12px] leading-[17px] text-danger">{problem}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[12px] leading-[17px] text-muted-foreground">
        The amount and the fee go back to your balance.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={busy}
          /* A control's label, not a caption — see the note in
             two-factor-setup. This one is the way out of an irreversible
             action, which is the last button on the page that should be the
             hard one to find. */
          className="inline-flex h-9 items-center rounded-lg px-3 text-[12.5px] font-medium text-foreground/75 transition-colors hover:text-foreground disabled:opacity-50"
        >
          Keep it
        </button>
        {/* Filled, now that the step before it is tinted. Two tinted outlines
            in sequence would make the press that actually cancels the payout
            look like the press that only asked about it, and this is the one
            that cannot be taken back. `--danger-solid` exists for exactly this
            — the file's own words: "the one filled button an irreversible
            action gets, mixed darker so white sits on it legibly". */}
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-danger-solid px-3 text-[12.5px] font-semibold text-white transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Cancelling…" : "Yes, cancel it"}
        </button>
      </div>
    </div>
  );
}



/**
 * One figure, and the drawing tells you which one.
 *
 * **The mark identifies the tile; the colour says which way the money went.**
 * The figure was `--foreground` on all four tiles, on the reasoning that a hue
 * would look like a verdict on the number. In a row of four totals it read as
 * the opposite — four identical white figures that all had to be traced back to
 * their captions. Deposits are green and withdrawals red, which is not a
 * verdict but the same direction the ledger rows below already use, and Pending
 * stays ink because it is both directions at once and a colour there would have
 * to pick one.
 *
 * **The mark is an object, not a glyph in a plate.** These were 16px lucide
 * lines inside 32px tinted squares, and the tint was doing the identifying:
 * green for money in, amber for money out, blue for the balance. Four small
 * coloured squares in a row is also, on the light theme, four highlighter
 * strokes across the top of a page that usually reports that nothing much has
 * happened. The marks in `transaction-marks.tsx` carry their own colour and
 * their own shape, so the plate went with the tint — a tinted ground behind a
 * coloured object is two backgrounds arguing.
 *
 * Proportional figures, not tabular: `tabular-nums` gives every digit the
 * width of a zero, which is right in a column and loose in a standalone
 * number at 20px.
 */
/* The figure takes the direction's colour, the same green and red the ledger
   rows below use. Three tiles out of four are a single direction and can say so;
   Pending is both at once, so it stays ink — a colour there would have to pick a
   side, and the whole point of that tile is that neither side has happened. */
/* `--verified` and `--danger`, the account panel's ink pair — a forest green
   and a brick red. The trading palette's emerald and rose are mixed to be
   spotted from across a chart in motion, and four of them set at 20px across a
   quiet statement page read as highlighter rather than as figures. */
const TONE_INK: Record<string, string> = {
  in: "text-verified",
  out: "text-danger",
  /* `--attention`, not `--attention-solid`. The pending status chip is filled
     with the solid one, and matching it exactly here would set a 20px figure in
     a colour mixed to sit *behind* white — on a dark card that is a brown
     smudge. `--attention` is the same amber as ink, which is what reads as the
     same colour to anyone looking at the two side by side. */
  waiting: "text-attention",
  neutral: "text-foreground",
};

/**
 * A count inside a tile's note, in that tile's own colour.
 *
 * The note is where the figure gets its qualifier — how many rows are behind
 * it, which of them are still moving — and the number in it was the same grey
 * as the words around it, so the one thing worth taking from a subtitle was the
 * hardest part of it to see.
 */
function Count({ n, tone }: { n: number; tone: keyof typeof TONE_INK }) {
  return <span className={cn("font-semibold", TONE_INK[tone])}>{n}</span>;
}

function StatCard({
  art: Art,
  label,
  value,
  note,
  noteTitle,
  tone = "neutral",
  dimmed = false,
}: {
  art: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  note: React.ReactNode;
  /** The note as plain text, for the truncation tooltip. */
  noteTitle?: string;
  /** Which way the money went, for the figure's colour. */
  tone?: "in" | "out" | "waiting" | "neutral";
  /** Drawn grey and quiet, for a tile reporting the absence of a thing. */
  dimmed?: boolean;
}) {
  return (
    <div className={cn(CARD, "p-3.5")}>
      <div className="flex items-center gap-2.5">
        {/* `grayscale` rather than a second grey drawing: one mark, two
            readings, and no way for the quiet version to drift out of step
            with the coloured one. */}
        <span className={cn("flex shrink-0", dimmed && "opacity-60 grayscale")}>
          <Art size={38} />
        </span>
        <p className="min-w-0 truncate text-[12px] font-medium text-muted-foreground">{label}</p>
      </div>
      <p
        className={cn(
          "mt-2.5 truncate text-[20px] font-semibold leading-tight",
          TONE_INK[tone] || TONE_INK.neutral
        )}
        title={value}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[11.5px] leading-[16px] text-muted-foreground" title={noteTitle}>
        {note}
      </p>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    /* A track with a raised chip in it, which is what a segmented control is.
       The selected one used to be `bg-primary/10` — 10% of a colour that is
       *white* in the dark theme and blue in the other two, so the same control
       had a different amount of contrast in each, and in one of them the
       chosen filter was a smudge. A `--card` chip on a `--muted` track is one
       step of elevation in every theme. */
    <div className="flex shrink-0 rounded-lg bg-muted p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium",
            "active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            value === id
              ? "bg-card text-foreground shadow-sm"
              /* The unselected filters were the rail's problem in miniature:
                 three greyed words and one black one, so the control read as
                 one option and three disabled ones rather than four choices.
                 The raised chip says which is selected; the words only have to
                 be readable. */
              : "text-foreground/75 hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * A column name that stays put while the ledger moves under it.
 *
 * The sticking was on the `<thead>`, which is a newer thing than a sticky cell
 * and does not hold everywhere the terminal runs — where it does not, the
 * column names scroll away with the first few rows and what is left is a grid
 * of unlabelled numbers, which is the whole reason a ledger has a header. Each
 * cell sticks instead.
 *
 * Which means each cell carries the band itself. A `<tr>` cannot paint behind a
 * cell that has left it, so `bg-muted` moves here — a transparent header with
 * rows sliding through it is worse than no header at all. The rule underneath
 * is a shadow rather than `border-b` for the same reason one step further down:
 * under `border-collapse: collapse` the borders belong to the table, not to the
 * cell, so a bordered sticky cell leaves its own rule behind at the top of the
 * ledger and floats down bare.
 */
function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_hsl(var(--border))]",
        "px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        className
      )}
    >
      {children}
    </th>
  );
}

export default TransactionsPanel;
