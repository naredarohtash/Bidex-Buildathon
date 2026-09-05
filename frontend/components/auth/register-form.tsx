"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { openGoogleLoginPopup } from "@/utils/google-auth";
import { $fetch } from "@/lib/api";
import { useSettings } from "@/hooks/use-settings";
import { usePowCaptcha } from "@/hooks/use-pow-captcha";
import {
  AuthField,
  AuthPasswordField,
  AuthPasswordStrength,
  AuthSubmitButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFormError,
  GoogleMark,
  PASSWORD_RULES,
  passwordRulesMet,
} from "@/components/auth/auth-fields";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

const NAME_PATTERN = /^[\p{L} \-'.]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterFormProps {
  onSuccess?: () => void;
  onRegistrationSuccess?: (email: string, needsEmailVerification: boolean) => void;
  onLoginClick?: () => void;
  /** @see LoginFormProps.withHeader — the shell's mode switch replaces both. */
  withHeader?: boolean;
}

export default function RegisterForm({
  onSuccess,
  onRegistrationSuccess,
  onLoginClick,
  withHeader = true,
}: RegisterFormProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const register = useUserStore((state) => state.register);
  const isLoading = useUserStore((state) => state.isLoading);
  const error = useUserStore((state) => state.error);
  const { settings } = useSettings();
  const { solveAndGetSolution, isLoading: powLoading } = usePowCaptcha();

  const googleAuthStatus =
    settings?.googleAuthStatus === true || settings?.googleAuthStatus === "true";

  // Get referral code from URL or sessionStorage
  const urlRef = searchParams.get("ref") || "";
  const [refCode, setRefCode] = useState(urlRef);
  const [referrerInfo, setReferrerInfo] = useState<{
    name: string;
    avatar?: string;
  } | null>(null);
  const [loadingReferrer, setLoadingReferrer] = useState(false);

  // Check sessionStorage for affiliate ref on mount
  useEffect(() => {
    if (!urlRef && typeof window !== "undefined") {
      const storedRef = sessionStorage.getItem("affiliateRef");
      if (storedRef) {
        setRefCode(storedRef);
      }
    }
  }, [urlRef]);

  // Fetch referrer information when refCode changes
  useEffect(() => {
    const fetchReferrerInfo = async () => {
      if (refCode) {
        setLoadingReferrer(true);
        try {
          const { data, error } = await $fetch({
            url: `/api/public/referrer/${refCode}`,
            method: "GET",
            silent: true,
          });

          if (data && !error) {
            setReferrerInfo(data);
          } else {
            setReferrerInfo(null);
          }
        } catch (err) {
          console.error("Failed to fetch referrer info:", err);
          setReferrerInfo(null);
        } finally {
          setLoadingReferrer(false);
        }
      }
    };

    fetchReferrerInfo();
  }, [refCode]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const googleButtonClicked = useRef(false);

  // Watch for errors from the store
  useEffect(() => {
    if (error && googleButtonClicked.current) {
      toast({
        title: "Google login error",
        description: error,
        variant: "destructive",
      });
      googleButtonClicked.current = false;
    }
  }, [error, toast]);

  const passwordValid =
    passwordRulesMet(password).filter(Boolean).length ===
    PASSWORD_RULES.length;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    /* The last name is genuinely optional — the column is allowNull on the
       model, so the only thing that can reject it is its format validator, and
       that only runs on a value. */
    if (!firstName.trim() || !email.trim() || !password || !confirmPassword) {
      setFormError("Fill in the required fields to continue.");
      return;
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      setFormError("That does not look like an email address.");
      return;
    }

    if (!NAME_PATTERN.test(firstName.trim())) {
      setFormError(
        "First name can only contain letters, spaces, hyphens, apostrophes and periods."
      );
      return;
    }

    if (lastName.trim() && !NAME_PATTERN.test(lastName.trim())) {
      setFormError(
        "Last name can only contain letters, spaces, hyphens, apostrophes and periods."
      );
      return;
    }

    if (password !== confirmPassword) {
      setFormError("The two passwords do not match.");
      return;
    }

    if (!passwordValid) {
      setFormError("Your password does not meet every requirement yet.");
      return;
    }

    setLocalLoading(true);

    try {
      // Solve PoW captcha if enabled
      let powSolution: any = null;
      try {
        powSolution = await solveAndGetSolution("register");
      } catch (powError) {
        console.error("PoW captcha error:", powError);
        setFormError("Security verification failed. Please try again.");
        setLocalLoading(false);
        return;
      }

      const result = await register({
        firstName,
        /* Omitted, not blanked. `lastName` is allowNull on the model but
           carries an `is` format validator, and Sequelize runs that on any
           non-null value — so "" fails a column that accepts nothing at all.
           JSON.stringify drops an undefined key, which is what we want. */
        lastName: lastName.trim() || undefined,
        email,
        password,
        ref: refCode || undefined,
        powSolution: powSolution || undefined,
      });

      if (result.success) {
        if (result.userLoggedIn) {
          toast({
            title: "Registration successful",
            description: "Welcome to our platform!",
          });

          if (onSuccess) {
            onSuccess();
          }

          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          // Registered, but the session is not open yet — usually email verification.
          const responseMessage = (result.data?.message || "").toLowerCase();
          const needsVerification =
            responseMessage.includes("verify") ||
            responseMessage.includes("verification") ||
            responseMessage.includes("not verified");

          if (onRegistrationSuccess) {
            onRegistrationSuccess(email, needsVerification);
          } else {
            toast({
              title: "Registration successful",
              description:
                result.data?.message ||
                "Please check your email to verify your account.",
            });

            if (onSuccess) {
              onSuccess();
            }
          }
        }
      } else {
        const storeError = useUserStore.getState().error;

        let errorDescription = storeError || "An unexpected error occurred.";

        if (storeError?.includes("lastName:") || storeError?.includes("firstName:")) {
          errorDescription =
            "Please check your name format. Names can only contain letters, spaces, hyphens, apostrophes and periods.";
        } else if (storeError?.includes("Email already in use")) {
          errorDescription =
            "That email is already registered. Try signing in instead.";
        } else if (storeError?.includes("Invalid password format")) {
          errorDescription =
            "Password must be at least 8 characters with uppercase, lowercase, numbers and special characters.";
        }

        setFormError(errorDescription);
      }
    } catch (error) {
      setFormError("An unexpected error occurred. Please try again.");
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogleButtonClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoading || localLoading) return;

    try {
      setLocalLoading(true);
      setFormError(null);
      googleButtonClicked.current = true;

      const googleResponse = await openGoogleLoginPopup(googleClientId);

      let requestBody: any = { ref: refCode };

      if (typeof googleResponse === "string") {
        requestBody.token = googleResponse;
      } else if (googleResponse && typeof googleResponse === "object") {
        if (googleResponse.credential) {
          requestBody.token = googleResponse.credential;
        } else if (googleResponse.access_token) {
          requestBody.access_token = googleResponse.access_token;
        } else {
          throw new Error("Invalid Google response format");
        }
      } else {
        throw new Error("No credential received from Google");
      }

      const { data, error } = await $fetch({
        url: "/api/auth/register/google",
        method: "POST",
        body: requestBody,
      });

      if (error) {
        toast({
          title: "Google registration error",
          description: error || "Failed to register with Google. Please try again.",
          variant: "destructive",
        });
        setLocalLoading(false);
        googleButtonClicked.current = false;
        return;
      }

      useUserStore.getState().setUser(data.user);

      toast({
        title: "Registration successful",
        description: "Welcome to our platform!",
      });

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error("Google registration error:", error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isCancellation =
        errorMessage.includes("cancelled") || errorMessage.includes("closed");

      if (!isCancellation) {
        toast({
          title: "Google registration error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to initialize Google registration. Please try again.",
          variant: "destructive",
        });
      }

      googleButtonClicked.current = false;
    } finally {
      setLocalLoading(false);
    }
  };

  const buttonLoading =
    localLoading || (isLoading && googleButtonClicked.current) || powLoading;

  return (
    <div className="w-full">
      {withHeader ? (
        <header className="mb-7">
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            Create your account
          </h2>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            Already registered?{" "}
            <button
              type="button"
              onClick={onLoginClick}
              className="cursor-pointer font-semibold text-[#0052ff] underline-offset-2 transition-colors hover:underline"
            >
              Sign in
            </button>
          </p>
        </header>
      ) : (
        <h1 className="sr-only">Create your account</h1>
      )}

      {/* First, not last — one tap finishes what five fields otherwise start. */}
      {googleAuthStatus && (
        <div className="mb-5 space-y-3">
          <AuthSecondaryButton
            icon={<GoogleMark />}
            onClick={handleGoogleButtonClick}
            disabled={buttonLoading}
          >
            {isLoading && googleButtonClicked.current
              ? "Connecting…"
              : "Continue with Google"}
          </AuthSecondaryButton>
          <AuthDivider label="or use your email" />
        </div>
      )}

      {refCode && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-field-border bg-field px-3.5 py-2.5">
          <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
            Referred by{" "}
            <span className="font-semibold text-foreground">
              {loadingReferrer ? "…" : referrerInfo?.name || refCode}
            </span>
          </span>
          {loadingReferrer ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#089981]" />
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AuthField
            id="register-first-name"
            label="First name"
            autoComplete="given-name"
            placeholder="Ada"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={buttonLoading}
            required
          />
          <AuthField
            id="register-last-name"
            label="Last name"
            labelAction={
              <span className="text-[11.5px] font-medium text-muted-foreground/70">
                Optional
              </span>
            }
            autoComplete="family-name"
            placeholder="Lovelace"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={buttonLoading}
          />
        </div>

        <AuthField
          id="register-email"
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={buttonLoading}
          required
        />

        <div>
          <AuthPasswordField
            id="register-password"
            label="Password"
            autoComplete="new-password"
            placeholder="Choose a strong password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={buttonLoading}
            required
          />
          <AuthPasswordStrength password={password} />
        </div>

        <AuthPasswordField
          id="register-confirm-password"
          label="Confirm password"
          autoComplete="new-password"
          /* Last field: its return key submits the form. */
          enterKeyHint="go"
          placeholder="Type it again"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={buttonLoading}
          required
          warnCapsLock={false}
          error={mismatch ? "The two passwords do not match." : null}
        />

        <AuthFormError message={formError} />

        <AuthSubmitButton
          loading={buttonLoading}
          loadingLabel={powLoading ? "Verifying…" : "Creating account…"}
          className="mt-1"
        >
          Create account
        </AuthSubmitButton>
      </form>
    </div>
  );
}
