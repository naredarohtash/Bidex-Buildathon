"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useRouter } from "@/i18n/routing";
import ResetPasswordForm from "@/components/auth/reset-password-form";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthStatusBlock,
  AuthSubmitButton,
  AuthSecondaryButton,
} from "@/components/auth/auth-fields";

/**
 * Where the reset email lands. Same shell as sign-in and sign-up, because it is
 * the same journey: this is the page you reach from the link the forgot-password
 * form sends, and it used to be a different-looking site.
 */
export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(searchParams?.get("token") || null);
  }, [searchParams]);

  /* No token at all — someone typed the address, or the mail client mangled the
     link. There is nothing to reset, so this offers the only useful next step
     rather than an empty form. */
  if (token === null) {
    return (
      <AuthShell
        headline="This page needs a link."
        subline="Password resets happen through a single-use link sent to the address on the account."
      >
        <div className="w-full">
          <AuthStatusBlock
            icon={<KeyRound className="h-5 w-5 text-[#f5a524]" />}
            tint="#f5a524"
            title="No reset link found"
            body="Open the link from the reset email, or request a new one — they expire, and each one works once."
          />

          <div className="mt-6 space-y-3">
            <AuthSubmitButton
              type="button"
              onClick={() => router.push("/login")}
            >
              Request a reset link
            </AuthSubmitButton>
            <AuthSecondaryButton onClick={() => router.push("/")}>
              Back to site
            </AuthSecondaryButton>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline="A new password, then back to the chart."
      subline="The link you followed is single use. Setting a password consumes it."
    >
      <ResetPasswordForm
        token={token}
        onSuccess={() => router.push("/login")}
        onLoginClick={() => router.push("/login")}
        preserveToken={false}
      />
    </AuthShell>
  );
}
