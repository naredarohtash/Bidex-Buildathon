"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationsStore } from "@/store/notification-store";
import { useTheme } from "next-themes";
import { Link } from "@/i18n/routing";
import ChartContainer from "../chart/chart-container";
import OrderPanel from "../order/order-panel";
import ActivePositions from "../positions/active-positions";
import type {
  Symbol,
  TimeFrame,
  OrderSide,
  PriceMovement,
} from "@/store/trade/use-binary-store";
import { useBinaryStore, isSameSymbol } from "@/store/trade/use-binary-store";
import Header from "../header/header";
import { useOneClickTrading } from "../settings/one-click-toggle";
import useLatch from "../../lib/use-latch";
import { OPEN_SUPPORT_EVENT } from "../../lib/open-support";
import { rankingRulesTriggerProps } from "../../lib/ranking-rules";

/* Panels a trader opens sometimes, loaded when they do.
 *
 * These were static imports, so all of them were downloaded, parsed and
 * executed before the first candle could be drawn — roughly 200KB of source
 * before counting what they pull in behind them, on a screen whose one job is
 * to show a chart. Support alone is larger than the chart container; the
 * leaderboard is bigger than most of the trading UI.
 *
 * Each is paired with useLatch below so the chunk is not requested until the
 * panel is first opened, after which it stays mounted and behaves exactly as
 * it did before — exit animations and all. See use-latch.ts for why the
 * latch is needed rather than simply rendering them while open.
 */
const TradingSettingsOverlay = dynamic(
  () => import("../settings/trading-settings-overlay").then((m) => m.TradingSettingsOverlay),
  { ssr: false }
);
const AnalyticsOverlay = dynamic(
  () => import("../modals/analytics-overlay").then((m) => m.AnalyticsOverlay),
  { ssr: false }
);
const AccountOverlay = dynamic(
  () => import("../modals/account-overlay").then((m) => m.AccountOverlay),
  { ssr: false }
);
const Leaderboard = dynamic(() => import("../education/leaderboard"), { ssr: false });
import { useMediaQuery } from "@/hooks/use-media-query";
import { DOCK_TRANSITION, LARGE_SCREEN, dockWidthFor, type DockPanel } from "./dock";
import { RailSelector } from "./rail-selector";
const SupportOverlay = dynamic(
  () => import("../support/support-overlay").then((m) => ({ default: m.SupportOverlay })),
  { ssr: false }
);
import {
  HelpCircle,
  HeartHandshake,
  Info,
  MessageCircle,
  LifeBuoy,
  BookOpen,
  Medal,
  TrendingUp,
  BarChart2,
  Settings,
  Sun,
  Moon,
  Zap,
  Hexagon,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Sliders,
  Crosshair,
  Check,
  Activity,
  LineChart,
  Sparkles,
  Palette,
  Bell,
  ArrowRight,
  ClipboardList,
  Users,
  User,
  History,
  Compass,
  FileText,
  X,
} from "lucide-react";
const CandleColorsPopup = dynamic(() => import("./candle-colors-popup"), { ssr: false });
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserStore } from "@/store/user";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Logo from "@/components/elements/logo";

import type { Order } from "@/store/trade/use-binary-store";
import { useGuestGate } from "@/lib/guest/use-guest-gate";

import {
  CandlestickIcon,
  LineChartIcon,
  TerminalIcon,
  LeaderboardIcon,
  AnalyticsIcon,
  JournalIcon,
  SupportIcon,
  AreaChartIcon,
  BarChartIcon,
} from "./terminal-icons";


// Chart order type that combines both active and completed orders for the chart
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

interface DesktopLayoutProps {
  balance: number;
  realBalance: number | null;
  demoBalance: number;
  netPL: number;
  activeMarkets?: Array<{ symbol: Symbol; price: number; change: number }>;
  symbol: Symbol;
  handleSymbolChange: (symbol: Symbol) => void;
  addMarket: (symbol: Symbol) => void;
  removeMarket: (symbol: Symbol) => void;
  orders: Order[]; // Active orders for header/positions components
  chartOrders: ChartOrder[]; // Combined orders for the chart
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
  priceMovements?: Record<Symbol, PriceMovement>;
  setChartContextRef: (ref: any) => void;
  isMarketSwitching: boolean;
  timeFrame: TimeFrame;
  timeframeDurations: Array<{ value: TimeFrame; label: string }>;
  showExpiry: boolean;
  positionMarkers: any[];
  handleMarketSelect?: (marketSymbol: string) => void;
  bottomSpacing?: number;
  currency?: string; // Currency for displaying amounts (e.g., "USDT", "USD")
  // Tutorial callback (education overlays are handled locally)
}

