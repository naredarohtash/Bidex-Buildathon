"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertTriangle, Loader2, ArrowLeft } from "lucide-react";
import { AuthModal } from "@/components/auth/auth-modal";
import LoginForm from "@/components/auth/login-form";
import ForgotPasswordForm from "@/components/auth/forgot-password-form";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  AuthField,
  AuthSubmitButton,
  AuthSecondaryButton,
  AuthStatusBlock,
} from "@/components/auth/auth-fields";
import { $fetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "@/i18n/routing";

type View = "sign-in" | "forgot-password";
type VerificationStatus = "none" | "pending" | "success" | "error" | "needs-code";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [view, setView] = useState<View>("sign-in");
  /* Wallet sign-in still lives in the shared modal — it owns a connector flow
     with its own chrome, and inlining it here would fork that. */
  const [walletOpen, setWalletOpen] = useState(false);

  const [verificationStatus, setVerificationStatus] =
    useState<VerificationStatus>("none");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  /* The six digits printed in the email. The link carries the same value, but
     it expires in five minutes and an email rarely arrives, gets opened and
     gets clicked inside five minutes — so the code has to be typeable too, or
     the only way in is to keep asking for links that keep going stale. */
  const [code, setCode] = useState("");

  useEffect(() => {
    const token = searchParams?.get("token");
    if (token) {
      handleEmailVerification(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleEmailVerification = async (token: string) => {
    setIsVerifying(true);
    setVerificationStatus("pending");

    try {
      const result = await $fetch({
        url: "/api/auth/verify/email",
        method: "POST",
        body: { token },
        silent: true,
      });

      if (result.data?.message) {
        setVerificationStatus("success");
        setVerificationMessage(result.data.message);
        toast({
          title: "Email verified",
          description: "You can now access all features.",
        });

        setTimeout(() => {
          router.push("/");
        }, 3000);
      } else {
        setVerificationStatus("error");
        setVerificationMessage(result.error || "Email verification failed");
        toast({
          title: "Verification failed",
          description: result.error || "Invalid or expired verification token.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Email verification error:", error);
      setVerificationStatus("error");
      setVerificationMessage(
        "An unexpected error occurred during verification"
      );
      toast({
        title: "Verification error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  /* Same endpoint the link uses. The link IS this code — /login?token=123456 —
     so typing it does exactly what clicking would have done. */
  const submitCode = async () => {
    const trimmed = code.replace(/\D/g, "");
    if (trimmed.length !== 6) {
      toast({
        title: "Enter the six digits",
        description: "The code in your email is six digits long.",
        variant: "destructive",
      });
      return;
    }
    await handleEmailVerification(trimmed);
  };

  const handleResendVerification = async () => {
    if (!userEmail) {
      toast({
        title: "Email required",
        description: "Enter your email address to resend the verification link.",
        variant: "destructive",
      });
      return;
    }

    setIsResending(true);

    try {
      const result = await $fetch({
        url: "/api/auth/verify/resend",
        method: "POST",
        body: { email: userEmail },
        silent: true,
      });

      if (result.data?.message) {
        toast({
          title: "Verification email sent",
          description: result.data.message,
        });
      } else {
        toast({
          title: "Failed to send",
          description: result.error || "Failed to send verification email.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Resend verification error:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  /* Arriving with ?token= is a different errand from signing in, so the column
     shows that errand instead — same page, same shell, no second layout. */
  if (verificationStatus !== "none") {
    return (
      <AuthShell
        headline="Confirming it's you."
        subline="Verification links are single use and expire, so this is the last step before the terminal opens."
      >
        <div className="w-full">
          {isVerifying ? (
            <AuthStatusBlock
              icon={<Loader2 className="h-5 w-5 animate-spin text-[#0052ff]" />}
              tint="#0052ff"
              title="Verifying your email"
              body="This only takes a moment."
            />
          ) : verificationStatus === "success" ? (
            <>
              <AuthStatusBlock
                icon={<CheckCircle2 className="h-5 w-5 text-[#089981]" />}
                tint="#089981"
                title="Email verified"
                body={verificationMessage || "Your account is ready."}
              />
              <p className="mt-4 text-[13px] text-muted-foreground">
                Taking you to the platform…
              </p>
              <AuthSubmitButton
                type="button"
                onClick={() => router.push("/")}
                className="mt-5"
              >
                Go now
              </AuthSubmitButton>
            </>
          ) : (
            <>
              <AuthStatusBlock
                icon={<AlertTriangle className="h-5 w-5 text-[#f23645]" />}
                tint="#f23645"
                title={
                  verificationStatus === "needs-code"
                    ? "Confirm your email to continue"
                    : "That link didn't work"
                }
                body={
                  verificationStatus === "needs-code"
                    ? "We have emailed you a six-digit code. Enter it below."
                    : verificationMessage ||
                      "The link expired. Type the code from the email, or send yourself a new one."
                }
              />

              {/* The code first, the resend second.
              
                  The screen used to offer only "send a new link", which is a
                  loop rather than a way out: the link and the code are the same
                  value with the same five-minute life, so a link that expired
                  in the inbox is replaced by another that will. Typing the code
                  from the newest email is the one action that reliably ends
                  this, so it is the one the screen leads with. */}
              <div className="mt-6 space-y-3">
                <AuthField
                  id="verification-code"
                  label="Verification code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <AuthSubmitButton
                  type="button"
                  onClick={submitCode}
                  loading={isVerifying}
                  loadingLabel="Checking…"
                >
                  Verify my email
                </AuthSubmitButton>
              </div>

              <div className="mt-6 space-y-3 border-t border-border pt-5">
                <p className="text-[13px] text-muted-foreground">
                  No code, or it has expired? Codes last five minutes.
                </p>
                <AuthField
                  id="resend-email"
                  label="Email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
                <AuthSecondaryButton
                  onClick={handleResendVerification}
                  disabled={isResending}
                >
                  {isResending ? "Sending…" : "Email me a new code"}
                </AuthSecondaryButton>
                <AuthSecondaryButton
                  onClick={() => {
                    setVerificationStatus("none");
                    setVerificationMessage("");
                    setCode("");
                  }}
                >
                  Back to sign in
                </AuthSecondaryButton>
              </div>
            </>
          )}
        </div>
      </AuthShell>
    );
  }

  return (
    <>
      <AuthShell
        mode={view === "sign-in" ? "sign-in" : undefined}
        headline={
          view === "forgot-password"
            ? "One email and you're back in."
            : "The next candle is already forming."
        }
        subline={
          view === "forgot-password"
            ? "A reset link goes to your registered address. The old password stops working the moment you set a new one."
            : "Currencies, crypto, commodities and stocks, open around the clock."
        }
      >
        {view === "forgot-password" ? (
          <div className="w-full">
            <button
              type="button"
              onClick={() => setView("sign-in")}
              className="group mb-6 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft
                size={14}
                className="transition-transform duration-200 group-hover:-translate-x-0.5"
              />
              Back to sign in
            </button>
            <ForgotPasswordForm onLoginClick={() => setView("sign-in")} />
          </div>
        ) : (
          <LoginForm
            withHeader={false}
            onSuccess={() => router.push("/")}
            onRegisterClick={() => router.push("/register")}
            onForgotPasswordClick={() => setView("forgot-password")}
            onWalletLoginClick={() => setWalletOpen(true)}
            onEmailUnverified={(email) => {
              /* The server has just emailed a fresh code, so go straight to
                 asking for it rather than leaving a red line under the form. */
              setUserEmail(email);
              setCode("");
              setVerificationMessage("");
              setVerificationStatus("needs-code");
            }}
          />
        )}
      </AuthShell>

      {walletOpen && (
        <AuthModal
          isOpen={walletOpen}
          onClose={() => setWalletOpen(false)}
          initialView="wallet-login"
          onViewChange={() => {}}
        />
      )}
    </>
  );
}
