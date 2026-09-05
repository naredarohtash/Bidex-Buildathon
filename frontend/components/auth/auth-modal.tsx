"use client";

import type React from "react";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { X, Shield } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import LoginForm from "@/components/auth/login-form";
import RegisterForm from "@/components/auth/register-form";
import RegisterSuccess from "@/components/auth/register-success";
import ForgotPasswordForm from "@/components/auth/forgot-password-form";
import ResetPasswordForm from "@/components/auth/reset-password-form";
/* Loaded only when someone actually chooses wallet sign-in.

   This was a static import, and it is the single most expensive thing on the
   terminal: the form imports SiweMessage from "siwe", which pulls in
   @spruceid/siwe-parser and with it apg-js — an ABNF parser generator that
   compiles to 656KB, around 195KB gzipped. It reached the trading screen
   through header -> AuthHeaderControls -> AuthModal, so every trader on every
   page load downloaded and parsed an Ethereum message grammar to look at
   candles, whether or not they were signed in and whether or not this platform
   is ever used with a wallet.

   The form was already gated behind view === "wallet-login"; only the import
   was unconditional. Nothing about when it renders changes.

   LazyWalletProvider stays a normal import — it is already lazy internally,
   which is a good sign this cost was known about and this one was missed. */
const WalletLoginForm = dynamic(() => import("@/components/auth/wallet-login-form"), {
  ssr: false,
});
import { LazyWalletProvider } from "@/context/wallet-lazy";
import { useUserStore } from "@/store/user";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: "login" | "register" | "forgot-password" | "reset-password" | "wallet-login";
  onViewChange?: (view: string) => void;
  returnTo?: string;
}