export default function DesktopLayout({
  balance = 0,
  realBalance = null,
  demoBalance = 10000,
  netPL = 0,
  activeMarkets,
  symbol,
  handleSymbolChange = () => {},
  addMarket = () => {},
  removeMarket = () => {},
  orders = [],
  chartOrders = [],
  currentPrice = 0,
  tradingMode = "demo",
  handleTradingModeChange = () => {},
  isLoadingWallet = false,
  handlePositionsChange = () => {},
  completedPositionsCount = 0,
  activePositionsCount = 0,
  placeOrder = async () => false,
  handleExpiryChange = () => {},
  selectedExpiryMinutes = 1,
  isInSafeZone = true,
  candleData = [],
  priceMovements = {},
  setChartContextRef = () => {},
  isMarketSwitching = false,
  timeFrame = "1m",
  timeframeDurations = [],
  showExpiry = true,
  positionMarkers = [],
  handleMarketSelect,
  bottomSpacing = 0,
  currency = "USD",
}: DesktopLayoutProps) {
  // Get theme from next-themes with hydration-safe handling
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Get user authentication state
  const user = useUserStore((state) => state.user);
  const isAuthenticated = !!user;

  // Notifications store for unread support badge
  const notifications = useNotificationsStore((state) => state.notifications);
  const fetchNotifications = useNotificationsStore((state) => state.fetchNotifications);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const unreadSupportCount = useMemo(() => {
    return (notifications || []).filter(
      (n) =>
        !n.read &&
        (n.type === "message" ||
          n.title?.toLowerCase().includes("support") ||
          n.title?.toLowerCase().includes("ticket") ||
          n.link?.includes("support"))
    ).length;
  }, [notifications]);

  // Calculate the total rendering height of all active bottom indicator panels dynamically in responsive viewport space
  const indicatorPanelHeight = useChartStore((s: any) => {
    const list = (s.indicators || []) as any[];
    const panels = list.filter((ind) => ind.placement === "panel" && ind.isVisible !== false).slice(0, 3);
    if (panels.length === 0) return 0;

    let total = 24; // Is index base padding
    panels.forEach((o, index) => {
      if (index > 0) total += 24;
      const defaultH = 100;
      const height = o.panelHeight || defaultH;
      total += Math.round(height * 1.0); // desktop uses 1.0 multiplier
    });
    return total;
  });

  const [isSupportBadgeDismissed, setIsSupportBadgeDismissed] = useState(false);
  const prevUnreadCountRef = useRef(0);

  useEffect(() => {
    if (unreadSupportCount > prevUnreadCountRef.current) {
      setIsSupportBadgeDismissed(false);
    }
    prevUnreadCountRef.current = unreadSupportCount;
  }, [unreadSupportCount]);

  // Get candles, viewport state, and live currentPrice from useChartStore
  const candles = useChartStore((s: any) => s.candles || []);
  const viewport = useChartStore((s: any) => s.state?.viewport);
  const chartCurrentPrice = useChartStore((s: any) => s.currentPrice);

  // The chart engine paints a skeleton until it has data; overlays that float
  // on top of the canvas fade in with it instead of hovering over an empty pane
  const chartLoading = useChartStore((s: any) => s.state?.isLoading ?? false);
  const chartReady = candles.length > 0 && !chartLoading;

  // Continuously sync chart engine price feed to binary store for live trade evaluation & header badges
  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPrice = () => {
      const chartStore = (window as any).__chartStore;
      if (chartStore) {
        const price = chartStore.getState()?.currentPrice;
        if (typeof price === "number" && price > 0) {
          useBinaryStore.getState().setCurrentPrice(price);
        }
      }
    };

    syncPrice();
    const interval = setInterval(syncPrice, 100);

    let unsubscribe: (() => void) | null = null;
    const timer = setTimeout(() => {
      const chartStore = (window as any).__chartStore;
      if (chartStore && typeof chartStore.subscribe === "function") {
        unsubscribe = chartStore.subscribe((state: any) => {
          if (typeof state?.currentPrice === "number" && state.currentPrice > 0) {
            useBinaryStore.getState().setCurrentPrice(state.currentPrice);
          }
        });
      }
    }, 200);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      if (unsubscribe) unsubscribe();
    };
  }, [symbol]);

  const showScrollToLatest = useMemo(() => {
    if (!viewport || !candles || candles.length === 0) return false;
    const latestCandle = candles[candles.length - 1];
    if (!latestCandle || !viewport.endTime || !viewport.startTime) return false;
    const viewDuration = viewport.endTime - viewport.startTime;
    if (viewDuration <= 0) return false;
    
    // Check if the latest candle has scrolled off the right edge of the screen,
    // or if it has been scrolled far to the left (i.e. inside the left 35% of the viewport,
    // as the default live position centers the latest candle at 60% from the left).
    const isOffRight = latestCandle.time > viewport.endTime;
    const positionPercent = (latestCandle.time - viewport.startTime) / viewDuration;
    const isTooFarLeft = positionPercent < 0.35;
    
    return isOffRight || isTooFarLeft;
  }, [viewport, candles]);

  const handleScrollToLatest = useCallback(() => {
    const store = (typeof window !== "undefined" && (window as any).__chartStore)
      ? (window as any).__chartStore.getState()
      : (useChartStore.getState() as any);
      
    if (store && typeof store.goToCurrentTime === "function") {
      store.goToCurrentTime();
    }
  }, []);

  /**
   * Fullscreen, asked for by the chart's drawing toolbar.
   *
   * The button moved off this rail and onto the toolbar, under the mute
   * control, because that is where the rest of the chart's own view controls
   * are. What it cannot move is the *call*: `requestFullscreen` has to be made
   * on `documentElement` — the whole terminal, header and rail and all — and
   * the chart engine is a component inside that, with no business deciding
   * what its host puts on screen. So the engine dispatches and this listens,
   * exactly the arrangement the mute button beside it already uses.
   *
   * No state here any more. Nothing on this side draws the button, so tracking
   * whether we are in fullscreen would be a subscription kept for nobody; the
   * toolbar reads `document.fullscreenElement` for its own icon, which is also
   * the only reading that survives somebody leaving fullscreen with Escape.
   */
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    window.addEventListener("fullscreen-toggle-requested", toggleFullscreen);
    return () => window.removeEventListener("fullscreen-toggle-requested", toggleFullscreen);
  }, [toggleFullscreen]);

  // Select theme callback
  const handleSelectTheme = useCallback((newTheme: string) => {
    setTheme(newTheme);

    // Immediately apply the theme class to prevent delay
    if (typeof window !== "undefined") {
      const htmlElement = document.documentElement;
      htmlElement.classList.remove("light", "dark", "navy");
      if (newTheme === "dark") {
        htmlElement.classList.add("dark");
      } else if (newTheme === "navy") {
        htmlElement.classList.add("navy");
      } else {
        htmlElement.classList.add("light");
      }
    }
  }, [setTheme]);

  // Only update after mounting to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setIsToolbarCollapsed(localStorage.getItem("vortex-sidebar-collapsed") === "true");
    }
  }, []);

  // Default to dark mode during SSR/hydration, then use resolved theme after mount
  const isDarkMode = mounted ? (resolvedTheme === "dark" || resolvedTheme === "navy") : true;
  const isNavyMode = mounted && resolvedTheme === "navy";

  // Overlay states
  const [showSettingsOverlay, setShowSettingsOverlay] = useState(false);
  const [showAnalyticsOverlay, setShowAnalyticsOverlay] = useState(false);
  const [showAccountOverlay, setShowAccountOverlay] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<"overview" | "journal">("overview");
  const [settingsInitialTab, setSettingsInitialTab] = useState<"trading" | "protection">("trading");
  const [showSupportPanel, setShowSupportPanel] = useState(false);

  /* Same rule as the phone: a demo session can trade, and everything that
     describes an account asks for one. A support ticket from a temporary
     identity nobody can reply to is the clearest case. */
  const { isGuest, requireAccount } = useGuestGate();

  // Education overlay states
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  /* One number drives the ranking column's width, the header band above it and
     the asset tabs' left inset. All three are CSS transitions of the same
     duration and curve, started in the same commit, so the tabs and the chart
     move as one instead of drifting apart mid-slide.

     Raised on the next frame rather than in the same one: the column mounts at
     zero width and only then grows, so the first open animates instead of
     appearing fully formed. */
  const [dockWidth, setDockWidth] = useState(0);
  const [rankingDocked, setRankingDocked] = useState(false);
  const [settingsDocked, setSettingsDocked] = useState(false);
  const handleRankingDocked = useCallback(() => setRankingDocked(true), []);
  const handleSettingsDocked = useCallback(() => setSettingsDocked(true), []);

  /* Which panel holds the dock. Only one of these can be true — opening either
     closes the other — so this is a choice, not a sum.

     Support was a third occupant of this dock and is not any more. A ticket
     thread in a 360px column was the whole of what was wrong with the old
     panel: an agent's reply wrapped every eight words, a screenshot arrived as
     a thumbnail, and there was no room left to say who was handling it. It is
     a full-screen workspace now, like the account and analytics panels — see
     ../support/support-overlay. */
  const dockPanel: DockPanel | null = showLeaderboard
    ? "ranking"
    : showSettingsOverlay
      ? "settings"
      : null;
  const dockReady =
    dockPanel === "ranking" ? rankingDocked : dockPanel === "settings" ? settingsDocked : false;

  /* The ranking column is wider on a large display, where its type is larger.
     False until the first client effect, which is the right way round: the dock
     opens from zero width, so the only frame this could be wrong on is one
     where the column is not on screen yet. */
  const wideDock = useMediaQuery(LARGE_SCREEN);

  useEffect(() => {
    if (!dockPanel || !dockReady) {
      setDockWidth(0);
      return;
    }
    const frame = requestAnimationFrame(() => setDockWidth(dockWidthFor(dockPanel, wideDock)));
    return () => cancelAnimationFrame(frame);
  }, [dockPanel, dockReady, wideDock]);

  /* Which panel the band is showing *while it animates out*. `dockPanel` is
     already null by then, so reading it directly renamed the band to "Ranking"
     and resized its contents for the whole 300ms of closing the settings. */
  const [lastDock, setLastDock] = useState<DockPanel>("ranking");
  useEffect(() => {
    if (dockPanel) setLastDock(dockPanel);
  }, [dockPanel]);
  const [activeChartOverlay, setActiveChartOverlay] = useState<string | null>(null);

  useEffect(() => {
    const handleOverlayChange = (e: Event) => {
      const customEvent = e as CustomEvent<string | null>;
      setTimeout(() => {
        setActiveChartOverlay(customEvent.detail);
      }, 0);
    };
    window.addEventListener("vortex-overlay-changed", handleOverlayChange);
    return () => {
      window.removeEventListener("vortex-overlay-changed", handleOverlayChange);
    };
  }, []);

  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);

  const toggleToolbarCollapse = useCallback(() => {
    setIsToolbarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("vortex-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  const handleToggleSupportPanel = useCallback(() => {
    if (isGuest) return requireAccount("support");
    setIsSupportBadgeDismissed(true);
    setTimeout(() => {
      const willOpen = !showSupportPanel;
      setShowSupportPanel(willOpen);
      if (willOpen) {
        // Opening support — close all others
        setShowSettingsOverlay(false);
        setShowAccountOverlay(false);
        setSettingsInitialTab("trading");
        setShowAnalyticsOverlay(false);
        setShowLeaderboard(false);
        window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: null }));
      }
    }, 0);
  }, [showSupportPanel, isGuest, requireAccount]);

  /* Support, asked for from somewhere that cannot reach this state: the
     "Contact support" button on a locked profile dialog, three portals down
     inside the account overlay. It opens support and closes what it was asked
     from, which is the same thing the sidebar button does — see
     lib/open-support. */
  useEffect(() => {
    const onOpenSupport = () => {
      if (isGuest) return requireAccount("support");
      setIsSupportBadgeDismissed(true);
      setShowAccountOverlay(false);
      setShowSettingsOverlay(false);
      setShowAnalyticsOverlay(false);
      setShowLeaderboard(false);
      setShowSupportPanel(true);
      window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: null }));
    };
    window.addEventListener(OPEN_SUPPORT_EVENT, onOpenSupport);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, onOpenSupport);
  }, [isGuest, requireAccount]);

  // Subscriptions to chart engine store
  const showDrawingTools = useChartStore((s: any) => s.settings?.showDrawingTools ?? false);
  const showIndicatorsPanel = useChartStore((s: any) => s.showIndicatorsPanel ?? false);
  const currentChartType = useChartStore((s: any) => s.state?.chartType ?? s.settings?.chartType ?? "candlestick");

  const toggleDrawingTools = useCallback(() => {
    const store = useChartStore.getState();
    if (store.updateSettings) {
      store.updateSettings({ showDrawingTools: !showDrawingTools });
    }
  }, [showDrawingTools]);

  const toggleIndicatorsPanel = useCallback(() => {
    const store = useChartStore.getState();
    if (showIndicatorsPanel) {
      if (store.closeIndicatorsPanel) store.closeIndicatorsPanel();
    } else {
      if (store.openIndicatorsPanel) store.openIndicatorsPanel();
    }
  }, [showIndicatorsPanel]);

  const handleTimeFrameChange = useCallback((tf: TimeFrame) => {
    useBinaryStore.getState().setTimeFrame(tf);
    const store = useChartStore.getState();
    if (store.setTimeFrame) {
      store.setTimeFrame(tf);
    }
  }, []);

  const handleChartTypeChange = useCallback((ct: string) => {
    const store = useChartStore.getState();
    if (store.setChartType) {
      store.setChartType(ct);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await useUserStore.getState().logout();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  }, []);

  const avatarLetter = useMemo(() => {
    if (user?.firstName) return user.firstName[0].toUpperCase();
    if (user?.email) return user.email[0].toUpperCase();
    return "N";
  }, [user]);

  const displayName = useMemo(() => {
    if (user?.firstName) {
      return `${user.firstName} ${user.lastName || ""}`.trim();
    }
    return user?.email || "Guest Trader";
  }, [user]);

  const chartTypes = useMemo(() => [
    { value: "candlestick", label: "Candles", icon: <CandlestickIcon /> },
    { value: "line", label: "Line", icon: <LineChartIcon /> },
    { value: "area", label: "Area", icon: <AreaChartIcon /> },
    { value: "bar", label: "Bar", icon: <BarChartIcon /> },
    { value: "heikin-ashi", label: "Heikin Ashi", icon: <CandlestickIcon /> },
  ], []);

  // Get completed orders for trading stats - use selector to prevent re-renders from other store changes
  const completedOrders = useBinaryStore((state) => state.completedOrders);
  const [showCandleColors, setShowCandleColors] = useState(false);

  /* One latch per lazily-loaded panel. Each flips the first time its overlay is
     opened and stays flipped, so the panel is fetched on demand but then lives
     as long as this screen does — see the dynamic imports at the top. */
  const settingsLoaded = useLatch(showSettingsOverlay);
  const analyticsLoaded = useLatch(showAnalyticsOverlay);
  const accountLoaded = useLatch(showAccountOverlay);
  const supportLoaded = useLatch(showSupportPanel);
  const leaderboardLoaded = useLatch(showLeaderboard);
  const candleColorsLoaded = useLatch(showCandleColors);

  // Filter completed orders by current trading mode
  const filteredCompletedOrders = useMemo(() => {
    return completedOrders.filter(order => order.isDemo === (tradingMode === "demo"));
  }, [completedOrders, tradingMode]);

  // One-click trading hook
  const oneClickTrading = useOneClickTrading(balance * 0.5);

  const defaultAmount = 1000;

  // Calculate trading stats for settings - filtered by mode
  const tradingStats = useMemo(() => {
    const wins = filteredCompletedOrders.filter(o => o.status === "WIN");
    const losses = filteredCompletedOrders.filter(o => o.status === "LOSS");
    const winRate = filteredCompletedOrders.length > 0 ? (wins.length / filteredCompletedOrders.length) * 100 : 55;
    const avgProfit = wins.length > 0 ? wins.reduce((sum, o) => sum + (o.profit || 0), 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, o) => sum + Math.abs(o.profit || 0), 0) / losses.length : 0;
    return { winRate, avgProfit, avgLoss };
  }, [filteredCompletedOrders]);

  // Get chart type setting from binary settings store
  // Use specific selector to only subscribe to chartType changes, not the entire settings object
  const binaryChartType = useBinaryStore((state) => state.binarySettings?.display?.chartType) || "CHART_ENGINE";

  // Hide left positions sidebar since they are now embedded in the right order panel
  const showPositionsSidebar = false;

  // Default price movement if not available for the current symbol
  const defaultPriceMovement = {
    direction: "neutral" as const,
    percent: 0,
    strength: "weak" as const,
  };

  // Helper to close all overlays safely after render cycle
  const closeAllOverlays = useCallback(() => {
    setTimeout(() => {
      setShowSettingsOverlay(false);
      setShowAnalyticsOverlay(false);
      setShowAccountOverlay(false);
      setShowLeaderboard(false);
      setSettingsInitialTab("trading");
      window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: null }));
    }, 0);
  }, []);

  // Check if any parent overlay is open (to close chart internal overlays)
  const isAnyOverlayOpen =
    showSettingsOverlay || showAnalyticsOverlay || showAccountOverlay || showLeaderboard || showSupportPanel;

  /* Which destination the rail's sliding mark sits on.
  
     Ordered, not summed: several of these flags are true together — the
     analytics overlay carries its own tab, and `isAnyOverlayOpen` covers most
     of the others — so the first match wins and the terminal is what is left
     when nothing is open. Fullscreen is deliberately absent: it does something
     rather than being somewhere, and a mark parked on it would claim otherwise. */
  const railRef = useRef<HTMLDivElement>(null);
  const activeRail = showSettingsOverlay
    ? "settings"
    : showAccountOverlay
      ? "account"
      : showSupportPanel
        ? "support"
        : showLeaderboard
          ? "leaderboard"
          : showAnalyticsOverlay
            ? analyticsTab === "journal"
              ? "journal"
              : "analytics"
            : !isAnyOverlayOpen
              ? "terminal"
              : null;

  // Settings overlay handlers - toggle behavior, close all others when opening settings
  const handleToggleSettings = useCallback(() => {
    if (isGuest) return requireAccount("settings");
    setTimeout(() => {
      const willOpen = !showSettingsOverlay;
      setShowSettingsOverlay(willOpen);
      if (willOpen) {
        // Opening settings, close all others including notification and support sidebars
        setShowAnalyticsOverlay(false);
        setShowAccountOverlay(false);
        setShowLeaderboard(false);
        setShowSupportPanel(false);
        window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: null }));
      }
    }, 0);
  }, [showSettingsOverlay, isGuest, requireAccount]);

  const handleCloseSettings = useCallback(() => {
    setTimeout(() => {
      setShowSettingsOverlay(false);
      setSettingsInitialTab("trading");
    }, 0);
  }, []);

  // Open settings with a specific tab (used by chart for notification settings)
  const handleOpenSettingsWithTab = useCallback((tab: "trading" | "protection") => {
    if (isGuest) return requireAccount("settings");
    setTimeout(() => {
      setSettingsInitialTab(tab);
      setShowSettingsOverlay(true);
      setShowAnalyticsOverlay(false);
      setShowAccountOverlay(false);
      setShowLeaderboard(false);
      window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: null }));
    }, 0);
  }, [isGuest, requireAccount]);

  // Analytics overlay handlers - toggle behavior, close all others when opening analytics
  const handleToggleAnalytics = useCallback(() => {
    if (isGuest) return requireAccount("analytics");
    setTimeout(() => {
      const isAlreadyOnOverview = showAnalyticsOverlay && analyticsTab === "overview";
      if (isAlreadyOnOverview) {
        setShowAnalyticsOverlay(false);
        return;
      }
      setAnalyticsTab("overview");
      setShowAnalyticsOverlay(true);

      // Close all others
      setShowSettingsOverlay(false);
      setShowAccountOverlay(false);
      setShowLeaderboard(false);
      setSettingsInitialTab("trading");
    }, 0);
  }, [showAnalyticsOverlay, analyticsTab, isGuest, requireAccount]);

  const handleToggleJournal = useCallback(() => {
    if (isGuest) return requireAccount("your journal");
    setTimeout(() => {
      const isAlreadyOnJournal = showAnalyticsOverlay && analyticsTab === "journal";
      if (isAlreadyOnJournal) {
        setShowAnalyticsOverlay(false);
        return;
      }
      setAnalyticsTab("journal");
      setShowAnalyticsOverlay(true);

      // Close all others
      setShowSettingsOverlay(false);
      setShowAccountOverlay(false);
      setShowLeaderboard(false);
      setSettingsInitialTab("trading");
    }, 0);
  }, [showAnalyticsOverlay, analyticsTab, isGuest, requireAccount]);

  const handleCloseAnalytics = useCallback(() => {
    setTimeout(() => {
      setShowAnalyticsOverlay(false);
    }, 0);
  }, []);

  // Account overlay handlers
  const handleToggleAccount = useCallback(() => {
    /* Everything behind this icon describes an account a guest does not have:
       a name and address that are never stored, KYC against no identity, a
       two-factor setup with nothing to protect, a transactions list that cannot
       have rows. Opening it for a guest showed all of that, empty, with a Sign
       out button underneath.

       The mobile route has had a guest surface since the demo shipped — the
       identity, the time left and a sign-up CTA — but the gate lived in
       account-overlay's mobile branch only, so the desktop rail walked straight
       past it into the dashboard. Gated here instead, beside every other
       account-shaped destination in this file. */
    if (isGuest) return requireAccount("your profile");
    setTimeout(() => {
      const willOpen = !showAccountOverlay;
      setShowAccountOverlay(willOpen);
      if (willOpen) {
        // Opening account dashboard, close all others
        setShowSettingsOverlay(false);
        setShowAnalyticsOverlay(false);
        setShowLeaderboard(false);
        setShowSupportPanel(false);
        window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: null }));
      }
    }, 0);
  }, [showAccountOverlay, isGuest, requireAccount]);

  const handleCloseAccount = useCallback(() => {
    setTimeout(() => {
      setShowAccountOverlay(false);
    }, 0);
  }, []);

  // Education overlay handlers - toggle behavior, close all others when opening
  const handleLeaderboardClick = useCallback(() => {
    if (isGuest) return requireAccount("the leaderboard");
    setTimeout(() => {
      const willOpen = !showLeaderboard;
      setShowLeaderboard(willOpen);
      if (willOpen) {
        // Opening, close all others
        setShowSettingsOverlay(false);
        setShowAnalyticsOverlay(false);
        setShowAccountOverlay(false);
        setSettingsInitialTab("trading");
      }
    }, 0);
  }, [showLeaderboard, isGuest, requireAccount]);

  const handleSignalsClick = useCallback(() => {
    closeAllOverlays();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: "signals" }));
    }, 0);
  }, [closeAllOverlays]);

  const handlePatternsClick = useCallback(() => {
    closeAllOverlays();
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("vortex-open-overlay", { detail: "patterns" }));
    }, 0);
  }, [closeAllOverlays]);

  // Handler to close all parent overlays - used by chart's internal overlays (like notification center)
  const handleCloseParentOverlays = useCallback(() => {
    closeAllOverlays();
  }, [closeAllOverlays]);

  // Memoize filtered orders for chart display to prevent unnecessary re-renders of the chart component
  const filteredOrders = useMemo(() => {
    return (chartOrders || []).filter((order) => isSameSymbol(order.symbol, symbol));
  }, [chartOrders, symbol]);



  return (
    <div className="flex flex-1 flex-col bg-background min-h-0 w-full">
      <style dangerouslySetInnerHTML={{ __html: `
        /* Hide built-in chart-engine floating vertical toolbar */
        [data-tutorial="chart-area"] .absolute.bottom-4.z-20.flex.flex-col {
          display: none !important;
        }
        
        /* Re-position notification center to the left side */
        [data-tutorial="chart-area"] .absolute.top-0.right-12.z-50 {
          right: auto !important;
          left: 12px !important;
          top: 12px !important;
        }
        
        [data-tutorial="chart-area"] .absolute.top-0.right-12.z-50 .right-0 {
          right: auto !important;
          left: 0 !important;
        }
        
        /* Custom thin scrollbar for drawing tools drawer list */
        .scrollbar-custom::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 9999px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        /* Enhanced visibility and sizing for Chart Drawing Toolbar Icons */
        [data-drawing-toolbar] {
          width: 44px !important;
        }

        /* Size is theme-independent; colour is not. These overrides forced a
           near-white icon with !important on every theme, so on the light theme
           the drawing toolbar was white-on-white and effectively invisible. The
           colour rules are now scoped: light by default, dark/navy via the same
           :is(.dark, .navy) selector the rest of the app themes with. */
        [data-drawing-toolbar] button {
          width: 34px !important;
          height: 34px !important;
          transition: all 0.15s ease-in-out !important;
        }

        [data-drawing-toolbar] button {
          color: rgba(39, 39, 42, 0.88) !important;
        }
        [data-drawing-toolbar] button:hover {
          color: #09090b !important;
          background-color: rgba(0, 0, 0, 0.07) !important;
        }

        :is(.dark, .navy) [data-drawing-toolbar] button {
          color: rgba(244, 244, 245, 0.85) !important;
        }
        :is(.dark, .navy) [data-drawing-toolbar] button:hover {
          color: #ffffff !important;
          background-color: rgba(255, 255, 255, 0.1) !important;
        }

        /* Target main tool SVG icons inside drawing toolbar buttons */
        [data-drawing-toolbar] button svg:first-child {
          width: 20px !important;
          height: 20px !important;
          stroke-width: 1.85px !important;
        }

        /* Keep tiny dropdown chevron arrow small */
        [data-drawing-toolbar] button svg.w-2,
        [data-drawing-toolbar] button svg.w-2.h-2 {
          width: 8px !important;
          height: 8px !important;
          stroke-width: 1.5px !important;
          opacity: 0.6 !important;
        }

        /* Active drawing tool button styling */
        [data-drawing-toolbar] button.bg-blue-500\/10,
        [data-drawing-toolbar] button[class*="bg-blue-500"] {
          background-color: rgba(59, 130, 246, 0.18) !important;
          border-color: rgba(59, 130, 246, 0.4) !important;
          color: #60a5fa !important;
        }

        [data-drawing-toolbar] button.bg-blue-500\/10 svg:first-child,
        [data-drawing-toolbar] button[class*="bg-blue-500"] svg:first-child {
          color: #60a5fa !important;
          stroke-width: 2.1px !important;
        }

        /* Drawing Tool Drawer icons visibility */
        [data-drawing-drawer] button svg {
          width: 18px !important;
          height: 18px !important;
          stroke-width: 1.8px !important;
        }

        [data-drawing-drawer] {
          left: 44px !important;
        }
      `}} />


      {/* Permanent Logo + Global Header (Row 1) */}
      <div className="relative w-full h-[53px] shrink-0 z-50">
        {/* Permanent Logo */}
        <div
          className="absolute top-0 left-0 h-[53px] w-[46px] flex items-center justify-center z-50 border-b border-r"
          style={{
            backgroundColor: isNavyMode ? "#0e1626" : isDarkMode ? "#121214" : "#f8f9fa",
            borderColor: isNavyMode ? "#1c2a4a" : isDarkMode ? "#27272a" : "#e0e3eb"
          }}
        >
          <Logo type="icon" className="w-8 h-8 flex-shrink-0" />
        </div>

        {/* The ranking column continues through the header row. Without this the
            panel would begin below the asset tabs and read as a box dropped onto
            the screen; with it, it is one column from the top edge down, and the
            tabs start after it (see `leftInset` on Header). No bottom border —
            the column is continuous through this band. */}
        {(leaderboardLoaded || settingsLoaded) && (
          <div
            className={`absolute top-0 left-[46px] h-[53px] z-50 overflow-hidden bg-background ${
              dockWidth > 0 ? "border-r border-border" : ""
            }`}
            style={{ width: dockWidth, transition: DOCK_TRANSITION }}
            inert={!dockPanel}
          >
            <div
              className="flex h-full items-center justify-between px-4"
              style={{ width: dockWidthFor(lastDock, wideDock) }}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground 2xl:text-[15px]">
                {lastDock === "settings" ? "Settings" : "Global Leaderboard"}
                {/* Beside the word it explains. The rules live in the column
                    below this band, so the button says so through an event —
                    see lib/ranking-rules. */}
                {lastDock !== "settings" && (
                  <button
                    type="button"
                    {...rankingRulesTriggerProps()}
                    aria-label="How ranking works"
                    className="grid h-5 w-5 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Info size={13} />
                  </button>
                )}
              </span>
              <button
                onClick={() => {
                  setShowLeaderboard(false);
                  setShowSettingsOverlay(false);
                }}
                aria-label={lastDock === "settings" ? "Close settings" : "Close the leaderboard"}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {/* Global Header Row 1 */}
        <Header
          balance={balance}
          realBalance={realBalance}
          demoBalance={demoBalance}
          netPL={netPL}
          activeMarkets={activeMarkets}
          currentSymbol={symbol}
          onSelectSymbol={handleSymbolChange}
          onAddMarket={addMarket}
          onRemoveMarket={removeMarket}
          orders={orders}
          currentPrice={currentPrice}
          isMobile={false}
          tradingMode={tradingMode}
          onTradingModeChange={handleTradingModeChange}
          isLoadingWallet={isLoadingWallet}
          handleMarketSelect={handleMarketSelect}
          onSettingsClick={handleToggleSettings}
          onAnalyticsClick={handleToggleAnalytics}
          completedTradesCount={filteredCompletedOrders.length}
          onLeaderboardClick={handleLeaderboardClick}
          isSettingsOpen={showSettingsOverlay}
          isAnalyticsOpen={showAnalyticsOverlay}
          isLeaderboardOpen={showLeaderboard}
          isSidebarCollapsed={isToolbarCollapsed}
          leftInset={dockWidth}
        />
      </div>


      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Active positions sidebar - hidden as orders are displayed
            directly on the Chart Engine with P/L zones, entry markers,
            and countdown timers */}
        {showPositionsSidebar && (
          <ActivePositions
            orders={(orders || []).filter(
              (order) => order.status === "PENDING" && order.mode === tradingMode
            )}
            currentPrice={currentPrice}
            onPositionsChange={handlePositionsChange}
            className="relative z-40 h-full"
            hasCompletedPositions={completedPositionsCount > 0}
            theme={isNavyMode ? "navy" : isDarkMode ? "dark" : "light"}
          />
        )}

        {/* Left Toolbar Wrapper */}
        <div className="relative flex h-full shrink-0 z-30">
          {/* Left Sidebar */}
          <div
            /* overflow-y-auto is a safety net, not decoration. This column is
               height:100% with justify-between and no overflow handling, so when
               its icons needed more room than the viewport had, the lower group
               was simply cut off — which is what happened the last time the page
               zoom was removed. Now it scrolls instead. The scrollbar is hidden
               because 48px is too narrow to spare the width, and the content
               only overflows on short windows. */
            ref={railRef}
            className={`relative flex flex-col items-center justify-between pt-4 pb-5 shrink-0 border-r transition-all duration-300 overflow-y-auto [&::-webkit-scrollbar]:hidden ${
              isToolbarCollapsed
                ? "w-0 overflow-hidden border-r-0 py-0"
                : "w-[46px]"
            }`}
            style={{
              scrollbarWidth: "none",
              height: '100%',
              backgroundColor: isNavyMode ? "#0e1626" : isDarkMode ? "#121214" : "#f8f9fa",
              borderColor: isNavyMode ? "#1c2a4a" : isDarkMode ? "#27272a" : "#e0e3eb"
            }}
          >
            <RailSelector containerRef={railRef} activeKey={activeRail} />

            {/* Top Group */}
            <div className="relative z-10 flex flex-col items-center gap-5 w-full">
              {/* Signals - Disabled
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleSignalsClick}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        activeChartOverlay === "signals"
                          ? "text-orange-500 bg-orange-500/10"
                          : "text-zinc-400 hover:text-orange-500 hover:bg-orange-500/10"
                      }`}
                    >
                      <Zap size={16} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Signals</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              */}

              {/* Patterns - Disabled
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handlePatternsClick}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        activeChartOverlay === "patterns"
                          ? "text-purple-500 bg-purple-500/10"
                          : "text-zinc-400 hover:text-purple-500 hover:bg-purple-500/10"
                      }`}
                    >
                      <Hexagon size={16} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Patterns</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              */}


              {/* Trading Terminal */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/terminal"
                      onClick={closeAllOverlays}
                      data-rail="terminal"
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        !isAnyOverlayOpen
                          ? "text-blue-500"
                          : isDarkMode ? "text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10" : "text-zinc-600 hover:text-blue-500 hover:bg-blue-500/10"
                      }`}
                    >
                      <TerminalIcon />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Trading Terminal</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Leaderboard */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleLeaderboardClick}
                      data-rail="leaderboard"
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        showLeaderboard
                          ? "text-blue-500"
                          : isDarkMode ? "text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10" : "text-zinc-600 hover:text-blue-500 hover:bg-blue-500/10"
                      }`}
                    >
                      <LeaderboardIcon />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Leaderboard</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Analytics */}
              {isAuthenticated && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleToggleAnalytics}
                      data-rail="analytics"
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative cursor-pointer ${
                          showAnalyticsOverlay && analyticsTab === "overview"
                            ? "text-blue-500"
                            : isDarkMode ? "text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10" : "text-zinc-600 hover:text-blue-500 hover:bg-blue-500/10"
                        }`}
                      >
                        <AnalyticsIcon />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      <p>Analytics</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* My Journal */}
              {isAuthenticated && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleToggleJournal}
                      data-rail="journal"
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative cursor-pointer ${
                          showAnalyticsOverlay && analyticsTab === "journal"
                            ? "text-blue-500"
                            : isDarkMode ? "text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10" : "text-zinc-600 hover:text-blue-500 hover:bg-blue-500/10"
                        }`}
                      >
                        <JournalIcon />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      <p>My Journal</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Help & Support */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleToggleSupportPanel}
                      data-rail="support"
                      className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        showSupportPanel
                          ? "text-blue-500"
                          : isDarkMode ? "text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10" : "text-zinc-600 hover:text-blue-500 hover:bg-blue-500/10"
                      }`}
                    >
                      <SupportIcon />
                      <AnimatePresence>
                        {unreadSupportCount > 0 && !isSupportBadgeDismissed && (
                          <motion.span
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 shadow-md shadow-red-500/80 ring-2"
                            style={{ '--tw-ring-color': isNavyMode ? '#0e1626' : isDarkMode ? '#121214' : '#f8f9fa' } as any}
                          />
                        )}
                      </AnimatePresence>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Support Centre</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Bottom Group */}
            <div className="relative z-10 flex flex-col items-center gap-5 w-full">
              {/* My Account */}
              {isAuthenticated && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleToggleAccount}
                      data-rail="account"
                        className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative cursor-pointer ${
                          showAccountOverlay
                            ? "text-blue-500"
                            : isDarkMode ? "text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10" : "text-zinc-600 hover:text-blue-500 hover:bg-blue-500/10"
                        }`}
                      >
                        <User size={22} strokeWidth={2.2} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      <p>My Account</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}

              {/* Settings */}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleToggleSettings}
                      data-rail="settings"
                      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                        showSettingsOverlay
                          ? "text-blue-500"
                          : isDarkMode ? "text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10" : "text-zinc-600 hover:text-blue-500 hover:bg-blue-500/10"
                      }`}
                    >
                      <Settings size={22} strokeWidth={2.2} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Settings</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Fullscreen used to sit here, under Settings. It is the last
                  button on the drawing toolbar now — see the note on
                  `toggleFullscreen` above. */}
            </div>
          </div>

          {/* Sidebar Collapse/Expand Toggle — a quiet grip rail that grows into a
              tab on hover. The button itself is a transparent 20x56 hit area so it
              is comfortable to click; only the inner rail is painted. */}
          <button
            onClick={toggleToolbarCollapse}
            aria-label={isToolbarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isToolbarCollapsed}
            title={isToolbarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            className="group absolute left-full bottom-[171px] z-50 flex h-14 w-5 items-center justify-start bg-transparent cursor-pointer focus:outline-none"
          >
            <span
              className={`flex h-9 w-[3px] items-center justify-center overflow-hidden rounded-full transition-all duration-200 ease-out group-hover:h-11 group-hover:w-4 group-hover:rounded-l-none group-hover:rounded-r-md group-focus-visible:h-11 group-focus-visible:w-4 group-focus-visible:rounded-l-none group-focus-visible:rounded-r-md ${
                isDarkMode
                  ? "bg-zinc-700 group-hover:bg-zinc-800 group-hover:ring-1 group-hover:ring-zinc-700 group-focus-visible:ring-1 group-focus-visible:ring-zinc-600"
                  : "bg-zinc-300 group-hover:bg-white group-hover:ring-1 group-hover:ring-zinc-200 group-focus-visible:ring-1 group-focus-visible:ring-zinc-300"
              }`}
            >
              <span
                className={`opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 ${
                  isDarkMode ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                {isToolbarCollapsed ? <ChevronRight size={13} strokeWidth={2.4} /> : <ChevronLeft size={13} strokeWidth={2.4} />}
              </span>
            </span>
          </button>

        </div>

        {/* Ranking — a docked column rather than an overlay, so opening it
            moves the chart over instead of covering it. Same relationship the
            positions sidebar above has to the chart. */}
        {leaderboardLoaded && (
          <Leaderboard
            isOpen={showLeaderboard}
            onClose={() => setShowLeaderboard(false)}
            isSidebarCollapsed={isToolbarCollapsed}
            dockedWidth={dockPanel === "ranking" ? dockWidth : 0}
            onDockReady={handleRankingDocked}
          />
        )}

        {/* Settings — the other occupant of the dock. Same column, same width,
            same transition; only one of the two is ever open. */}
        {settingsLoaded && (
          <TradingSettingsOverlay
            isOpen={showSettingsOverlay}
            onClose={handleCloseSettings}
            darkMode={isDarkMode}
            balance={balance}
            currentPrice={currentPrice}
            symbol={symbol}
            oneClickEnabled={oneClickTrading.enabled}
            onOneClickChange={oneClickTrading.setEnabled}
            oneClickMaxAmount={oneClickTrading.maxAmount}
            currentAmount={defaultAmount}
            onPlaceOrder={placeOrder}
            currency={currency}
            isSidebarCollapsed={isToolbarCollapsed}
            dockedWidth={dockPanel === "settings" ? dockWidth : 0}
            onDockReady={handleSettingsDocked}
          />
        )}

        {/* Chart area */}
        <div className="flex-1 min-w-0 relative z-0 h-full bg-[#fafafa] dark:bg-background" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <ChartContainer
              /* Keyed on the symbol alone. isMarketSwitching used to be part of
                 this key, which meant a flag — not the data — decided when the
                 chart engine was destroyed and rebuilt, three times per switch:

                   t=0    switching:true          -> rebuild, for the OLD symbol
                   t=100  symbol changes          -> rebuild, starts loading NEW
                   t=400  switching:false         -> rebuild, throwing away (2)

                 The engine a trader finally sees is the third one, and the fetch
                 the second one had already started is discarded a few hundred
                 milliseconds before it would have painted. That is the whole of
                 "switching is slow while opening is instant": a first load
                 builds this key once and mounts exactly once, so it never pays
                 any of it.

                 A React key is for identity, and identity here is the symbol.
                 Progress state belongs in a prop — isMarketSwitching is still
                 passed below, and the chart reacts to it without being rebuilt. */
              key={`binary-desktop-chart-${symbol}`}
              symbol={symbol}
              timeFrame={timeFrame}
              orders={filteredOrders}
              expiryMinutes={selectedExpiryMinutes}
              showExpiry={showExpiry}
              timeframeDurations={timeframeDurations}
              onChartContextReady={setChartContextRef}
              positions={positionMarkers}
              isMarketSwitching={isMarketSwitching}
              currency={currency}
              defaultOrderAmount={defaultAmount}
              onPlaceOrder={placeOrder}
              onCloseParentOverlays={handleCloseParentOverlays}
              closeInternalOverlays={isAnyOverlayOpen}
            />

            {/* Go to current candle button */}
            {showScrollToLatest && (
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleScrollToLatest();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1 group cursor-pointer animate-in fade-in zoom-in-95 duration-200"
                title="Go to current candle"
              >
                <div className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-xl border border-blue-400/40 group-hover:scale-110 active:scale-95 transition-all">
                  <ArrowRight size={16} strokeWidth={2.5} />
                </div>
                {currentPrice > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-zinc-900/90 dark:bg-zinc-800/90 text-[11px] font-mono font-bold text-white border border-zinc-700/50 shadow-md">
                    {currentPrice.toFixed(2)}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Custom floating vertical toolbar (Quotex-Style floating tools) */}
          <div
            className={`absolute z-20 flex flex-col gap-1.5 p-1 transition-all duration-300 bg-transparent border-0 shadow-none ${
              chartReady ? "opacity-100" : "opacity-0 pointer-events-none"
            } ${showDrawingTools ? "left-[53px]" : "left-[11px]"}`}
            style={{ bottom: 30 + indicatorPanelHeight }}
          >
            {/* Drawings */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleDrawingTools}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-md border hover:scale-105 active:scale-95 ${
                      showDrawingTools
                        ? "bg-[#0052ff] border-[#0052ff] text-white"
                        : isDarkMode
                        ? "bg-[#151a26]/80 border-zinc-800/30 text-zinc-300 hover:bg-[#151a26]/95 hover:border-zinc-700/50 hover:text-white"
                        : "bg-white/80 border-zinc-200/50 text-zinc-700 hover:bg-white/95 hover:border-zinc-300 hover:text-zinc-950"
                    }`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  <p>Drawings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Timeframe */}
            <DropdownMenu>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-8 h-8">
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer backdrop-blur-md shadow-md border hover:scale-105 active:scale-95 ${
                            isDarkMode
                              ? "bg-[#151a26]/80 border-zinc-800/30 text-zinc-300 hover:bg-[#151a26]/95 hover:border-zinc-700/50 hover:text-white"
                              : "bg-white/80 border-zinc-200/50 text-zinc-700 hover:bg-white/95 hover:border-zinc-300 hover:text-zinc-950"
                          }`}
                        >
                          {timeFrame}
                        </button>
                      </DropdownMenuTrigger>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Timeframe</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent side="right" align="center" sideOffset={16} className="w-[190px] bg-white dark:bg-[#151a26] border border-zinc-200 dark:border-zinc-800/80 text-zinc-900 dark:text-zinc-200 rounded-xl p-2 shadow-2xl">
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { value: "1m", label: "1m", enabled: true },
                    { value: "2m", label: "2m", enabled: true },
                    { value: "3m", label: "3m", enabled: true },
                    { value: "5m", label: "5m", enabled: true },
                    { value: "10m", label: "10m", enabled: true },
                    { value: "15m", label: "15m", enabled: true },
                    { value: "30m", label: "30m", enabled: true },
                    { value: "1h", label: "1h", enabled: true },
                    { value: "4h", label: "4h", enabled: true },
                    { value: "1d", label: "1d", enabled: true },
                  ].map((tf) => {
                    const isSelected = timeFrame === tf.value;
                    const isSpanning = tf.value === "4h" || tf.value === "1d";
                    if (!tf.enabled) {
                      return (
                        <div
                          key={tf.value}
                          className={`flex items-center justify-center h-8 text-[11px] font-medium rounded-lg text-zinc-400 dark:text-zinc-600 bg-zinc-50 dark:bg-zinc-900/40 border border-transparent select-none opacity-30 ${
                            isSpanning ? "col-span-2" : "col-span-1"
                          }`}
                        >
                          {tf.label}
                        </div>
                      );
                    }
                    return (
                      <DropdownMenuItem
                        key={tf.value}
                        onClick={() => handleTimeFrameChange(tf.value as TimeFrame)}
                        className={`flex items-center justify-center h-8 text-[11px] font-semibold rounded-lg cursor-pointer transition-colors focus:bg-zinc-100 dark:focus:bg-zinc-800 ${
                          isSpanning ? "col-span-2" : "col-span-1"
                        } ${
                          isSelected
                            ? "bg-[#0052ff] text-white font-bold hover:bg-[#0052ff] dark:hover:bg-[#0052ff] focus:bg-[#0052ff] focus:text-white"
                            : "bg-zinc-50 dark:bg-[#1f2635]/50 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#1f2635] hover:text-zinc-950 dark:hover:text-white"
                        }`}
                      >
                        {tf.label}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Chart Type */}
            <DropdownMenu>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-8 h-8">
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-md border hover:scale-105 active:scale-95 ${
                            isDarkMode
                              ? "bg-[#151a26]/80 border-zinc-800/30 text-zinc-300 hover:bg-[#151a26]/95 hover:border-zinc-700/50 hover:text-white"
                              : "bg-white/80 border-zinc-200/50 text-zinc-700 hover:bg-white/95 hover:border-zinc-300 hover:text-zinc-950"
                          }`}
                        >
                          {currentChartType === "candlestick" && <CandlestickIcon />}
                          {currentChartType === "line" && <LineChartIcon />}
                          {currentChartType === "area" && <AreaChartIcon />}
                          {currentChartType === "bar" && <BarChartIcon />}
                          {currentChartType === "heikin-ashi" && <CandlestickIcon />}
                        </button>
                      </DropdownMenuTrigger>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    <p>Chart Type</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DropdownMenuContent side="right" align="center" sideOffset={16} className="w-[143px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 rounded-xl p-1 shadow-xl">
                {chartTypes.map((ct) => (
                  <DropdownMenuItem
                    key={ct.value}
                    onClick={() => handleChartTypeChange(ct.value)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
                      currentChartType === ct.value ? "bg-[#0052ff] text-white font-medium" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {ct.icon}
                    <span className="flex-1">{ct.label}</span>
                    {currentChartType === ct.value && <Check size={12} />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Indicators */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleIndicatorsPanel}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-md border hover:scale-105 active:scale-95 ${
                      showIndicatorsPanel
                        ? "bg-[#0052ff] border-[#0052ff] text-white"
                        : isDarkMode
                        ? "bg-[#151a26]/80 border-zinc-800/30 text-zinc-300 hover:bg-[#151a26]/95 hover:border-zinc-700/50 hover:text-white"
                        : "bg-white/80 border-zinc-200/50 text-zinc-700 hover:bg-white/95 hover:border-zinc-300 hover:text-zinc-950"
                    }`}
                  >
                    <Activity className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  <p>Indicators</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Candle Colors */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowCandleColors((prev) => !prev)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer backdrop-blur-md shadow-md border hover:scale-105 active:scale-95 ${
                      showCandleColors
                        ? "bg-[#0052ff] border-[#0052ff] text-white"
                        : isDarkMode
                        ? "bg-[#151a26]/80 border-zinc-800/30 text-zinc-300 hover:bg-[#151a26]/95 hover:border-zinc-700/50 hover:text-white"
                        : "bg-white/80 border-zinc-200/50 text-zinc-700 hover:bg-white/95 hover:border-zinc-300 hover:text-zinc-950"
                    }`}
                  >
                    <Palette className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  <p>Candle Colors</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Candle Colors Customization Popup Overlay */}
          {candleColorsLoaded && (
          <CandleColorsPopup
            isOpen={showCandleColors}
            onClose={() => setShowCandleColors(false)}
            isDarkMode={isDarkMode}
            isNavyMode={isNavyMode}
          />
          )}


          {/* Analytics Overlay */}
          {analyticsLoaded && (
          <AnalyticsOverlay
            isOpen={showAnalyticsOverlay}
            onClose={handleCloseAnalytics}
            theme={isDarkMode ? "dark" : "light"}
            isSidebarCollapsed={isToolbarCollapsed}
            defaultTab={analyticsTab}
            hideTabs={true}
          />
          )}

          {/* Account Overlay */}
          {accountLoaded && (
          <AccountOverlay
            isOpen={showAccountOverlay}
            onClose={handleCloseAccount}
            isSidebarCollapsed={isToolbarCollapsed}
          />
          )}

          {/* Support — tickets, the conversation and the ticket itself, side by
              side across the whole workspace. */}
          {supportLoaded && (
          <SupportOverlay
            isOpen={showSupportPanel}
            onClose={() => setShowSupportPanel(false)}
            isSidebarCollapsed={isToolbarCollapsed}
          />
          )}

        </div>

        {/* Order panel - fixed width on desktop with full height */}
        <div className="h-full w-[238px] shrink-0" style={{ backgroundColor: 'var(--chart-bg)' }}>
          <OrderPanel
            currentPrice={currentPrice}
            symbol={symbol}
            onPlaceOrder={placeOrder}
            onExpiryChange={handleExpiryChange}
            balance={balance}
            candleData={candleData}
            priceMovement={
              priceMovements && symbol in priceMovements
                ? priceMovements[symbol]
                : defaultPriceMovement
            }
            isInSafeZone={isInSafeZone}
            tradingMode={tradingMode}
            darkMode={isDarkMode}
          />
        </div>
      </div>
    </div>
  );
}
