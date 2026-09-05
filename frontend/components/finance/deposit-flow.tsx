"use client";

/**
 * Depositing.
 *
 * One component, mounted in the terminal's drawer and on the full finance page,
 * because there is one deposit process and two implementations of it would
 * drift within a month.
 *
 * Laid out as a vertical rail rather than a wizard. The wizard showed one
 * question at a time, so a trader could not see how many steps remained, and
 * could not check the network they picked two screens ago at the moment they
 * were about to send real money to an address — which is exactly when they want
 * to. Here every step is on one surface: finished ones collapse to a line that
 * reopens on click, the current one is expanded, later ones are dimmed.
 *
 * The order still follows what a wrong choice costs. Method, then network, then
 * payment: choosing the wrong coin wastes a moment; sending USDT over Ethereum
 * after picking Tron destroys it, so the network is its own step carrying the
 * warning, never a dropdown beside the amount.
 *
 * Drawn in semantic tokens throughout, so light, dark and navy work with no
 * themed branches.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AssetLogo, MethodLogo } from "./asset-logo";
import { StepRail, type RailStep } from "./step-rail";
import {
  useFinanceGateways,
  groupByKind,
  formatAmount,
  useCountUp,
  type DepositMethod,
} from "./use-finance";

/** Copy that reports what actually happened rather than assuming success. */
function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");

  const copy = useCallback(async () => {
    try {
      // Awaited: the promise rejects on a denied permission, and not awaiting
      // it shows "Copied" for a clipboard that was never written.
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      setState("fail");
    }
    setTimeout(() => setState("idle"), 1800);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
        state === "ok"
          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
          : state === "fail"
            ? "border-destructive/40 text-destructive"
            : "border-border text-foreground hover:bg-muted"
      )}
    >
      {state === "ok" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {state === "ok" ? "Copied" : state === "fail" ? "Ctrl+C" : label}
    </button>
  );
}

