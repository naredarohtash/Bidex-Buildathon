"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useState, useEffect, useReducer } from "react";
import { useUserStore } from "@/store/user";
import { AuthModal } from "@/components/auth/auth-modal";
import ProfileInfo from "../partials/header/profile-info";
import { useReturnParam } from "@/hooks/use-return-param";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

export function AuthHeaderControls({
  isMobile = false,
  variant = "default",
  square = false,
}: {
  isMobile?: boolean;
  variant?: "default" | "binary";
  square?: boolean;
}) {
  const t = useTranslations("common");
  const tComponentsAuth = useTranslations("components_auth");
  const returnTo = useReturnParam();
  const user = useUserStore((state) => state.user);
  /* Not `!!user`: a signed-out visitor's profile request 401s and leaves a
     hollow user object behind, truthy and empty. Testing it rendered the
     profile control in place of the Login / Create an Account buttons — so a
     signed-out visitor had no way in from the header at all. */
  const signedIn = !!user?.email;
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalView, setAuthModalView] = useState<
    "login" | "register" | "forgot-password"
  >("login");

  // Check if we're on mobile
  const isSmallScreen = useMediaQuery("(max-width: 768px)");

  // Determine if we should show mobile UI
  const showMobileUI = isMobile || isSmallScreen;

  // Use useReducer instead of useState for force update
  const [, forceUpdate] = useReducer((x) => x + 1, 0);

  // Handle mounting state
  useEffect(() => {
    setMounted(true);
  }, []);

  // Subscribe to user state changes
  useEffect(() => {
    const unsubscribe = useUserStore.subscribe(() => forceUpdate());
    return () => unsubscribe();
  }, []);

  // Determine dark mode - default to dark during SSR
  const darkMode = !mounted ? true : resolvedTheme === "dark";

  const openLoginModal = () => {
    setAuthModalView("login");
    setIsAuthModalOpen(true);
  };

  const openRegisterModal = () => {
    setAuthModalView("register");
    setIsAuthModalOpen(true);
  };

  // Render different UI for mobile and desktop
  return (
    <>
      {signedIn ? (
        <ProfileInfo square={square} />
      ) : (
        // UI for logged-out user - styled as header sections
        <div className="flex items-center h-full">
          {variant === "binary" ? (
            <>
              {/* Binary variant - original flat style */}
              <button
                onClick={openLoginModal}
                className={`h-10 px-4 flex items-center justify-center text-sm font-medium cursor-pointer ${
                  showMobileUI ? "border-l" : "border-r"
                } ${
                  darkMode
                    ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                } transition-colors`}
              >
                {showMobileUI ? "Login" : "Login"}
              </button>
              {!showMobileUI && (
                <button
                  onClick={openRegisterModal}
                  className="h-10 px-4 flex items-center justify-center text-sm font-medium cursor-pointer transition-colors bg-[#F7941D] text-black hover:bg-[#F7941D]/90"
                >
                  {tComponentsAuth("sign_up")}
                </button>
              )}
            </>
          ) : (
            <>
              {/* Login and Create an Account.

                  It was "Log in" and "Start Trading", and the second was a
                  three-stop emerald gradient with a coloured drop shadow that
                  lifted on hover — a colour this platform uses for a rising
                  candle and nothing else, on the one control that should look
                  like the rest of the product. It is the platform's blue now,
                  flat, with the same 44px metrics as every other button in the
                  auth flow.

                  "Start Trading" also promised the wrong thing: it opens a
                  sign-up form. The button now says what it does. */}
              <div className="flex items-center gap-2 px-2">
                <button
                  onClick={openLoginModal}
                  className="h-10 px-4 flex items-center justify-center text-[13.5px] font-semibold cursor-pointer transition-colors rounded-lg text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                >
                  Login
                </button>
                {!showMobileUI && (
                  <button
                    onClick={openRegisterModal}
                    className="h-10 px-4 flex items-center justify-center text-[13.5px] font-semibold cursor-pointer rounded-lg bg-[#0052ff] text-white transition-colors duration-200 hover:bg-[#0041cc] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0052ff]/35"
                  >
                    Create an Account
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Auth Modal.
          returnTo is `?? undefined` because the hook yields null for "no return
          path" while the modal's prop is optional, i.e. undefined means the
          same thing there. */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        initialView={authModalView}
        onViewChange={(view) =>
          setAuthModalView(view as "login" | "register" | "forgot-password")
        }
        returnTo={returnTo ?? undefined}
      />
    </>
  );
}
