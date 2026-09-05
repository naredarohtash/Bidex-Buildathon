"use client";

/**
 * Deposit and withdrawal history.
 *
 * This is the panel that sat at the bottom of both modals showing trading
 * history. It read /api/finance/transaction?type=DEPOSIT, and that endpoint
 * does not filter on transaction type — it reads `walletType` and hands the
 * rest to a generic filter that drops what it does not recognise. So the type
 * was ignored, every transaction on the account came back, and since a binary
 * payout is booked as REFUND, "Deposit history" was a list of settled trades.
 *
 * It now reads /api/finance/ledger, which returns deposits and withdrawals and
 * nothing else.
 */

import { memo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLedger, formatAmount, STATUS_TONE, type LedgerEntry } from "./use-finance";

function when(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

const Row = memo(function Row({ entry }: { entry: LedgerEntry }) {
  const isIn = entry.kind === "deposit";
  /* A pending deposit has an amount of 0 — nothing is verified yet — and
     rendering that as "0.00" reads as a deposit that failed. What they told us
     they sent stands in until there is a confirmed figure. */
  const pendingUnverified = isIn && entry.status === "PENDING" && entry.amount === 0;
  const shown = pendingUnverified ? entry.claimedAmount ?? 0 : entry.amount;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full",
          isIn ? "bg-emerald-500/12" : "bg-amber-500/12"
        )}
      >
        {isIn ? (
          <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <ArrowUpRight className="h-3.5 w-3.5 text-amber-500" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">
          {entry.methodLabel || (isIn ? "Deposit" : "Withdrawal")}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {when(entry.createdAt)}
          {entry.networkLabel ? ` · ${entry.networkLabel}` : ""}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cn(
            "text-[12px] font-semibold tabular-nums",
            pendingUnverified ? "text-muted-foreground" : isIn ? "text-emerald-500" : "text-foreground"
          )}
        >
          {isIn ? "+" : "−"}
          {formatAmount(shown, entry.currency)}
          {pendingUnverified && <span className="ml-1 font-normal text-[10px]">claimed</span>}
        </p>
        <span
          className={cn(
            "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
            STATUS_TONE[entry.status] || "bg-muted text-muted-foreground"
          )}
        >
          {entry.status}
        </span>
      </div>
    </div>
  );
});

export function LedgerPanel({
  kind,
  title,
  collapsible = true,
  limit = 25,
}: {
  kind?: "deposit" | "withdraw";
  title?: string;
  collapsible?: boolean;
  limit?: number;
}) {
  const { items, loading } = useLedger(kind, limit);
  const [open, setOpen] = useState(!collapsible);

  const label =
    title || (kind === "deposit" ? "Deposit history" : kind === "withdraw" ? "Withdrawal history" : "History");

  const body = loading ? (
    <div className="grid place-items-center py-8">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
    </div>
  ) : items.length === 0 ? (
    <div className="flex flex-col items-center gap-1.5 py-8 text-center">
      <Receipt className="h-5 w-5 text-muted-foreground" />
      <p className="text-[12px] font-medium text-foreground">
        No {kind === "withdraw" ? "withdrawals" : kind === "deposit" ? "deposits" : "activity"} yet
      </p>
      <p className="max-w-xs text-[11px] text-muted-foreground">
        Your trades are not shown here — only money entering and leaving your account.
      </p>
    </div>
  ) : (
    <div className="divide-y divide-border">
      {items.map((entry) => (
        <Row key={entry.id} entry={entry} />
      ))}
    </div>
  );

  if (!collapsible) {
    return (
      <div className="rounded-xl border border-border">
        <div className="border-b border-border px-3 py-2.5">
          <p className="text-[12px] font-semibold text-foreground">{label}</p>
        </div>
        <div className="max-h-[340px] overflow-y-auto">{body}</div>
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-1.5 px-4 py-3 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Clock className="h-3.5 w-3.5" />
        {label}
        {!loading && items.length > 0 && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{items.length}</span>
        )}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="max-h-[300px] overflow-y-auto border-t border-border">{body}</div>}
    </div>
  );
}

export default LedgerPanel;
