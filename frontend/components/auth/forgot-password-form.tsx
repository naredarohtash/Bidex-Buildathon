"use client";

import type React from "react";
import { useState } from "react";
import { AlertTriangle, MailCheck } from "lucide-react";
import {
  AuthField,
  AuthSubmitButton,
  AuthSecondaryButton,
  AuthStatusBlock,
} from "@/components/auth/auth-fields";
import { useToast } from "@/hooks/use-toast";
import { $fetch } from "@/lib/api";
import { useTranslations } from "next-intl";
import { usePowCaptcha } from "@/hooks/use-pow-captcha";

interface ForgotPasswordFormProps {
  onSuccess?: () => void;
  onLoginClick?: () => void;
  onTokenSubmit?: (token: string) => void;
}

export default function ForgotPasswordForm({
  onSuccess,
  onLoginClick,
  onTokenSubmit,
}: ForgotPasswordFormProps) {
  const t = useTranslations("components_auth");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const { solveAndGetSolution, isLoading: powLoading } = usePowCaptcha();

  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [tokenFocused, setTokenFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Enter the email address on your account.");
      return;
    }

    setLoading(true);

    try {
      // Solve PoW captcha if enabled
      let powSolution: any = null;
      try {
        powSolution = await solveAndGetSolution("reset");
      } catch (powError) {
        console.error("PoW captcha error:", powError);
        toast({
          title: "Security verification failed",
          description: "Please try again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // Call the forgot password API endpoint with PoW solution
      const result = await $fetch({
        url: "/api/auth/reset",
        method: "POST",
        body: { email, powSolution: powSolution || undefined },
        successMessage: "Reset link sent",
      });

      if (result.data) {
        setSubmitted(true);
        toast({
          title: "Reset link sent",
          description:
            "If an account exists with that email, you'll receive a password reset link.",
        });

        // Call onSuccess for any parent component tracking
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(result.error || "Failed to send reset link");
        toast({
          title: "Request failed",
          description: result.error || "An unexpected error occurred.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Password reset request error:", error);
      setError("An unexpected error occurred");
      toast({
        title: "Request error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError("Token is required");
      toast({
        title: "Token required",
        description: "Please enter the reset token from your email.",
        variant: "destructive",
      });
      return;
    }

    setTokenLoading(true);

    try {
      // Verify the token
      const result = await $fetch({
        url: "/api/auth/verify/reset",
        method: "POST",
        body: { token },
      });

      if (result.data?.success) {
        // Token is valid, proceed to reset password form
        if (onTokenSubmit) {
          onTokenSubmit(token);
        }
      } else {
        setError(result.error || "Invalid token");
        toast({
          title: "Invalid token",
          description:
            result.error ||
            "The token is invalid or has expired. Please request a new one.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Token verification error:", error);
      setError("Failed to verify token");
      toast({
        title: "Verification error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTokenLoading(false);
    }
  };

  return (
    <div className="w-full">
      {submitted ? (
        <>
          <AuthStatusBlock
            icon={<MailCheck className="h-5 w-5 text-[#0052ff]" />}
            tint="#0052ff"
            title="Check your email"
            body={
              <>
                If an account exists for{" "}
                <span className="font-medium text-foreground">{email}</span>, a
                reset link is on its way. Open it here, or paste the token from
                the email below.
              </>
            }
          />

          {error && <FormError message={error} />}

          <form onSubmit={handleTokenSubmit} className="mt-6 space-y-4">
            <AuthField
              id="reset-token"
              label="Reset token"
              placeholder="Paste the token from the email"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onFocus={() => setTokenFocused(true)}
              onBlur={() => setTokenFocused(false)}
              autoComplete="one-time-code"
              spellCheck={false}
              disabled={tokenLoading}
              className="font-numeric tracking-wide"
            />

            <AuthSubmitButton
              loading={tokenLoading}
              loadingLabel="Checking…"
            >
              Continue
            </AuthSubmitButton>

            <AuthSecondaryButton
              onClick={() => {
                setSubmitted(false);
                setError(null);
              }}
              disabled={tokenLoading}
            >
              Use a different email
            </AuthSecondaryButton>
          </form>
        </>
      ) : (
        <>
          <header className="mb-7">
            <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
              Reset your password
            </h2>
            <p className="mt-1.5 text-[13.5px] text-muted-foreground">
              Enter the address on the account and we will send a reset link.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <AuthField
              id="reset-email"
              label="Email"
              enterKeyHint="go"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              disabled={loading || powLoading}
              required
            />

            {error && <FormError message={error} />}

            <AuthSubmitButton
              loading={loading || powLoading}
              loadingLabel={powLoading ? "Verifying…" : "Sending…"}
            >
              Send reset link
            </AuthSubmitButton>
          </form>

          {onLoginClick && (
            <p className="mt-6 text-[13px] text-muted-foreground">
              Remembered it?{" "}
              <button
                type="button"
                onClick={onLoginClick}
                className="cursor-pointer font-semibold text-[#0052ff] underline-offset-2 transition-colors hover:underline"
              >
                Back to sign in
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-[#f23645]/25 bg-[#f23645]/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-[#f23645]"
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
      {message}
    </p>
  );
}
