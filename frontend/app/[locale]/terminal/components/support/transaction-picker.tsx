"use client";

/**
 * "Which payment is this about?"
 *
 * A money ticket without a transaction on it is a ticket that costs two extra
 * days: the agent reads it, asks for the reference, and waits. The person
 * asking usually cannot answer quickly either — the reference is a gateway
 * hash sitting in a ledger two screens away, and they came here because
 * something had already gone wrong.
 *
 * So neither side is asked to type it. The deposits and withdrawals category
 * puts the person's own recent payments of that kind in front of them, and
 * picking one attaches its id to the ticket. The row they pick is the row an
 * agent will see, drawn the same way it is drawn in the account ledger:
 * direction, amount, method, date, status.
 *
 * Reads `/api/finance/transaction`, which scopes to the caller server-side —
 * the same endpoint account/transactions-panel uses, and the same filtering of
 * types, because "a deposit" has to mean the same thing on both screens. It
 * is deliberately a separate small fetch rather than a shared store: this
 * needs twenty rows to choose from, not the two hundred a ledger pages
 * through, and lifting a store between two panels that disagree about scope
 * is how one of them ends up loading the other's data.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Loader2,
  Receipt,
  Search,
  SearchX,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AssetLogo } from "@/components/finance/asset-logo";
import { StatusChip } from "../modals/account/transactions-panel";
import { canonicalZoneId, findZone } from "@/lib/time-zones";
import { TIME_ZONE_KEY } from "../../lib/time-zone-sync";
import { FIELD } from "./support-kit";
import type { TicketContext } from "./support-catalog";

/* The same split account/transactions-panel draws, for the same reason: a
   binary payout is booked as a REFUND, so anything wider than this fills a
   "choose your deposit" list with trade settlements. */
const MONEY_IN = ["DEPOSIT", "FOREX_DEPOSIT"];
const MONEY_OUT = ["WITHDRAW", "FOREX_WITHDRAW"];

export interface TxnRow {
  id: string;
  type: string;
  amount: number;
  fee?: number;
  status: string;
  createdAt: string;
  referenceId?: string | null;
  trxId?: string | null;
  description?: string | null;
  metadata?: any;
  wallet?: { currency?: string; type?: string } | null;
  currency?: string | null;
}

function readMetadata(row: TxnRow): Record<string, any> {
  const raw = row?.metadata;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw)) || {};
  } catch {
    return {};
  }
}

/* Crypto gateways hand back their own identifier and never populate the
   column — the same reason transactions-panel reads the metadata for it. */
export function referenceOf(row: TxnRow): string {
  const m = readMetadata(row);
  return (
    row.referenceId ||
    row.trxId ||
    m.paymentId ||
    m.invoiceId ||
    m.txHash ||
    m.transactionHash ||
    m.reference ||
    ""
  );
}

export function methodOf(row: TxnRow): string {
  const m = readMetadata(row);
  const named =
    m.networkLabel || m.method || m.gateway || m.provider || m.paymentMethod || m.chain || m.network;
  return typeof named === "string" && named ? named : row.wallet?.type || "";
}

export const currencyOf = (row: TxnRow) => row.wallet?.currency || row.currency || "";

/**
 * Which chain the money moved on, if any.
 *
 * `network` or `chain`, whichever the gateway wrote — reading only the first
 * loses the TRC-20 badge on every row from a provider that calls it `chain`,
 * and a USDT row with no badge is the one thing the badge exists to prevent:
 * USDT on Tron and USDT on Ethereum are two different places to send money.
 * The account's ledger reads both; so does this.
 */
export function networkOf(row: TxnRow): string | undefined {
  const m = readMetadata(row);
  const raw = m.network || m.chain;
  return raw ? String(raw) : undefined;
}

/* A deposit that expired books zero, so the figure worth showing is the one
   the person actually tried to move. Flagged rather than silently swapped —
   see `amountOf` in account/transactions-panel, which this mirrors. */
export function amountOf(row: TxnRow): { value: number; attempted: boolean } {
  const booked = Number(row.amount || 0);
  if (booked > 0) return { value: booked, attempted: false };
  const m = readMetadata(row);
  const claimed = Number(m.claimedAmount ?? m.amount ?? m.payAmount ?? 0);
  return claimed > 0 ? { value: claimed, attempted: true } : { value: 0, attempted: false };
}

