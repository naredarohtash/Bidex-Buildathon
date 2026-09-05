"use client";

/**
 * The mobile terminal.
 *
 *   ┌──────────────────────────────────────┐
 *   │ [🇨🇦🇨🇭 CAD/CHF 76% ⌄]  [▮▮ REAL ₹1.2M]│  header, floating
 *   │                                     ◧│  ← positions tab
 *   │              chart                   │
 *   │ ⚙                                    │  ← chart tools
 *   ├──────────────────────────────────────┤
 *   │ ┌ Timer ────────┬ Investment ──────┐ │
 *   │ │ − 00:01:00 +  │  −  1,000 ₹  +   │ │  trade panel
 *   │ │ [DUR|CLK]     │  [ ₹ | % ]       │ │
 *   │ │ Invest: 1,000 ₹ | Payout: 1,760 ₹│ │
 *   │ [    Up ↑    ] [    Down ↓    ]     │
 *   ├──────────────────────────────────────┤
 *   │ 📈 🏆 🎯 📊 📓 🎧 👤 ⚙               │  nav = desktop rail
 *   └──────────────────────────────────────┘
 *
 * The shape is the change. What was here before put the chart and the order
 * form in *the same space*, swapped by a tab and a horizontal swipe: choosing
 * a stake meant covering the price the stake was a bet on, and every trade was
 * two screen transitions long. Since a binary position is decided in seconds
 * against a moving price, the two things that decide it now share the screen —
 * chart above, controls below, neither ever hidden by the other.
 *
 * The bottom bar is the desktop left rail turned on its side — same glyphs,
 * same order, same destinations — so the two are one navigation rather than
 * two that happen to overlap. The chart's own controls (timeframe, chart type,
 * indicators, drawing tools) collapse into one button in its bottom-left
 * corner; positions pull out from a tab on its right edge.
 */

