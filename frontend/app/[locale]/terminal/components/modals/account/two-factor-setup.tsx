"use client";

/**
 * Two-factor setup, compact.
 *
 * The version this replaces spent a full-width band on a four-label progress
 * bar — "Select Method / Setup / Verify / Complete" — above three tall cards of
 * explanatory prose, so choosing a method filled a whole screen to ask one
 * question. It also carried its own copy button that reported success without
 * checking, the same bug the account ID had.
 *
 * Here the steps are a single line of dots, each method is one row, and the
 * panel stays a fixed narrow column because every step is one short question.
 * The API calls are unchanged: /api/user/profile/otp/secret to begin,
 * /api/user/profile/otp/verify to finish.
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Smartphone, Mail, ShieldCheck, Loader2, Check } from "lucide-react";
import { $fetch } from "@/lib/api";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { CopyValue } from "./copy-value";

type Method = "APP" | "EMAIL";
type Step = "choose" | "setup" | "verify" | "done";

/* What is offered here is decided by the server, not by this list.
   Each method is gated by its own setting — twoFactorAppStatus,
   twoFactorEmailStatus, twoFactorSmsStatus — and picking one that is off ends
   a committed flow with "not enabled on this server". That is exactly what
   happened when this list was hardcoded: the settings differ between machines,
   so a screen correct on one was wrong on the other. Reading the same settings
   the server enforces keeps the two in step wherever this runs.

   SMS has no entry at all: carriers charge per message, so there is no free
   gateway to turn on. Add it here if one is ever configured. */
const METHODS: {
  id: Method;
  label: string;
  hint: string;
  icon: React.ElementType;
  recommended?: boolean;
  /** Setting that must be "true" for the server to accept this method. */
  setting: string;
}[] = [
  {
    id: "APP",
    label: "Authenticator app",
    hint: "Google Authenticator, Authy, 1Password — works offline",
    icon: Smartphone,
    recommended: true,
    setting: "twoFactorAppStatus",
  },
  {
    id: "EMAIL",
    label: "Email",
    hint: "A code sent to your inbox each time you sign in",
    icon: Mail,
    setting: "twoFactorEmailStatus",
  },
];

const STEPS: Step[] = ["choose", "setup", "verify", "done"];

const Dots = memo(function Dots({ step }: { step: Step }) {
  const index = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300",
            i < index && "w-1.5 bg-primary/40",
            i === index && "w-6 bg-primary",
            i > index && "w-1.5 bg-muted"
          )}
        />
      ))}
    </div>
  );
});

/** Six boxes that behave like one field: paste fills them, backspace walks back. */
const CodeInput = memo(function CodeInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, " ").slice(0, 6).split("");

  const setAt = (i: number, char: string) => {
    const next = value.padEnd(6, " ").split("");
    next[i] = char;
    onChange(next.join("").replace(/\s/g, "").slice(0, 6));
  };

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d.trim()}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const char = e.target.value.replace(/\D/g, "").slice(-1);
            if (!char) return;
            setAt(i, char);
            refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (d.trim()) setAt(i, " ");
              else refs.current[i - 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (text) {
              onChange(text);
              refs.current[Math.min(text.length, 5)]?.focus();
            }
          }}
          className={cn(
            "h-11 w-10 rounded-lg border border-border bg-background text-center text-base font-semibold",
            "text-foreground outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />
      ))}
    </div>
  );
});

