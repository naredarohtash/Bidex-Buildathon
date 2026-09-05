"use client";

import type React from "react";
import { useState, useEffect, useRef } from "react";
import { Wallet } from "lucide-react";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { openGoogleLoginPopup } from "@/utils/google-auth";
import { $fetch } from "@/lib/api";
import TwoFactorForm from "@/components/auth/two-factor-form";
import { useSettings } from "@/hooks/use-settings";
import { usePowCaptcha } from "@/hooks/use-pow-captcha";
import {
  AuthField,
  AuthPasswordField,
  AuthSubmitButton,
  AuthSecondaryButton,
  AuthDivider,
  AuthFormError,
  GoogleMark,
} from "@/components/auth/auth-fields";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

/* Wallet sign-in loads WalletConnect, which throws at import time without a
   project id. No id, no button — rather than a button that fails on click. */
const walletConfigured = !!process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

interface LoginFormProps {
  onSuccess?: () => void;
  onRegisterClick?: () => void;
  onForgotPasswordClick?: () => void;
  onWalletLoginClick?: () => void;
  /** Called when the server refuses the sign-in because the address is not
      confirmed yet. It has already emailed a fresh code by that point, so the
      host can go straight to asking for it. */
  onEmailUnverified?: (email: string) => void;
  /**
   * Draw the heading and the "new here?" link. The auth pages set this false —
   * the shell puts a sign-in / create-account switch above the form, and a
   * heading repeating the selected segment plus a link to the other one is the
   * same choice offered twice. The modal has no switch, so it keeps them.
   */
  withHeader?: boolean;
}

