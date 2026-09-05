"use client";

/**
 * The account panel, rebuilt.
 *
 * What was wrong with the version this replaces:
 *
 * - It was a full-screen surface whose content was capped at `max-w-5xl` and
 *   centred. On a wide display that is roughly a third of the window in use and
 *   two thick empty margins, while the form inside stayed in a cramped column.
 *   Nothing here caps the width; the layout uses what it is given.
 * - Navigation was a row of tabs, and directly beneath it a "Quick actions"
 *   card listed three of those same tabs again. The rail is now the only
 *   navigation and quick actions is gone.
 * - "Account checklist" was a card of four rows restating flags the Security
 *   and Phone tabs each own. It is four chips in the header, next to the person
 *   they describe, and each unfinished one links to the tab that fixes it.
 * - The account ID sat in a card at the bottom of a narrow column, and its copy
 *   button reported success whether or not the copy happened. It is in the
 *   header, and it tells you the truth — see ./account/copy-value.
 *
 * Shape: identity header across the top, navigation rail down the left, content
 * filling the rest. Below `lg` the rail becomes a horizontal scroller and the
 * whole thing is a single column.
 */

import { memo, useEffect, useRef, useState, Suspense, lazy, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useUserStore } from "@/store/user";
import { useRouter, useParams } from "next/navigation";
import { useGuestGate } from "@/lib/guest/use-guest-gate";
import { useGuestSession, formatRemaining } from "@/store/trade/use-guest-session";
import { useToast } from "@/hooks/use-toast";
import { MOBILE_NAV_HEIGHT } from "../navigation/mobile-navigation";
import { AccountRail, ACCOUNT_TABS } from "./account/account-rail";
import { MobileAccountNav } from "./account/mobile-account-nav";
import { MobileIdentityCard } from "./account/mobile-identity-card";
import { MobileSubPage } from "./account/mobile-sub-page";
import { buildChecks } from "./account/account-checks";
import { KYC_RAIL_STATUS, resolveKycStage } from "./account/kyc-state";
import { useAvatarUpload } from "./account/use-avatar-upload";
import { PersonalPanel } from "./account/personal-panel";

/* Hosted here rather than at /user/kyc so verification does not send the trader
   out of the terminal and leave them to find the way back. */
const KycPanel = lazy(() =>
  import("./account/kyc-panel").then((m) => ({ default: m.KycPanel }))
);

const TransactionsPanel = lazy(() =>
  import("./account/transactions-panel").then((m) => ({ default: m.TransactionsPanel }))
);

/* The other three areas are unchanged and keep their own components — they now
   simply render into a panel that gives them the full width. */
const SecurityTab = lazy(() =>
  import("@/app/[locale]/(dashboard)/user/profile/components/premium/tabs/security-tab").then(
    (mod) => ({ default: mod.SecurityTab })
  )
) as React.ComponentType<{ startTwoFactorSetup: () => void }>;


/* The compact rebuild — see ./account/two-factor-setup. The old flow spent a
   full-width four-label progress bar and three tall cards of prose on what is
   one question. */
const TwoFactorSetupFlow = lazy(() =>
  import("./account/two-factor-setup").then((mod) => ({ default: mod.TwoFactorSetup }))
) as React.ComponentType<{ onCancel: () => void; onComplete: () => void }>;

const ContentFallback = () => (
  <div className="flex h-full min-h-[280px] flex-1 items-center justify-center">
    <Loader2 className="h-5 w-5 animate-spin text-primary" />
  </div>
);

interface AccountOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  isSidebarCollapsed?: boolean;
  /** Phone: stop at the bottom bar so the navigation stays reachable. */
  isMobile?: boolean;
}

/**
 * Direction-aware slide between account tabs.
 *
 * A function variant rather than an inline `initial`/`exit` object, because
 * only variants receive `custom`. It matters for the element on its way out:
 * inline props are captured when a child mounts, so the leaving tab would
 * animate with the direction that was current when IT arrived — the previous
 * one — and every change after the first would send the two halves the same
 * way.
 */
