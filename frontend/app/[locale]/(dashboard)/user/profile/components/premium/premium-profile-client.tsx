"use client";

import { useEffect, Suspense, lazy, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsNav } from "../kit/settings-nav";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/user";
import { useRouter } from "@/i18n/routing";
import { Button } from "@/components/ui/button";

// Lazy load components
const PersonalInfoTab = lazy(() =>
  import("./tabs/personal-info-tab").then((mod) => ({
    default: mod.PersonalInfoTab,
  }))
);
const SecurityTab = lazy(() =>
  import("./tabs/security-tab").then((mod) => ({ default: mod.SecurityTab }))
);

// Keep existing tabs for notifications
const NotificationsTab = lazy(() =>
  import("../tabs/notifications-tab").then((mod) => ({
    default: mod.NotificationsTab,
  }))
);
const PhoneVerificationTab = lazy(() =>
  import("../tabs/phone-verification-tab").then((mod) => ({
    default: mod.PhoneVerificationTab,
  }))
);
const TwoFactorSetupFlow = lazy(() =>
  import("../two-factor-setup-flow").then((mod) => ({
    default: mod.TwoFactorSetupFlow,
  }))
);

// Loading fallbacks
const ContentFallback = () => (
  <div className="flex-1 flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-transparent border-t-primary animate-spin" />
      </div>
      <p className="text-zinc-500 text-sm">Loading...</p>
    </div>
  </div>
);

export function PremiumProfileClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get("tab") || "personal";

  const {
    user,
    isLoading,
    setActiveTab,
    calculateSecurityScore,
    calculateProfileCompletion,
    showTwoFactorSetup,
    setShowTwoFactorSetup,
  } = useUserStore();

  // Set the active tab based on URL query parameter
  useEffect(() => {
    if (tabParam) {
      if (
        [
          "personal",
          "security",
          "notifications",
          "phone-verification",
        ].includes(tabParam)
      ) {
        setActiveTab(tabParam);
      } else {
        router.push("/user/profile?tab=personal");
      }
    }
  }, [tabParam, setActiveTab, router]);

  // Calculate scores on mount
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        calculateSecurityScore();
        calculateProfileCompletion();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [user, calculateSecurityScore, calculateProfileCompletion]);

  // Close mobile menu when tab changes
  useEffect(() => {
  }, [tabParam]);

  const handleTabChange = useCallback(
    (tab: string) => {
      router.push(`/user/profile?tab=${tab}`);
    },
    [router]
  );

  const startTwoFactorSetup = useCallback(() => {
    setShowTwoFactorSetup(true);
  }, [setShowTwoFactorSetup]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-2 border-primary/20" />
            <div className="absolute inset-0 h-16 w-16 rounded-full border-2 border-transparent border-t-primary animate-spin" />
          </div>
          <p className="text-zinc-500">Loading your profile...</p>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    // If 2FA setup is active, show that instead
    if (showTwoFactorSetup) {
      return (
        <Suspense fallback={<ContentFallback />}>
          <TwoFactorSetupFlow
            onCancel={() => setShowTwoFactorSetup(false)}
            onComplete={() => setShowTwoFactorSetup(false)}
          />
        </Suspense>
      );
    }

    switch (tabParam) {
      case "personal":
        return (
          <Suspense fallback={<ContentFallback />}>
            <PersonalInfoTab onTabChange={handleTabChange} />
          </Suspense>
        );
      case "security":
        return (
          <Suspense fallback={<ContentFallback />}>
            <SecurityTab startTwoFactorSetup={startTwoFactorSetup} />
          </Suspense>
        );
      case "notifications":
        return (
          <Suspense fallback={<ContentFallback />}>
            <NotificationsTab />
          </Suspense>
        );
      case "phone-verification":
        return (
          <Suspense fallback={<ContentFallback />}>
            <PhoneVerificationTab />
          </Suspense>
        );
      default:
        return (
          <Suspense fallback={<ContentFallback />}>
            <PersonalInfoTab onTabChange={handleTabChange} />
          </Suspense>
        );
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-background">
      {/* Main Content */}
      <div className="mx-auto w-full max-w-5xl p-4 md:p-6 lg:p-8">
        <SettingsNav
          active={tabParam}
          onChange={handleTabChange}
          attention={{ security: !user?.twoFactor?.enabled }}
          className="mb-6"
        />
        <div>
          <AnimatePresence mode="wait">
            <motion.div
              key={showTwoFactorSetup ? "2fa" : tabParam}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >


              {/* Tab Content */}
              {renderTabContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Background gradient effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/[0.02] rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/[0.02] rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2" />
      </div>
    </div>
  );
}

export default PremiumProfileClient;
