"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { $fetch } from "@/lib/api";
import {
  AuthPasswordField,
  AuthPasswordStrength,
  AuthSubmitButton,
  AuthSecondaryButton,
  AuthStatusBlock,
  PASSWORD_RULES,
  passwordRulesMet,
} from "@/components/auth/auth-fields";
import { useUserStore } from "@/store/user";
import { useTranslations } from "next-intl";

interface ResetPasswordFormProps {
  token: string;
  onSuccess?: () => void;
  onLoginClick?: () => void;
  preserveToken?: boolean;
}

export default function ResetPasswordForm({
  token,
  onSuccess,
  onLoginClick,
  preserveToken = false,
}: ResetPasswordFormProps) {
  const t = useTranslations("components_auth");
  const tCommon = useTranslations("common");
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(
    null
  );
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Skip token verification and assume token is valid if provided
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenValid(false);
      setVerificationError("No token provided");
    } else {
      // Skip verification and assume token is valid
      // The actual token validation will happen when user submits the form
      setVerifying(false);
      setTokenValid(true);
      setVerificationError(null);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!password || !confirmPassword) {
      setFormError("Enter your new password twice.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("The two passwords do not match.");
      return;
    }

    /* The same five rules registration enforces. This form used to check four
       looser ones and an 8-character floor, so it accepted passwords the server
       then rejected — a round trip to be told what could have been said here. */
    if (!passwordValid) {
      setFormError("Your password does not meet every requirement yet.");
      return;
    }

    setLoading(true);

    try {
      // Use the user store to reset the password
      const resetPassword = useUserStore.getState().resetPassword;
      const success = await resetPassword(token, password);

      if (success) {
        setSubmitted(true);
        toast({
          title: "Password reset successful",
          description:
            "Your password has been reset. You can now log in with your new password.",
        });

        if (onSuccess) {
          onSuccess();
        }
      } else {
        const storeError = useUserStore.getState().error;

        // Check if the error is related to invalid token
        if (
          storeError &&
          (storeError.includes("Invalid token") ||
            storeError.includes("expired") ||
            storeError.includes("used"))
        ) {
          setTokenValid(false);
          setVerificationError(storeError);
          toast({
            title: "Invalid or expired token",
            description: storeError,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Reset failed",
            description: storeError || "An unexpected error occurred.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Password reset error:", error);
      toast({
        title: "Reset error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const passwordValid =
    passwordRulesMet(password).filter(Boolean).length === PASSWORD_RULES.length;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  if (verifying) {
    return (
      <AuthStatusBlock
        icon={<Loader2 className="h-5 w-5 animate-spin text-[#0052ff]" />}
        tint="#0052ff"
        title={t("verifying_link")}
        body="Checking the link you followed. This only takes a moment."
      />
    );
  }

  if (!tokenValid) {
    return (
      <div className="w-full">
        <AuthStatusBlock
          icon={<ShieldX className="h-5 w-5 text-[#f23645]" />}
          tint="#f23645"
          title={t("invalid_link")}
          body={
            verificationError ||
            "This reset link is invalid or has expired. Request a new one and try again."
          }
        />
        {onLoginClick && (
          <AuthSubmitButton type="button" onClick={onLoginClick} className="mt-6">
            {t("return_to_login")}
          </AuthSubmitButton>
        )}
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="w-full">
        <AuthStatusBlock
          icon={<CheckCircle2 className="h-5 w-5 text-[#089981]" />}
          tint="#089981"
          title="Password reset"
          body="Your new password is active. The old one no longer works anywhere."
        />
        {onLoginClick && (
          <AuthSubmitButton type="button" onClick={onLoginClick} className="mt-6">
            {t("return_to_login")}
          </AuthSubmitButton>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <header className="mb-7">
        <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          Choose a new password
        </h2>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground">
          Setting it signs you out of nothing else — but the old password stops
          working immediately.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <AuthPasswordField
            id="reset-new-password"
            label="New password"
            autoComplete="new-password"
            placeholder="Choose a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={() => setPasswordFocused(true)}
            onBlur={() => setPasswordFocused(false)}
            disabled={loading}
            required
          />
          <AuthPasswordStrength password={password} />
        </div>

        <AuthPasswordField
          id="reset-confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          enterKeyHint="go"
          placeholder="Type it again"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onFocus={() => setConfirmPasswordFocused(true)}
          onBlur={() => setConfirmPasswordFocused(false)}
          disabled={loading}
          required
          warnCapsLock={false}
          error={mismatch ? "The two passwords do not match." : null}
        />

        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-[#f23645]/25 bg-[#f23645]/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-[#f23645]"
          >
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {formError}
          </p>
        )}

        <AuthSubmitButton loading={loading} loadingLabel="Saving…" className="mt-1">
          Set new password
        </AuthSubmitButton>

        {onLoginClick && (
          <AuthSecondaryButton onClick={onLoginClick} disabled={loading}>
            {t("return_to_login")}
          </AuthSecondaryButton>
        )}
      </form>
    </div>
  );
}
