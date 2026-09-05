"use client";

/**
 * Turning two-factor on, in one popup.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The switch on the security card used to replace the entire page with a
 * four-step wizard: pick a method (already picked, by the switch you just
 * flipped), a setup screen, a verify screen, a success screen. Turning on a
 * setting closed the settings, and any error along the way arrived as a toast
 * in the corner of a page that no longer showed the thing it was about — so
 * "it just throws an error" was, from the trader's side, the whole story.
 *
 * A second factor is one question — *prove you have the thing* — so it is one
 * card: what to scan or where to look, the six boxes, and a button. Nothing
 * navigates. The card is closable at every point except while a request is in
 * flight, and closing it changes nothing about the account.
 *
 * ── The order the server wants ─────────────────────────────────────────────
 *
 * 1. `POST otp/secret` mints the secret. For APP it also returns a QR image;
 *    for EMAIL the server posts the first code to the address on the account.
 *    This is also the call that fails when the method is switched off
 *    server-side, which is the error people were hitting — so that answer gets
 *    a screen of its own with the reason spelled out, rather than a toast.
 * 2. `POST otp/verify` checks the code *and already saves it* — the route
 *    calls `saveOTPQuery` itself.
 * 3. `POST otp` saves again and is the only call that returns recovery codes,
 *    which is why it runs even though step 2 has stored the same secret.
 *
 * Recovery codes are shown once, on the last screen, because that is the only
 * time they exist in a form anybody can read. The account is already protected
 * by the time that screen appears: closing it early loses the codes, not the
 * setting.
 *
 * ── The clock, for the mailed kind ─────────────────────────────────────────
 *
 * An emailed TOTP is generated when the mail is queued and typed whenever the
 * mail lands, so the server verifies it with a wide window (see the
 * BIDEX_OTP_WINDOW note in `otp/verify.post.js`). Resending mints a *new*
 * secret, so the code in the newest mail is the one that works — the copy says
 * so, because two codes in an inbox and no word about which is live is how
 * this reads as broken when it is working.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, ShieldCheck } from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/user";
import {
  Modal,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogButton,
  Labelled,
  Notice,
  Ack,
  dialogInput,
} from "@/components/ui/dialog-kit";
import { CodeInput } from "./code-input";
import { AuthenticatorMark, EmailCodeMark } from "./marks";

export type Method = "APP" | "EMAIL";

const COPY: Record<
  Method,
  { title: string; subtitle: string; mark: React.ElementType; label: string }
> = {
  APP: {
    title: "Authenticator app",
    subtitle: "Scan the square in your app, then type the code it shows.",
    mark: AuthenticatorMark,
    label: "Set up an authenticator app",
  },
  EMAIL: {
    title: "Email code",
    subtitle: "We have sent a six-digit code to the address on your account.",
    mark: EmailCodeMark,
    label: "Set up email codes",
  },
};

/* Groups of four. A 32-character base32 secret typed off the screen in one
   unbroken run is where the typo goes. */
function grouped(secret: string) {
  return (secret.match(/.{1,4}/g) || []).join(" ");
}

