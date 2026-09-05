"use client";

import { memo, useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, BarChart2, RefreshCw, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useTheme } from "next-themes";
import { AnalyticsDashboard } from "../analytics";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { useTranslations } from "next-intl";
import { MOBILE_NAV_HEIGHT } from "../navigation/mobile-navigation";

// ============================================================================
// TYPES
// ============================================================================

interface AnalyticsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "dark" | "light";
  /** When true, disables enter/exit animations for instant overlay switching on mobile */
  isMobile?: boolean;
  isSidebarCollapsed?: boolean;
  defaultTab?: "overview" | "journal";
  hideTabs?: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AnalyticsOverlay = memo(function AnalyticsOverlay({
  isOpen,
  onClose,
  theme = "dark",
  isMobile = false,
  isSidebarCollapsed = false,
  defaultTab,
  hideTabs = false,
}: AnalyticsOverlayProps) {
  const t = useTranslations("binary_components");
  const tCommon = useTranslations("common");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark" || resolvedTheme === "navy";
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { fetchCompletedOrders, completedOrders, tradingMode } = useBinaryStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter completed orders by current trading mode
  const filteredCompletedOrders = useMemo(() => {
    return completedOrders.filter(order => order.isDemo === (tradingMode === "demo"));
  }, [completedOrders, tradingMode]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Refresh data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchCompletedOrders();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const borderClass = isDark ? "border-zinc-800/50" : "border-gray-200/50";
  const subtitleClass = isDark ? "text-zinc-400" : "text-zinc-600";

  // Calculate quick stats
  const stats = useMemo(() => {
    if (filteredCompletedOrders.length === 0) return { wins: 0, losses: 0, winRate: 0 };
    const wins = filteredCompletedOrders.filter((o: any) => o.pnl > 0).length;
    const losses = filteredCompletedOrders.filter((o: any) => o.pnl < 0).length;
    const winRate = filteredCompletedOrders.length > 0 ? (wins / filteredCompletedOrders.length) * 100 : 0;
    return { wins, losses, winRate };
  }, [filteredCompletedOrders]);

  if (!isOpen || !mounted) return null;

  // Wrapper component - use div on mobile (no animation), motion.div on desktop
  const Wrapper = isMobile ? 'div' : motion.div;
  const wrapperProps = isMobile ? {} : {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  };

  const BackdropWrapper = isMobile ? 'div' : motion.div;
  const backdropProps = isMobile ? {} : {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  };

  const PanelWrapper = isMobile ? 'div' : motion.div;
  const panelProps = isMobile ? {} : {
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
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 6 },
    // `as const` so the easing array stays the tuple framer-motion expects.
    // Widened to number[] it matches no Transition variant, and the whole prop
    // object is rejected — which is how the old slide-in went unchecked.
    transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] } as const,
  };

  const content = (
    <Wrapper
      {...wrapperProps}
      /* The 46px inset is the desktop left rail's width, kept clear so the
         rail stays reachable while this is open. There is no left rail on a
         phone — the navigation is the bottom bar — so that inset was just a
         strip of chart showing down the side of a panel that was supposed to
         be the whole screen.

         The bottom bar is that same navigation, and it gets the same courtesy:
         the panel stops at it rather than covering it, so a section can be
         left from the bar the way it was entered. */
      style={isMobile ? { bottom: MOBILE_NAV_HEIGHT } : undefined}
      className={`fixed top-0 ${isMobile || isSidebarCollapsed ? "left-0" : "left-[46px]"} right-0 ${
        isMobile ? "" : "bottom-0"
      } z-[9999] flex pointer-events-none overflow-hidden`}
    >
      {/* Backdrop */}
      <BackdropWrapper
        {...backdropProps}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Analytics Panel - Full page spread covering full screen width & height except left sidebar */}
      <PanelWrapper
        {...panelProps}
        className={`relative h-full w-full flex flex-col ${
          isDark ? "bg-[#0b0e14]" : "bg-white"
        } shadow-2xl pointer-events-auto overflow-hidden`}
      >
        {/* Analytics Dashboard - Takes full remaining height, with tabs shown separately */}
        <div className="flex-1 overflow-hidden">
          <AnalyticsDashboard
            theme={theme}
            className="h-full"
            hideHeader={true}
            onClose={onClose}
            defaultTab={defaultTab}
            hideTabs={hideTabs}
          />
        </div>
      </PanelWrapper>
    </Wrapper>
  );

  // On mobile, render directly via Portal
  if (isMobile) {
    return createPortal(content, document.body);
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && content}
    </AnimatePresence>,
    document.body
  );
});

export default AnalyticsOverlay;
