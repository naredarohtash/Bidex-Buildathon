"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { AuthSubmitButton } from "@/components/auth/auth-fields";
import { useToast } from "@/hooks/use-toast";
import { useUserStore } from "@/store/user";
import { ShieldCheck, RefreshCw, AlertTriangle } from "lucide-react";
import { $fetch } from "@/lib/api";
import { useTranslations } from "next-intl";

interface TwoFactorFormProps {
  userId: string;
  type: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function TwoFactorForm({
  userId,
  type,
  onSuccess,
  onCancel,
}: TwoFactorFormProps) {
  const t = useTranslations("common");
  const tComponentsAuth = useTranslations("components_auth");
  const { toast } = useToast();
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const setUser = useUserStore((state) => state.setUser);

  // Focus the first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleInputChange = (index: number, value: string) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return;

    // Update the OTP array
    const newOtp = [...otp];
    newOtp[index] = value;

    // Move to next input if current input is filled
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }

    setOtp(newOtp);
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    // Move to previous input on backspace if current input is empty
    if (
      e.key === "Backspace" &&
      !otp[index] &&
      index > 0 &&
      inputRefs.current[index - 1]
    ) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text/plain").trim();

    // Check if pasted data is a valid OTP (numbers only)
    if (!/^\d+$/.test(pastedData)) return;

    // Fill the OTP inputs with the pasted data
    const newOtp = [...otp];
    for (let i = 0; i < Math.min(pastedData.length, 6); i++) {
      newOtp[i] = pastedData[i];
    }
    setOtp(newOtp);

    // Focus the appropriate input
    if (pastedData.length < 6 && inputRefs.current[pastedData.length]) {
      inputRefs.current[pastedData.length]?.focus();
    }
  };

  const handleVerify = async () => {
    // Check if OTP is complete
    const otpValue = otp.join("");
    if (otpValue.length !== 6) {
      setError("Please enter a complete 6-digit code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await $fetch({
        url: "/api/auth/otp/login",
        method: "POST",
        body: {
          id: userId,
          otp: otpValue,
        },
      });

      if (!error) {
        toast({
          title: "Verification successful",
          description: "You have been successfully logged in.",
        });

        // Update user state if user data is returned
        if (data?.user) {
          setUser(data.user);
        }

        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(error || "Invalid verification code");
        toast({
          title: "Verification failed",
          description: error || "Invalid verification code. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("2FA verification error:", error);
      setError("An unexpected error occurred");
      toast({
        title: "Verification error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);

    try {
      const { data, error } = await $fetch({
        url: "/api/auth/otp/resend",
        method: "POST",
        body: {
          id: userId,
          type,
        },
      });

      if (!error) {
        toast({
          title: "Code resent",
          description: `A new verification code has been sent to your ${type === "EMAIL" ? "email" : "phone"}.`,
        });
      } else {
        setError(error || "Failed to resend code");
        toast({
          title: "Resend failed",
          description:
            error || "Failed to resend verification code. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Resend 2FA code error:", error);
      setError("An unexpected error occurred");
      toast({
        title: "Resend error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const destination =
    type === "EMAIL"
      ? "sent to your email"
      : type === "SMS"
        ? "sent to your phone"
        : "from your authenticator app";

  return (
    <div className="w-full">
      <header className="mb-7">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl border"
          style={{ borderColor: "#0052ff33", backgroundColor: "#0052ff12" }}
        >
          <ShieldCheck className="h-5 w-5 text-[#0052ff]" />
        </span>
        <h2 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
          {t("two_factor_authentication")}
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Enter the 6-digit code {destination}.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-lg border border-[#f23645]/25 bg-[#f23645]/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium leading-relaxed text-[#f23645]"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* One field per digit, but only the first advertises one-time-code:
          repeat it on all six and both iOS and password managers fill the same
          digit into every box. */}
      <div className="flex gap-2">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1} of 6`}
            maxLength={1}
            value={digit}
            onChange={(e) => handleInputChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            disabled={isLoading}
            className="font-numeric h-[52px] w-full min-w-0 rounded-lg border border-field-border bg-field py-3.5 text-center text-[19px] font-semibold text-foreground outline-none transition-[border-color,background-color,box-shadow] duration-150 hover:border-foreground/30 focus:border-[#0052ff] focus:ring-[3px] focus:ring-[#0052ff]/20 disabled:opacity-50"
          />
        ))}
      </div>

      <div className="mt-5 space-y-3">
        <AuthSubmitButton
          type="button"
          onClick={handleVerify}
          loading={isLoading}
          loadingLabel={t("verifying")}
          disabled={otp.join("").length !== 6}
        >
          {t("verify")}
        </AuthSubmitButton>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isResending ? "animate-spin" : ""}`}
            />
            {isResending ? t("resending") : t("resend_code")}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