function Row({
  logo,
  title,
  meta,
  disabled,
  onClick,
}: {
  logo: React.ReactNode;
  title: React.ReactNode;
  meta: string;
  /** When set, the row is off and says so on its face. */
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors",
        disabled ? "cursor-not-allowed opacity-45" : "hover:border-primary/40 hover:bg-muted/40"
      )}
    >
      {logo}
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 truncate text-[13px] font-semibold text-foreground">
          {title}
        </p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{meta}</p>
      </div>
      {disabled ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Unavailable
        </span>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

/* How long the screen encourages someone to pay within.
   Deliberately shorter than the address's real seven-day life. The rate is not
   locked, so a payment made days later can arrive short of what was asked for;
   an hour keeps the quoted figure honest. */
const PAY_WINDOW_MINUTES = 60;

/**
 * Time left in that window.
 *
 * Advisory only. The address keeps working after it runs out and a late payment
 * is still credited — the blockchain has never heard of our timer, and money
 * that genuinely arrived must never be refused because a clock on a web page
 * ran out. What lapsing changes is what the screen says, not what happens to
 * the funds.
 */
function useCountdown(from: number | null) {
  const [left, setLeft] = useState<number>(() =>
    from ? Math.max(0, from + PAY_WINDOW_MINUTES * 60000 - Date.now()) : 0
  );
  useEffect(() => {
    if (!from) return;
    const tick = () => setLeft(Math.max(0, from + PAY_WINDOW_MINUTES * 60000 - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [from]);
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return { left, label: `${minutes}:${String(seconds).padStart(2, "0")}`, lapsed: from !== null && left <= 0 };
}

export function DepositFlow({
  onCredited,
  onClose,
  onSettled,
  registerCloseGuard,
}: {
  onCredited?: (balance: number) => void;
  /** Closes the surface this is mounted in, once leaving has been confirmed. */
  onClose?: () => void;
  /**
   * Take them back to trading. Called when a deposit lands, from the button or
   * from the countdown that follows it.
   *
   * Supplied by the container because "back to trading" means different things
   * in each: the drawer is already on top of the terminal and only has to
   * close, while the finance page has to navigate there.
   */
  onSettled?: () => void;
  /**
   * Hands the container a predicate to run before it closes: false means "not
   * yet, I am asking them first". Only the drawer supplies this; the full page
   * has no close button of its own.
   */
  registerCloseGuard?: (guard: () => boolean) => void;
}) {
  const { gateways, loading, error, reload } = useFinanceGateways();

  const [asset, setAsset] = useState<string | null>(null);
  const [method, setMethod] = useState<DepositMethod | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [bonusCode, setBonusCode] = useState("");
  const [bonus, setBonus] = useState<{ valid: boolean; amount?: number; percent?: number; error?: string } | null>(null);
  const [checkingBonus, setCheckingBonus] = useState(false);
  /* The amount step is free text, so it needs an explicit "done" — unlike
     picking a method, typing does not tell us when the trader has finished. */
  const [amountDone, setAmountDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{
    credited: number;
    pending: boolean;
    message: string;
    /** Set only when the money actually landed, so the screen can show it. */
    balance?: number | null;
  } | null>(null);
  /* What the processor last said about a payment in flight — "confirming",
     "sending". Someone who has definitely paid needs the screen to acknowledge
     it before their balance moves, or the only feedback they get for ten
     minutes is nothing at all. */
  const [progress, setProgress] = useState<string | null>(null);
  /* The address for THIS deposit, returned when the payment is opened. Nothing
     to show before that: it does not exist until the processor issues it. */
  const [payment, setPayment] = useState<{
    /* Which deposit row this address belongs to, so walking away from it can
       say which one to close. */
    depositId: string;
    /* And which method it was issued for. An address is bound to one chain; see
       `livePayment` below for why that has to be checked at render time. */
    methodId: string;
    payAddress: string;
    payinExtraId: string | null;
    payAmount: number;
    payCurrency: string;
    validUntil: string | null;
    creditAmount: number;
    message: string;
    openedAt: number;
  } | null>(null);
  /* Set while asking "you have an address open — really leave?", holding what to
     do if they say yes. */
  const [leaving, setLeaving] = useState<{ proceed: () => void } | null>(null);

  const countdown = useCountdown(payment?.openedAt ?? null);

  /* Close a deposit the trader has decided not to pay.
     Best-effort and never awaited by the caller: the point is to keep the
     operator queue honest, and a failed call leaves a PENDING row — exactly
     what we had before, and still creditable if the money turns up. */
  const abandon = useCallback(async (depositId: string) => {
    await $fetch({
      url: "/api/finance/deposit/abandon",
      method: "POST",
      body: { id: depositId },
      silent: true,
      silentSuccess: true,
    });
  }, []);

  /* Watching for the payment to arrive.
     Without this the address screen was a dead end: it said the balance would
     update on its own and then never changed, which from the trader's side is
     identical to a page that has stopped working. That is the state that
     produces a second payment "just in case".

     Polled rather than pushed. The wallet socket does carry the new balance,
     but it announces a balance, not which deposit caused it — and this screen
     has to speak about THIS payment. Five seconds is well inside the time any
     chain takes to confirm, and the endpoint is a single indexed read. */
  useEffect(() => {
    if (!payment) return;
    let stopped = false;
    /* Whatever the last payment was doing says nothing about this one. Without
       this, opening a second address after abandoning a half-confirmed first
       one inherits "Payment seen — confirming it now" for a transfer nobody has
       made yet. */
    setProgress(null);

    const look = async () => {
      const { data } = await $fetch<{
        status: string;
        credited: number;
        balance: number | null;
        paymentStatus: string | null;
      }>({
        url: `/api/finance/deposit/status?id=${encodeURIComponent(payment.depositId)}`,
        silent: true,
        silentSuccess: true,
      });
      if (stopped || !data) return;

      if (data.status === "COMPLETED") {
        setPayment(null);
        setProgress(null);
        setResult({
          credited: data.credited,
          pending: false,
          message: "Your deposit has been added to your trading balance.",
          balance: data.balance,
        });
        if (data.balance != null) onCredited?.(data.balance);
        return;
      }

      if (data.status === "FAILED" || data.status === "REJECTED") {
        setPayment(null);
        setProgress(null);
        setProblem(
          "That payment did not go through. Nothing has been taken from you — you can start again."
        );
        return;
      }

      setProgress(data.paymentStatus);
    };

    void look();
    const id = setInterval(() => void look(), 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [payment, onCredited]);

  /* Closing the tab on an unpaid address.
     The browser's own prompt, because it is the only thing that can interrupt a
     tab close. It cannot carry our wording and it cannot call the server — so
     this warns and nothing more. The deposit stays PENDING, which is the safe
     resting state: if they paid it after all, the callback still credits them. */
  useEffect(() => {
    if (!payment) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [payment]);

  /* Closing the drawer on an unpaid address.
     The drawer closes on its X, on Escape and on a click anywhere outside it —
     three ways to lose an address by accident, one of them just by aiming
     badly. It asks first now, using the same sheet as going back, and the close
     only happens if they say so. */
  useEffect(() => {
    if (!registerCloseGuard) return;
    registerCloseGuard(() => {
      if (!payment) return true;
      const open = payment;
      setLeaving({
        proceed: () => {
          setPayment(null);
          void abandon(open.depositId);
          onClose?.();
        },
      });
      return false;
    });
  }, [registerCloseGuard, payment, abandon, onClose]);

  const sections = useMemo(() => groupByKind(gateways?.deposit || []), [gateways]);
  const groups = useMemo(() => sections.flatMap((s) => s.assets), [sections]);
  const group = useMemo(() => groups.find((g) => g.asset === asset), [groups, asset]);

  /* Whether a network choice exists at all. A coin on one chain has nothing to
     ask, and showing a step with a single option is noise — the rail drops it
     entirely rather than rendering a formality. */
  const needsNetwork = Boolean(group && group.networks.length > 1);

  const pickAsset = useCallback(
    (id: string) => {
      const found = groups.find((g) => g.asset === id);
      setAsset(id);
      setProblem(null);
      setMethod(found && found.networks.length === 1 ? found.networks[0] : null);
    },
    [groups]
  );

  const submit = useCallback(async () => {
    if (!method) return;
    setProblem(null);

    /* Crypto asks for nothing here — the address it is paid to identifies the
       payer. Only the rupee rails still need a reference, because no API will
       ever tell us a bank transfer arrived. */
    const value = reference.trim();
    if (method.kind !== "CRYPTO" && !value) {
      setProblem(`Enter the ${method.referenceLabel.toLowerCase()} so we can find your payment.`);
      return;
    }

    setSubmitting(true);
    const { data, error: err } = await $fetch<{
      id: string;
      status: string;
      credited?: number;
      balance?: number | null;
      message: string;
      payAddress?: string;
      payinExtraId?: string | null;
      payAmount?: number;
      payCurrency?: string;
      validUntil?: string | null;
      creditAmount?: number;
    }>({
      url: "/api/finance/deposit",
      method: "POST",
      body: {
        methodId: method.id,
        amount: Number(amount) || undefined,
        txId: value,
        bonusCode: bonusCode.trim() || undefined,
      },
      silent: true,
      silentSuccess: true,
    });
    setSubmitting(false);

    if (err || !data) {
      setProblem(typeof err === "string" ? err : "Could not submit your deposit. Please try again.");
      return;
    }

    /* Crypto does not finish here. The payment has been opened and the trader
       still has to pay it, so the address takes over the last step rather than
       a result screen claiming something happened. */
    if (data.status === "AWAITING_PAYMENT" && data.payAddress) {
      setPayment({
        depositId: String(data.id),
        methodId: method.id,
        payAddress: data.payAddress,
        payinExtraId: data.payinExtraId ?? null,
        payAmount: Number(data.payAmount) || 0,
        payCurrency: String(data.payCurrency || method.asset),
        validUntil: data.validUntil ?? null,
        creditAmount: Number(data.creditAmount) || Number(amount) || 0,
        message: data.message,
        openedAt: Date.now(),
      });
      return;
    }

    setResult({
      credited: data.credited || 0,
      pending: data.status !== "COMPLETED",
      message: data.message,
    });
    if (data.status === "COMPLETED" && data.balance != null) onCredited?.(data.balance);
  }, [method, amount, reference, bonusCode, onCredited]);

  /* Checked against the server, not guessed at here. The amount travels with
     it because a code's worth depends on it — "10% up to 1000" means nothing
     without a figure, and telling someone their code is good before knowing it
     qualifies is how a bonus turns into a complaint. */
  const checkBonus = useCallback(async () => {
    const code = bonusCode.trim();
    if (!code) {
      setBonus(null);
      return;
    }
    setCheckingBonus(true);
    const { data } = await $fetch<{ valid: boolean; amount?: number; percent?: number; error?: string }>({
      url: `/api/finance/bonus?code=${encodeURIComponent(code)}&amount=${encodeURIComponent(amount || "0")}`,
      silent: true,
      silentSuccess: true,
    });
    setCheckingBonus(false);
    setBonus(data ?? { valid: false, error: "Could not check that code." });
  }, [bonusCode, amount]);

  const restart = useCallback(() => {
    setAsset(null);
    setMethod(null);
    setAmount("");
    setReference("");
    setPayment(null);
    setBonusCode("");
    setBonus(null);
    setAmountDone(false);
    setResult(null);
    setProblem(null);
    setProgress(null);
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
        <p className="text-[13px] font-medium text-foreground">Could not load payment methods</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
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

  /* ── Result replaces the rail ── */
  if (result && !result.pending) {
    return (
      <DepositSucceeded
        credited={result.credited}
        balance={result.balance ?? null}
        currency={gateways.balanceCurrency}
        onAgain={restart}
        onSettled={onSettled}
      />
    );
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-3.5 px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-500/12">
          <Clock className="h-5 w-5 text-amber-500" />
        </div>
        <p className="max-w-sm text-[13px] leading-relaxed text-foreground">{result.message}</p>
        <p className="max-w-sm text-[11.5px] leading-relaxed text-muted-foreground">
          Nothing else is needed from you. Your balance updates on its own once the payment is
          confirmed.
        </p>
        <button
          type="button"
          onClick={restart}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted"
        >
          <Wallet className="h-3.5 w-3.5" />
          Make another deposit
        </button>
      </div>
    );
  }

  /* ── Step 1: how you want to pay ── */
  const methodStep = (
    <div className="space-y-5">
      {!gateways.automaticDeposits && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="text-[12px] font-semibold text-foreground">
              Crypto deposits are unavailable here
            </p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              This environment has no exchange connection, so there are no addresses to send to.
              Nothing is wrong with your account.
            </p>
          </div>
        </div>
      )}

      {sections.map((section) => (
        <section key={section.kind}>
          <h3 className="mb-2 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.label}
          </h3>
          <div className="space-y-2">
            {section.assets.map((g) => {
              const usable = g.networks.some((n) => n.available);
              const first = g.networks[0];
              return (
                <Row
                  key={`${section.kind}-${g.asset}`}
                  disabled={!usable}
                  onClick={() => pickAsset(g.asset)}
                  logo={
                    section.kind === "CRYPTO" ? (
                      <AssetLogo asset={g.asset} size={34} />
                    ) : (
                      <MethodLogo kind={section.kind} size={34} />
                    )
                  }
                  title={
                    <>
                      {g.label}
                      {section.kind === "CRYPTO" && (
                        <span className="text-[11px] font-normal text-muted-foreground">
                          {g.asset}
                        </span>
                      )}
                    </>
                  }
                  meta={
                    usable
                      ? g.networks.length > 1
                        ? `${g.networks.length} networks available`
                        : first.networkLabel
                      : first?.unavailableReason || "Unavailable"
                  }
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  /* ── Step 2: which chain (only when there is a choice) ── */
  const networkStep = group && (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <p className="text-[11.5px] leading-relaxed text-foreground">
          Send only over the network you pick. {group.label} sent on a different network{" "}
          <span className="font-semibold">cannot be recovered</span>.
        </p>
      </div>
      <div className="space-y-2">
        {group.networks.map((n) => (
          <Row
            key={n.id}
            disabled={!n.available}
            onClick={() => {
              setMethod(n);
              setProblem(null);
            }}
            logo={<AssetLogo asset={n.asset} network={n.network} size={30} showChain />}
            title={n.networkLabel}
            meta={n.available ? `Min ${n.min} ${n.asset} · ${n.eta}` : n.unavailableReason || ""}
          />
        ))}
      </div>
    </div>
  );


  /* ── Step 3: how much, and any bonus ──
     After the method, not before it: the minimum depends on which rail was
     chosen (10 USDT on TRC-20, 20 on ERC-20, 500 INR on UPI), so asking first
     would mean accepting a figure and rejecting it a step later. */
  const enteredAmount = Number(amount) || 0;
  const belowMinimum = enteredAmount > 0 && method ? enteredAmount < method.min : false;
  /* Crypto deposits are priced in USD, because that is what the processor
     accepts — it refuses USDT as a price currency. Labelling the field USDT
     while pricing in USD is what produced "why does it say 14.97 when I typed
     15": the two are close but not equal, and the screen was naming the wrong
     one. Balances are USDT, and USDT tracks the dollar, so the figure credited
     is the figure typed. */
  const amountUnit = method ? (method.kind === "CRYPTO" ? "USD" : "INR") : "";

  const amountStep = method && (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="deposit-amount"
          className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        >
          Amount
        </label>
        <div className="relative mt-1.5">
          <input
            id="deposit-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              // A bonus quoted against the old figure is worse than none.
              setBonus(null);
              setProblem(null);
            }}
            placeholder={String(method.min)}
            className={cn(
              "h-11 w-full rounded-lg border bg-background pl-3 pr-16 text-[15px] font-medium tabular-nums text-foreground outline-none transition-colors focus-visible:ring-[3px]",
              belowMinimum
                ? "border-destructive/50 focus-visible:ring-destructive/20"
                : "border-border focus-visible:border-ring focus-visible:ring-ring/20"
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-medium text-muted-foreground">
            {amountUnit}
          </span>
        </div>
        <p
          className={cn(
            "mt-1.5 text-[11.5px]",
            belowMinimum ? "text-destructive" : "text-muted-foreground"
          )}
        >
          Minimum {method.min} {amountUnit}
        </p>
      </div>

      <div>
          <label
            htmlFor="bonus-code"
            className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Bonus code <span className="normal-case text-muted-foreground/70">(if you have one)</span>
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="bonus-code"
              value={bonusCode}
              onChange={(e) => {
                setBonusCode(e.target.value.toUpperCase());
                setBonus(null);
              }}
              placeholder="Enter code"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-[13px] font-medium uppercase tracking-wide text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
            />
            <button
              type="button"
              onClick={checkBonus}
              disabled={checkingBonus || !bonusCode.trim() || enteredAmount <= 0}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[12px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              {checkingBonus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Apply
            </button>
          </div>

          {bonus && (
            <p
              className={cn(
                "mt-2 flex items-start gap-1.5 text-[11.5px]",
                bonus.valid ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}
            >
              {bonus.valid ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              {bonus.valid
                ? `${bonus.percent}% bonus — an extra ${formatAmount(bonus.amount || 0, gateways.balanceCurrency)} once your deposit confirms.`
                : bonus.error}
            </p>
          )}
      </div>

      {/* What lands in the balance, before anything is sent. */}
      {enteredAmount > 0 && !belowMinimum && (
        <dl className="space-y-2 rounded-xl border border-border bg-muted/20 p-3.5 text-[12px]">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">You send</dt>
            <dd className="tabular-nums text-foreground">
              {enteredAmount.toLocaleString()} {amountUnit}
            </dd>
          </div>
          {bonus?.valid && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Deposit bonus</dt>
              <dd className="tabular-nums text-emerald-600 dark:text-emerald-400">
                +{formatAmount(bonus.amount || 0, gateways.balanceCurrency)}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-border pt-2">
            <dt className="font-medium text-foreground">Credited to your trading account</dt>
            <dd className="font-semibold tabular-nums text-foreground">
              {formatAmount(
                enteredAmount + (bonus?.valid ? bonus.amount || 0 : 0),
                gateways.balanceCurrency
              )}
            </dd>
          </div>
          {method.kind === "CRYPTO" && (
            <p className="pt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              The exact {method.asset} amount to send is worked out at the current rate on the next
              step, and network fees are added on top so this figure arrives in full.
            </p>
          )}
        </dl>
      )}

      <button
        type="button"
        onClick={() => setAmountDone(true)}
        disabled={enteredAmount <= 0 || belowMinimum}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );

  /* ── Step 4: pay ──
     For crypto this is where the issued address appears, after the deposit is
     opened. For the rupee rails it is still where the reference is entered,
     because that is the only thing that can attribute a bank transfer. */

  /* An address is bound to one chain, and showing it under any other is how
     someone loses their money for good — send Bitcoin to the Tron address this
     screen is still displaying and nobody can get it back.

     Navigation is guarded so this should never happen, but "should never" is
     not good enough for an irreversible transfer, so the address is also
     matched against the method being displayed at the moment it is drawn. Any
     mismatch shows no address at all, and the trader opens a correct one. */
  const livePayment = payment && payment.methodId === method?.id ? payment : null;

  const payStep = method && (
    <div className="space-y-4">
      {livePayment ? (
        <>
          {/* What to send, said once and said large.
              This was a paragraph reading "Send exactly 14.97 USDT to this
              address", with the figure inline among the words — the single most
              important number on the screen, set at the same size as the
              sentence around it. Sending the wrong amount is the mistake this
              step exists to prevent, so the amount is the headline and the
              instruction is the caption. */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-center gap-2">
              <AssetLogo asset={method.asset} network={method.network} size={22} showChain />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Send exactly
              </p>
            </div>
            <p className="mt-1.5 text-center text-[26px] font-semibold leading-tight tabular-nums tracking-tight text-foreground">
              {livePayment.payAmount}{" "}
              <span className="text-[16px] font-medium text-muted-foreground">
                {livePayment.payCurrency}
              </span>
            </p>
            {/* The network, restated at the point of no return. It was chosen
                two steps ago and is the one mistake that destroys the funds
                outright, so it is repeated here rather than left behind on a
                collapsed step heading. */}
            <p className="mt-1 text-center text-[12px] font-medium text-foreground">
              on {method.networkLabel}
            </p>
            {/* Where the number comes from. The amount asked for is not the
                amount typed — it is that amount converted at the current rate —
                and a screen that shows one without the other invites exactly
                the question "why does it say 14.97 when I asked for 15". */}
            <p className="mt-1.5 text-center text-[11px] leading-relaxed text-muted-foreground">
              {formatAmount(livePayment.creditAmount, "USD")} at today's rate — that is what reaches
              your balance
            </p>
          </div>

          {/* Two ways to pay it, in the order people reach for them: scan from
              a phone, or copy into a desktop wallet. Numbered because this is a
              procedure with a right order, and the QR sat unlabelled before —
              a picture with no instruction attached to it. */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">
                1
              </span>
              <p className="text-[12px] font-medium text-foreground">
                Scan this with your wallet app
              </p>
            </div>
            <div className="flex justify-center">
              {/* White plate always: a QR inverted by a dark theme will not
                  scan, and the one place that must never fail is the one a
                  phone camera is pointed at. */}
              <div className="rounded-lg bg-white p-3">
                <QRCode value={livePayment.payAddress} size={140} level="M" />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[10px] font-bold text-primary">
                2
              </span>
              <p className="text-[12px] font-medium text-foreground">
                Or copy the address into your wallet
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="break-all font-mono text-[11.5px] leading-relaxed text-foreground">
                {livePayment.payAddress}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <CopyButton value={livePayment.payAddress} label="Copy address" />
                <CopyButton value={String(livePayment.payAmount)} label="Copy amount" />
              </div>
            </div>

            {livePayment.payinExtraId && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold text-foreground">
                    This chain also needs a memo
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[11.5px] text-foreground">
                    {livePayment.payinExtraId}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    Without it your transfer cannot be matched to you.
                  </p>
                </div>
              </div>
            )}

            {!countdown.lapsed ? (
              <p className="flex items-center justify-center gap-1.5 pt-0.5 text-[11.5px] text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                This rate is held for
                <span className="font-semibold tabular-nums text-foreground">{countdown.label}</span>
              </p>
            ) : (
              /* Says what actually happens rather than "expired", which would
                 imply money sent now is lost. It is not — the address still
                 works and a late payment is still credited; only the quoted
                 rate is no longer guaranteed. */
              <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
                <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>
                    The hour is up, so this rate is no longer held. The address still works and
                    anything you send is still credited.
                  </span>
                </p>
                {/* One click, not four. Telling someone to "start a new deposit"
                    while leaving them to press Back through three finished steps
                    is an instruction without a way to follow it. Re-opening keeps
                    the method, network and amount they already chose. */}
                <button
                  type="button"
                  onClick={() => {
                    /* Close the old one before opening its replacement, or every
                       lapsed rate quietly leaves another open address behind. */
                    void abandon(livePayment.depositId);
                    setPayment(null);
                    void submit();
                  }}
                  disabled={submitting}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Get a new address at today's rate
                </button>
              </div>
            )}
          </div>

          {/* The live half of the screen.
              Everything above is static and was all this step used to be: it
              told someone their balance would update on its own and then never
              changed again, which is indistinguishable from a page that has
              stopped working. This is now polled, so the screen answers the
              only question they have after paying — did it arrive? */}
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              <p className="text-[12.5px] font-semibold text-foreground">
                {progress ? "Payment seen — confirming it now" : "Waiting for your payment"}
              </p>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {progress
                ? `Your transfer has reached the network and is being confirmed. This usually takes ${method.eta}. Nothing more is needed from you.`
                : `This address is yours alone, so we will know the payment is yours — there is no reference to enter. This screen updates by itself the moment it arrives, usually within ${method.eta}.`}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              You can close this and keep trading. Your balance updates either way.
            </p>
          </div>
        </>
      ) : (
        <>
          {method.payTo && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
              {method.kind === "UPI" && method.payTo.find((d) => d.field === "upiId") && (
                <div className="flex flex-col items-center gap-2 pb-1">
                  <div className="rounded-lg bg-white p-3">
                    <QRCode
                      value={`upi://pay?pa=${method.payTo.find((d) => d.field === "upiId")!.value}&am=${Number(amount) || ""}&cu=INR`}
                      size={132}
                      level="M"
                    />
                  </div>
                  <p className="text-[11.5px] text-muted-foreground">Scan with any UPI app</p>
                </div>
              )}
              {method.payTo.map((detail) => (
                <div
                  key={detail.field}
                  className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{detail.label}</p>
                    <p className="truncate text-[13px] font-medium text-foreground">{detail.value}</p>
                  </div>
                  <CopyButton value={detail.value} />
                </div>
              ))}
            </div>
          )}

          {method.kind !== "CRYPTO" && (
            <label className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {method.referenceLabel}
              </span>
              <input
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  setProblem(null);
                }}
                placeholder="Enter the reference number"
                className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-[12px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
              />
              <span className="mt-1.5 block text-[11.5px] leading-relaxed text-muted-foreground">
                {method.referenceHint}
              </span>
            </label>
          )}

          <div className="flex items-center gap-4 rounded-xl border border-border px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {method.eta}
            </p>
            {method.kind === "CRYPTO" && (
              <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> {method.confirmations} confirmation
                {method.confirmations === 1 ? "" : "s"}
              </p>
            )}
          </div>

          {problem && (
            <p className="flex items-start gap-1.5 text-[12px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {problem}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || (method.kind !== "CRYPTO" && !reference.trim())}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {submitting
              ? "Opening…"
              : method.kind === "CRYPTO"
                ? "Get payment address"
                : "I've sent it"}
          </button>
        </>
      )}
    </div>
  );

  /* The marks carried on finished steps.
     A collapsed step said "USDT · Tron (TRC-20)" in small grey text, which is
     something you have to stop and read. The coin mark with its chain badge is
     recognised without reading — and the moment that matters is the one just
     before sending funds that cannot be recalled, when someone glances up to
     check they picked the right thing. */
  const methodMark = group ? (
    sections.find((s) => s.assets.some((a) => a.asset === group.asset))?.kind === "CRYPTO" ? (
      <AssetLogo asset={group.asset} size={18} />
    ) : (
      <MethodLogo kind={group.networks[0]?.kind ?? "CRYPTO"} size={18} />
    )
  ) : null;

  const steps: RailStep[] = [
    {
      id: "method",
      title: "Payment method",
      summary: group ? group.label : null,
      icon: methodMark,
      content: methodStep,
    },
    ...(needsNetwork
      ? [
          {
            id: "network",
            title: "Network",
            summary: method?.networkLabel ?? null,
            icon: method ? (
              <AssetLogo asset={method.asset} network={method.network} size={18} showChain />
            ) : null,
            content: networkStep,
          },
        ]
      : []),
    {
      id: "amount",
      title: "Amount",
      summary: amountDone
        ? `${(Number(amount) || 0).toLocaleString()} ${amountUnit}${bonus?.valid ? " + bonus" : ""}`
        : null,
      content: amountStep,
    },
    { id: "pay", title: "Send payment", summary: null, content: payStep },
  ];

  // Derived, never stored: one source of truth for how far along we are, so the
  // rail cannot disagree with the selections that produced it.
  const activeIndex = !group
    ? 0
    : needsNetwork && !method
      ? 1
      : !amountDone
        ? steps.length - 2 // the amount step
        : steps.length - 1; // send payment

  /* Move the rail to a step. Pure state, no questions asked — everything that
     needs to check with the trader first does so before calling this. */
  const goToStep = (id: string) => {
    if (id === "method") {
      setAsset(null);
      setMethod(null);
    } else if (id === "network") {
      setMethod(null);
    }
    // Anything before "pay" invalidates the amount that was confirmed.
    if (id !== "pay") setAmountDone(false);
    setProblem(null);
  };

  return (
    <div className="relative px-5 py-5 sm:px-6 sm:py-6">
      <StepRail
        steps={steps}
        activeIndex={activeIndex}
        onSelect={(i) => {
          const id = steps[i]?.id;
          if (!id) return;

          /* Going back from an issued address.
             This used to just happen, and it left the address on screen while
             the rail moved: pick Bitcoin after opening a Tron address and the
             pay step still drew the Tron QR under a "Bitcoin" heading. Anyone
             following that screen sends BTC to a TRON address, and nobody can
             get it back.

             So it is a decision now, not a side effect. Once they confirm, the
             deposit is closed on the server and the address is dropped from
             state — there is no path that carries it into a different coin. */
          if (payment && id !== "pay") {
            const open = payment;
            setLeaving({
              proceed: () => {
                setPayment(null);
                goToStep(id);
                void abandon(open.depositId);
              },
            });
            return;
          }

          goToStep(id);
        }}
      />

      {leaving && (
        <LeaveConfirm
          onStay={() => setLeaving(null)}
          onLeave={() => {
            const go = leaving.proceed;
            setLeaving(null);
            go();
          }}
        />
      )}
    </div>
  );
}

/**
 * "You have an address open."
 *
 * Shown when a trader navigates away from a payment they have been given an
 * address for.
 *
 * The first draft explained the mechanism — that the address belongs to this
 * deposit, that a new one would be issued. Accurate, and the wrong thing to
 * say: someone mid-click does not want a description of address lifecycles,
 * they want to know whether they are about to lose money. So the two lines are
 * now the only two facts that change what they should do, in the order they
 * will worry about them.
 *
 * Staying is the default and the prominent action, because most people who see
 * this got here by mis-aiming rather than by deciding.
 */
function LeaveConfirm({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-background/85 px-5 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-amber-500/12">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>

        <p className="mt-3 text-[15px] font-semibold tracking-tight text-foreground">
          Haven't paid yet?
        </p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          Leaving closes this payment and its address. You can start a new deposit any time.
        </p>

        {/* The line that stops a panic. Someone who has already sent funds and
            is now clicking around must not be left thinking they just cancelled
            their own money — and this is the moment they would think it. */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <p className="text-[12px] leading-relaxed text-foreground">
            <span className="font-semibold">Already sent it? It's safe.</span> Your money will still
            reach your balance — leaving does not cancel a payment.
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onStay}
            className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Keep this payment open
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex h-9 w-full items-center justify-center rounded-lg text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Leave anyway
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The moment it lands.
 *
 * Nothing marked the end of a deposit before. The payment screen said the
 * balance would update on its own and then stayed exactly as it was, so the
 * only way to find out whether real money had arrived was to close the panel
 * and squint at the header — after which someone is still not sure, and sends
 * again.
 *
 * So this is deliberately loud: the figure counts up, it says the new balance
 * outright, and it puts them back where they were going anyway. Trading is what
 * they came to do; the deposit was the errand.
 *
 * The countdown can always be stopped. Auto-navigation that cannot be cancelled
 * is how someone loses a reference number they were still reading.
 */
function DepositSucceeded({
  credited,
  balance,
  currency,
  onAgain,
  onSettled,
}: {
  credited: number;
  balance: number | null;
  currency: string;
  onAgain: () => void;
  onSettled?: () => void;
}) {
  const shown = useCountUp(credited, true);
  const [left, setLeft] = useState(5);
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    // Nowhere to send them, so no countdown to run.
    if (!onSettled || holding) return;
    if (left <= 0) {
      onSettled();
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left, holding, onSettled]);

  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/12">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-500">
          <Check className="h-6 w-6 text-white" strokeWidth={3} />
        </div>
      </div>

      <p className="mt-4 text-[15px] font-semibold tracking-tight text-foreground">
        Payment received
      </p>

      <p className="mt-2 text-[32px] font-semibold leading-none tabular-nums tracking-tight text-emerald-500">
        +{shown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        <span className="ml-1.5 text-[16px] font-medium">{currency}</span>
      </p>

      {balance != null && (
        <p className="mt-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2 text-[12.5px] text-muted-foreground">
          New balance{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {formatAmount(balance, currency)}
          </span>
        </p>
      )}

      <div className="mt-6 w-full max-w-xs space-y-2">
        {onSettled && (
          <button
            type="button"
            onClick={onSettled}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start trading
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setHolding(true);
            onAgain();
          }}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
        >
          <Wallet className="h-3.5 w-3.5" />
          Deposit again
        </button>
      </div>

      {onSettled && !holding && (
        <button
          type="button"
          onClick={() => setHolding(true)}
          className="mt-3 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Taking you to trading in {left}s — stay here
        </button>
      )}
    </div>
  );
}

export default DepositFlow;
