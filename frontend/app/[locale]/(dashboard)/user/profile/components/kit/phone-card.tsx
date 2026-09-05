"use client";

/**
 * Phone verification, against the real endpoints.
 *
 * What this replaces was not a broken implementation — it was a demonstration.
 * The file declared its own `useUserStore` returning a frozen empty user, and
 * its own `$fetch` that slept two seconds and returned `{ success: true }` for
 * any URL. So the screen accepted any number, accepted any six digits, and
 * congratulated the user, having spoken to nothing. `POST /api/user/phone/send`
 * and `POST /api/user/phone/verify` existed the whole time.
 *
 * Two states only: unverified, with an entry form, and verified, showing the
 * number on file. A code that has been sent is a stage of the first, not a
 * third screen, so the number stays visible and correctable while the code is
 * typed — the previous flow hid it behind a "success" step and left no way back
 * except reloading.
 */

import { useState } from "react";
import { Phone, Check, RotateCcw } from "lucide-react";
import { $fetch } from "@/lib/api";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { Card, Field, Row, Pill, Action, inputClass } from "./settings-kit";

export function PhoneCard() {
  const { user, setUser } = useUserStore();
  const { toast } = useToast();

  const [phone, setPhone] = useState(user?.phone || "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verified = !!user?.phoneVerified;

  const sendCode = async () => {
    const trimmed = phone.trim();
    // Checked here so an obviously bad number does not cost a round trip or an
    // SMS. Deliberately loose: numbering plans vary and the server is the
    // authority on what it can actually reach.
    if (trimmed.replace(/\D/g, "").length < 7) {
      setError("Enter a phone number including the country code.");
      return;
    }
    setError(null);
    setSending(true);
    const { error: err } = await $fetch({
      url: "/api/user/phone/send",
      method: "POST",
      body: { phoneNumber: trimmed },
      silentSuccess: true,
    });
    setSending(false);
    if (err) {
      setError(typeof err === "string" ? err : "Could not send the code. Check the number and try again.");
      return;
    }
    setSent(true);
    toast({ title: "Code sent", description: `We sent a 6-digit code to ${trimmed}.` });
  };

  const verifyCode = async () => {
    if (code.trim().length < 4) {
      setError("Enter the code from the message.");
      return;
    }
    setError(null);
    setVerifying(true);
    const { error: err } = await $fetch({
      url: "/api/user/phone/verify",
      method: "POST",
      body: { code: code.trim() },
      silentSuccess: true,
    });
    setVerifying(false);
    if (err) {
      setError(typeof err === "string" ? err : "That code was not accepted. Request a new one and try again.");
      return;
    }
    /* Re-read the account rather than assuming.
       phoneVerified is the server's to decide, and this page should show what it
       decided — not a local guess that the call probably worked. */
    const { data: fresh } = await $fetch({ url: "/api/user/profile", silent: true, silentSuccess: true });
    if (fresh) setUser(fresh as any);
    setSent(false);
    setCode("");
    toast({ title: "Phone verified", description: "Your number is now confirmed on your account." });
  };

  if (verified) {
    return (
      <Card
        title="Phone number"
        description="Used to confirm withdrawals and to reach you about account security."
      >
        <Row
          title={user?.phone || "On file"}
          description="Verified. To change it, contact support so the new number can be confirmed."
          status={
            <Pill tone="ok">
              <Check className="h-3 w-3" />
              Verified
            </Pill>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title="Phone number"
      description="Used to confirm withdrawals and to reach you about account security."
      footer={
        sent ? (
          <>
            <Action variant="secondary" onClick={sendCode} loading={sending}>
              <RotateCcw className="h-3.5 w-3.5" />
              Resend code
            </Action>
            <Action onClick={verifyCode} loading={verifying}>
              Verify number
            </Action>
          </>
        ) : (
          <Action onClick={sendCode} loading={sending}>
            Send code
          </Action>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone number"
          hint="Include your country code, for example +91."
          error={!sent ? error : null}
        >
          <input
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            inputMode="tel"
            autoComplete="tel"
          />
        </Field>

        {/* The number stays editable while the code is entered. A wrong digit is
            the most likely reason a code never arrives, and the previous flow
            made that the one thing you could not fix without starting over. */}
        {sent && (
          <Field label="Verification code" hint="Six digits, valid for a few minutes." error={error}>
            <input
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </Field>
        )}
      </div>
    </Card>
  );
}

export default PhoneCard;
