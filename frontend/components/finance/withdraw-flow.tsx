"use client";

/**
 * Withdrawing.
 *
 * The mirror of DepositFlow and mounted in the same two places. Same rule about
 * ordering: the destination is asked for as its own step, because a mistyped
 * bank account or a crypto address on the wrong network is the failure that
 * cannot be undone, and it deserves more room than a field wedged beside the
 * amount.
 *
 * Two things this is careful about that the screen it replaces was not:
 *
 *   The balance is USDT. The old modal showed "Available Balance: 0.00 INR"
 *   next to an account holding funds, because it read a wallet in the currency
 *   the header happened to be displaying — a wallet that does not exist. What
 *   is spendable is stated in the currency it is actually held in.
 *
 *   The fee is shown before the button, not after. A withdrawal costs amount
 *   plus fee, and a trader who types their whole balance should be told it will
 *   not go through while they can still change the number.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ChevronRight, Clock, Loader2 } from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { MethodLogo } from "./asset-logo";
import {
  useFinanceGateways,
  formatAmount,
  validateField,
  type WithdrawMethod,
} from "./use-finance";

type Step = "method" | "details" | "done";

/* Which coin a crypto method pays out in, for its logo. Bank and UPI have no
   honest logo to use and fall back to a glyph — see MethodLogo. */
const PAYOUT_ASSET: Record<string, string> = {
  USDT_TRC20: "USDT",
  USDT_ERC20: "USDT",
  BTC: "BTC",
  ETH: "ETH",
};

