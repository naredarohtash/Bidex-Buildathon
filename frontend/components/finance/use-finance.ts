"use client";

/**
 * The data layer behind every deposit and withdrawal screen.
 *
 * There is one of these because there is one backend catalogue. The old modals
 * each carried their own hard-coded list of methods, their own idea of the
 * minimums, and their own copy of the history call — which is how the deposit
 * screen ended up offering five coins that its submit button could not process.
 * Anything that shows a method or a balance movement now reads from here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { $fetch } from "@/lib/api";

export interface DepositMethod {
  id: string;
  label: string;
  /** Groups the picker: crypto settles itself, UPI and bank need an operator. */
  kind: "CRYPTO" | "UPI" | "BANK";
  settlement: "AUTOMATIC" | "MANUAL";
  /** What to call the number we ask for — hash, UTR, bank reference. */
  referenceLabel: string;
  referenceHint: string;
  /** Where to pay, for the methods a person pays by hand. */
  payTo: { field: string; label: string; value: string }[] | null;
  settlementNote?: string;
  asset: string;
  network: string;
  networkLabel: string;
  min: number;
  confirmations: number;
  eta: string;
  address: string | null;
  tag: string | null;
  available: boolean;
  unavailableReason: string | null;
}

export interface WithdrawField {
  name: string;
  label: string;
  hint?: string;
  type: "text" | "tel";
  required: boolean;
  pattern?: string;
  patternHint?: string;
}

export interface WithdrawMethod {
  id: string;
  label: string;
  kind: "CRYPTO" | "BANK" | "UPI";
  payoutCurrency: string;
  networkLabel: string;
  min: number;
  fee: number;
  eta: string;
  settlement: "AUTOMATIC" | "MANUAL";
  fields: WithdrawField[];
}

export interface LedgerEntry {
  id: string;
  kind: "deposit" | "withdraw";
  status: string;
  amount: number;
  claimedAmount: number | null;
  fee: number;
  currency: string;
  methodId: string | null;
  methodLabel: string | null;
  networkLabel: string | null;
  reference: string | null;
  payoutCurrency: string | null;
  createdAt: string;
}

interface Gateways {
  balanceCurrency: string;
  /** Spendable balance, carried with the catalogue so the withdrawal screen
      never renders a zero on a funded account while a second call is in
      flight. */
  balance: number;
  automaticDeposits: boolean;
  /** False when no bonus codes are configured — the field is hidden entirely. */
  bonusesEnabled: boolean;
  deposit: DepositMethod[];
  withdraw: WithdrawMethod[];
}

/**
 * Methods and live deposit addresses.
 *
 * Addresses come from the server on every load rather than being cached in the
 * browser: an address that has been rotated but is still sitting in someone's
 * localStorage is money sent somewhere we are no longer watching.
 */
export function useFinanceGateways() {
  const [data, setData] = useState<Gateways | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error: err } = await $fetch<Gateways>({
      url: "/api/finance/gateway",
      silent: true,
      silentSuccess: true,
    });
    if (err || !res) {
      setError(typeof err === "string" ? err : "Could not load payment methods.");
      setData(null);
    } else {
      setError(null);
      setData(res);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { gateways: data, loading, error, reload: load };
}

/**
 * Deposit and withdrawal history.
 *
 * Reads /api/finance/ledger, which returns only money in and money out. The
 * screens used to read the generic transaction endpoint with ?type=DEPOSIT,
 * which does not filter on type at all — so "Deposit history" listed every
 * transaction on the account, and because a binary payout is booked as REFUND,
 * what a trader actually saw under their deposits was their trading history.
 */
export function useLedger(kind?: "deposit" | "withdraw", limit = 25) {
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (kind) query.set("kind", kind);
    query.set("limit", String(limit));

    const { data, error } = await $fetch<{ items: LedgerEntry[] }>({
      url: `/api/finance/ledger?${query.toString()}`,
      silent: true,
      silentSuccess: true,
    });
    setItems(error || !data?.items ? [] : data.items);
    setLoading(false);
  }, [kind, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

/** Money, shown the same way everywhere. */
export function formatAmount(value: number, currency = "USDT") {
  const n = Number(value) || 0;
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Group the catalogue by coin.
 *
 * USDT appears twice — TRC-20 and ERC-20 — and listing it as two peers reads as
 * two different assets. Traders choose the coin first and the network second,
 * which is also the order in which choosing wrongly costs them: picking the
 * wrong coin is a mistake, picking the wrong network loses the funds.
 */
export const KIND_ORDER: DepositMethod["kind"][] = ["CRYPTO", "UPI", "BANK"];
export const KIND_LABEL: Record<DepositMethod["kind"], string> = {
  CRYPTO: "Cryptocurrency",
  UPI: "UPI",
  BANK: "Bank transfer",
};

/**
 * Split the catalogue into the sections the picker shows.
 *
 * Crypto is grouped again by coin underneath, because USDT spans two chains and
 * listing it twice at the top level reads as two different assets. UPI and bank
 * have one entry each and need no second level.
 */
export function groupByKind(methods: DepositMethod[]) {
  /* Anything without a recognised kind is treated as crypto rather than
     dropped. Filtering strictly meant that a server one deploy behind — sending
     methods with no `kind` yet — produced zero matching sections and a
     completely empty panel: no methods, no explanation, just a heading. Losing
     the grouping is a cosmetic problem; losing every payment method is not, and
     the screen should degrade in that direction. */
  const known = new Set<string>(KIND_ORDER);
  const kindOf = (m: DepositMethod) => (known.has(m.kind) ? m.kind : "CRYPTO");

  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    assets: groupByAsset(methods.filter((m) => kindOf(m) === kind)),
  })).filter((section) => section.assets.length > 0);
}

export function groupByAsset(methods: DepositMethod[]) {
  const groups = new Map<string, { asset: string; label: string; networks: DepositMethod[] }>();
  for (const m of methods) {
    const existing = groups.get(m.asset);
    if (existing) existing.networks.push(m);
    else groups.set(m.asset, { asset: m.asset, label: m.label, networks: [m] });
  }
  return [...groups.values()];
}

/** Client-side mirror of the server's field rules, for instant feedback. */
export function validateField(field: WithdrawField, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return field.required ? `${field.label} is required.` : null;
  if (field.pattern && !new RegExp(field.pattern).test(trimmed)) {
    return field.patternHint ? `${field.patternHint}` : `${field.label} is not valid.`;
  }
  return null;
}

export function useCountUp(target: number, active: boolean) {
  const [value, setValue] = useState(active ? 0 : target);
  useEffect(() => {
    if (!active) {
      setValue(target);
      return;
    }
    let frame = 0;
    const steps = 24;
    const id = setInterval(() => {
      frame += 1;
      // Ease out, so it settles rather than stopping dead.
      setValue(target * (1 - Math.pow(1 - frame / steps, 3)));
      if (frame >= steps) {
        setValue(target);
        clearInterval(id);
      }
    }, 24);
    return () => clearInterval(id);
  }, [target, active]);
  return value;
}

export const STATUS_TONE: Record<string, string> = {
  COMPLETED: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  PENDING: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  REJECTED: "bg-destructive/12 text-destructive",
  FAILED: "bg-destructive/12 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

export const useFinance = { useFinanceGateways, useLedger };
