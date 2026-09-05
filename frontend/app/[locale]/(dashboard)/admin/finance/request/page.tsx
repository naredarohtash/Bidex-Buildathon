"use client";

/**
 * The operator queue.
 *
 * Deliberately not a DataTable. The shared admin table is built for CRUD over a
 * model — list, edit a row, delete a row — and this is not that: it is a
 * worklist where each item needs a decision, one of those decisions needs an
 * amount typed in, and getting it wrong moves real money. A grid with an edit
 * pencil would hide all of that.
 *
 * Two tabs:
 *   Pending    — bank and UPI payouts nobody can confirm automatically, plus
 *                deposits the exchange could not settle on its own.
 *   Unclaimed  — transfers the exchange received that no user has claimed,
 *                usually somebody who paid and closed the tab before submitting
 *                their hash. Read-only; crediting one means knowing whose it is.
 *
 * The consequence of each button is written on the screen rather than left to
 * be inferred, because the two that move money are the counterintuitive ones:
 * approving a DEPOSIT credits an account, and rejecting a WITHDRAWAL refunds
 * one. Approving a withdrawal moves nothing — the balance was already taken
 * when the trader asked for it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Clock,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface QueueItem {
  id: string;
  kind: "deposit" | "withdraw";
  status: string;
  amount: number;
  claimedAmount: number | null;
  fee: number;
  methodLabel: string | null;
  networkLabel: string | null;
  payoutCurrency: string | null;
  details: Record<string, string> | null;
  reference: string | null;
  user: { id: string; name: string; email: string } | null;
  createdAt: string;
  waitingHours: number;
}

interface Unclaimed {
  txId: string;
  asset: string;
  network: string;
  amount: number;
  address: string;
  ageHours: number;
}

function money(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Louder the longer something has sat unanswered. */
function ageTone(hours: number) {
  if (hours >= 48) return "text-destructive";
  if (hours >= 12) return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

export default function FinanceRequestQueue() {
  const [tab, setTab] = useState<"pending" | "unclaimed">("pending");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [unclaimed, setUnclaimed] = useState<Unclaimed[]>([]);
  const [unclaimedNote, setUnclaimedNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const loadPending = useCallback(async () => {
    setLoading(true);
    const { data, error } = await $fetch<{ items: QueueItem[] }>({
      url: "/api/admin/finance/request",
      silent: true,
      silentSuccess: true,
    });
    setItems(error || !data?.items ? [] : data.items);
    setLoading(false);
  }, []);

  const loadUnclaimed = useCallback(async () => {
    setLoading(true);
    const { data, error } = await $fetch<{
      items: Unclaimed[];
      configured: boolean;
      message?: string;
    }>({ url: "/api/admin/finance/request/unclaimed", silent: true, silentSuccess: true });
    setUnclaimed(error || !data?.items ? [] : data.items);
    setUnclaimedNote(data && !data.configured ? data.message || "Exchange keys are not configured." : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "pending") loadPending();
    else loadUnclaimed();
  }, [tab, loadPending, loadUnclaimed]);

  const decide = useCallback(
    async (item: QueueItem, action: "approve" | "reject") => {
      /* Approving a deposit is the one decision that needs a number, and it has
         to be the amount actually received — this queue exists for deposits the
         exchange could not confirm, so there is no verified figure to fall back
         on. */
      const typed = Number(amounts[item.id]);
      if (item.kind === "deposit" && action === "approve" && (!Number.isFinite(typed) || typed <= 0)) {
        toast.error("Enter the amount actually received before approving.");
        return;
      }

      setBusy(item.id);
      const { data, error } = await $fetch<{ message: string }>({
        url: `/api/admin/finance/request/${item.id}`,
        method: "POST",
        body: {
          action,
          ...(item.kind === "deposit" && action === "approve" ? { amount: typed } : {}),
        },
        silent: true,
        silentSuccess: true,
      });
      setBusy(null);

      if (error) {
        toast.error(typeof error === "string" ? error : "Could not apply that decision.");
        return;
      }
      toast.success(data?.message || "Done.");
      // Refetched rather than removed locally: another operator may have
      // decided something else while this one was reading.
      loadPending();
    },
    [amounts, loadPending]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.user?.email?.toLowerCase().includes(q) ||
        i.user?.name?.toLowerCase().includes(q) ||
        i.methodLabel?.toLowerCase().includes(q) ||
        i.reference?.toLowerCase().includes(q)
    );
  }, [items, query]);

  return (
    /* pt-24 clears the site header, which is `fixed top-0` and h-16 — it takes
       no space in the layout, so a page starting at the top of the document
       renders underneath it and loses its heading. */
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-24 md:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Deposits &amp; withdrawals</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Requests waiting on a decision. Crypto deposits settle on their own — anything here
            needs a person.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (tab === "pending" ? loadPending() : loadUnclaimed())}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          {([
            ["pending", "Pending", items.length],
            ["unclaimed", "Unclaimed", unclaimed.length],
          ] as const).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "rounded-md px-3 py-1 text-[12px] font-medium transition-colors",
                tab === id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
            </button>
          ))}
        </div>

        {tab === "pending" && (
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by user, method or hash"
              className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-[12px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid min-h-[240px] place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : tab === "unclaimed" ? (
        unclaimedNote ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-12 text-center">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <p className="text-[13px] text-foreground">{unclaimedNote}</p>
          </div>
        ) : unclaimed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-12 text-center">
            <Check className="h-5 w-5 text-emerald-500" />
            <p className="text-[13px] font-medium text-foreground">Nothing unaccounted for</p>
            <p className="max-w-sm text-[12px] text-muted-foreground">
              Every transfer the exchange received has a matching request.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-[12px] text-foreground">
              These reached the exchange with no matching deposit request — usually someone who paid
              and closed the tab. Confirm who sent each one before crediting it.
            </p>
            {unclaimed.map((u) => (
              <div
                key={u.txId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <ArrowDownLeft className="h-4 w-4 shrink-0 text-emerald-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold tabular-nums text-foreground">
                    {money(u.amount)} {u.asset}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      {u.network}
                    </span>
                  </p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">{u.txId}</p>
                </div>
                <span className={cn("text-[11px] tabular-nums", ageTone(u.ageHours))}>
                  {u.ageHours}h ago
                </span>
              </div>
            ))}
          </div>
        )
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-12 text-center">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <p className="text-[13px] font-medium text-foreground">Nothing waiting</p>
          <p className="max-w-sm text-[12px] text-muted-foreground">
            Crypto deposits confirm on their own. Bank and UPI payouts appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((item) => {
            const isDeposit = item.kind === "deposit";
            return (
              <div key={item.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                        isDeposit ? "bg-emerald-500/12" : "bg-amber-500/12"
                      )}
                    >
                      {isDeposit ? (
                        <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">
                        {item.methodLabel || (isDeposit ? "Deposit" : "Withdrawal")}
                        {!isDeposit && (
                          <span className="ml-2 tabular-nums text-muted-foreground">
                            {money(item.amount)}
                            {item.fee > 0 && ` + ${money(item.fee)} fee`}
                          </span>
                        )}
                        {isDeposit && item.claimedAmount != null && (
                          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                            claims {money(item.claimedAmount)}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.user?.email || "unknown user"}
                        {item.networkLabel ? ` · ${item.networkLabel}` : ""}
                      </p>
                      {item.reference && (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                          {item.reference}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn("flex items-center gap-1 text-[11px] tabular-nums", ageTone(item.waitingHours))}
                  >
                    <Clock className="h-3 w-3" />
                    {item.waitingHours}h
                  </span>
                </div>

                {/* Where the money goes. The reason this page is permission-gated. */}
                {item.details && (
                  <dl className="mt-2.5 grid gap-x-4 gap-y-1 rounded-lg bg-muted/30 p-2.5 text-[11px] sm:grid-cols-2">
                    {Object.entries(item.details).map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <dt className="shrink-0 text-muted-foreground">{k}:</dt>
                        <dd className="truncate font-medium text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {isDeposit && (
                    <input
                      inputMode="decimal"
                      value={amounts[item.id] || ""}
                      onChange={(e) => setAmounts((a) => ({ ...a, [item.id]: e.target.value }))}
                      placeholder="Amount received (USDT)"
                      className="h-8 w-[190px] rounded-lg border border-border bg-background px-2.5 text-[12px] tabular-nums text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
                    />
                  )}
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => decide(item, "approve")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500/12 px-3 text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                  >
                    {busy === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {isDeposit ? "Credit account" : "Mark as paid"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => decide(item, "reject")}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-destructive/10 px-3 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    {isDeposit
                      ? "Approving adds the amount to their balance."
                      : "Rejecting returns the amount and fee to their balance."}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