const TAB_SLIDE = {
  enter: (direction: number) => ({ opacity: 0, x: 24 * (direction || 1) }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: -24 * (direction || 1) }),
};

export const AccountOverlay = memo(function AccountOverlay({
  isOpen,
  onClose,
  isSidebarCollapsed = false,
  isMobile = false,
}: AccountOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  /* Phone only: null is the list of destinations, a tab id is that
     destination open over it. Desktop ignores this — it shows the rail and
     the content side by side and always has something selected. */
  const [mobileRoute, setMobileRoute] = useState<string | null>(null);

  const { user, profileCompletion, calculateSecurityScore, calculateProfileCompletion } =
    useUserStore();

  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "en";
  const { isGuest, requireAccount } = useGuestGate();
  const guestIdentity = useGuestSession((s) => s.identity);
  const guestRemaining = useGuestSession((s) => s.msRemaining);

  /* The one outstanding thing, derived exactly as the desktop header derives it
     — same buildChecks, same "lead with the first" — so the phone card and the
     desktop banner can never disagree about what is left to do. */
  const nextStep = useMemo(() => {
    const pending = buildChecks(user).filter((c) => !c.done);
    const first = pending[0];
    if (!first) return undefined;
    return {
      label: first.label.toLowerCase(),
      // Email is resolved in place on Personal; everything else names its tab.
      tab: first.goTo || (first.action === "verify-email" ? "personal" : "security"),
    };
  }, [user]);
  const { toast } = useToast();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (isOpen && user) {
      calculateSecurityScore();
      calculateProfileCompletion();
    }
  }, [isOpen, user, calculateSecurityScore, calculateProfileCompletion]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("personal");
      setShowTwoFactorSetup(false);
      setMobileRoute(null);
    }
  }, [isOpen]);

  /* Which way the content should travel.
  
     The panel slid the same direction whichever tab you picked, so going up
     the rail and going down it looked identical — the movement carried no
     information. Comparing the rail's own order gives the sign: pick something
     below where you are and the next tab arrives from below, pick something
     above and it arrives from above. Stored in a ref rather than state because
     it is read during the render that follows the change and must not cause a
     second one. */
  const slideDirection = useRef(1);

  /**
   * What each rail row reports.
   *
   * Identity verification has four answers and they matter differently:
   * approved, waiting on a human reviewer, refused, and never begun. The rail
   * used to collapse all of that into a tick or a dot, which cannot tell
   * somebody their documents were rejected — the one state where doing nothing
   * is the wrong response.
   *
   * The reading itself lives in ./account/kyc-state, because the lock over
   * Personal asks the same question. Derived twice, the two would eventually
   * disagree in the worst possible way: a rail saying "Verified" above a page
   * that still refuses to open.
   *
   * KYC only. Security carried a "2FA off" badge for a moment and it was wrong
   * twice over: it labelled the tab with a detail rather than a state, and it
   * made a row shout about something the Security tab says properly the moment
   * it is opened. Verification is different — it is the one thing people come
   * to this panel to check without opening anything.
   */
  const railStatus = useMemo(() => ({ kyc: KYC_RAIL_STATUS[resolveKycStage(user)] }), [user]);

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab((current) => {
        const from = ACCOUNT_TABS.findIndex((t) => t.id === current);
        const to = ACCOUNT_TABS.findIndex((t) => t.id === tab);
        if (from !== -1 && to !== -1 && from !== to) slideDirection.current = to > from ? 1 : -1;
        return tab;
      });
      setShowTwoFactorSetup(false);
      // On a phone, choosing a destination means opening it.
      setMobileRoute(tab);
    },
    []
  );

  const startTwoFactorSetup = useCallback(() => {
    setActiveTab("security");
    setShowTwoFactorSetup(true);
    setMobileRoute("security");
  }, []);

  /* Back goes to the list, except out of two-factor setup, where it goes back to
     Security — the screen that sent you there. Anything else loses your place. */
  const handleMobileBack = useCallback(() => {
    if (showTwoFactorSetup) {
      setShowTwoFactorSetup(false);
      return;
    }
    setMobileRoute(null);
  }, [showTwoFactorSetup]);

  /* One hook, shared with the portrait on Profile — see use-avatar-upload. */
  const { pickPhoto: onPickPhoto, chooseAvatar: onChooseAvatar, uploading } = useAvatarUpload();

  const renderContent = () => {
    if (showTwoFactorSetup) {
      return (
        <Suspense fallback={<ContentFallback />}>
          <div className="px-5 py-6 md:px-8">
            <TwoFactorSetupFlow
              onCancel={() => setShowTwoFactorSetup(false)}
              onComplete={() => setShowTwoFactorSetup(false)}
            />
          </div>
        </Suspense>
      );
    }

    switch (activeTab) {
      case "security":
        return (
          <Suspense fallback={<ContentFallback />}>
            {/* Wider than the form tabs, because Security is two columns and
                820px would put each of them under 400. The cap belongs to this
                frame rather than to the tab itself: SecurityTab is shared with
                the dashboard's profile page, where a different width may well
                be right. */}
            <div className="px-5 py-6 md:px-8">
              <div className="mx-auto w-full max-w-[1120px]">
                <SecurityTab startTwoFactorSetup={startTwoFactorSetup} />
              </div>
            </div>
          </Suspense>
        );
      case "kyc":
        return (
          <Suspense fallback={<ContentFallback />}>
            <KycPanel />
          </Suspense>
        );
      case "transactions":
        /* No measure cap here, deliberately. The other tabs are forms — a form
           read at 1600px wide is a worse form — but this one is a ledger, and a
           ledger wants every column it can get: date, movement, reference,
           amount, fee and status side by side rather than truncated. */
        return (
          <Suspense fallback={<ContentFallback />}>
            <TransactionsPanel />
          </Suspense>
        );
      default:
        // Owns its own scrolling and its own anchored save bar.
        return <PersonalPanel onGoToKyc={() => handleTabChange("kyc")} />;
    }
  };

  if (!isOpen || !mounted) return null;

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={isMobile ? { bottom: MOBILE_NAV_HEIGHT } : undefined}
      className={`fixed top-0 ${
        isSidebarCollapsed ? "left-0" : "left-[46px]"
      } right-0 ${isMobile ? "" : "bottom-0"} z-[9999] flex pointer-events-none overflow-hidden`}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      <motion.div
        /* A settle, not a slide.
        
               These panels take the whole workspace. Sliding one in from the right edge
               is a drawer's motion — it says "something has arrived beside what you were
               doing" — and 100% of the viewport travelling across at spring stiffness
               drags the eye along for the ride before there is anything to read. A
               spring also overshoots, so the panel arrives, springs back, and settles,
               three events for one action.
        
               Fading up over a short distance says the same thing without the journey:
               the backdrop dims, the panel resolves in place. Same curve and duration
               family as the dock's columns, so the terminal moves one way throughout. */
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-2xl pointer-events-auto"
      >
        {/* No close button. It sat over the account ID and duplicated two ways
            out that already exist: Escape, and the sidebar icon that opened it
            (desktop-layout toggles the same flag). */}
        {isMobile ? (
          /* Phone: a list of destinations, and one of them open over it. Not the
             rail — see ./account/mobile-account-nav for why. */
          <AnimatePresence initial={false} mode="wait">
            {mobileRoute === null ? (
              <motion.div
                key="root"
                initial={{ x: "-25%", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: "-25%", opacity: 0 }}
                transition={{ type: "tween", duration: 0.18 }}
                className="min-h-0 flex-1"
              >
                <MobileAccountNav
                  /* Every destination in here describes an account. A guest can
                     see what is on offer, and asking for any of it asks for the
                     account instead. */
                  onOpen={(tab) =>
                    isGuest
                      ? requireAccount(
                          ACCOUNT_TABS.find((t) => t.id === tab)?.label ?? "this"
                        )
                      : handleTabChange(tab)
                  }
                  onSignedOut={onClose}
                  guest={
                    isGuest
                      ? {
                          remaining: formatRemaining(guestRemaining),
                          onCreate: () => {
                            onClose();
                            router.push(`/${locale}/register`);
                          },
                          onSignIn: () => {
                            onClose();
                            router.push(`/${locale}/login`);
                          },
                        }
                      : undefined
                  }
                  /* Words rather than a dot: the list should answer "does this
                     need me?" without being opened. */
                  status={{
                    security: user?.twoFactor?.enabled
                      ? { label: "On", tone: "ok" as const }
                      : { label: "Not set up", tone: "warn" as const },
                    kyc:
                      (user?.kycLevel || 0) > 0
                        ? { label: "Verified", tone: "ok" as const }
                        : String((user as any)?.kyc?.status || "").toUpperCase() === "PENDING"
                          ? { label: "In process", tone: "neutral" as const }
                          : { label: "Pending", tone: "warn" as const },
                  }}
                  header={
                    <MobileIdentityCard
                      name={
                        guestIdentity?.name ||
                        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
                        "Your account"
                      }
                      email={guestIdentity?.email || user?.email || ""}
                      avatar={user?.avatar || undefined}
                      completion={profileCompletion || 0}
                      nextStepLabel={isGuest ? undefined : nextStep?.label}
                      onNextStep={
                        !isGuest && nextStep ? () => handleTabChange(nextStep.tab) : undefined
                      }
                    />
                  }
                />
              </motion.div>
            ) : (
              <motion.div
                key={showTwoFactorSetup ? "2fa" : mobileRoute}
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "tween", duration: 0.2 }}
                className="min-h-0 flex-1"
              >
                <MobileSubPage
                  title={
                    showTwoFactorSetup
                      ? "Two-factor"
                      : ACCOUNT_TABS.find((t) => t.id === mobileRoute)?.label || "Account"
                  }
                  onBack={handleMobileBack}
                  /* Personal anchors its own save bar below its own scroller. */
                  childScrolls={!showTwoFactorSetup && mobileRoute === "personal"}
                >
                  {renderContent()}
                </MobileSubPage>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          <>
            {/* No header.
            
                There was a full-width band above this — avatar, name, email,
                account id, real balance, tier, a completion ring and a
                next-step chip — repeated on every tab. It cost about 90px of a
                fixed-height panel to say things that belong elsewhere: the
                balance to the terminal, the account id to the Account card
                where account facts live, and the person's identity to the rail,
                which is on screen anyway. What is left is rail and content,
                and the content starts at the top of the panel.
            
                Rail + content. `min-h-0` is what lets the content pane scroll
                instead of pushing the panel taller than the window. */}
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <AccountRail
                active={activeTab}
                onChange={handleTabChange}
                status={railStatus}
                onSignedOut={onClose}
                user={user}
                uploading={uploading}
                onPickPhoto={onPickPhoto}
                onChooseAvatar={onChooseAvatar}
              />

              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                {/* The tab slides in from the side it lives on, and the one
                    leaving goes out the other way — so the two tabs read as one
                    movement rather than a flicker. `mode="wait"` keeps them from
                    overlapping, which matters because both are full height and a
                    crossfade of two scrolling panels looks like a fault.
                
                    A little further and a little slower than the fade it
                    replaces: 24px at 0.22s is enough to be read as direction
                    without becoming something you wait for. */}
                <AnimatePresence mode="wait" initial={false} custom={slideDirection.current}>
                  <motion.div
                    key={showTwoFactorSetup ? "2fa" : activeTab}
                    custom={slideDirection.current}
                    variants={TAB_SLIDE}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                    className="h-full"
                  >
                    {renderContent()}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );

  return createPortal(<AnimatePresence>{isOpen && content}</AnimatePresence>, document.body);
});

export default AccountOverlay;