export const TwoFactorSetup = memo(function TwoFactorSetup({
  onCancel,
  onComplete,
}: {
  onCancel: () => void;
  onComplete: () => void;
}) {
  const { user, setUser } = useUserStore();
  const { toast } = useToast();
  const { settings } = useSettings();

  const isOn = (key: string) => {
    const v = (settings as any)?.[key];
    return v === true || v === "true";
  };
  const available = METHODS.filter((m) => isOn(m.setting));

  const [step, setStep] = useState<Step>("choose");
  const [method, setMethod] = useState<Method>("APP");

  // Keep the selection on something the server will accept.
  useEffect(() => {
    if (available.length && !available.some((m) => m.id === method)) {
      setMethod(available[0].id);
    }
  }, [available, method]);
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const begin = useCallback(async () => {
    setBusy(true);
    const { data, error } = await $fetch({
      url: "/api/user/profile/otp/secret",
      method: "POST",
      body: { type: method, phoneNumber: user?.phone, email: user?.email },
      silentSuccess: true,
    });
    setBusy(false);
    if (error) {
      toast({ title: "Could not start setup", description: String(error), variant: "destructive" });
      return;
    }
    setSecret(data?.secret || "");
    setQr(data?.qrCode || "");
    // An emailed code needs no setup screen — it is already on its way.
    setStep(method === "APP" ? "setup" : "verify");
  }, [method, user?.phone, user?.email, toast]);

  const finish = useCallback(async () => {
    if (code.length !== 6) return;
    setBusy(true);
    const { error } = await $fetch({
      url: "/api/user/profile/otp/verify",
      method: "POST",
      body: { otp: code, secret, type: method },
      silentSuccess: true,
    });
    setBusy(false);
    if (error) {
      toast({ title: "That code did not work", description: "Check it and try again.", variant: "destructive" });
      setCode("");
      return;
    }
    if (user) setUser({ ...user, twoFactor: { enabled: true, type: method } } as any);
    setStep("done");
  }, [code, secret, method, user, setUser, toast]);

  // The last step announces itself and closes; nothing to click.
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(onComplete, 1600);
    return () => clearTimeout(t);
  }, [step, onComplete]);

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Two-factor authentication</h3>
        </div>
        <Dots step={step} />
      </div>

      {step === "choose" && (
        <div className="space-y-2">
          {available.length === 0 && (
            <p className="rounded-lg border border-border bg-muted/40 p-4 text-[13px] text-muted-foreground">
              Two-factor is not switched on for this server yet. An administrator
              enables it under Admin → Settings.
            </p>
          )}
          {available.map((m) => {
            const Icon = m.icon;
            const active = method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted/60"
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-foreground">{m.label}</span>
                    {m.recommended && (
                      <span className="rounded border border-verified/35 px-1.5 py-0.5 text-[11px] font-medium text-verified">
                        Best
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{m.hint}</span>
                </span>
                <span
                  className={cn(
                    "h-4 w-4 shrink-0 rounded-full border-2 transition-colors",
                    active ? "border-primary bg-primary" : "border-border"
                  )}
                />
              </button>
            );
          })}

          <div className="flex items-center justify-between pt-3">
            <button
              type="button"
              onClick={onCancel}
              /* `--foreground` at 75%, not `--muted-foreground`. That token is
                 mixed for prose that supports something else — a description
                 under a title. A button is not that: it is the thing you are
                 being asked to press, and there is no reading of "Cancel" in
                 which being hard to read is the point. 75% keeps it plainly
                 quieter than the action beside it and still lands clear of the
                 surface. Same change on every naked text button in the account
                 screens. */
              className="text-[13px] text-foreground/75 transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={begin}
              disabled={busy || available.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "setup" && (
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Scan this with your authenticator app, or enter the key by hand.
          </p>
          {qr && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="Two-factor QR code"
                className="h-40 w-40 rounded-lg border border-border bg-white p-2"
              />
            </div>
          )}
          {secret && <CopyValue label="Setup key" value={secret} />}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="inline-flex items-center gap-1.5 text-[13px] text-foreground/75 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={() => setStep("verify")}
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              I've added it
            </button>
          </div>
        </div>
      )}

      {step === "verify" && (
        <div className="space-y-4">
          <p className="text-center text-[13px] text-muted-foreground">
{method === "APP"
              ? "Enter the six-digit code from your authenticator app."
              : "Enter the six-digit code we just emailed you."}
          </p>
          <CodeInput value={code} onChange={setCode} disabled={busy} />
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setStep(method === "APP" ? "setup" : "choose")}
              className="inline-flex items-center gap-1.5 text-[13px] text-foreground/75 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              type="button"
              onClick={finish}
              disabled={busy || code.length !== 6}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Turn on
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-verified/10 text-verified">
            <Check className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-foreground">Two-factor is on</p>
          <p className="text-[13px] text-muted-foreground">
            You'll be asked for a code the next time you sign in.
          </p>
        </div>
      )}
    </div>
  );
});

export default TwoFactorSetup;