export default function LoginForm({
  onSuccess,
  onRegisterClick,
  onForgotPasswordClick,
  onWalletLoginClick,
  onEmailUnverified,
  withHeader = true,
}: LoginFormProps) {
  const { toast } = useToast();
  const login = useUserStore((state) => state.login);
  const isLoading = useUserStore((state) => state.isLoading);
  const error = useUserStore((state) => state.error);
  const { settings } = useSettings();
  const { solveAndGetSolution, isLoading: powLoading } = usePowCaptcha();

  const googleAuthStatus =
    settings?.googleAuthStatus === true ||
    settings?.googleAuthStatus === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  /* Shown in the form, not only in a toast. A toast that has already faded
     leaves someone staring at a form with no idea what it objected to. */
  const [formError, setFormError] = useState<string | null>(null);

  // 2FA state
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [twoFactorData, setTwoFactorData] = useState<{
    id: string;
    type: string;
  } | null>(null);

  const googleButtonClicked = useRef(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error && googleButtonClicked.current) {
      toast({
        title: "Google login error",
        description: error || "An error occurred during Google login",
        variant: "destructive",
      });
      googleButtonClicked.current = false;
      setGoogleLoading(false);
    }
  }, [error, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalLoading(true);
    setFormError(null);

    try {
      /* Validated here rather than by disabling the button. A primary action
         that is already grey on first paint says "broken", not "incomplete" —
         it cannot say which field it is waiting for, and it reads as a dead
         page. Let it be pressed, then say what is missing and put the caret
         there. */
      if (!email.trim()) {
        setFormError("Enter the email address on your account.");
        emailRef.current?.focus();
        setLocalLoading(false);
        return;
      }

      if (!password) {
        setFormError("Enter your password.");
        passwordRef.current?.focus();
        setLocalLoading(false);
        return;
      }

      let powSolution: any = null;
      try {
        powSolution = await solveAndGetSolution("login");
      } catch (powError) {
        setFormError("Security verification failed. Please try again.");
        setLocalLoading(false);
        return;
      }

      const success = await login(email, password, powSolution).catch(
        () => false
      );

      if (success && typeof success === "object" && success.requiresTwoFactor) {
        setTwoFactorData({
          id: success.id,
          type: success.twoFactor.type,
        });
        setShowTwoFactor(true);
        setLocalLoading(false);
        return;
      }

      if (success) {
        toast({
          title: "Login successful",
          description: "Welcome back!",
        });

        if (onSuccess) {
          onSuccess();
        }

        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        const currentError = useUserStore.getState().error;
        /* "User email not verified. Verification email sent." — the server has
           already sent a new code by the time this arrives, so showing it as a
           form error strands the reader: the one thing that would let them in
           is sitting in their inbox with nowhere to type it. Hand it up
           instead, and the page asks for the code. */
        if (onEmailUnverified && /not verified/i.test(String(currentError || ""))) {
          onEmailUnverified(email);
          return;
        }
        setFormError(currentError || "Invalid email or password.");
      }
    } catch (error) {
      setFormError("An unexpected error occurred. Please try again.");
    } finally {
      setLocalLoading(false);
    }
  };

  const handleGoogleButtonClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoading || googleLoading) return;

    try {
      setGoogleLoading(true);
      setFormError(null);
      googleButtonClicked.current = true;

      const googleResponse = await openGoogleLoginPopup(googleClientId);
      let requestBody: any;

      if (typeof googleResponse === "string") {
        requestBody = { token: googleResponse };
      } else if (googleResponse && typeof googleResponse === "object") {
        if (googleResponse.credential) {
          requestBody = { token: googleResponse.credential };
        } else if (googleResponse.access_token) {
          requestBody = {
            access_token: googleResponse.access_token,
            user_info: googleResponse.user_info,
          };
        } else {
          throw new Error("Invalid Google response format");
        }
      } else {
        throw new Error("No credential received from Google");
      }

      const { data, error } = await $fetch({
        url: "/api/auth/login/google",
        method: "POST",
        body: requestBody,
      });

      if (error) {
        toast({
          title: "Google login error",
          description: error || "Failed to authenticate with Google.",
          variant: "destructive",
        });
        setGoogleLoading(false);
        googleButtonClicked.current = false;
        return;
      }

      useUserStore.getState().setUser(data.user);
      toast({
        title: "Login successful",
        description: "Welcome back!",
      });

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isCancellation =
        errorMessage.includes("cancelled") || errorMessage.includes("closed");
      if (!isCancellation) {
        toast({
          title: "Google login error",
          description: errorMessage || "Failed to initialize Google login.",
          variant: "destructive",
        });
      }
      googleButtonClicked.current = false;
    } finally {
      setGoogleLoading(false);
    }
  };

  const buttonLoading = localLoading || isLoading || powLoading;

  const handleTwoFactorSuccess = () => {
    setShowTwoFactor(false);
    setTwoFactorData(null);
    toast({
      title: "Login successful",
      description: "Welcome back!",
    });
    if (onSuccess) {
      onSuccess();
    }
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  if (showTwoFactor && twoFactorData) {
    return (
      <TwoFactorForm
        userId={twoFactorData.id}
        type={twoFactorData.type}
        onSuccess={handleTwoFactorSuccess}
        onCancel={() => setShowTwoFactor(false)}
      />
    );
  }

  const showAlternatives = googleAuthStatus || (walletConfigured && !!onWalletLoginClick);

  return (
    <div className="w-full">
      {withHeader ? (
        <header className="mb-7">
          <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            Sign in
          </h2>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            New here?{" "}
            <button
              type="button"
              onClick={onRegisterClick}
              className="cursor-pointer font-semibold text-[#0052ff] underline-offset-2 transition-colors hover:underline"
            >
              Create an account
            </button>
          </p>
        </header>
      ) : (
        <h1 className="sr-only">Sign in</h1>
      )}

      {/* Above the fields, not below them.

          It was under a divider at the foot of the form, which is where an
          afterthought goes — so the fastest way in was the last thing offered,
          after someone had already started typing an address. Most people
          arriving here have a Google account and one tap finishes the job;
          those who want a password scroll past a single line to reach it. */}
      {showAlternatives && (
        <div className="mb-5 space-y-3">
          {googleAuthStatus && (
            <AuthSecondaryButton
              icon={<GoogleMark />}
              onClick={handleGoogleButtonClick}
              disabled={buttonLoading || googleLoading}
            >
              {googleLoading ? "Connecting…" : "Continue with Google"}
            </AuthSecondaryButton>
          )}

          {walletConfigured && onWalletLoginClick && (
            <AuthSecondaryButton
              icon={<Wallet size={16} className="text-muted-foreground" />}
              onClick={onWalletLoginClick}
              disabled={buttonLoading || googleLoading}
            >
              Continue with a wallet
            </AuthSecondaryButton>
          )}

          <AuthDivider label="or use your email" />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <AuthField
          id="login-email"
          ref={emailRef}
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

        <AuthPasswordField
          id="login-password"
          ref={passwordRef}
          label="Password"
          autoComplete="current-password"
          /* The keyboard's action key submits, so finishing the form never
             depends on reaching a button the keyboard may be sitting on. */
          enterKeyHint="go"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={buttonLoading}
          required
          labelAction={
            <button
              type="button"
              onClick={onForgotPasswordClick}
              className="cursor-pointer text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Forgot password?
            </button>
          }
        />

        <AuthFormError message={formError} />

        <AuthSubmitButton
          loading={buttonLoading}
          /* The proof-of-work runs before the request does, and on a slow
             machine it is the longer half of the wait. Saying "signing in"
             through it would be a lie about which step is stuck. */
          loadingLabel={powLoading ? "Verifying…" : "Signing in…"}
          className="mt-1"
        >
          Sign in
        </AuthSubmitButton>
      </form>
    </div>
  );
}