export function formatAmount(row: TxnRow): string {
  const { value } = amountOf(row);
  const currency = currencyOf(row);
  const written = Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: value > 0 && value < 1 ? 8 : 2,
  });
  return currency ? `${written} ${currency}` : written;
}

export const isMoneyIn = (row: TxnRow) => MONEY_IN.includes(row.type);


export function shortRef(value: string) {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

/**
 * The trader's own clock — the one they picked for the chart.
 *
 * Falls back to the browser's, and to UTC when even that is unrecognised, so
 * it never renders empty. The same resolution the ticket details pane does,
 * because a payment stamped 19:30 in one panel and 14:00 in another is a
 * payment somebody will report twice.
 */
function readerZone(): string {
  const stored =
    (typeof window !== "undefined" && localStorage.getItem(TIME_ZONE_KEY)) ||
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  return findZone(canonicalZoneId(stored))?.id || "UTC";
}

/**
 * When the payment happened, to the minute, on the reader's own clock.
 *
 * The date alone was not enough to pick a row with: somebody who deposits
 * twice on a Tuesday was choosing between two lines that read identically,
 * and the whole point of this control is that the ticket names the exact
 * payment.
 *
 * No offset printed beside it. It was there for a moment and it was the wrong
 * kind of precision: "UTC+05:30" is a fact about the clock rather than about
 * the payment, and putting a second time system next to a time is how you make
 * somebody wonder which one their own screen is in. The conversion still
 * happens — the stamp is in the zone they picked for the chart — it simply is
 * not announced. A time on your own clock needs no label.
 */
function dateOf(row: TxnRow, zone: string) {
  const ms = new Date(row.createdAt).getTime();
  if (!Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: zone,
    });
  } catch {
    /* An unknown zone id throws rather than falling back, and a row with no
       date on it is worse than one in the wrong zone. */
    return new Date(ms).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
}

/**
 * The caller's deposits or withdrawals, newest first.
 *
 * `enabled` rather than an unconditional fetch: this hook is mounted by the
 * wizard as soon as the wizard is, and most tickets are not about money. The
 * request is not made until a category that needs it has actually been chosen.
 */