import { useEffect, useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { X, ChevronRight, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import MobileHeader from "../header/mobile-header";
import ChartContainer from "../chart/chart-container";
import MobileTradePanel from "../order/mobile-trade-panel";
import MobileNavigation, {
  MOBILE_NAV_HEIGHT,
  type MobileNavTab,
} from "../navigation/mobile-navigation";
import {
  AnalyticsIcon,
  JournalIcon,
} from "./terminal-icons";
import MobileChartTools from "../chart/mobile-chart-tools";
import FeedDiagnostics from "../debug/feed-diagnostics";
import { TradingSettingsOverlay } from "../settings/trading-settings-overlay";
import { AnalyticsOverlay } from "../modals/analytics-overlay";
import PatternLibrary from "../education/pattern-library";
import Leaderboard from "../education/leaderboard";
import ActivePositions from "../positions/active-positions";
import { useBinaryStore, isSameSymbol } from "@/store/trade/use-binary-store";
import { useOneClickTrading } from "../settings/one-click-toggle";
import { useGuestGate } from "@/lib/guest/use-guest-gate";
import type {
  OrderSide,
  Symbol,
  TimeFrame,
  Order,
} from "@/store/trade/use-binary-store";

import { OPEN_SUPPORT_EVENT } from "../../lib/open-support";

const SupportOverlay = dynamic(
  () => import("../support/support-overlay").then((m) => ({ default: m.SupportOverlay })),
  { ssr: false }
);
const AccountOverlay = dynamic(
  () => import("../modals/account-overlay").then((m) => m.AccountOverlay),
  { ssr: false }
);

interface ChartOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  amount: number;
  entryPrice: number;
  entryTime: number;
  expiryTime: number;
  closePrice?: number;
  status: "PENDING" | "WIN" | "LOSS";
  profit?: number;
  profitPercentage?: number;
  isDemo?: boolean;
}

interface MobileLayoutProps {
  balance: number;
  netPL: number;
  activeMarkets?: Array<{ symbol: Symbol; price: number; change: number }>;
  symbol: Symbol;
  handleSymbolChange: (symbol: Symbol) => void;
  addMarket: (symbol: Symbol) => void;
  removeMarket: (symbol: Symbol) => void;
  orders: Order[];
  chartOrders: ChartOrder[];
  currentPrice?: number;
  tradingMode: "demo" | "real";
  handleTradingModeChange: (mode: "demo" | "real") => void;
  isLoadingWallet: boolean;
  handlePositionsChange: (positions: any[]) => void;
  completedPositionsCount: number;
  activePositionsCount: number;
  placeOrder: (
    side: OrderSide,
    amount: number,
    expiryMinutes: number
  ) => Promise<boolean>;
  handleExpiryChange: (minutes: number) => void;
  selectedExpiryMinutes: number;
  isInSafeZone: boolean;
  candleData: any[];
  priceMovements?: Record<
    Symbol,
    {
      direction: "up" | "down" | "neutral";
      percent: number;
      strength: "strong" | "medium" | "weak";
    }
  >;
  activePanel: "chart" | "order" | "positions";
  setActivePanel: (panel: "chart" | "order" | "positions") => void;
  showMobileOrderPanel: boolean;
  setShowMobileOrderPanel: (show: boolean) => void;
  showMobilePositions: boolean;
  setShowMobilePositions: (show: boolean) => void;
  showQuickTradeButtons: boolean;
  toggleMobileOrderPanel: () => void;
  toggleMobilePositions: () => void;
  toggleQuickTradeButtons: () => void;
  setChartContextRef: (ref: any) => void;
  isMarketSwitching: boolean;
  timeFrame: TimeFrame;
  handleTimeFrameChange: (timeFrame: TimeFrame) => void;
  timeframeDurations: Array<{ value: TimeFrame; label: string }>;
  showExpiry: boolean;
  positionMarkers: any[];
  darkMode?: boolean;
  onDarkModeChange?: (darkMode: boolean) => void;
  handleMarketSelect?: (marketSymbol: string) => void;
  currency?: string;
}

export default function MobileLayout({
  symbol,
  currentPrice,
  handleSymbolChange,
  setActivePanel,
  handlePositionsChange,
  orders,
  chartOrders = [],
  placeOrder,
  handleExpiryChange,
  selectedExpiryMinutes,
  isInSafeZone,
  balance,
  tradingMode,
  handleTradingModeChange,
  setChartContextRef,
  isMarketSwitching,
  timeFrame,
  handleTimeFrameChange,
  timeframeDurations,
  showExpiry,
  positionMarkers,
  darkMode = true,
  handleMarketSelect,
  currency = "USD",
}: MobileLayoutProps) {
  const { resolvedTheme } = useTheme();
  const defaultOrderAmount = 1000;

  const [activeTab, setActiveTab] = useState<MobileNavTab>("chart");
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const [showAnalyticsOverlay, setShowAnalyticsOverlay] = useState(false);
  const [showPatternLibrary, setShowPatternLibrary] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showPositions, setShowPositions] = useState(false);
  /** The ⋯ rail is out — other floating controls stand down while it is. */
  const [toolsRailOpen, setToolsRailOpen] = useState(false);
  /* The engine's eleven-tool drawing rail costs 40px of a 390px viewport and
     offers Fibonacci retracements to someone placing a 60-second trade with a
     thumb. Off by default, back on demand from the ⋯ control. */
  const [showChartTools, setShowChartTools] = useState(false);

  const { isGuest, requireAccount } = useGuestGate();
  const { completedOrders } = useBinaryStore();

  const filteredCompletedOrders = useMemo(
    () => completedOrders.filter((o) => o.isDemo === (tradingMode === "demo")),
    [completedOrders, tradingMode]
  );

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (o) => o.status === "PENDING" && (o as any).mode === tradingMode
      ),
    [orders, tradingMode]
  );

  const oneClickTrading = useOneClickTrading(balance * 0.5);

  const closeAllOverlays = useCallback(() => {
    setShowSettingsOverlay(false);
    setShowAnalyticsOverlay(false);
    setShowPatternLibrary(false);
    setShowLeaderboard(false);
    setShowSupport(false);
    setShowAccount(false);
    setShowJournal(false);
    setShowPositions(false);
    setShowMenu(false);
  }, []);

  /* The surfaces that take the whole screen. Positions is not one of them —
     it is a drawer with its own collapse control, and the chart behind it is
     the thing you are dismissing it to see. */
  const isFullScreenOverlayOpen =
    showSettingsOverlay ||
    showAnalyticsOverlay ||
    showJournal ||
    showPatternLibrary ||
    showLeaderboard ||
    showSupport ||
    showAccount;

  const isAnyOverlayOpen =
    showSettingsOverlay ||
    showAnalyticsOverlay ||
    showPatternLibrary ||
    showLeaderboard ||
    showSupport ||
    showAccount ||
    showJournal ||
    showPositions ||
    showMenu;

  /* One destination at a time, and every one of them returns to the chart when
     dismissed — so the bar can never be left highlighting a tab whose surface
     is closed. */
  const handleNavSelect = useCallback(
    (tab: MobileNavTab) => {
      const wasActive = activeTab === tab;
      closeAllOverlays();
      if (wasActive && tab !== "chart") {
        setActiveTab("chart");
        return;
      }
      setActiveTab(tab);
      setActivePanel("chart");
      if (tab === "menu") {
        /* The drawer is a way in, not a place — the bar keeps highlighting
           whatever is behind it. */
        setActiveTab(activeTab === "menu" ? "chart" : activeTab);
        setShowMenu(true);
        return;
      }
      /* What a demo session actually contains.
         The chart and the trade panel are the product; everything below is
         built around an account that a guest does not have — a leaderboard
         they cannot appear on, a journal of trades that are never stored, a
         support thread nobody can reply to. Rather than open an empty version
         of each, name the one thing that unlocks them. Positions stay open
         because a guest's own live trades are in there. */
      const NEEDS_ACCOUNT: Record<string, string> = {
        leaders: "the leaderboard",
        analytics: "analytics",
        journal: "your journal",
        support: "support",
        settings: "settings",
      };
      if (isGuest && NEEDS_ACCOUNT[tab]) {
        requireAccount(NEEDS_ACCOUNT[tab]);
        setActiveTab(activeTab);
        return;
      }

      if (tab === "positions") setShowPositions(true);
      if (tab === "leaders") setShowLeaderboard(true);
      if (tab === "analytics") setShowAnalyticsOverlay(true);
      if (tab === "journal") setShowJournal(true);
      if (tab === "support") setShowSupport(true);
      if (tab === "account") setShowAccount(true);
      if (tab === "settings") setShowSettingsOverlay(true);
    },
    [activeTab, closeAllOverlays, setActivePanel, isGuest, requireAccount]
  );

  const backToChart = useCallback(() => {
    closeAllOverlays();
    setActiveTab("chart");
  }, [closeAllOverlays]);

  /* Support, asked for from inside something else — the "Contact support"
     button on a locked profile dialog, which is several portals below this.
     Same destination the nav bar's own tab reaches; see lib/open-support. */
  useEffect(() => {
    const onOpenSupport = () => {
      if (isGuest) return requireAccount("support");
      closeAllOverlays();
      setActiveTab("support");
      setActivePanel("chart");
      setShowSupport(true);
    };
    window.addEventListener(OPEN_SUPPORT_EVENT, onOpenSupport);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, onOpenSupport);
  }, [closeAllOverlays, isGuest, requireAccount, setActivePanel]);

  /* Mobile browsers report a viewport that the URL bar is about to take a bite
     out of; --vh is the measured height so the nav sits on the real bottom
     edge rather than below it, taking the chart's time axis with it. */
  useEffect(() => {
    const update = () => {
      const height = Math.min(
        window.innerHeight,
        document.documentElement.clientHeight
      );
      document.documentElement.style.setProperty("--vh", `${height * 0.01}px`);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", () =>
      setTimeout(update, 100)
    );
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const isDark = resolvedTheme === "dark" || resolvedTheme === "navy";

  return (
    <div
      className={`terminal-mobile flex flex-col w-full h-full overflow-hidden relative ${
        isDark ? "bg-[#0f1115]" : "bg-white"
      }`}
    >
      <MobileHeader
        symbol={symbol}
        balance={balance}
        tradingMode={tradingMode}
        onTradingModeChange={handleTradingModeChange}
        handleMarketSelect={handleMarketSelect}
      />

      {/* ── Chart ─────────────────────────────────────────────────────────
          The plot area starts below the floating boxes, not behind them.

          Running the canvas to the very top looked like more chart and was
          less: candles and price labels slid under the instrument box and the
          account box, and a wick emerging from behind an opaque card reads as
          a rendering fault rather than as depth. The strip they sit on is the
          chart's own background colour, so the surface still runs edge to edge
          — nothing is drawn in it, which is the point.

          "The chart's own background colour" has to mean the one the engine
          actually paints, which is --chart-bg. This column used bg-chart-base,
          a class holding a second copy of that value, and in the light theme
          the copy disagrees: #ffffff here against the #fafafa on the canvas.
          The result was a seam straight across the screen at the top of the
          plot area — the one place the strip and the canvas meet. */}
      <div
        style={{ background: "var(--chart-bg)" }}
        className="flex-1 relative min-h-0 flex flex-col"
      >
        <div className="h-[58px] shrink-0" />
        <div className="flex-1 min-h-0 relative">
        <ChartContainer
          /* Symbol only — see the note on the desktop layout's chart key.
             Including isMarketSwitching rebuilt the engine three times per
             switch and discarded the in-flight candle fetch each time. */
          key={`binary-mobile-chart-${symbol}`}
          symbol={symbol}
          timeFrame={timeFrame}
          orders={chartOrders.filter((o) => isSameSymbol(o.symbol, symbol))}
          expiryMinutes={selectedExpiryMinutes}
          showExpiry={showExpiry}
          timeframeDurations={timeframeDurations}
          onChartContextReady={setChartContextRef}
          positions={positionMarkers}
          isMarketSwitching={isMarketSwitching}
          isMobile={true}
          showDrawingTools={showChartTools}
          currency={currency}
          defaultOrderAmount={defaultOrderAmount}
          onPlaceOrder={placeOrder}
          onCloseParentOverlays={closeAllOverlays}
          closeInternalOverlays={isAnyOverlayOpen}
        />

        </div>

        {/* The chart's own controls: the ⋯ rail, and the open-position count. */}
        <MobileChartTools
          timeFrame={timeFrame}
          timeframeDurations={timeframeDurations}
          onTimeFrameChange={handleTimeFrameChange}
          drawingToolsOpen={showChartTools}
          onDrawingToolsChange={setShowChartTools}
          onOpenChange={setToolsRailOpen}
          isDark={isDark}
        />

        {/* Positions: a tab on the right edge, and the drawer it pulls out.
            Same Live/Settled panel the desktop sidebar carries — the desktop
            keeps it open permanently because it has the width for it; here it
            is a drawer, and a tap on the chart puts it away, because the chart
            is what you were looking at. */}
        {showPositions && (
          <>
            {/* Tapping the chart dismisses it. Not over the bar, though —
                a tap meant for a nav tab would otherwise be spent closing
                this instead of going where it was aimed. */}
            <div
              style={{ bottom: MOBILE_NAV_HEIGHT }}
              className="fixed top-0 inset-x-0 z-[65]"
              onClick={() => {
                setShowPositions(false);
                setActiveTab("chart");
              }}
            />
            {/* Fixed, not absolute: inside the chart box it stopped where the
                chart did, so the Live/Settled list was a 320px column in the
                top two thirds of the screen with the trade panel showing below
                it. It runs the full height now and carries its own collapse
                grip on the leading edge.

                Narrower than the desktop sidebar's 320px, not equal to it.
                Matching that number exactly is the wrong reading of "same as
                desktop": 320px is a quiet column beside a 1400px chart, but
                82% of a 390px phone — the panel stops being a drawer over the
                chart and becomes the screen. The card's own contents are
                11px type in label/value rows and sit comfortably in 280px,
                which leaves the chart actually visible behind it. */}
            <div
              style={{ bottom: MOBILE_NAV_HEIGHT }}
              className={`fixed top-0 right-0 z-[70] w-[280px] max-w-[78%] border-l shadow-2xl flex flex-col ${
                isDark
                  ? "bg-[#0f1115] border-[#1e222a]"
                  : "bg-white border-[#eceff3]"
              }`}
            >
              <button
                onClick={() => {
                  setShowPositions(false);
                  setActiveTab("chart");
                }}
                aria-label="Collapse positions"
                className={`absolute top-1/2 -translate-y-1/2 -left-5 w-5 h-14 rounded-l-md border border-r-0 flex items-center justify-center shadow-sm ${
                  isDark
                    ? "bg-[#1b1f26] border-[#2a2f3a] text-zinc-400"
                    : "bg-white border-zinc-200 text-zinc-500"
                }`}
              >
                <ChevronRight size={14} strokeWidth={2.4} />
              </button>
              <ActivePositions
                orders={activeOrders}
                completedOrders={filteredCompletedOrders}
                currentPrice={currentPrice ?? 0}
                isMobile={true}
                theme={isDark ? "dark" : "light"}
                isEmbedded={true}
              />
            </div>
          </>
        )}

      </div>

      {/* ── Trade panel ─────────────────────────────────────────────────── */}
      <MobileTradePanel
        symbol={symbol}
        balance={balance}
        isInSafeZone={isInSafeZone}
        darkMode={isDark}
        onPlaceOrder={placeOrder}
        onExpiryChange={handleExpiryChange}
      />

      {/* Off unless ?diag=feed has been used on this device. */}
      <FeedDiagnostics />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <MobileNavigation
        activeTab={activeTab}
        onSelect={handleNavSelect}
        activePositionsCount={activeOrders.length}
      />

      {/* The rest of the desktop rail, as a drawer. */}
      {showMenu && (
        <TerminalMenuDrawer
          isDark={isDark}
          completedTradesCount={filteredCompletedOrders.length}
          onClose={() => {
            setShowMenu(false);
            setActiveTab("chart");
          }}
          onSelect={(tab) => {
            setShowMenu(false);
            handleNavSelect(tab);
          }}
        />
      )}

      {/* Help and Account are full-surface and own their own chrome. */}
      {showSupport && (
        <SupportOverlay isOpen onClose={backToChart} isSidebarCollapsed={true} isMobile={true} />
      )}
      {showAccount && (
        <AccountOverlay isOpen onClose={backToChart} isSidebarCollapsed={true} isMobile={true} />
      )}

      {/* Every overlay is a full screen — full width, and every pixel of height
          down to the navigation bar. They used to be mounted inside the chart
          box, which meant a leaderboard or a journal was drawn into two thirds
          of a phone with the trade panel still lit underneath it, and its own
          scroll area squeezed into whatever the chart had left.

          Down to the bar, not over it: a section is a destination, and the bar
          is how destinations are chosen, so covering it forces a dismiss before
          every move. Each surface stops at MOBILE_NAV_HEIGHT instead. A surface
          that fills the screen still has to be dismissible from anywhere on it,
          so each one also gets the terminal's own back button rather than
          relying on the panel having remembered to draw a close control. */}
      <TradingSettingsOverlay
        isOpen={showSettingsOverlay}
        onClose={backToChart}
        darkMode={darkMode}
        balance={balance}
        symbol={symbol}
        oneClickEnabled={oneClickTrading.enabled}
        onOneClickChange={oneClickTrading.setEnabled}
        oneClickMaxAmount={oneClickTrading.maxAmount}
        currentAmount={defaultOrderAmount}
        onPlaceOrder={placeOrder}
        currency={currency}
        isMobile={true}
      />

      {/* Analytics and My Journal are two views of one overlay, exactly as on
          the desktop rail — the tabs are hidden because the bar chose the view. */}
      <AnalyticsOverlay
        isOpen={showAnalyticsOverlay || showJournal}
        onClose={backToChart}
        theme={darkMode ? "dark" : "light"}
        defaultTab={showJournal ? "journal" : "overview"}
        hideTabs={true}
        isMobile={true}
      />

      {showPatternLibrary && (
        <PatternLibrary isOpen onClose={backToChart} isMobile={true} />
      )}

      {showLeaderboard && (
        <Leaderboard isOpen onClose={backToChart} isMobile={true} />
      )}

      {/* One dismiss control for every full-screen surface, in the same place
          on all of them. */}
      {isFullScreenOverlayOpen && (
        <button
          onClick={backToChart}
          aria-label="Back to chart"
          className="fixed top-3 right-3 z-[10000] w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center shadow-lg backdrop-blur-sm active:bg-black/70"
        >
          <X size={20} strokeWidth={2.4} />
        </button>
      )}

    </div>
  );
}

/** A floating control over the chart: 40px, one glyph, optional count. */
function ChartFab({
  children,
  label,
  onClick,
  badge,
  active = false,
  isDark,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
  active?: boolean;
  isDark: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`relative w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors ${
        active
          ? "bg-[#2f80ed] text-white"
          : isDark
            ? "bg-[#1b1f26]/90 text-zinc-300 active:bg-[#232833]"
            : "bg-[#f2f4f7]/95 text-zinc-600 active:bg-[#e6e9ee]"
      }`}
    >
      {children}
      {badge !== undefined && (
        <span
          className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2f80ed] text-white text-[11px] font-bold leading-none flex items-center justify-center ring-2 ${
            isDark ? "ring-[#0f1115]" : "ring-white"
          }`}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/**
 * The desktop left rail, as a drawer.
 *
 * The destinations a trader visits once a session — leaderboard, analytics,
 * journal, support, settings — which is exactly the set that does
 * not deserve permanent thumb space on a phone. Same glyphs and same order as
 * the desktop rail, with the labels the desktop only shows on hover, because a
 * drawer has the width to say what things are.
 */
function TerminalMenuDrawer({
  isDark,
  completedTradesCount,
  onClose,
  onSelect,
}: {
  isDark: boolean;
  completedTradesCount: number;
  onClose: () => void;
  onSelect: (tab: MobileNavTab) => void;
}) {
  const items: Array<{
    id: MobileNavTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    hidden?: boolean;
  }> = [
    /* Leaderboard and Support are not here any more — they are their own tabs
       in the bottom bar. What is left is the review-and-configure set, which
       is what a menu is for. */
    {
      id: "analytics",
      label: "Analytics",
      icon: <AnalyticsIcon />,
      badge: completedTradesCount,
    },
    { id: "journal", label: "My Journal", icon: <JournalIcon /> },
    { id: "settings", label: "Settings", icon: <Settings size={22} strokeWidth={2.2} /> },
  ];

  return (
    <div
      style={{ bottom: MOBILE_NAV_HEIGHT }}
      className="fixed top-0 inset-x-0 z-[80] flex"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/45" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-[78%] max-w-[300px] h-full flex flex-col border-r shadow-2xl ${
          isDark ? "bg-[#0f1115] border-[#1e222a]" : "bg-white border-[#eceff3]"
        }`}
      >
        <div
          className={`flex items-center justify-between h-14 px-4 border-b shrink-0 ${
            isDark ? "border-[#1e222a]" : "border-[#eceff3]"
          }`}
        >
          <span
            className={`text-[15px] font-semibold ${
              isDark ? "text-zinc-100" : "text-zinc-900"
            }`}
          >
            Menu
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className={`p-2 -mr-2 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {items
            .filter((i) => !i.hidden)
            .map(({ id, label, icon, badge }) => (
              <button
                key={id}
                onClick={() => onSelect(id)}
                className={`w-full h-14 px-4 flex items-center gap-3.5 ${
                  isDark ? "text-zinc-200 active:bg-white/5" : "text-zinc-800 active:bg-zinc-100"
                }`}
              >
                <span className={isDark ? "text-zinc-400" : "text-zinc-600"}>{icon}</span>
                <span className="text-[15px] font-medium flex-1 text-left">{label}</span>
                {!!badge && badge > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#2f80ed] text-white text-[11px] font-bold flex items-center justify-center">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
