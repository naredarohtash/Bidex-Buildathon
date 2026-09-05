"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import RegisterForm from "@/components/auth/register-form";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthSubmitButton,
  AuthSecondaryButton,
} from "@/components/auth/auth-fields";
import { VerifyEmailPanel } from "@/components/auth/verify-email-panel";

/**
 * Everything a guest reaches for that needs an account sends them here with a
 * `?from=` note saying what it was (see lib/guest/use-guest-gate.ts). Without
 * this the trip reads as the terminal throwing you out for no stated reason.
 *
 * The value arrives off the URL, so it is clamped and filtered before it is
 * rendered — React escapes it, but nothing stops a crafted link from pasting a
 * paragraph into the page otherwise.
 */
function useGateNotice() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("from");

  return useMemo(() => {
    if (!raw) return null;

    const cleaned = raw.replace(/[^a-zA-Z0-9 /'-]/g, "").trim().slice(0, 40);
    if (!cleaned) return null;

    if (cleaned === "demo-expired") {
      return {
        title: "Demo session ended",
        body: "Create an account to keep trading on live markets.",
      };
    }

    return {
      title: "Account required",
      body:
        cleaned === "a full account"
          ? "The demo covers Rise and Fall. An account opens the rest of the terminal."
          : `Create an account to access ${cleaned}.`,
    };
  }, [raw]);
}

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const ref = searchParams.get("ref");
  const notice = useGateNotice();

  const [registered, setRegistered] = useState<{
    email: string;
    needsVerification: boolean;
  } | null>(null);

  useEffect(() => {
    if (ref) {
      sessionStorage.setItem("affiliateRef", ref);
    }
  }, [ref]);

  if (registered) {
    return (
      <AuthShell
        headline="You're in."
        subline="The terminal is open. Pick a market and take your first position."
      >
        {/* The same panel the auth modal shows — see components/auth/
            verify-email-panel. These two used to be separate copies of the same
            moment and had already drifted: one headed "Verify your email" and
            the other "Confirm your email", with different sentences under
            each. */}
        <VerifyEmailPanel
          email={registered.email}
          needsVerification={registered.needsVerification}
        >
          <AuthSubmitButton type="button" onClick={() => router.push("/login")}>
            {registered.needsVerification ? "Back to sign in" : "Go to sign in"}
          </AuthSubmitButton>
          {/* No "Open the terminal" while a link is outstanding.
          
              It was offered next to a screen saying the account is not live
              yet, to somebody who has no session — so the button led to a
              guest demo, which is the one thing a person who has just created
              a real account should not be handed. There is exactly one thing
              to do on this screen and it is not on this screen; it is in their
              inbox. Once the account needs no verification the terminal is a
              fair offer, and it stays. */}
          {!registered.needsVerification && (
            <AuthSecondaryButton onClick={() => router.push("/terminal")}>
              Open the terminal
            </AuthSecondaryButton>
          )}
        </VerifyEmailPanel>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline="Buy or Sell. That's the whole trade."
      subline="Pick a market and an expiry. The payout is on the screen before you commit."
      notice={notice ? <GateNotice {...notice} /> : undefined}
      mode="sign-up"
    >
      <RegisterForm
        withHeader={false}
        onSuccess={() => router.push("/")}
        onRegistrationSuccess={(email, needsEmailVerification) =>
          setRegistered({ email, needsVerification: needsEmailVerification })
        }
        onLoginClick={() => router.push("/login")}
      />
    </AuthShell>
  );
}

/**
 * Why the person is on this page rather than where they were going.
 *
 * A rule and two lines, not an alert box. A tinted panel with a coloured icon
 * in a rounded tile is the component every library ships and every generated
 * page reaches for, and it competes with the heading directly beneath it for
 * the same reason it is popular: it is loud. This is context. It should be read
 * once, understood, and then stop asking for attention.
 *
 * The label is the panel's own idiom — the spaced uppercase the market board
 * uses for LIVE PRICES — so the note reads as part of this page rather than as
 * a widget dropped onto it.
 */
function GateNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-l-2 border-[#0052ff] pl-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0052ff]">
        {title}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-foreground">
        {body}
      </p>
    </div>
  );
}
