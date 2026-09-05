"use client";

/**
 * Managing deposit bonus codes.
 *
 * Not a DataTable: the shared admin grid edits one field at a time, and a bonus
 * code is a set of conditions that only make sense together. Whether a code is
 * safe depends on the combination — a 50% bonus is fine with a cap and ruinous
 * without one — so the form shows them on one surface, with the worst case
 * spelled out beneath as the numbers change.
 *
 * The list leads with what a code has cost, because that is the question an
 * operator opens this screen to answer.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Gift,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BonusCode {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minDeposit: number;
  maxBonus: number;
  maxUsesTotal: number;
  maxUsesPerUser: number;
  firstDepositOnly: boolean;
  allowedMethods: string[] | null;
  startsAt: string | null;
  expiresAt: string | null;
  status: boolean;
  usedCount: number;
  totalPaidOut: number;
  state: "LIVE" | "PAUSED" | "SCHEDULED" | "EXPIRED" | "EXHAUSTED";
}

const STATE_TONE: Record<string, string> = {
  LIVE: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  SCHEDULED: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
  PAUSED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  EXHAUSTED: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
};

/* The methods a code may be limited to. Mirrors the backend catalogue; a code
   restricted to a method that does not exist would silently never apply. */
const METHODS = [
  { id: "USDT_TRC20", label: "USDT · Tron" },
  { id: "USDT_ERC20", label: "USDT · Ethereum" },
  { id: "BTC", label: "Bitcoin" },
  { id: "ETH", label: "Ethereum" },
  { id: "TRX", label: "Tron" },
  { id: "LTC", label: "Litecoin" },
  { id: "UPI_INR", label: "UPI" },
  { id: "BANK_INR", label: "Bank transfer" },
];

const BLANK = {
  id: "",
  code: "",
  description: "",
  // Widened deliberately: `as const` pins the draft to PERCENTAGE and the
  // type selector can then never be set to FIXED.
  type: "PERCENTAGE" as BonusCode["type"],
  value: "",
  minDeposit: "",
  maxBonus: "",
  maxUsesTotal: "",
  maxUsesPerUser: "1",
  firstDepositOnly: false,
  allowedMethods: [] as string[],
  startsAt: "",
  expiresAt: "",
  status: true,
};