export function useTransactions(context: TicketContext, enabled: boolean) {
  const [rows, setRows] = useState<TxnRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /* The "have we started" guard is a ref, not the `loading` state.

     It was state, and the effect listed it as a dependency: starting the fetch
     set `loading`, which re-ran the effect, which ran the *cleanup* belonging
     to the run that owned the request — flipping `cancelled` and throwing the
     response away. `loaded` never arrived, so the linked-payment card sat on
     "Looking it up…" for as long as the panel stayed open. A ref re-runs
     nothing, which is what a once-only guard actually wants. */
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    let cancelled = false;
    setLoading(true);
    $fetch<any>({
      url: "/api/finance/transaction?perPage=100&sortField=createdAt&sortOrder=desc",
      silent: true,
      silentSuccess: true,
    })
      .then(({ data }) => {
        if (cancelled) return;
        const items: TxnRow[] = Array.isArray(data) ? data : data?.items || [];
        setRows(items.filter((r) => MONEY_IN.includes(r.type) || MONEY_OUT.includes(r.type)));
        setLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const scoped = useMemo(() => {
    if (context === "deposit") return rows.filter((r) => MONEY_IN.includes(r.type));
    if (context === "withdrawal") return rows.filter((r) => MONEY_OUT.includes(r.type));
    return rows;
  }, [rows, context]);

  return { rows: scoped, all: rows, loading: loading && !loaded, loaded };
}

/* ── The row, shared by the dropdown and by the ticket's detail pane ────── */

export const TransactionLine = memo(function TransactionLine({
  row,
  className,
}: {
  row: TxnRow;
  className?: string;
}) {
  const incoming = isMoneyIn(row);
  const { attempted } = amountOf(row);
  const reference = referenceOf(row);
  const method = methodOf(row);
  const zone = useMemo(() => readerZone(), []);

  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {/* The payment method itself, on the left.
      
          This was a tinted disc with an arrow in it — direction, which the row
          states three more times: in the sign beside the amount, in the words
          of the method, and in the category the ticket is being raised under.
          What it did not say was *what* the payment was, which is the one
          thing somebody picking a transaction out of a list of five is
          matching against their bank app. `AssetLogo` is the account section's
          own mark, chain badge and all, so USDT on Tron and USDT on Ethereum
          are told apart here exactly as they are in the ledger. */}
      <AssetLogo
        asset={currencyOf(row)}
        network={networkOf(row)}
        size={28}
        showChain={!!networkOf(row)}
      />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          {/* The direction, kept next to the figure it belongs to rather than
              as a disc of its own — an arrow at the number is read with the
              number. */}
          {incoming ? (
            <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 self-center text-verified" strokeWidth={2.6} />
          ) : (
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-center text-brand" strokeWidth={2.6} />
          )}
          <span
            className={cn(
              "truncate text-[13px] font-semibold tabular-nums",
              attempted ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {formatAmount(row)}
          </span>
          {attempted && (
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              attempted
            </span>
          )}
        </span>
        <span className="mt-[1px] flex min-w-0 items-center gap-1.5 text-[11.5px] leading-[15px] text-muted-foreground">
          <span className="shrink-0 tabular-nums">{dateOf(row, zone)}</span>
          {method && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{method}</span>
            </>
          )}
          {reference && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate font-mono text-[11px]">{shortRef(reference)}</span>
            </>
          )}
        </span>
      </span>

      {/* The ledger's own pill, not a second rendering of the same fact.
      
          This was coloured text — "Pending" in amber, "Completed" in green —
          beside a transactions page that draws those states as filled pills
          with a glyph in a white disc. Same status, two appearances, one of
          which quietly said "this is a smaller kind of status". `StatusChip`
          comes from the account panel, so Pending, Completed, Failed and the
          six other states it knows about all read here exactly as they read
          in the ledger. */}
      <StatusChip status={row.status} compact />
    </span>
  );
});

/* ── The dropdown ──────────────────────────────────────────────────────── */

export function TransactionPicker({
  context,
  rows,
  loading,
  value,
  onChange,
}: {
  context: TicketContext;
  rows: TxnRow[];
  loading: boolean;
  value: TxnRow | null;
  onChange: (row: TxnRow | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const noun = context === "withdrawal" ? "withdrawal" : "deposit";

  /* Dismissal is pointerdown rather than click: a click that starts inside
     the list and ends outside it — a drag on the scrollbar, or a selection
     across a reference — fires `click` on the document and would close the
     panel out from under the pointer. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      /* Escape belongs to the innermost thing that is open. Without this it
         reaches the overlay and closes the whole workspace, losing a
         half-written ticket to a keystroke meant for a dropdown. */
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
    else setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [formatAmount(r), referenceOf(r), methodOf(r), r.status, dateOf(r, readerZone()), r.description || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  const choose = useCallback(
    (row: TxnRow | null) => {
      onChange(row);
      setOpen(false);
    },
    [onChange]
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          value
            ? "border-brand/40 bg-brand/[0.06]"
            : "border-field-border bg-field hover:border-foreground/20"
        )}
      >
        {value ? (
          <TransactionLine row={value} className="flex-1" />
        ) : (
          <>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <span className="flex-1 text-[13px] text-muted-foreground">
              {loading ? `Loading your ${noun}s…` : `Choose the ${noun} this is about`}
            </span>
          </>
        )}
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground",
              open && "rotate-180"
            )}
            strokeWidth={2}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
            /* `popover`, not `card`. This floats over a surface that is
               already a card in two of the three themes, and popover is the
               one token mixed to sit above whatever it opens on. */
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          >
            <div className="border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by amount, reference or method"
                  className={cn(FIELD, "py-1.5 pl-8 text-[12.5px]")}
                />
              </div>
            </div>

            <div className="max-h-[292px] overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="flex items-center gap-2 px-2.5 py-6 text-[12.5px] text-muted-foreground">
                  <SearchX className="h-4 w-4 shrink-0" />
                  {rows.length === 0
                    ? `No ${noun}s on this account yet.`
                    : `Nothing matches “${query.trim()}”.`}
                </p>
              ) : (
                filtered.map((row) => {
                  const selected = value?.id === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => choose(row)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left",
                        selected ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]"
                      )}
                    >
                      <TransactionLine row={row} className="flex-1" />
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0 text-brand",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                        strokeWidth={2.5}
                      />
                    </button>
                  );
                })
              )}
            </div>

            {/* Not everything is about one payment — "my withdrawals are all
                slow" is a real ticket. Without this the only way past a
                required-looking field is to pick a payment the ticket is not
                about, which is worse than no tag at all. */}
            <button
              type="button"
              onClick={() => choose(null)}
              className="w-full border-t border-border px-3 py-2.5 text-left text-[12.5px] font-medium text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
            >
              This is not about one specific {noun}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