export function TwoFactorDialog({
  method,
  onClose,
  onDone,
}: {
  /** Null closes it. The method is fixed by the switch that opened it. */
  method: Method | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user, setUser } = useUserStore();

  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<null | "secret" | "codes">(null);

  const [retryIn, setRetryIn] = useState(0);

  /* One request per opening. Without the guard, React's double-invoked effects
     in development ask the server for two secrets and mail two codes, and the
     one in the first mail is dead on arrival. */
  const asked = useRef<Method | null>(null);

  const prepare = useCallback(
    async (which: Method) => {
      setPreparing(true);
      setPrepareError(null);
      setError(null);
      const { data, error: failure } = await $fetch({
        url: "/api/user/profile/otp/secret",
        method: "POST",
        body: { type: which, email: user?.email },
        silent: true,
        silentSuccess: true,
      });
      setPreparing(false);

      if (failure || !(data as any)?.secret) {
        setPrepareError(
          typeof failure === "string" ? failure : "The setup could not be started."
        );
        return;
      }
      setSecret((data as any).secret);
      setQr((data as any).qrCode || "");
      if (which === "EMAIL") setRetryIn(60);
    },
    [user?.email]
  );

  /* Opening asks for the secret; closing forgets everything, so the next
     opening is a clean setup rather than a half-finished one. */
  useEffect(() => {
    if (!method) {
      asked.current = null;
      setSecret("");
      setQr("");
      setCode("");
      setCodes(null);
      setSaved(false);
      setError(null);
      setPrepareError(null);
      setRetryIn(0);
      return;
    }
    if (asked.current === method) return;
    asked.current = method;
    prepare(method);
  }, [method, prepare]);

  useEffect(() => {
    if (retryIn <= 0) return;
    const id = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [retryIn]);

  const turnOn = useCallback(async () => {
    if (!method || code.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);

    const { error: bad } = await $fetch({
      url: "/api/user/profile/otp/verify",
      method: "POST",
      body: { otp: code, secret, type: method },
      silent: true,
      silentSuccess: true,
    });

    if (bad) {
      setVerifying(false);
      /* The server says "Invalid OTP", which is true and unhelpful: the two
         reasons it happens are a mistyped code and a code from a mail that has
         been superseded, and neither is obvious from those two words. */
      setError(
        typeof bad === "string" && !/invalid otp/i.test(bad)
          ? bad
          : method === "EMAIL"
            ? "That code did not match. Use the code from the newest email — asking for another one replaces the last."
            : "That code did not match. Check your app is showing the current code and try again."
      );
      setCode("");
      return;
    }

    /* Verify has already stored the secret. This second call is what returns
       the recovery codes, and it is the only place they are ever readable. */
    const { data, error: saveFailed } = await $fetch({
      url: "/api/user/profile/otp",
      method: "POST",
      body: { secret, type: method },
      silent: true,
      silentSuccess: true,
    });
    setVerifying(false);

    await setUser({
      ...user,
      twoFactor: { enabled: true, type: method },
    } as any);

    /* The factor is on either way — verify saved it. A failure here costs the
       recovery codes, not the protection, so it says that rather than looking
       like the whole thing failed. */
    setCodes(saveFailed ? [] : (data as any)?.recoveryCodes || []);
  }, [code, method, secret, setUser, user, verifying]);

  const copy = useCallback(async (text: string, what: "secret" | "codes") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* Clipboard permission can be refused; the key is on screen either way. */
    }
  }, []);

  const download = useCallback(() => {
    if (!codes?.length) return;
    const body = [
      `${process.env.NEXT_PUBLIC_SITE_NAME || "Bidex"} recovery codes`,
      user?.email ? `Account: ${user.email}` : "",
      "",
      "Each code signs you in once if you lose your second factor.",
      "",
      ...codes,
    ]
      .filter(Boolean)
      .join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "bidex-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [codes, user?.email]);

  const open = method !== null;
  const copyText = COPY[method || "APP"];
  const Mark = copyText.mark;
  const done = codes !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      closable={!verifying}
      label={copyText.label}
      className={done ? "max-w-[460px]" : "max-w-[440px]"}
    >
      {/* ── What this is ──────────────────────────────────────────────── */}
      <DialogHeader
        onClose={onClose}
        closeDisabled={verifying}
        mark={
          done ? (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-verified/15 text-verified">
              <ShieldCheck className="h-[19px] w-[19px]" />
            </span>
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
              <Mark size={20} />
            </span>
          )
        }
        title={done ? "Two-factor is on" : copyText.title}
        subtitle={
          done
            ? "Sign-ins now need a code as well as your password."
            : method === "EMAIL" && user?.email
              ? `We have sent a six-digit code to ${user.email}.`
              : copyText.subtitle
        }
      />

      {/* ── The one thing to do ───────────────────────────────────────── */}
      {done ? (
        <RecoveryCodes
          codes={codes || []}
          saved={saved}
          onSaved={setSaved}
          onCopy={() => copy((codes || []).join("\n"), "codes")}
          copied={copied === "codes"}
          onDownload={download}
          onDone={onDone}
        />
      ) : prepareError ? (
        <Failure message={prepareError} onRetry={() => method && prepare(method)} onClose={onClose} busy={preparing} />
      ) : preparing ? (
        <div className="flex items-center justify-center gap-2.5 px-6 py-14 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {method === "EMAIL" ? "Sending your code…" : "Building your setup key…"}
        </div>
      ) : (
        <DialogBody>
          {method === "APP" && (
            <div className="flex gap-4">
              {/* On white, always. A QR is read by a camera looking for black
                  squares on a light ground, and the dark themes would hand it
                  the negative. */}
              <div className="shrink-0 rounded-lg bg-white p-2">
                {qr ? (
                  <img src={qr} alt="" width={116} height={116} className="block h-[116px] w-[116px]" />
                ) : (
                  <div className="h-[116px] w-[116px]" />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[12.5px] leading-[18px] text-muted-foreground">
                  Scan it with Google Authenticator, Authy or 1Password.
                </p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Or type this key
                </p>
                <div className="mt-1.5 flex items-start gap-2">
                  <code className="min-w-0 break-all font-mono text-[12px] leading-[17px] text-foreground">
                    {grouped(secret)}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy(secret, "secret")}
                    aria-label="Copy the setup key"
                    className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    {copied === "secret" ? (
                      <Check className="h-3.5 w-3.5 text-verified" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className={cn(method === "APP" && "mt-5")}>
            <Labelled
              label={
                method === "APP" ? "Enter the code your app shows" : "Enter the code from your email"
              }
              htmlFor="twofa-code-0"
              required
              error={error}
              helper={
                method === "APP"
                  ? "Six digits, and it changes every thirty seconds."
                  : "Six digits, from the newest email we sent you."
              }
            >
              <CodeInput
                value={code}
                onChange={(v) => {
                  setCode(v);
                  if (error) setError(null);
                }}
                disabled={verifying}
                complete={code.length === 6}
                idPrefix="twofa-code"
                autoFocus
              />
            </Labelled>

            {method === "EMAIL" && (
              <button
                type="button"
                onClick={() => prepare("EMAIL")}
                disabled={preparing || retryIn > 0 || verifying}
                className={cn(
                  "mt-2.5 text-[12px] font-medium underline underline-offset-2",
                  /* A control's label, not a caption. `--muted-foreground` is
                     for prose that supports something else; this is the one
                     thing to press when the code did not arrive. */
                  "text-foreground/75 hover:text-foreground hover:no-underline",
                  "disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                )}
              >
                {retryIn > 0 ? `Send another code in ${retryIn}s` : "Send another code"}
              </button>
            )}
          </div>
        </DialogBody>
      )}

      {!done && !prepareError && !preparing && (
        <DialogFooter
          ruled
          cancel={
            <DialogButton tone="quiet" onClick={onClose} disabled={verifying}>
              Cancel
            </DialogButton>
          }
          action={
            <DialogButton
              onClick={turnOn}
              disabled={code.length !== 6}
              busy={verifying}
              icon={<ShieldCheck className="h-[18px] w-[18px]" />}
            >
              {verifying ? "Checking…" : "Turn it on"}
            </DialogButton>
          }
        />
      )}
    </Modal>
  );
}

/**
 * The answer when the server will not start the setup at all.
 *
 * Almost always one thing: the method is switched off for the whole server, in
 * which case no amount of retrying by this trader will help and the sentence
 * that matters is the one naming who can fix it. Everything else gets the
 * server's own words and a button to try again.
 */
function Failure({
  message,
  onRetry,
  onClose,
  busy,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  const serverSide = /not enabled on this server|not properly configured/i.test(message);

  return (
    <>
      <DialogBody>
        <Notice tone="warn">
          <p className="font-medium text-foreground">{message}</p>
          <p className="mt-1.5 text-muted-foreground">
            {serverSide
              ? "This one is not yours to fix: an administrator has to switch this method on in the platform's settings before anybody can use it. The other method on the card may still be available."
              : "Nothing has changed on your account. Try again, and if it keeps failing, the other method on the card is a working second factor too."}
          </p>
        </Notice>
      </DialogBody>

      <DialogFooter
        ruled
        cancel={
          <DialogButton tone="quiet" onClick={onClose}>
            Close
          </DialogButton>
        }
        action={
          serverSide ? (
            <span />
          ) : (
            <DialogButton onClick={onRetry} busy={busy}>
              Try again
            </DialogButton>
          )
        }
      />
    </>
  );
}

/**
 * The twelve codes, shown once.
 *
 * They are the way back in when the phone is lost or the mailbox is gone, and
 * this screen is the only time they can be read — so the button that leaves is
 * dead until the box is ticked. Not to be officious: an untouched recovery
 * list is exactly the state somebody is in three months later, at the moment
 * they need it, wondering why they cannot get in.
 */
function RecoveryCodes({
  codes,
  saved,
  onSaved,
  onCopy,
  copied,
  onDownload,
  onDone,
}: {
  codes: string[];
  saved: boolean;
  onSaved: (v: boolean) => void;
  onCopy: () => void;
  copied: boolean;
  onDownload: () => void;
  onDone: () => void;
}) {
  /* The one case where the factor is on but the codes never arrived: the save
     call that mints them failed after verify had already stored the secret. */
  if (!codes.length) {
    return (
      <>
        <DialogBody>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            We could not create your recovery codes just now. Two-factor is on and working, and you
            can get a new set from this page at any time.
          </p>
        </DialogBody>
        <DialogFooter ruled action={<DialogButton onClick={onDone}>Done</DialogButton>} />
      </>
    );
  }

  return (
    <>
      <DialogBody>
      <p className="text-[13px] leading-[19px] text-foreground">
        Save these codes somewhere safe. Each one lets you sign in{" "}
        <span className="font-semibold">once</span> if you lose your phone or cannot reach your
        email, and this is the only time we show them.
      </p>

      <div className="mt-4 rounded-lg border border-border bg-background p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {codes.map((c) => (
            <code key={c} className="font-mono text-[12.5px] leading-[18px] tracking-[0.04em] text-foreground">
              {c}
            </code>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-medium text-foreground hover:bg-muted"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-verified" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy all"}
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[12.5px] font-medium text-foreground hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>

      <div className="mt-5">
        <Ack checked={saved} onChange={onSaved}>
          I have saved these somewhere safe
        </Ack>
      </div>
      </DialogBody>

      <DialogFooter
        ruled
        action={
          <DialogButton onClick={onDone} disabled={!saved}>
            Done
          </DialogButton>
        }
      />
    </>
  );
}