export function WithdrawFlow({
  balance: balanceProp,
  onSubmitted,
}: {
  /**
   * Spendable balance in the platform's currency.
   *
   * Optional: the terminal already holds a live figure and passes it so the
   * screen agrees with the header the moment it opens, while the full page has
   * none and falls back to the one the catalogue carries.
   */
  balance?: number;
  onSubmitted?: (remaining: number) => void;
}) {
  const { gateways, loading, error, reload } = useFinanceGateways();

  const [step, setStep] = useState<Step>("method");
  const [method, setMethod] = useState<WithdrawMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const currency = gateways?.balanceCurrency || "USDT";
  const balance = balanceProp ?? gateways?.balance ?? 0;
  const requested = Number(amount) || 0;
  const fee = method?.fee || 0;
  const total = requested + fee;
  const short = total > balance;

  const pick = useCallback((m: WithdrawMethod) => {
    setMethod(m);
    setFields({});
    setFieldErrors({});
    setProblem(null);
    setStep("details");
  }, []);

  const setField = useCallback((name: string, value: string) => {
    setFields((f) => ({ ...f, [name]: value }));
    setFieldErrors((e) => ({ ...e, [name]: "" }));
    setProblem(null);
  }, []);

  const submit = useCallback(async () => {
    if (!method) return;
    setProblem(null);

    // Same rules the server enforces, run here first so the answer is instant.
    const errors: Record<string, string> = {};
    for (const field of method.fields) {
      const message = validateField(field, fields[field.name] || "");
      if (message) errors[field.name] = message;
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    if (requested < method.min) {
      setProblem(`The minimum withdrawal for ${method.label} is ${formatAmount(method.min, currency)}.`);
      return;
    }
    if (short) {
      setProblem(
        `You need ${formatAmount(total, currency)} including the fee, and have ${formatAmount(balance, currency)}.`
      );
      return;
    }

    setSubmitting(true);
    const { data, error: err } = await $fetch<{ balance: number; message: string }>({
      url: "/api/finance/withdraw",
      method: "POST",
      body: { methodId: method.id, amount: requested, details: fields },
      silent: true,
      silentSuccess: true,
    });
    setSubmitting(false);

    if (err || !data) {
      setProblem(typeof err === "string" ? err : "Could not place your request. Please try again.");
      return;
    }
    setResult(data.message);
    setStep("done");
    onSubmitted?.(data.balance);
  }, [method, fields, requested, total, short, balance, currency, onSubmitted]);

  const restart = useCallback(() => {
    setStep("method");
    setMethod(null);
    setAmount("");
    setFields({});
    setFieldErrors({});
    setResult(null);
    setProblem(null);
  }, []);

  if (loading) {
    return (
      <div className="grid min-h-[320px] place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !gateways) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        <p className="text-[13px] font-medium text-foreground">Could not load withdrawal methods</p>
        <button
          type="button"
          onClick={reload}
          className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Context bar only — the drawer already carries the title. */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        {step === "details" ? (
          <button
            type="button"
            onClick={() => setStep("method")}
            className="-ml-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : (
          <span className="text-[12px] font-medium text-muted-foreground">
            {step === "method" ? "Select a method" : "Complete"}
          </span>
        )}
        <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
          {step === "details" ? method?.eta : `${formatAmount(balance, currency)} available`}
        </span>
      </div>

      <div className="px-5 py-5 sm:px-6 sm:py-6">
        {step === "method" && (
          <div className="space-y-2">
            {gateways.withdraw.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m)}
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <MethodLogo kind={m.kind} asset={PAYOUT_ASSET[m.id]} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{m.label}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                    {m.eta} · min {formatAmount(m.min, currency)}
                    {m.fee > 0 ? ` · ${formatAmount(m.fee, currency)} fee` : " · no fee"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        )}

        {step === "details" && method && (
          <div className="space-y-5">
            <div className="space-y-5">
              <label className="block">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Amount to withdraw
                </span>
                <div className="relative mt-1.5">
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setProblem(null);
                    }}
                    placeholder={String(method.min)}
                    className={cn(
                      "h-10 w-full rounded-lg border bg-background pl-3 pr-16 text-[14px] font-medium tabular-nums text-foreground outline-none transition-colors",
                      short && requested > 0
                        ? "border-destructive/50 focus-visible:ring-destructive/20"
                        : "border-border focus-visible:border-ring focus-visible:ring-ring/20",
                      "focus-visible:ring-[3px]"
                    )}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted-foreground">
                    {currency}
                  </span>
                </div>
                <button
                  type="button"
                  // Whole balance minus the fee, so "all" is an amount that can
                  // actually go through rather than one that fails on submit.
                  onClick={() => setAmount(String(Math.max(0, balance - fee)))}
                  className="mt-1.5 text-[11px] font-medium text-primary hover:underline"
                >
                  Withdraw everything ({formatAmount(Math.max(0, balance - fee), currency)})
                </button>
              </label>

              <div className="space-y-3.5 rounded-xl border border-border p-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Where to send it
                </p>
                {method.fields.map((field) => (
                  <label key={field.name} className="block">
                    <span className="text-[12px] font-medium text-foreground">{field.label}</span>
                    <input
                      type={field.type}
                      value={fields[field.name] || ""}
                      onChange={(e) => setField(field.name, e.target.value)}
                      className={cn(
                        "mt-1 h-9 w-full rounded-lg border bg-background px-3 text-[13px] text-foreground outline-none transition-colors focus-visible:ring-[3px]",
                        fieldErrors[field.name]
                          ? "border-destructive/50 focus-visible:ring-destructive/20"
                          : "border-border focus-visible:border-ring focus-visible:ring-ring/20"
                      )}
                    />
                    {fieldErrors[field.name] ? (
                      <span className="mt-1 block text-[11px] text-destructive">
                        {fieldErrors[field.name]}
                      </span>
                    ) : field.hint ? (
                      <span className="mt-1 block text-[11px] text-muted-foreground">{field.hint}</span>
                    ) : null}
                  </label>
                ))}
              </div>

              {method.kind !== "CRYPTO" && (
                <p className="flex items-start gap-1.5 rounded-lg border border-border bg-muted/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  The account must be in your own name. Payments to someone else's account cannot be
                  processed.
                </p>
              )}

              {problem && (
                <p className="flex items-start gap-1.5 text-[12px] text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {problem}
                </p>
              )}
            </div>

            {/* The cost, before the button — not after it. */}
            <div className="flex flex-col gap-3.5 rounded-xl border border-border p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Summary
              </p>
              <dl className="space-y-2 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="tabular-nums text-foreground">{formatAmount(requested, currency)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Fee</dt>
                  <dd className="tabular-nums text-foreground">
                    {fee > 0 ? formatAmount(fee, currency) : "Free"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-border pt-2">
                  <dt className="font-medium text-foreground">Taken from balance</dt>
                  <dd
                    className={cn(
                      "font-semibold tabular-nums",
                      short && requested > 0 ? "text-destructive" : "text-foreground"
                    )}
                  >
                    {formatAmount(total, currency)}
                  </dd>
                </div>
              </dl>

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" /> {method.eta}
              </p>

              <button
                type="button"
                onClick={submit}
                disabled={submitting || requested <= 0 || short}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {submitting ? "Placing request…" : "Request withdrawal"}
              </button>
              {short && requested > 0 && (
                <p className="text-center text-[11px] text-destructive">Not enough balance</p>
              )}
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/12">
              <Check className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="max-w-sm text-[13px] text-foreground">{result}</p>
            <p className="max-w-sm text-[11px] text-muted-foreground">
              The amount has already been held from your balance. If the request is turned down it
              is returned in full, including the fee.
            </p>
            <button
              type="button"
              onClick={restart}
              className="mt-1 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
            >
              Make another request
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default WithdrawFlow;