export function AuthModal({
  isOpen,
  onClose,
  initialView = "login",
  onViewChange,
  returnTo,
}: AuthModalProps) {
  const [view, setView] = useState<
    "login" | "register" | "register-success" | "forgot-password" | "reset-password" | "wallet-login"
  >(initialView);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [registrationData, setRegistrationData] = useState<{ email: string; needsEmailVerification: boolean } | null>(null);
  const [animateContent, setAnimateContent] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useUserStore();

  /* The dialog is `fixed` and vertically centred in the *layout* viewport, and
     iOS never shrinks that for a keyboard — so with one open the bottom half of
     this card, submit button included, sat behind the keys, and nothing could
     scroll it out of the way because a fixed element does not move with the
     page. Everything done for the standalone auth page was irrelevant here for
     exactly that reason.

     With a keyboard up the card stops being centred: it pins near the top and
     its height is capped to what the keyboard leaves, so the whole of it —
     including the button — is inside the visible area, and its own scroller
     handles the rest. */
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (user && isOpen) {
      handleClose();
    }
  }, [user, isOpen]);

  const handleClose = () => {
    setError(null);
    onClose();
  };

  const handleViewChange = (
    newView: "login" | "register" | "register-success" | "forgot-password" | "reset-password" | "wallet-login"
  ) => {
    setError(null);
    setAnimateContent(false);
    setTimeout(() => {
      setView(newView);
      setAnimateContent(true);
      if (onViewChange) {
        onViewChange(newView);
      }
    }, 150);
  };

  const handleSuccess = () => {
    handleClose();
  };

  const handleLoginClick = () => {
    handleViewChange("login");
  };

  const handleTokenSubmit = (token: string) => {
    setResetToken(token);
    handleViewChange("reset-password");
  };

  const handleRegistrationSuccess = (email: string, needsEmailVerification: boolean) => {
    setRegistrationData({ email, needsEmailVerification });
    handleViewChange("register-success");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      {/* Theme tokens, not a hardcoded white card.

          It was `bg-white text-zinc-900`, which was survivable while every form
          inside it also hardcoded zinc — and became white-on-white the moment
          those forms started colouring themselves from the theme like the rest
          of the app. The lopsided 36px/4px radius went with it: it belonged to
          the old white login card, which no longer exists. */}
      <DialogContent
        /* DialogContent draws its own close button unless told not to, and this
           modal draws one too — both absolutely positioned at top-4 right-4, so
           they landed on the same pixels and rendered as one bolder X. The one
           below is kept because it is the bigger target: the built-in is a bare
           16px glyph, which is under half of what a thumb needs. */
        hideCloseButton
        className="sm:max-w-[430px] w-[92vw] sm:w-full p-0 overflow-hidden rounded-2xl border border-border bg-background text-foreground"
        style={{
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
          /* `translate`, not `transform`. Tailwind v4 centres this card with the
             standalone `translate` property, which composes *with* `transform`
             rather than being replaced by it — so overriding transform left the
             -50% vertical centring in place and doubled the horizontal shift.
             The card stayed centred and its top sat off-screen. */
          ...(keyboardInset > 0
            ? {
                top: 12,
                translate: "-50% 0",
                maxHeight: `calc(100dvh - ${keyboardInset + 24}px)`,
              }
            : {}),
        }}
      >
        <DialogTitle>
          <span className="sr-only">Authentication</span>
        </DialogTitle>
        <DialogDescription>
          <span className="sr-only">Sign in or create an account securely.</span>
        </DialogDescription>

        <DialogPrimitive.Close className="absolute right-3 top-3 z-20 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff]/40 sm:right-3.5 sm:top-3.5 sm:h-8 sm:w-8">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>

        {error && (
          <div
            className="relative z-10 mx-6 mt-6 rounded-lg border border-[#f23645]/25 bg-[#f23645]/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-[#f23645]"
            role="alert"
          >
            <div className="flex items-center gap-2 pr-5">
              <Shield className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              className="absolute right-0 top-0 bottom-0 cursor-pointer px-3 opacity-70 transition-opacity hover:opacity-100"
              onClick={() => setError(null)}
              aria-label="Dismiss"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}

        <div
          /* 90vh is the layout viewport again. When the card is height-capped
             above, the scroller must fit the card rather than the screen. */
          className={`overflow-y-auto scrollbar-hide auth-modal-content ${animateContent ? "opacity-100" : "opacity-0"}`}
          style={{ maxHeight: keyboardInset > 0 ? "100%" : "90dvh" }}
        >
          {view === "forgot-password" ? (
            <div className="p-7">
              <ForgotPasswordForm
                onSuccess={handleSuccess}
                onLoginClick={handleLoginClick}
                onTokenSubmit={handleTokenSubmit}
              />
            </div>
          ) : view === "reset-password" ? (
            <div className="p-7">
              <ResetPasswordForm
                token={resetToken || ""}
                onSuccess={handleSuccess}
                onLoginClick={handleLoginClick}
                preserveToken={true}
              />
            </div>
          ) : view === "wallet-login" ? (
            <div className="p-7">
              <LazyWalletProvider cookies="">
                <WalletLoginForm
                  onSuccess={handleSuccess}
                  onCancel={handleLoginClick}
                />
              </LazyWalletProvider>
            </div>
          ) : (
            <div>
              {view === "login" ? (
                <div className="p-8 sm:p-9">
                  <LoginForm
                    onSuccess={handleSuccess}
                    onRegisterClick={() => handleViewChange("register")}
                    onForgotPasswordClick={() => handleViewChange("forgot-password")}
                    onWalletLoginClick={() => handleViewChange("wallet-login")}
                  />
                </div>
              ) : view === "register" ? (
                <div className="p-7">
                  <RegisterForm
                    onSuccess={handleSuccess}
                    onRegistrationSuccess={handleRegistrationSuccess}
                    onLoginClick={handleLoginClick}
                  />
                </div>
              ) : (
                <div className="p-7">
                  <RegisterSuccess 
                    email={registrationData?.email || ""}
                    needsEmailVerification={registrationData?.needsEmailVerification || false}
                    onLoginClick={handleLoginClick}
                    onClose={handleClose}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