function money(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** yyyy-MM-ddTHH:mm for a datetime-local input. */
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function BonusCodesPage() {
  const [items, setItems] = useState<BonusCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<typeof BLANK | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await $fetch<{ items: BonusCode[] }>({
      url: "/api/admin/finance/bonus",
      silent: true,
      silentSuccess: true,
    });
    setItems(error || !data?.items ? [] : data.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async () => {
    if (!editing) return;
    setSaving(true);
    const { data, error } = await $fetch<{ message: string }>({
      url: "/api/admin/finance/bonus",
      method: "POST",
      body: {
        ...(editing.id ? { id: editing.id } : {}),
        code: editing.code,
        description: editing.description,
        type: editing.type,
        value: Number(editing.value),
        minDeposit: Number(editing.minDeposit) || 0,
        maxBonus: Number(editing.maxBonus) || 0,
        maxUsesTotal: Number(editing.maxUsesTotal) || 0,
        maxUsesPerUser: Number(editing.maxUsesPerUser) || 0,
        firstDepositOnly: editing.firstDepositOnly,
        allowedMethods: editing.allowedMethods,
        startsAt: editing.startsAt || null,
        expiresAt: editing.expiresAt || null,
        status: editing.status,
      },
      silent: true,
      silentSuccess: true,
    });
    setSaving(false);
    if (error) {
      toast.error(typeof error === "string" ? error : "Could not save that code.");
      return;
    }
    toast.success(data?.message || "Saved.");
    setEditing(null);
    load();
  }, [editing, load]);

  const togglePause = useCallback(
    async (row: BonusCode) => {
      const { error } = await $fetch({
        url: "/api/admin/finance/bonus",
        method: "POST",
        body: { ...row, status: !row.status, value: row.value },
        silent: true,
        silentSuccess: true,
      });
      if (error) {
        toast.error(typeof error === "string" ? error : "Could not change that code.");
        return;
      }
      toast.success(row.status ? `${row.code} paused.` : `${row.code} resumed.`);
      load();
    },
    [load]
  );

  const remove = useCallback(
    async (row: BonusCode) => {
      const { data, error } = await $fetch<{ message: string }>({
        url: `/api/admin/finance/bonus/${row.id}`,
        method: "DELETE",
        silent: true,
        silentSuccess: true,
      });
      // The server refuses to delete a code that has been claimed and explains
      // why; that message is more useful than a generic failure.
      if (error) {
        toast.error(typeof error === "string" ? error : "Could not delete that code.");
        return;
      }
      toast.success(data?.message || "Deleted.");
      load();
    },
    [load]
  );

  /* The worst case, restated as the numbers change. A percentage with a cap is
     bounded by the cap times the number of claims; that product is the figure
     worth seeing before a code goes live, and it is not obvious from the
     fields on their own. */
  const worstCase = useMemo(() => {
    if (!editing) return null;
    const value = Number(editing.value) || 0;
    const cap = Number(editing.maxBonus) || 0;
    const total = Number(editing.maxUsesTotal) || 0;
    const perClaim = editing.type === "FIXED" ? value : cap;
    if (!perClaim) return null;
    if (!total) return `Up to ${money(perClaim)} USDT per claim, with no limit on the number of claims.`;
    return `Up to ${money(perClaim)} USDT per claim × ${total} claims = ${money(perClaim * total)} USDT total.`;
  }, [editing]);

  return (
    /* pt-24 clears the site header, which is `fixed top-0` and h-16 — it takes no
       space in the layout, so a page that starts at the top of the document renders
       underneath it and loses its heading. */
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-24 md:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Deposit bonuses</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Codes traders enter when depositing. The bonus is paid from the amount that actually
            arrives, not the amount they type.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setEditing({ ...BLANK })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            New code
          </button>
        </div>
      </header>

      {loading ? (
        <div className="grid min-h-[220px] place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border py-14 text-center">
          <Gift className="h-5 w-5 text-muted-foreground" />
          <p className="text-[13px] font-medium text-foreground">No bonus codes yet</p>
          <p className="max-w-sm text-[12px] text-muted-foreground">
            Until one exists, the bonus field is hidden from the deposit screen rather than shown
            with nothing behind it.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[14px] font-semibold tracking-wide text-foreground">
                      {row.code}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        STATE_TONE[row.state] || "bg-muted text-muted-foreground"
                      )}
                    >
                      {row.state}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {row.type === "PERCENTAGE" ? `${row.value}%` : `${money(row.value)} USDT`}
                      {row.maxBonus > 0 && ` · max ${money(row.maxBonus)}`}
                    </span>
                  </p>
                  {row.description && (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{row.description}</p>
                  )}
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {row.minDeposit > 0 && <span>min deposit {money(row.minDeposit)}</span>}
                    <span>
                      {row.maxUsesPerUser === 0 ? "unlimited per user" : `${row.maxUsesPerUser}× per user`}
                    </span>
                    {row.maxUsesTotal > 0 && <span>{row.maxUsesTotal} total</span>}
                    {row.firstDepositOnly && <span>first deposit only</span>}
                    {row.allowedMethods?.length ? (
                      <span>{row.allowedMethods.length} method(s) only</span>
                    ) : null}
                    {row.expiresAt && <span>ends {new Date(row.expiresAt).toLocaleDateString()}</span>}
                  </p>
                </div>

                {/* Cost first — the reason this screen gets opened. */}
                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-semibold tabular-nums text-foreground">
                    {money(row.totalPaidOut)} <span className="text-[11px] font-normal">USDT</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {row.usedCount} claim{row.usedCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditing({
                      id: row.id,
                      code: row.code,
                      description: row.description || "",
                      type: row.type,
                      value: String(row.value),
                      minDeposit: String(row.minDeposit || ""),
                      maxBonus: String(row.maxBonus || ""),
                      maxUsesTotal: String(row.maxUsesTotal || ""),
                      maxUsesPerUser: String(row.maxUsesPerUser),
                      firstDepositOnly: row.firstDepositOnly,
                      allowedMethods: row.allowedMethods || [],
                      startsAt: toLocalInput(row.startsAt),
                      expiresAt: toLocalInput(row.expiresAt),
                      status: row.status,
                    })
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => togglePause(row)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12px] font-medium text-foreground hover:bg-muted"
                >
                  {row.status ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {row.status ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(row)}
                  disabled={row.usedCount > 0}
                  title={row.usedCount > 0 ? "Used codes cannot be deleted — pause it instead" : undefined}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── The editor ── */}
      {editing && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setEditing(null)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <h2 className="text-[14px] font-semibold text-foreground">
                {editing.id ? `Edit ${editing.code}` : "New bonus code"}
              </h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Code" hint="Letters, numbers, - and _">
                  <input
                    value={editing.code}
                    onChange={(e) =>
                      setEditing({ ...editing, code: e.target.value.toUpperCase().replace(/\s+/g, "") })
                    }
                    placeholder="WELCOME100"
                    className={inputClass + " font-mono uppercase tracking-wide"}
                  />
                </Field>
                <Field label="Description" hint="Only you see this">
                  <input
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    placeholder="New year campaign"
                    className={inputClass}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bonus type">
                  <select
                    value={editing.type}
                    onChange={(e) =>
                      setEditing({ ...editing, type: e.target.value as "PERCENTAGE" | "FIXED" })
                    }
                    className={inputClass}
                  >
                    <option value="PERCENTAGE">Percentage of deposit</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </Field>
                <Field label={editing.type === "PERCENTAGE" ? "Percentage" : "Amount (USDT)"}>
                  <input
                    inputMode="decimal"
                    value={editing.value}
                    onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                    placeholder={editing.type === "PERCENTAGE" ? "50" : "25"}
                    className={inputClass + " tabular-nums"}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Minimum deposit (USDT)" hint="0 = any amount">
                  <input
                    inputMode="decimal"
                    value={editing.minDeposit}
                    onChange={(e) => setEditing({ ...editing, minDeposit: e.target.value })}
                    placeholder="100"
                    className={inputClass + " tabular-nums"}
                  />
                </Field>
                <Field
                  label="Maximum bonus (USDT)"
                  hint={editing.type === "PERCENTAGE" ? "Required for percentages" : "0 = uncapped"}
                >
                  <input
                    inputMode="decimal"
                    value={editing.maxBonus}
                    onChange={(e) => setEditing({ ...editing, maxBonus: e.target.value })}
                    placeholder="1000"
                    className={inputClass + " tabular-nums"}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Uses per person" hint="0 = unlimited">
                  <input
                    inputMode="numeric"
                    value={editing.maxUsesPerUser}
                    onChange={(e) => setEditing({ ...editing, maxUsesPerUser: e.target.value })}
                    className={inputClass + " tabular-nums"}
                  />
                </Field>
                <Field label="Total uses" hint="0 = unlimited">
                  <input
                    inputMode="numeric"
                    value={editing.maxUsesTotal}
                    onChange={(e) => setEditing({ ...editing, maxUsesTotal: e.target.value })}
                    placeholder="500"
                    className={inputClass + " tabular-nums"}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Starts" hint="Leave empty to start now">
                  <input
                    type="datetime-local"
                    value={editing.startsAt}
                    onChange={(e) => setEditing({ ...editing, startsAt: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Ends" hint="Leave empty for no expiry">
                  <input
                    type="datetime-local"
                    value={editing.expiresAt}
                    onChange={(e) => setEditing({ ...editing, expiresAt: e.target.value })}
                    className={inputClass}
                  />
                </Field>
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  checked={editing.firstDepositOnly}
                  onChange={(e) => setEditing({ ...editing, firstDepositOnly: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-[12.5px] font-medium text-foreground">
                    First deposit only
                  </span>
                  <span className="block text-[11.5px] text-muted-foreground">
                    Only for accounts that have never had a deposit complete.
                  </span>
                </span>
              </label>

              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Payment methods
                </p>
                <p className="mb-2 text-[11.5px] text-muted-foreground">
                  Leave all unchecked to allow every method.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {METHODS.map((m) => {
                    const on = editing.allowedMethods.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...editing,
                            allowedMethods: on
                              ? editing.allowedMethods.filter((x) => x !== m.id)
                              : [...editing.allowedMethods, m.id],
                          })
                        }
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                          on
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {worstCase && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[11.5px] leading-relaxed text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    <b className="font-semibold">Most this can cost:</b> {worstCase}
                  </span>
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="h-9 rounded-lg border border-border px-3.5 text-[12.5px] font-medium text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !editing.code.trim() || !editing.value}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {editing.id ? "Save changes" : "Create code"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
