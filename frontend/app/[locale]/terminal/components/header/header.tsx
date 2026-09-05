"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Sun, Moon, Wallet, TrendingUp, ArrowUpRight, ArrowUpFromLine, Sparkles, ChevronDown, Maximize, Minimize, BarChart2, Settings, Trophy, BookOpen, HelpCircle, LifeBuoy, MessageCircle, Headphones, MoreHorizontal, Clock, X, Plus, Check, RefreshCw, Pencil, LogOut, Eye, Send, User, Gem, Pin, Bell, Copy, FlaskConical } from "lucide-react";
import type { Symbol, Order, Market } from "@/store/trade/use-binary-store";
import {
  extractBaseCurrency,
  extractQuoteCurrency,
  useBinaryStore,
  isSameSymbol,
} from "@/store/trade/use-binary-store";
import { NotificationCenter } from "@/components/binary/notifications";
import { useTradingNotificationsStore } from "@/components/binary/notifications/core";
import MarketSelector from "./market-selector-desktop";
/* Loaded when first opened, not when the terminal boots.

   These three were static imports, so the deposit flow (88KB of source, plus
   qrcode.react and the whole payment-gateway table), the withdrawal flow (54KB)
   and the account-levels modal were all downloaded, parsed and executed before
   a trader could be shown a single candle — on a page whose job is to draw a
   chart. Most sessions never open any of them.

   Each already returns null while closed, so nothing about what renders
   changes; only the moment the code is fetched does. */
const DepositModal = dynamic(() => import("../modals/deposit-modal"), { ssr: false });
const WithdrawModal = dynamic(() => import("../modals/withdraw-modal"), { ssr: false });
const AccountLevelsModal = dynamic(() => import("../modals/account-levels-modal"), { ssr: false });
import { TIERS, TIER_ORDER, TierBars, resolveTier } from "../../lib/account-tiers";
import { AccountPanel } from "./account-panel";
import MarketBrowserPanel from "./market-browser-panel";
import Image from "next/image";
import { wishlistService } from "@/services/wishlist-service";
import { tickersWs } from "@/services/tickers-ws";
import type { TickerData } from "@/services/market-data-ws";
import { getCryptoImageUrl, handleImageError, getAssetDisplayName } from "@/utils/image-fallback";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@iconify/react";
import { formatBinaryPrice } from "@/lib/precision-utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { FIAT_CURRENCIES, getFullTabDisplayName, formatTabReturn } from "../../lib/asset-name";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useUserStore } from "@/store/user";
import { adoptStoredTimeZone, applyTimeZone } from "../../lib/time-zone-sync";
import { canonicalZoneId } from "@/lib/time-zones";
import { AuthHeaderControls } from "@/components/auth/auth-header-controls";
import { useGuestGate } from "@/lib/guest/use-guest-gate";
import { NotificationBell } from "@/components/partials/header/notification-bell";
import ProfileInfo from "@/components/partials/header/profile-info";
import { useSettings } from "@/hooks/use-settings";
import { getChartSynchronizedTime } from "@/utils/time-sync";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import { OTC_BADGE_CLASS } from "../../lib/otc-badge";
import LiveBalance from "./live-balance";

interface HeaderProps {
  balance: number;
  realBalance: number | null;
  demoBalance: number;
  netPL: number;
  /* Market, not a hand-rolled copy of three of its fields. The inline shape
     here omitted isPinned, so this component could not read the pin state on
     the very markets it renders pin buttons for — the store has carried that
     field, and a togglePinMarket action, the whole time. */
  activeMarkets?: Market[];
  currentSymbol: Symbol;
  onSelectSymbol: (symbol: Symbol) => void;
  onAddMarket: (symbol: Symbol) => void;
  onRemoveMarket: (symbol: Symbol) => void;
  orders: Order[];
  currentPrice?: number;
  isMobile?: boolean;
  tradingMode: "demo" | "real";
  onTradingModeChange: (mode: "demo" | "real") => void;
  isLoadingWallet?: boolean;
  handleMarketSelect?: (marketSymbol: string) => void;
  onSettingsClick?: () => void;
  onAnalyticsClick?: () => void;
  /** Number of completed trades (for analytics badge) */
  completedTradesCount?: number;
  // Education features callbacks
  onLeaderboardClick?: () => void;
  // Overlay open states for active button styling
  isSettingsOpen?: boolean;
  isAnalyticsOpen?: boolean;
  isLeaderboardOpen?: boolean;
  isSidebarCollapsed?: boolean;
  hideMainHeader?: boolean;
  hideTabs?: boolean;
  /**
   * Extra width, in pixels, occupied to the left of this row by a docked panel.
   * The asset tabs start after it, so a docked panel that runs the full height
   * of the window pushes them across rather than being covered by them.
   */
  leftInset?: number;
}

interface WalletType {
  type: "real" | "practice";
  balance: number;
  name: string;
  color: string;
}

export const EXCHANGE_RATES: Record<string, number> = {
  USDT: 1.0,
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.5,
  BRL: 5.4,
  TRY: 32.5,
  MYR: 4.7,
  IDR: 16300.0,
  THB: 36.7,
  NGN: 1500.0,
  KES: 129.0,
  ZAR: 18.4,
  AED: 3.67,
  VND: 25400.0,
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USDT: "₮",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  BRL: "R$",
  TRY: "₺",
  MYR: "RM",
  IDR: "Rp",
  THB: "฿",
  NGN: "₦",
  KES: "KSh",
  ZAR: "R",
  AED: "د.إ",
  VND: "₫",
};


/* The list moved to @/lib/time-zones so the account screen and the admin's
   user form can offer the same zones this header does. Re-exported here
   because a good deal of code imports TIME_ZONES from this file. */
import { TIME_ZONES } from "@/lib/time-zones";
export { TIME_ZONES };
export type { TimeZone } from "@/lib/time-zones";

export default function Header({
  balance,
  realBalance,
  demoBalance,
  netPL,
  activeMarkets: propActiveMarkets,
  currentSymbol,
  onSelectSymbol,
  onAddMarket,
  onRemoveMarket,
  orders,
  currentPrice: propCurrentPrice,
  isMobile = false,
  tradingMode,
  onTradingModeChange,
  isLoadingWallet = false,
  handleMarketSelect = undefined,
  onSettingsClick,
  onAnalyticsClick,
  completedTradesCount = 0,
  onLeaderboardClick,
  isSettingsOpen = false,
  isAnalyticsOpen = false,
  isLeaderboardOpen = false,
  isSidebarCollapsed = false,
  hideMainHeader = false,
  hideTabs = false,
  leftInset = 0,
}: HeaderProps) {
  const showDrawingTools = useChartStore((s: any) => s.settings?.showDrawingTools ?? false);
  /* hoveredSymbol is gone.

     It existed to lift a hovered tab's z-index above its neighbours, which do
     not overlap — they sit in a flex row with a gap, so the raised stacking
     order changed nothing that could be seen. What it did do was call setState
     on every mouseenter and every mouseleave, and each of those re-rendered the
     header and every tab in it.

     That is the cost paid precisely while dragging the rail: the pointer sweeps
     across tab after tab, and each boundary crossed threw away the whole header
     and rebuilt it mid-gesture. A drag was the one interaction guaranteed to
     trigger it as often as possible. */
  /* Confirms a copy for a moment. Copying gives no feedback of its own, and a
     support ID copied with no acknowledgement gets copied three more times. */
  const [copiedTraderId, setCopiedTraderId] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Floating notification center popover states
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const unreadCount = useTradingNotificationsStore((state) => state.unreadCount);

  const railCleanupRef = useRef<(() => void) | null>(null);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (railCleanupRef.current) {
      railCleanupRef.current();
      railCleanupRef.current = null;
    }

    if (node) {
      const updateWidth = () => {
        setContainerWidth(node.getBoundingClientRect().width);
      };
      updateWidth();

      const observer = new ResizeObserver(updateWidth);
      observer.observe(node);
      resizeObserverRef.current = observer;

      /* Horizontal scrolling for machines without a horizontal input.

         This rail is overflow-x-auto and nothing else, which quietly assumes the
         pointing device can express horizontal intent. A Mac trackpad can — a
         two-finger swipe emits deltaX and the browser scrolls the rail natively,
         so it has always worked here. A standard Windows mouse has one wheel and
         emits only deltaY. Nothing on the page consumes that (the rail has no
         vertical overflow), so the event was discarded and the tabs sat still:
         not a broken handler, an absent one.

         deltaY is mapped onto scrollLeft, and deltaX is left alone so trackpads
         keep their native behaviour rather than being driven twice. */
      /* Everything below drives scrollLeft from a single rAF loop.

         The previous version wrote scrollLeft straight from the event handler,
         which is where the reported lag came from, in three separate ways:

         1. A wheel notch is one instant jump. Chrome on Windows reports 100px
            per notch, so the rail teleported 100px at a time — steps, not
            motion, which reads as stutter however fast it is.
         2. A mouse reporting at 125Hz fires pointermove roughly twice per
            frame, and each one wrote scrollLeft and forced the browser to
            reflow the rail. Half that work was thrown away before it was ever
            painted.
         3. Firefox on Windows reports wheel deltas in LINES (deltaMode 1),
            about 3 per notch, not pixels. Treating that as pixels moved the
            rail three pixels a notch — the same gesture that moves it a
            hundred in Chrome. On that browser it would have looked less like
            lag than like a rail that had stopped responding. */
      const maxLeft = () => Math.max(0, node.scrollWidth - node.clientWidth);
      const clamp = (v: number) => Math.max(0, Math.min(v, maxLeft()));

      let glideRaf: number | null = null;
      let target = node.scrollLeft;

      /* Exponential ease toward the target. It covers ~22% of the remaining
         distance per frame, so a notch resolves in about six frames — quick
         enough to feel like a direct response, gradual enough to read as
         movement rather than a jump. Snapping the last half pixel keeps it from
         chasing a fraction forever. */
      const glide = () => {
        const diff = target - node.scrollLeft;
        if (Math.abs(diff) < 0.5) {
          node.scrollLeft = target;
          glideRaf = null;
          return;
        }
        node.scrollLeft += diff * 0.22;
        glideRaf = requestAnimationFrame(glide);
      };

      let momentumRaf: number | null = null;
      const stopMomentum = () => {
        if (momentumRaf !== null) cancelAnimationFrame(momentumRaf);
        momentumRaf = null;
      };
      const stopGlide = () => {
        if (glideRaf !== null) cancelAnimationFrame(glideRaf);
        glideRaf = null;
      };

      const onWheel = (e: WheelEvent) => {
        if (e.deltaX !== 0) return;                        // trackpad: already horizontal
        if (node.scrollWidth <= node.clientWidth) return;  // nothing to scroll
        e.preventDefault();
        stopMomentum();
        // deltaMode: 0 = pixels, 1 = lines, 2 = pages. Normalise to pixels.
        const px =
          e.deltaMode === 1
            ? e.deltaY * 16
            : e.deltaMode === 2
            ? e.deltaY * node.clientWidth
            : e.deltaY;
        // Accumulate onto the target, not onto the current position, so notches
        // arriving mid-glide add up instead of cancelling the travel so far.
        target = clamp((glideRaf !== null ? target : node.scrollLeft) + px);
        if (glideRaf === null) glideRaf = requestAnimationFrame(glide);
      };

      /* Click-and-drag to pan, which is the other half of what a mouse cannot do
         here. The threshold matters: without it every tab click ends as a 1px
         drag and selecting an asset stops working. Under 4px is a click and is
         left alone; past it the rail pans and the click that follows is
         swallowed in the capture phase so it does not also switch instrument. */
      let down = false;
      let dragged = false;
      let startX = 0;
      let startLeft = 0;
      let pointerX = 0;
      let dragRaf: number | null = null;
      let velocity = 0; // px per ms, signed with the pointer
      let lastX = 0;
      let lastT = 0;

      // Drag tracks the cursor exactly — no easing. A hand dragging a surface
      // expects the surface under its finger, and easing here would feel like
      // slippage rather than smoothness. The rAF only coalesces the writes.
      const applyDrag = () => {
        dragRaf = null;
        node.scrollLeft = clamp(startLeft - (pointerX - startX));
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        down = true;
        dragged = false;
        startX = e.clientX;
        startLeft = node.scrollLeft;
        pointerX = e.clientX;
        lastX = e.clientX;
        lastT = e.timeStamp;
        velocity = 0;
        stopMomentum();
        stopGlide();
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (!dragged && Math.abs(dx) < 4) return;
        if (!dragged) {
          dragged = true;
          // Keep receiving moves once the cursor leaves the rail mid-drag.
          try { node.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
        }
        pointerX = e.clientX;
        const dt = e.timeStamp - lastT;
        if (dt > 0) {
          // Blended, so one erratic sample cannot throw the release.
          velocity = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * velocity;
          lastX = e.clientX;
          lastT = e.timeStamp;
        }
        if (dragRaf === null) dragRaf = requestAnimationFrame(applyDrag);
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!down) return;
        down = false;
        if (dragRaf !== null) {
          cancelAnimationFrame(dragRaf);
          dragRaf = null;
          applyDrag();
        }
        try { node.releasePointerCapture(e.pointerId); } catch { /* already released */ }

        /* Let go mid-sweep and the rail keeps travelling, shedding 6% a frame.
           Without it a fast drag stops dead the instant the button comes up,
           which is the moment a flick is supposed to do the most work. Stale
           velocity is ignored: if the pointer was held still before release,
           the gesture was a placement, not a throw. */
        if (!dragged || e.timeStamp - lastT > 80) return;
        let v = velocity * 16; // px per ms -> px per frame
        if (Math.abs(v) < 0.5) return;
        const decay = () => {
          v *= 0.94;
          const next = clamp(node.scrollLeft - v);
          if (Math.abs(v) < 0.2 || next === node.scrollLeft) {
            momentumRaf = null;
            return;
          }
          node.scrollLeft = next;
          momentumRaf = requestAnimationFrame(decay);
        };
        momentumRaf = requestAnimationFrame(decay);
      };

      const onClickCapture = (e: MouseEvent) => {
        if (!dragged) return;
        e.stopPropagation();
        e.preventDefault();
        dragged = false;
      };

      node.addEventListener("wheel", onWheel, { passive: false });
      node.addEventListener("pointerdown", onPointerDown);
      node.addEventListener("click", onClickCapture, true);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);

      railCleanupRef.current = () => {
        stopGlide();
        stopMomentum();
        if (dragRaf !== null) cancelAnimationFrame(dragRaf);
        node.removeEventListener("wheel", onWheel);
        node.removeEventListener("pointerdown", onPointerDown);
        node.removeEventListener("click", onClickCapture, true);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
    }
  }, []);

  useEffect(() => {
    return () => {
      railCleanupRef.current?.();
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  // Get activeMarkets and currentPrice from store if not provided via props
  const storeCurrentPrice = useBinaryStore((s) => s.currentPrice);
  const storeActiveMarkets = useBinaryStore((s) => s.activeMarkets);
  const currentPrice = propCurrentPrice ?? storeCurrentPrice;
  const activeMarkets = propActiveMarkets ?? storeActiveMarkets;

  /* One selector per value, not a bare useBinaryStore().

     Destructuring the hook with no selector subscribes to the whole store, and
     zustand then re-renders on any change to any part of it. This store is the
     busiest object in the terminal — currentPrice, symbolPrices and the order
     list are all rewritten several times a second by the price feed — so the
     header, every asset tab in it, its flags and its framer-motion wrappers were
     being rebuilt continuously, whether or not anything they display had
     changed. That is the cost that made the rail feel heavy to drag on any
     machine: the scroll was competing for the main thread with a re-render of
     the entire header, many times a second.

     Selected individually, the header re-renders when one of these seven values
     changes and at no other time. None of them changes on a price tick. */
  const binaryMarkets = useBinaryStore((s) => s.binaryMarkets);
  const resetDemoBalance = useBinaryStore((s) => s.resetDemoBalance);
  const binaryDurations = useBinaryStore((s) => s.binaryDurations);
  const selectedExpiryMinutes = useBinaryStore((s) => s.selectedExpiryMinutes);
  const selectedOrderType = useBinaryStore((s) => s.selectedOrderType);
  const selectedAmount = useBinaryStore((s) => s.selectedAmount);
  const togglePinMarket = useBinaryStore((s) => s.togglePinMarket);

  const [favoriteMarkets, setFavoriteMarkets] = useState<Symbol[]>([]);
  const [tickerData, setTickerData] = useState<Record<string, TickerData>>({});

  // Load wishlist
  useEffect(() => {
    if (isMobile) return;
    const unsub = wishlistService.subscribe((wishlist) => {
      setFavoriteMarkets(wishlist.map((i) => i.symbol as Symbol));
    });
    return unsub;
  }, [isMobile]);

  /* Live tickers, buffered and flushed on a timer rather than on arrival.

     This called setTickerData on every message from the feed, building a fresh
     object each time, so the state's identity changed on every tick and the
     whole header re-rendered — every tab, every pair of flag images, every
     framer-motion wrapper. The feed carries all streaming symbols, not only the
     ones in the rail, so the rate was set by the market rather than by anything
     on screen.

     Nothing here needs sub-second precision: these values feed a price and a
     payout on a tab. Four flushes a second is well past what can be read, and it
     is the difference between the rail being smooth to drag and not, because the
     gesture was competing with those re-renders for the main thread.

     Symbols outside the rail are dropped on arrival — updating state for an
     instrument that has no tab is work with no possible effect. */
  const tickerBufferRef = useRef<Record<string, TickerData>>({});
  useEffect(() => {
    if (isMobile) return;
    tickersWs.initialize();

    const unsub = tickersWs.subscribeToSpotData((data) => {
      Object.entries(data).forEach(([sym, td]) => {
        if (td?.last !== undefined) tickerBufferRef.current[sym] = td;
      });
    });

    const flush = setInterval(() => {
      const buffered = tickerBufferRef.current;
      if (Object.keys(buffered).length === 0) return;
      tickerBufferRef.current = {};
      setTickerData((prev) => ({ ...prev, ...buffered }));
    }, 250);

    return () => {
      unsub();
      clearInterval(flush);
    };
  }, [isMobile]);

  // Calculate payout percent for any given market
  const getPayoutPercent = useCallback((market: any): number => {
    const duration = binaryDurations.find((d) => d.duration === selectedExpiryMinutes);
    let baseProfit = 85;
    if (duration) {
      if (selectedOrderType === "RISE_FALL") baseProfit = duration.profitPercentageRiseFall || 85;
      else if (selectedOrderType === "HIGHER_LOWER") baseProfit = duration.profitPercentageHigherLower || 80;
      else if (selectedOrderType === "TOUCH_NO_TOUCH") baseProfit = duration.profitPercentageTouchNoTouch || 82;
      else if (selectedOrderType === "CALL_PUT") baseProfit = duration.profitPercentageCallPut || 85;
      else if (selectedOrderType === "TURBO") baseProfit = duration.profitPercentageTurbo || 80;
    }
    const sym = market.symbol || `${market.currency}${market.pair}`;
    if (sym.toUpperCase().includes("OTC")) {
      return baseProfit;
    }
    const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.min(95, Math.max(72, baseProfit - (hash % 7)));
  }, [binaryDurations, selectedExpiryMinutes, selectedOrderType]);

  // Get live price and change for pinned symbols
  const getLiveData = useCallback((symbol: Symbol) => {
    const market = binaryMarkets.find((m) => isSameSymbol(m.symbol, symbol) || isSameSymbol(`${m.currency}${m.pair}`, symbol));
    if (!market) return { price: 0, change: 0 };
    const wsKey = market.label || `${market.currency}/${market.pair}`;
    const sym = market.symbol || `${market.currency}${market.pair}`;
    const live = tickerData[wsKey] || tickerData[sym] || tickerData[`${market.currency}/${market.pair}`];
    const marketEntry = activeMarkets.find((m) => isSameSymbol(m.symbol, symbol));
    return {
      price: live?.last || marketEntry?.price || 0,
      change: live?.change || marketEntry?.change || 0,
    };
  }, [tickerData, activeMarkets, binaryMarkets]);

  const t = useTranslations("binary_components");
  const tCommon = useTranslations("common");
  const [showBalanceMenu, setShowBalanceMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [preferredCurrency, setPreferredCurrency] = useState<string>("USDT");

  // Track preferred currency from localStorage & custom events
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("preferred_currency") || "USDT";
      setPreferredCurrency(stored);

      const handleCurrencyChange = () => {
        setPreferredCurrency(localStorage.getItem("preferred_currency") || "USDT");
      };

      window.addEventListener("currency-changed", handleCurrencyChange);
      window.addEventListener("storage", handleCurrencyChange);
      return () => {
        window.removeEventListener("currency-changed", handleCurrencyChange);
        window.removeEventListener("storage", handleCurrencyChange);
      };
    }
  }, []);

  // Get user authentication state. Read here rather than further down because
  // the time-zone effect below needs it: the account carries the zone.
  const user = useUserStore((state) => state.user);

  const [selectedTz, setSelectedTz] = useState(TIME_ZONES[0]);

  // Load timezone from localStorage on mount and sync with changes
  useEffect(() => {
    /* The account's zone first, for a device that has not been told one — so
       signing in on a second machine starts on the zone you chose rather than
       on whatever that machine's browser guesses. */
    let saved = adoptStoredTimeZone(user) || localStorage.getItem("binary_timezone");
    if (!saved) {
      try {
        const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (detected) {
          saved = detected;
          localStorage.setItem("binary_timezone", detected);
          window.dispatchEvent(new CustomEvent("binary_timezone_changed", { detail: detected }));
        }
      } catch (e) {
        // Fallback
      }
    }

    // Helper to find or dynamically construct and add to global list
    const resolveAndSetTz = (raw: string) => {
      /* Old IANA names first: `Asia/Calcutta` is `Asia/Kolkata`, and a device
         reporting the alias should land on the listed zone rather than have a
         second India appended to the list. */
      const tzId = canonicalZoneId(raw);
      let found = TIME_ZONES.find((tz) => tz.id === tzId);
      if (!found && tzId) {
        try {
          const label = new Intl.DateTimeFormat("en-US", { timeZone: tzId, timeZoneName: "short" })
            .formatToParts(new Date())
            .find(p => p.type === "timeZoneName")?.value || "LOCAL";
          const name = tzId.split("/").pop()?.replace(/_/g, " ") || tzId;
          found = { id: tzId, label, name, flagCode: "GLO" };
          TIME_ZONES.push(found);
        } catch (err) {
          found = { id: tzId, label: "LOCAL", name: tzId.split("/").pop() || tzId, flagCode: "GLO" };
          TIME_ZONES.push(found);
        }
      }
      if (found) setSelectedTz(found);
    };

    if (saved) resolveAndSetTz(saved);

    const handleTzChanged = (e: any) => {
      if (e.detail) resolveAndSetTz(e.detail);
    };

    window.addEventListener("binary_timezone_changed", handleTzChanged);
    return () => {
      window.removeEventListener("binary_timezone_changed", handleTzChanged);
    };
    // Re-run when the account arrives: the profile loads after the first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, (user as any)?.profile]);

  /* One setter for the whole platform: this device's clock and the account's
     own Time zone field, which the profile screen reads back. See
     lib/time-zone-sync. */
  const handleSelectTz = (tz: typeof TIME_ZONES[0]) => {
    setSelectedTz(tz);
    applyTimeZone(tz.id);
  };

  // Live time-zone aware clock
  const [clockTime, setClockTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = getChartSynchronizedTime();
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: selectedTz.id === "UTC" ? "UTC" : selectedTz.id,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).formatToParts(now);
        const h = parts.find((p) => p.type === "hour")?.value || "00";
        const m = parts.find((p) => p.type === "minute")?.value || "00";
        const s = parts.find((p) => p.type === "second")?.value || "00";
        setClockTime(`${h}:${m}:${s}`);
      } catch (e) {
        // Fallback
        const h = String(now.getUTCHours()).padStart(2, "0");
        const m = String(now.getUTCMinutes()).padStart(2, "0");
        const s = String(now.getUTCSeconds()).padStart(2, "0");
        setClockTime(`${h}:${m}:${s}`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [selectedTz]);

  /* A guest has an account panel to show — a demo identity, a demo balance and
     a countdown — so "is there something here besides Log In / Sign Up" is not
     the same question as "is there a user". It was `!!user`, which answered the
     second, so a demo session got the signed-out header: login buttons where
     the ₮50,000 balance should be, on a terminal that had just handed them
     50,000 to trade with.

     `!!user` was also wrong in the other direction. The profile request 401s for
     a signed-out visitor and leaves a hollow user object behind — truthy, with
     no email — which is what once rendered "undefined undefined" in the account
     panel. useGuestGate is the one place that knows both rules
     (`signedIn = !!user?.email`), so both headers ask it rather than re-deriving. */
  const { isGuest, signedIn } = useGuestGate();
  const isAuthenticated = signedIn || isGuest;

  // Helper function to get user initials
  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
    }
    if (user?.firstName) {
      return user.firstName.charAt(0).toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  // Get settings to check if practice mode is enabled
  const { settings, settingsFetched } = useSettings();
  const binaryPracticeEnabled = settings?.binaryPracticeStatus !== false && settings?.binaryPracticeStatus !== "false";

  // Use next-themes hook
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Handle mounting state to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    
    // Ensure theme consistency on mount
    if (typeof window !== 'undefined') {
      const htmlElement = document.documentElement;
      const currentTheme = resolvedTheme || theme;
      
      // Apply the correct theme class
      htmlElement.classList.remove('light', 'dark', 'navy');
      if (currentTheme === 'dark') {
        htmlElement.classList.add('dark');
      } else if (currentTheme === 'navy') {
        htmlElement.classList.add('navy');
      } else {
        htmlElement.classList.add('light');
      }
    }
  }, [theme, resolvedTheme]);

  // Determine dark mode based on resolved theme (handles system theme)
  // Default to dark mode during SSR/initial render to prevent white flash
  const darkMode = !mounted ? true : (resolvedTheme === "dark" || resolvedTheme === "navy");

  // Wallet data
  const wallets: WalletType[] = [
    {
      type: "real",
      balance: realBalance ?? 0, // Use actual real balance from API
      name: "REAL ACCOUNT",
      color: "text-green-500",
    },
    {
      type: "practice",
      balance: demoBalance ?? 20000, // Ensure demo balance has a fallback
      name: "PRACTICE ACCOUNT",
      color: "text-[#F7941D]",
    },
  ];

  const [activeWallet, setActiveWallet] = useState<"real" | "practice">(
    tradingMode === "real" ? "real" : "practice"
  );
  const [isAccountSwitching, setIsAccountSwitching] = useState(false);

  // Ref to store timeout ID for debouncing
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get current wallet with safe fallback
  const currentWallet = wallets.find((w) => w.type === activeWallet);
  // Use the correct balance based on active wallet type
  const currentBalance = activeWallet === "real" 
    ? (realBalance ?? 0) 
    : (demoBalance ?? 20000);

  // Sync activeWallet with tradingMode prop changes
  useEffect(() => {
    setActiveWallet(tradingMode === "real" ? "real" : "practice");
  }, [tradingMode]);

  // Debounced handler for account switching to prevent rapid clicking issues
  const handleAccountSwitch = useCallback((accountType: "real" | "practice") => {
    if (activeWallet === accountType || isAccountSwitching) return; // Prevent duplicate calls and rapid switching

    setIsAccountSwitching(true);
    setActiveWallet(accountType);
    onTradingModeChange(accountType === "real" ? "real" : "demo");

    // Reset switching state after a short delay
    setTimeout(() => {
      setIsAccountSwitching(false);
    }, 500);
  }, [activeWallet, onTradingModeChange, isAccountSwitching]);

  // Force switch to real mode if practice mode is disabled
  useEffect(() => {
    // Only attempt switch after settings are loaded
    if (settingsFetched && !binaryPracticeEnabled && activeWallet === "practice") {
      handleAccountSwitch("real");
    }
  }, [settingsFetched, binaryPracticeEnabled, activeWallet, handleAccountSwitch]);

  // Debounced account switch using useRef to store timeout ID
  const debouncedAccountSwitch = useCallback((accountType: "real" | "practice") => {
    // Clear any existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout - reduced to 50ms for faster response
    debounceTimeoutRef.current = setTimeout(() => {
      handleAccountSwitch(accountType);
      debounceTimeoutRef.current = null;
    }, 50);
  }, [handleAccountSwitch]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Note: Wallet data is fetched by the binary store when symbol is set (see setSymbol in use-binary-store.ts)
  // No need to duplicate the fetch here - the store handles it centrally

  // Use the handleMarketSelect prop if provided, otherwise fall back to onSelectSymbol
  const effectiveHandleMarketSelect = handleMarketSelect || ((marketSymbol: string) => {
    if (marketSymbol !== currentSymbol) {
      onSelectSymbol(marketSymbol as Symbol);
    }
  });

  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    const handleOpenBrowser = () => setPanelOpen(true);
    window.addEventListener("open-market-browser", handleOpenBrowser);
    return () => {
      window.removeEventListener("open-market-browser", handleOpenBrowser);
    };
  }, []);

  const [accountLevelsOpen, setAccountLevelsOpen] = useState(false);

  /* Latches for the three lazily-loaded modals at the bottom of this render.

     Each stays true once its modal has been opened, so closing and reopening
     reuses the same instance and keeps whatever the trader had filled in —
     which is what mounting them unconditionally used to give us. The only
     behaviour that changes is that a session which never opens them never
     pays for them. */
  const depositEverOpened = useLatch(depositModalOpen);
  const withdrawEverOpened = useLatch(withdrawModalOpen);
  const accountLevelsEverOpened = useLatch(accountLevelsOpen);

  // Dynamic status/progress calculations
  const preferredCurrencyRate = EXCHANGE_RATES[preferredCurrency] || 1.0;
  const preferredCurrencySymbol = CURRENCY_SYMBOLS[preferredCurrency] || "$";

  // Convert balances
  const convertedCurrentBalance = currentBalance * preferredCurrencyRate;
  const convertedRealBalance = (realBalance ?? 0) * preferredCurrencyRate;
  const convertedDemoBalance = (demoBalance ?? 10000) * preferredCurrencyRate;

  // Level thresholds live on the shared tier table in USD and are converted here,
  // so "$5,000 or the equivalent" holds in every display currency. INR used to be
  // special-cased to ₹475,000 / ₹950,000, which was neither the old USD threshold
  // nor a conversion of it; that carve-out is gone.
  const proThreshold = TIERS.advanced.minBalanceUsd * preferredCurrencyRate;
  const vipThreshold = TIERS.elite.minBalanceUsd * preferredCurrencyRate;
  
  const activeRealBalance = convertedRealBalance;
  
  // Tier presentation comes from the shared table — this block used to hardcode its
  // own icons and colours and had drifted from the balance card above it (Elite was
  // purple here, amber there).
  const statusTierKey = resolveTier(activeRealBalance, proThreshold, vipThreshold);
  const statusTier = TIERS[statusTierKey];

  const statusIcon = (
    <TierBars level={statusTier.level} size={12} filledClass={statusTier.accent.fill} />
  );
  const iconBg = statusTier.accent.iconTile;
  const payoutColor = statusTier.accent.text;

  /* Sentence case. This sits directly under the all-caps status badge, and a
     second line of capitals beside it turned a quiet progress caption into a
     third thing shouting for attention. All three states change together —
     they are one label in different tiers, and case that switches with the tier
     would read as a mistake. */
  /* "Next: Advanced", not "Advanced status requirement".
     The old phrasing was 27 characters that named a rule rather than a goal, and
     at 12px it filled most of a 320px panel on its own. "Next:" says the same
     thing in five. */
  const isTopTier = statusTierKey === "elite";

  /* The next tier by name and by requirement, so the card can state the term of
     the account rather than only the distance from it. */
  const nextTierKey = TIER_ORDER[TIER_ORDER.indexOf(statusTierKey) + 1];
  const nextTierName = nextTierKey ? TIERS[nextTierKey].name : "";
  const nextTierThreshold = statusTierKey === "basic" ? proThreshold : vipThreshold;
  const tierMoney = (v: number) =>
    `${preferredCurrencySymbol}${Math.round(v).toLocaleString("en-US")}`;
  const progressMax = statusTierKey === "basic" ? proThreshold : vipThreshold;

  /* Progress through the current tier, not from zero.

     It used to be balance/nextThreshold, so an Advanced trader who had just
     cleared the Advanced line — every bit of the way there already behind them —
     was shown a bar a fifth of the way along, because it was still measuring
     from nothing. The bar is meant to answer "how far through this level am I",
     and the level starts at the threshold that granted it. */
  const tierFloor = statusTierKey === "basic" ? 0 : proThreshold;
  const progressPercent = isTopTier
    ? 100
    : Math.min(
        100,
        Math.max(
          0,
          ((activeRealBalance - tierFloor) / Math.max(1, progressMax - tierFloor)) * 100
        )
      );

  /* What is left to do, rather than what has been done.

     The row showed "€318 / €4,600" — two figures a trader has to subtract in
     their head to learn the only thing they wanted from this panel: how much
     further. The remaining amount is that answer already worked out, and the
     pair it replaces is kept on the row's title attribute for anyone who wants
     the underlying numbers. */


  const handleSelectMarket = useCallback((sym: string) => {
    effectiveHandleMarketSelect(sym);
    setPanelOpen(false);
  }, [effectiveHandleMarketSelect]);

  // Toggle theme function with proper synchronization
  const toggleTheme = useCallback(() => {
    let newTheme = "dark";
    if (resolvedTheme === "dark") {
      newTheme = "navy";
    } else if (resolvedTheme === "navy") {
      newTheme = "light";
    } else {
      newTheme = "dark";
    }
    setTheme(newTheme);

    // Immediately apply the theme class to prevent delay
    if (typeof window !== 'undefined') {
      const htmlElement = document.documentElement;
      htmlElement.classList.remove('light', 'dark', 'navy');
      if (newTheme === 'dark') {
        htmlElement.classList.add('dark');
      } else if (newTheme === 'navy') {
        htmlElement.classList.add('navy');
      } else {
        htmlElement.classList.add('light');
      }
    }
  }, [resolvedTheme, setTheme]);

  // Fullscreen toggle function
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div className="flex flex-col w-full bg-transparent">
      {/* 1. Main Header Row */}
      {!hideMainHeader && (
        <div
          className="relative flex items-center justify-between h-[53px] min-h-[53px] bg-card border-b border-border px-3 transition-all duration-300"
          /* The transition is inline because the `transition-all duration-300`
             in the class list above does nothing: `styles/theme.css` sets
             `* { transition: background-color .3s, border-color .3s, color .2s }`
             unlayered, which outranks every Tailwind transition utility in the
             app. Without this the tabs snapped to their new position while the
             ranking column slid, which is exactly what "not shifting smoothly
             with the chart" looked like. Same curve and duration as
             DOCK_TRANSITION, and the colour transitions are repeated so the
             row still cross-fades on a theme change. */
          style={{
            paddingLeft: isMobile ? undefined : `${48 + leftInset}px`,
            transition:
              "padding-left 300ms cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease, border-color 0.3s ease, color 0.2s ease",
          }}
        >
        {isMobile && (
          <div className="flex-1 flex items-stretch h-full min-w-0 overflow-x-auto scrollbar-none relative">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center h-full px-3 gap-1.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors min-w-0">
                  <span className="font-semibold text-sm text-zinc-900 dark:text-white truncate">
                    {extractBaseCurrency(String(currentSymbol), binaryMarkets)}/{extractQuoteCurrency(String(currentSymbol), binaryMarkets)}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                    ${formatBinaryPrice(currentPrice, currentSymbol)}
                  </span>
                  <span
                    className={`text-[10px] font-medium ${
                      (activeMarkets.find((m) => m.symbol === currentSymbol)?.change ?? 0) >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }`}
                  >
                    {(activeMarkets.find((m) => m.symbol === currentSymbol)?.change ?? 0) >= 0 ? "+" : ""}
                    {(activeMarkets.find((m) => m.symbol === currentSymbol)?.change ?? 0).toFixed(2)}%
                  </span>
                  <ChevronDown size={12} className="text-zinc-400 ml-0.5 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 p-1 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                <div className="px-2 py-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-300 uppercase tracking-wide">
                    {tCommon("active_markets")}
                  </span>
                </div>
                {activeMarkets.map((market) => {
                  const base = extractBaseCurrency(String(market.symbol), binaryMarkets);
                  const quote = extractQuoteCurrency(String(market.symbol), binaryMarkets);
                  const isActive = market.symbol === currentSymbol;
                  return (
                    <DropdownMenuItem
                      key={market.symbol}
                      onClick={() => effectiveHandleMarketSelect(String(market.symbol))}
                      className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer ${
                        isActive
                          ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white"
                          : "text-zinc-650 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <span className="font-medium">{base}/{quote}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-zinc-500">${formatBinaryPrice(market.price, market.symbol)}</span>
                        <span className={`text-[10px] font-medium ${market.change >= 0 ? "text-green-500" : "text-red-500"}`}>
                          {market.change >= 0 ? "+" : ""}{market.change.toFixed(2)}%
                        </span>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {!isMobile && (
          <div className="flex-1 flex items-center h-full overflow-hidden relative ml-4 min-w-0">
            {/* Active Asset Tabs (Browser-style with smooth horizontal scroll) */}
            {/* cursor-grab advertises that the rail can be dragged; without it the
                drag handler is a feature nobody discovers. touch-pan-x keeps the
                browser's own horizontal panning on touch devices, where the
                pointer handlers would otherwise fight it. */}
            <div ref={containerRef} className="flex-1 flex items-center h-full overflow-x-auto scrollbar-none relative scroll-smooth flex-nowrap py-1 pr-2 cursor-grab active:cursor-grabbing touch-pan-x">
              {(() => {
                const GAP = 6;
                const tabMargin = GAP; // Fixed positive gap — tabs never shrink or overlap

                return (
                  <>
                    <AnimatePresence>
                      {activeMarkets.map(({ symbol, isPinned }, index) => {
                        const market = binaryMarkets.find(
                          (m) => isSameSymbol(m.symbol, symbol) || isSameSymbol(`${m.currency}${m.pair}`, symbol)
                        );
                        if (!market) return null;

                        const base = market.currency || "";
                        const quote = market.pair || "";
                        
                        let cleanBase = base;
                        let cleanQuote = quote;
                        if (base.includes("/")) {
                          const parts = base.split("/");
                          cleanBase = parts[0];
                          cleanQuote = parts[1];
                        }
                        if (quote === "OTC" && cleanQuote === "OTC") {
                          cleanQuote = "USD";
                        }

                        const isActive = currentSymbol === symbol;
                        const payout = getPayoutPercent(market);
                        const isOTC = String(symbol).toUpperCase().includes("OTC") || (market as any)?.isOTC || (market?.label && String(market.label).toUpperCase().includes("OTC"));
                        const isSingle = isOTC && !FIAT_CURRENCIES.has(cleanBase.toUpperCase());

                        // Calculate live trade return badge for this symbol
                        const symbolActiveOrders = orders.filter(
                          (o) => o.status === "PENDING" && isSameSymbol(o.symbol, symbol) && o.mode === tradingMode
                        );
                        const hasActiveTrades = symbolActiveOrders.length > 0;
                        
                        const storeSymbolPrice = useBinaryStore.getState().getSymbolPrice(String(symbol));
                        const symbolPrice = (storeSymbolPrice > 0 ? storeSymbolPrice : 0) || getLiveData(symbol).price || (isActive ? currentPrice : 0) || 0;
                        let isWinningTotal = false;

                        const liveReturnAmount = hasActiveTrades
                          ? Math.round(
                              symbolActiveOrders.reduce((sum, order) => {
                                const orderPayout = order.profitPercentage || payout;
                                const isOrderWinning = checkIsWinning(order, symbolPrice);
                                if (isOrderWinning) {
                                  isWinningTotal = true;
                                  return sum + order.amount * (1 + orderPayout / 100);
                                }
                                return sum;
                              }, 0) * preferredCurrencyRate
                            )
                          : 0;
                        const currencySymbol = preferredCurrencySymbol;

                        // Check if any active trade for this symbol has 10 seconds or less remaining
                        const criticalOrders = symbolActiveOrders.filter((order) => {
                          const now = Date.now();
                          const secondsLeft = (order.expiryTime - now) / 1000;
                          return secondsLeft > 0 && secondsLeft <= 10;
                        });
                        const hasCriticalTime = criticalOrders.length > 0;
                        const isCriticalWinning = hasCriticalTime
                          ? criticalOrders.some((order) => checkIsWinning(order, symbolPrice))
                          : false;

                        // Calculate minimum seconds remaining for the pulse logic
                        let minSecondsLeft = 10;
                        if (hasCriticalTime) {
                          const now = Date.now();
                          const secondsArr = criticalOrders.map((o) =>
                            Math.max(0, (o.expiryTime - now) / 1000)
                          );
                          minSecondsLeft = Math.min(...secondsArr);
                        }

                        // Dynamically accelerate pulse speed and intensify opacity as expiration approaches
                        const pulseDuration = 0.4 + (minSecondsLeft / 10) * 1.1; // 1.5s down to 0.4s
                        const minOpacity = Math.max(0.1, 0.25 - (minSecondsLeft / 10) * 0.15); // 0.1 up to 0.25
                        const maxOpacity = Math.max(0.3, 0.55 - (minSecondsLeft / 10) * 0.25); // 0.3 up to 0.55

                        return (
                          <motion.div
                            key={symbol}
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{
                              position: "relative",
                              marginLeft: index > 0 ? tabMargin : 0,
                              zIndex: isActive ? 200 : 10 + index
                            }}
                            className="h-full flex items-center shrink-0"
                          >
                            <div
                              onClick={() => {
                                if (isActive) {
                                  setPanelOpen(true);
                                } else {
                                  effectiveHandleMarketSelect(String(symbol));
                                }
                              }}
                              /* One width for every tab, active or not.

                                 It was 131px, or 144px while active, so the rail
                                 changed shape as you moved along it, and the
                                 narrow state left the name about 84px — enough
                                 to ellipsise a currency pair, which is the one
                                 kind of name that must never be cut: CAD/JPY and
                                 CAD/JPX are a single truncated character apart.
                                 134px is measured to hold the widest pair plus
                                 the OTC mark, and the active state no longer
                                 widens, so the boxes read as a row of equals. It
                                 was 152px, which cleared a pair by about 26px —
                                 room the tab did not need and spent as a gap
                                 after every name.

                                 Long single-ticker names (BANKBARODA, MCDOWELL-N)
                                 still ellipsise, which is the right trade the
                                 other way round: they have no fixed shape to
                                 preserve, and letting them size the tab is what
                                 made the rail uneven. */
                              /* The accent edge is set here, not in a class.

                                 border-l-emerald-500 is a single class, (0,1,0),
                                 while this project's dark variant expands to
                                 &:is(.dark *, .navy *) — so dark:border-zinc-700
                                 lands at (0,2,0) and repaints all four sides,
                                 the left one included. The green survived only
                                 on light, where no dark: rule exists to beat it,
                                 which is exactly the reported symptom. An inline
                                 style outranks every class, so the marker cannot
                                 be overruled by a border colour set for the other
                                 three sides. Rose when a critical position is
                                 losing, emerald otherwise. */
                              style={
                                isActive
                                  ? {
                                      /* An inset shadow, not a 3px left border.

                                         A thicker border on the selected tab
                                         takes 2px out of the content box, so a
                                         name that fitted while the tab was
                                         inactive gained an ellipsis the moment
                                         it was clicked — the instrument became
                                         harder to read by being chosen. An inset
                                         shadow paints in the same place and
                                         occupies no layout, so both states have
                                         exactly the same room. */
                                      boxShadow: `inset 3px 0 0 ${
                                        hasCriticalTime && !isCriticalWinning ? "#f43f5e" : "#10b981"
                                      }`,
                                    }
                                  : undefined
                              }
                              className={`h-[42px] flex items-center rounded-lg text-xs font-semibold cursor-pointer transition-all select-none relative group shrink w-[142px] flex-shrink-0 ${
                                hasCriticalTime
                                  ? isCriticalWinning
                                    ? isActive
                                      ? darkMode
                                        ? "bg-emerald-50 dark:bg-[#1c1f30] border-y border-r border-emerald-500/50 text-emerald-900 dark:text-white pl-1.5 pr-1"
                                        : "bg-white border-y border-r border-emerald-500 text-zinc-900 pl-1.5 pr-1 shadow-sm"
                                      : darkMode
                                        ? "bg-white dark:bg-[#13151f] border border-emerald-500/50 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-250 hover:bg-zinc-100 dark:hover:bg-[#1c1f30] pl-1.5 pr-1"
                                        : "bg-[#f4f4f5] border border-emerald-500/40 text-zinc-650 hover:text-zinc-805 hover:bg-white pl-1.5 pr-1"
                                    : isActive
                                      ? darkMode
                                        ? "bg-rose-50 dark:bg-[#1c1f30] border-y border-r border-rose-500/50 text-rose-900 dark:text-white pl-1.5 pr-1"
                                        : "bg-white border-y border-r border-rose-500 text-zinc-900 pl-1.5 pr-1 shadow-sm"
                                      : darkMode
                                        ? "bg-white dark:bg-[#13151f] border border-rose-500/50 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-250 hover:bg-zinc-100 dark:hover:bg-[#1c1f30] pl-1.5 pr-1"
                                        : "bg-[#f4f4f5] border border-rose-500/40 text-zinc-655 hover:text-zinc-855 hover:bg-white pl-1.5 pr-1"
                                  : isActive
                                    ? darkMode
                                      ? "bg-zinc-100 dark:bg-[#1c1f30] border-y border-r border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white pl-1.5 pr-1 shadow-lg shadow-black/10 dark:shadow-black/40"
                                      : "bg-white border-y border-r border-zinc-350 text-zinc-900 pl-1.5 pr-1 shadow-sm"
                                    : darkMode
                                      ? "bg-white dark:bg-[#13151f] border border-zinc-300 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-[#1c1f30] pl-1.5 pr-1"
                                      : "bg-[#f4f4f5] border border-zinc-300/80 text-zinc-500 hover:text-zinc-850 hover:bg-white pl-1.5 pr-1"
                              }`}
                            >
                            {/* Radial Glow Overlay with Dynamic Breathing Pulse */}
                            {hasCriticalTime && (
                              <motion.div
                                animate={{
                                  opacity: [minOpacity, maxOpacity, minOpacity],
                                  scale: [0.95, 1.03, 0.95],
                                }}
                                transition={{
                                  duration: pulseDuration,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                                className={`absolute inset-0 pointer-events-none rounded-lg z-0 ${
                                  isCriticalWinning
                                    ? "bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.35)_0%,_transparent_75%)]"
                                    : "bg-[radial-gradient(circle_at_center,_rgba(239,68,68,0.35)_0%,_transparent_75%)]"
                                }`}
                              />
                            )}

                            {/* Overlapping Flags/Icons (Enlarged) */}
                            <div className="relative z-10 w-[29px] h-[29px] mr-2 shrink-0 flex items-center justify-center">
                              {isSingle ? (
                                <div className={`w-7 h-7 rounded-full overflow-hidden border bg-zinc-900 shadow-sm ${darkMode ? "border-white/50" : "border-zinc-950/50"}`}>
                                  <img
                                    src={getCryptoImageUrl(cleanBase)}
                                    alt={cleanBase}
                                    className="object-cover w-full h-full"
                                    onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
                                    loading="lazy"
                                  />
                                </div>
                              ) : (
                                <>
                                  {/* Base Currency Icon (behind, top-left) */}
                                  <div className={`absolute left-0 top-0 w-[21px] h-[21px] rounded-full overflow-hidden border bg-zinc-900 z-0 shadow-sm ${darkMode ? "border-white/50" : "border-zinc-950/50"}`}>
                                    <img
                                      src={getCryptoImageUrl(cleanBase)}
                                      alt={cleanBase}
                                      className="object-cover w-full h-full"
                                      onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
                                      loading="lazy"
                                    />
                                  </div>
                                  {/* Quote Currency Icon (in front, bottom-right) */}
                                  <div className={`absolute right-0 bottom-0 w-[21px] h-[21px] rounded-full overflow-hidden border z-10 shadow-sm ${darkMode ? "border-white/50" : "border-zinc-950/50"}`}>
                                    <img
                                      src={getCryptoImageUrl(cleanQuote)}
                                      alt={cleanQuote}
                                      className="object-cover w-full h-full"
                                      onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
                                      loading="lazy"
                                    />
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Texts container */}
                             <div className="flex flex-col justify-center leading-tight relative z-10 min-w-0 flex-1 pr-2">
                               {/* Symbol name row. The colour lives here, not on
                                   the name, because the OTC mark inherits it —
                                   one decision for both, so the mark cannot end
                                   up brighter than the instrument it labels. */}
                               <div className={`flex items-start gap-0.5 min-w-0 w-full ${
                                 isActive
                                   ? darkMode ? "text-white" : "text-zinc-900"
                                   : darkMode ? "text-zinc-350" : "text-zinc-655"
                               }`}>
                                 {/* truncate is back, but the tab is now wide
                                     enough that no currency pair can reach it —
                                     it only catches the long single-ticker names,
                                     which is what it is for. */}
                                 <span className="text-[11px] font-bold truncate">
                                   {getFullTabDisplayName(market, cleanBase, quote)}
                                 </span>
                                 {isOTC && (
                                   <span className={OTC_BADGE_CLASS}>
                                     OTC
                                   </span>
                                 )}
                               </div>

                               {/* Payout percent row */}
                                <div className="flex items-center gap-1 mt-0.5 min-w-0 overflow-hidden">
                                  <span className="text-[11px] font-extrabold text-blue-500 shrink-0">
                                    {payout}%
                                  </span>
                                  {/* The tab does not resize for this.

                                      Letting it grow meant the rail changed shape
                                      as positions opened and closed — tabs
                                      shifting under the pointer while a trade is
                                      running is worse than a shortened figure.
                                      The width is fixed and the number gives way
                                      instead: five digits, then an ellipsis, cut
                                      in formatTabReturn so the pill never has to
                                      be clipped by its container. */}
                                  {hasActiveTrades && (
                                    <span /* justify-start, so what survives truncation is the front of the
                                         number. Centred text inside a clipped box loses
                                         characters from both ends, which turns +3,520 into
                                         a figure with no leading digit and no sign — the
                                         two parts that carry the meaning. The tail is the
                                         right thing to give up. */
                                    className={`text-[10px] font-extrabold text-white px-[4px] h-[14px] leading-none rounded-[3px] tracking-tight shrink-0 whitespace-nowrap shadow-sm inline-flex items-center justify-start select-none tabular-nums ${
                                      isWinningTotal
                                        ? "bg-emerald-500"
                                        : "bg-rose-500"
                                    }`}>
                                      {`${isWinningTotal ? "+" : "-"}${formatTabReturn(liveReturnAmount)} ${currencySymbol}`}
                                    </span>
                                  )}
                                </div>
                               </div>

                            {/* Close & Pin buttons (Floating Badge style) */}
                            {activeMarkets.length > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRemoveMarket(symbol);
                                }}
                                className={`absolute z-20 top-[-4px] right-[-4px] flex items-center justify-center w-3.5 h-3.5 rounded-full border shadow-md transition-all opacity-0 group-hover:opacity-100 ${
                                  darkMode
                                    ? "bg-black text-zinc-400 hover:text-white border-zinc-800"
                                    : "bg-white text-zinc-500 hover:text-zinc-800 border-zinc-200"
                                }`}
                                title="Close tab"
                              >
                                <X size={8} strokeWidth={2.5} />
                              </button>
                            )}


                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Asset Selector (+) Button placed directly adjacent to the last open tab */}
                  <button
                    onClick={() => setPanelOpen(true)}
                    className={`relative z-10 h-[42px] w-[42px] min-w-[42px] ml-1.5 flex items-center justify-center rounded-lg border transition-all cursor-pointer shadow-sm group shrink-0 ${
                      darkMode
                        ? "bg-white dark:bg-[#13151f] border-zinc-300 dark:border-zinc-800 text-blue-600 dark:text-blue-400 hover:bg-zinc-100 dark:hover:bg-[#1c1f30] hover:border-blue-500/60 hover:text-blue-700 dark:hover:text-blue-300"
                        : "bg-[#f4f4f5] border-zinc-300/80 text-blue-500 hover:bg-white hover:border-blue-500/50 hover:text-blue-600"
                    }`}
                    title="Add Asset / Open Market Browser"
                  >
                    <Plus size={18} strokeWidth={2.5} className="transition-transform group-hover:scale-110" />
                  </button>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Right section - Actions (desktop: no padding/gap so it never reserves
            an empty black strip at the top-right; the wallet below is absolute) */}
        <div className={`flex items-center ml-auto ${isMobile ? "gap-2 px-3" : ""}`}>
          {/* Mobile: More dropdown containing all actions */}
          {isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-12 w-12 flex items-center justify-center border-r border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                  <MoreHorizontal size={18} className="text-zinc-600 dark:text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                {/* Education section */}
                {onLeaderboardClick && (
                  <>
                    <div className="px-2 py-1.5 mb-1">
                      <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-300 uppercase tracking-wide">
                        {t("learn_compete")}
                      </span>
                    </div>
                    {/* A plain link, and it never needed a callback to guard
                        it. It was rendered only when `onTutorialClick` was
                        passed, which is why it read as the tutorial entry —
                        the tutorial itself never had one. */}
                    <DropdownMenuItem asChild>
                      <Link
                        href="/support"
                        target="_blank"
                        className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer w-full"
                      >
                        <MessageCircle size={14} className="text-blue-500" />
                        <span>Help & Support</span>
                      </Link>
                    </DropdownMenuItem>

                    {onLeaderboardClick && (
                      <DropdownMenuItem onClick={onLeaderboardClick} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${isLeaderboardOpen ? "text-amber-500 bg-amber-500/10" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                        <Trophy size={14} className="text-amber-500" />
                        <span>Leaderboard</span>
                      </DropdownMenuItem>
                    )}
                    <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                  </>
                )}

                {/* Tools section */}
                <div className="px-2 py-1.5 mb-1">
                  <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-300 uppercase tracking-wide">
                    Tools
                  </span>
                </div>
                {isAuthenticated && onAnalyticsClick && (
                  <DropdownMenuItem onClick={onAnalyticsClick} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${isAnalyticsOpen ? "text-blue-500 bg-blue-500/10" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                    <BarChart2 size={14} className="text-blue-500" />
                    <span>Analytics</span>
                    {completedTradesCount > 0 && (
                      <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 bg-blue-500 text-white rounded-full">
                        {completedTradesCount > 99 ? "99+" : completedTradesCount}
                      </span>
                    )}
                  </DropdownMenuItem>
                )}
                {onSettingsClick && (
                  <DropdownMenuItem onClick={onSettingsClick} className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${isSettingsOpen ? "text-purple-500 bg-purple-500/10" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}>
                    <Settings size={14} className="text-purple-500" />
                    <span>Settings</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={toggleTheme} className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  {(!mounted || resolvedTheme === "dark") ? (
                    <Sparkles size={14} className="text-blue-400" />
                  ) : resolvedTheme === "navy" ? (
                    <Sun size={14} className="text-amber-500" />
                  ) : (
                    <Moon size={14} className="text-blue-500" />
                  )}
                  <span>
                    {(!mounted || resolvedTheme === "dark")
                      ? "Navy Mode"
                      : resolvedTheme === "navy"
                        ? "Light Mode"
                        : "Dark Mode"}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleFullscreen} className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer">
                  {isFullscreen ? <Minimize size={14} className="text-zinc-500" /> : <Maximize size={14} className="text-zinc-500" />}
                  <span>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Wallet — Floating overlay on top right of chart canvas */}
          {isAuthenticated && (
            <div className="absolute top-[61px] right-2 md:right-[245px] z-40 pointer-events-auto">
              <DropdownMenu
                open={showBalanceMenu}
                onOpenChange={setShowBalanceMenu}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    data-tutorial="demo-toggle"
                    className="flex items-center gap-2.5 px-3 py-1 h-[42px] rounded-md cursor-pointer transition-all bg-white hover:bg-zinc-100 text-zinc-900 border border-zinc-300 dark:bg-[#1e2230] dark:hover:bg-[#262b3d] dark:text-white dark:border-zinc-700/60 shadow-lg active:scale-[0.98] group sf-pro-selectors"
                  >
                    {/* Tier icon, resolved from the shared tier table so this always
                        matches the Account Levels modal and the status block below. */}
                    {activeWallet === "real" ? (
                      (() => {
                        const tier = TIERS[resolveTier(activeRealBalance, proThreshold, vipThreshold)];
                        return (
                          <TierBars
                            level={tier.level}
                            size={18}
                            filledClass={tier.accent.fill}
                            className="shrink-0"
                          />
                        );
                      })()
                    ) : (
                      <FlaskConical size={19} className="text-orange-600 dark:text-[#f97316] shrink-0" />
                    )}

                    {/* Text Stack matching reference */}
                    <div className="flex flex-col items-start leading-none">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wide ${
                            activeWallet === "real"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-orange-700 dark:text-[#f97316]"
                          }`}
                        >
                          {activeWallet === "real" ? "Real Account" : "Demo Account"}
                        </span>
                        <ChevronDown
                          size={12}
                          className={`text-zinc-500 group-hover:text-zinc-900 dark:text-zinc-300 dark:group-hover:text-white transition-transform shrink-0 ${
                            showBalanceMenu ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                      {/* Semibold, not extrabold.

                          Weight was doing the work of size here, and at 15px the
                          heaviest cuts of Onest thicken the stems until the
                          counters — the enclosed gaps in 9, 8, 0 — start filling
                          in. On a dark ground the strokes bloom further and the
                          figure reads as a solid mass rather than digits. The
                          size increase already established the hierarchy against
                          the label, so the weight can come back down and let the
                          numbers be legible. */}
                      <span className="text-[15px] font-semibold tabular-nums text-zinc-900 dark:text-white leading-none mt-1">
                        {/* Only the real wallet can fail to load; the demo
                            balance is local and always known. */}
                        {activeWallet === "real" ? (
                          <LiveBalance
                            amount={convertedCurrentBalance}
                            symbol={preferredCurrencySymbol}
                          />
                        ) : (
                          `${preferredCurrencySymbol}${convertedCurrentBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        )}
                      </span>
                    </div>
                  </button>
                </DropdownMenuTrigger>
                {/* Opaque, not /95. This panel is portalled and positioned, so the
                    compositor gives it its own layer — and Chromium will not use LCD
                    subpixel antialiasing (ClearType) on text in a layer whose backdrop
                    it cannot resolve. At 95% over a near-black page the translucency was
                    invisible, but it cost every label in here its sharpness, which is why
                    this card read soft while the opaque order panel beside it did not.
                    Solid also fixes the tints nested below: they now paint into a layer
                    that is known opaque, so they keep ClearType too. */}
                <DropdownMenuContent
                  /* 320px, not 304. The type below moves up a step and the panel
                     has to grant it the room, or the extra size is spent on
                     truncation instead of legibility. */
                  className="w-[320px] p-0 flex overflow-hidden bg-white dark:bg-[#181a26] border-zinc-200/80 dark:border-[#2b3045]/70 border rounded-xl shadow-xl z-[999] sf-pro-selectors"
                  align="end"
                >
                  {/* Account tier, identity, currency and the two balances.
                      Extracted to ./account-panel so the mobile terminal shows
                      this panel rather than a thinner copy of it. */}
                  <AccountPanel
                    onClose={() => setShowBalanceMenu(false)}
                    onOpenAccountLevels={() => setAccountLevelsOpen(true)}
                    onDeposit={() => setDepositModalOpen(true)}
                    onWithdraw={() => setWithdrawModalOpen(true)}
                    onSwitchAccount={debouncedAccountSwitch}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {!isAuthenticated && (
            /* Auth controls for unauthenticated users */
            <AuthHeaderControls isMobile={isMobile} variant="binary" />
          )}
        </div>
        

      </div>
    )}

      {/* Market Browser Panel */}
      <MarketBrowserPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        handleMarketSelect={handleSelectMarket}
      />

      {/* Deposit Modal — mounted on first open; see the imports at the top.
          The guard is what defers the download: a dynamic component still
          fetches its chunk as soon as it is rendered, even rendered closed. */}
      {depositEverOpened && (
        <DepositModal
          isOpen={depositModalOpen}
          onClose={() => setDepositModalOpen(false)}
        />
      )}

      {/* Withdraw Modal */}
      {withdrawEverOpened && (
        <WithdrawModal
          isOpen={withdrawModalOpen}
          onClose={() => setWithdrawModalOpen(false)}
        />
      )}

      {/* Account Levels Modal */}
      {accountLevelsEverOpened && (
        <AccountLevelsModal
          isOpen={accountLevelsOpen}
          onClose={() => setAccountLevelsOpen(false)}
          realBalance={realBalance ?? 0}
          currency={preferredCurrency}
          theme={resolvedTheme === "navy" ? "navy" : resolvedTheme === "light" ? "light" : "dark"}
        />
      )}
    </div>
  );
}

/** False until `open` is first true, and true from then on. */
function useLatch(open: boolean): boolean {
  const [latched, setLatched] = useState(open);
  useEffect(() => {
    if (open) setLatched(true);
  }, [open]);
  return latched;
}

function getCurrencySymbol(quote: string): string {
  switch (quote.toUpperCase()) {
    case "USD": return "$";
    case "USDT": return "₮";
    case "EUR": return "€";
    case "GBP": return "£";
    case "JPY": return "¥";
    case "INR": return "₹";
    case "TRY": return "₺";
    case "RUB": return "₽";
    default: return quote;
  }
}

function isBullishSide(side: string): boolean {
  return side === "RISE" || side === "HIGHER" || side === "TOUCH" || side === "CALL" || side === "UP";
}

function checkIsWinning(order: any, livePrice: number): boolean {
  if (livePrice <= 0) return false; // No valid price = unknown state, don't assume winning

  const side = order.side;
  const entryPrice = order.entryPrice;

  switch (order.type) {
    case "HIGHER_LOWER":
      if (order.barrier) {
        return side === "HIGHER" ? livePrice > order.barrier : livePrice < order.barrier;
      }
      return isBullishSide(side) ? livePrice > entryPrice : livePrice < entryPrice;
    case "TOUCH_NO_TOUCH":
      if (order.barrier) {
        const distance = Math.abs(livePrice - order.barrier);
        const distancePercent = (distance / order.barrier) * 100;
        const isTouching = distancePercent < 0.1;
        return side === "TOUCH" ? isTouching : !isTouching;
      }
      return false;
    case "CALL_PUT":
      if (order.strikePrice) {
        return side === "CALL" ? livePrice > order.strikePrice : livePrice < order.strikePrice;
      }
      return isBullishSide(side) ? livePrice > entryPrice : livePrice < entryPrice;
    case "TURBO":
      if (order.barrier) {
        return side === "UP" ? livePrice > order.barrier : livePrice < order.barrier;
      }
      return isBullishSide(side) ? livePrice > entryPrice : livePrice < entryPrice;
    default:
      // RISE_FALL
      return isBullishSide(side) ? livePrice > entryPrice : livePrice < entryPrice;
  }
}

function FlagIcon({ code, size = 16 }: { code: string; size?: number }) {
  switch (code) {
    case "GLO":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 dark:text-zinc-500 shrink-0">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "US":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="20" height="20" fill="#B22234" />
          <rect y="1.54" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="3.08" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="4.62" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="6.16" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="7.7" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="9.24" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="10.78" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="12.32" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="13.86" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="15.4" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="16.94" width="20" height="1.54" fill="#FFFFFF" />
          <rect y="18.48" width="20" height="1.54" fill="#FFFFFF" />
          <rect width="9" height="10.8" fill="#3C3B6E" />
          <circle cx="2.2" cy="2.2" r="0.5" fill="#FFFFFF" />
          <circle cx="4.5" cy="2.2" r="0.5" fill="#FFFFFF" />
          <circle cx="6.8" cy="2.2" r="0.5" fill="#FFFFFF" />
          <circle cx="3.3" cy="4.4" r="0.5" fill="#FFFFFF" />
          <circle cx="5.6" cy="4.4" r="0.5" fill="#FFFFFF" />
          <circle cx="2.2" cy="6.6" r="0.5" fill="#FFFFFF" />
          <circle cx="4.5" cy="6.6" r="0.5" fill="#FFFFFF" />
          <circle cx="6.8" cy="6.6" r="0.5" fill="#FFFFFF" />
          <circle cx="3.3" cy="8.8" r="0.5" fill="#FFFFFF" />
          <circle cx="5.6" cy="8.8" r="0.5" fill="#FFFFFF" />
        </svg>
      );
    case "GB":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="20" height="20" fill="#00247D" />
          <line x1="0" y1="0" x2="20" y2="20" stroke="#FFFFFF" strokeWidth="2.5" />
          <line x1="20" y1="0" x2="0" y2="20" stroke="#FFFFFF" strokeWidth="2.5" />
          <line x1="0" y1="0" x2="20" y2="20" stroke="#CF142B" strokeWidth="1" />
          <line x1="20" y1="0" x2="0" y2="20" stroke="#CF142B" strokeWidth="1" />
          <rect x="7.5" width="5" height="20" fill="#FFFFFF" />
          <rect y="7.5" width="20" height="5" fill="#FFFFFF" />
          <rect x="8.5" width="3" height="20" fill="#CF142B" />
          <rect y="8.5" width="20" height="3" fill="#CF142B" />
        </svg>
      );
    case "DE":
      return (
        <svg width={size} height={size} viewBox="0 0 3 2" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="3" height="0.67" y="0" fill="#000000" />
          <rect width="3" height="0.67" y="0.67" fill="#FF0000" />
          <rect width="3" height="0.67" y="1.33" fill="#FFCC00" />
        </svg>
      );
    case "FR":
      return (
        <svg width={size} height={size} viewBox="0 0 3 2" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="1" height="2" x="0" fill="#002395" />
          <rect width="1" height="2" x="1" fill="#FFFFFF" />
          <rect width="1" height="2" x="2" fill="#ED2939" />
        </svg>
      );
    case "JP":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="20" height="20" fill="#FFFFFF" />
          <circle cx="10" cy="10" r="4.5" fill="#BC002D" />
        </svg>
      );
    case "SG":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="20" height="10" y="0" fill="#DF151A" />
          <rect width="20" height="10" y="10" fill="#FFFFFF" />
          <circle cx="4.5" cy="4.5" r="2.2" fill="#FFFFFF" />
          <circle cx="5.3" cy="4.5" r="2.2" fill="#DF151A" />
          <circle cx="4.5" cy="3.2" r="0.4" fill="#FFFFFF" />
          <circle cx="3.8" cy="4.2" r="0.4" fill="#FFFFFF" />
          <circle cx="5.2" cy="4.2" r="0.4" fill="#FFFFFF" />
          <circle cx="4.1" cy="5.2" r="0.4" fill="#FFFFFF" />
          <circle cx="4.9" cy="5.2" r="0.4" fill="#FFFFFF" />
        </svg>
      );
    case "IN":
      return (
        <svg width={size} height={size} viewBox="0 0 30 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="30" height="6.67" y="0" fill="#FF9933" />
          <rect width="30" height="6.67" y="6.67" fill="#FFFFFF" />
          <rect width="30" height="6.67" y="13.33" fill="#128807" />
          <circle cx="15" cy="10" r="2.2" stroke="#000080" strokeWidth="0.5" fill="none" />
          <line x1="15" y1="7.8" x2="15" y2="12.2" stroke="#000080" strokeWidth="0.3" />
          <line x1="12.8" y1="10" x2="17.2" y2="10" stroke="#000080" strokeWidth="0.3" />
        </svg>
      );
    case "AU":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="20" height="20" fill="#00008B" />
          <rect width="10" height="10" fill="#00247D" />
          <line x1="0" y1="0" x2="10" y2="10" stroke="#FFFFFF" strokeWidth="1.2" />
          <line x1="10" y1="0" x2="0" y2="20" stroke="#FFFFFF" strokeWidth="1.2" />
          <line x1="0" y1="0" x2="10" y2="10" stroke="#CF142B" strokeWidth="0.5" />
          <line x1="10" y1="0" x2="0" y2="10" stroke="#CF142B" strokeWidth="0.5" />
          <rect x="3.8" width="2.4" height="10" fill="#FFFFFF" />
          <rect y="3.8" width="10" height="2.4" fill="#FFFFFF" />
          <rect x="4.4" width="1.2" height="10" fill="#CF142B" />
          <rect y="4.4" width="10" height="1.2" fill="#CF142B" />
          <polygon points="15,4.5 15.3,5.4 16.2,5.4 15.5,6 15.7,6.9 15,6.3 14.3,6.9 14.5,6 13.8,5.4 14.7,5.4" fill="#FFFFFF" />
          <polygon points="12.5,13.5 12.8,14.4 13.7,14.4 13,15 13.2,15.9 12.5,15.3 11.8,15.9 12,15 11.3,14.4 12.2,14.4" fill="#FFFFFF" />
          <polygon points="17.5,13.5 17.8,14.4 18.7,14.4 18,15 18.2,15.9 17.5,15.3 16.8,15.9 17,15 16.3,14.4 17.2,14.4" fill="#FFFFFF" />
          <polygon points="15,11.5 15.3,12.4 16.2,12.4 15.5,13 15.7,13.9 15,13.3 14.3,13.9 14.5,13 13.8,12.4 14.7,12.4" fill="#FFFFFF" />
          <polygon points="15,16.5 15.3,17.4 16.2,17.4 15.5,18 15.7,18.9 15,18.3 14.3,18.9 14.5,18 13.8,17.4 14.7,17.4" fill="#FFFFFF" />
        </svg>
      );
    case "RU":
      return (
        <svg width={size} height={size} viewBox="0 0 3 2" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="3" height="0.67" y="0" fill="#FFFFFF" />
          <rect width="3" height="0.67" y="0.67" fill="#0039A6" />
          <rect width="3" height="0.67" y="1.33" fill="#D52B1E" />
        </svg>
      );
    case "AE":
      return (
        <svg width={size} height={size} viewBox="0 0 30 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="30" height="6.67" y="0" fill="#00732F" />
          <rect width="30" height="6.67" y="6.67" fill="#FFFFFF" />
          <rect width="30" height="6.67" y="13.33" fill="#000000" />
          <rect width="7.5" height="20" fill="#FF0000" />
        </svg>
      );
    case "HK":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="20" height="20" fill="#DE2910" />
          <circle cx="10" cy="10" r="3" fill="#FFFFFF" />
          <circle cx="10" cy="10" r="1.5" fill="#DE2910" />
        </svg>
      );
    case "BR":
      return (
        <svg width={size} height={size} viewBox="0 0 20 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="20" height="20" fill="#009739" />
          <polygon points="10,2 18,10 10,18 2,10" fill="#FEDF00" />
          <circle cx="10" cy="10" r="4" fill="#002776" />
          <path d="M6.5,10.5 Q10,8 13.5,10.5" stroke="#FFFFFF" strokeWidth="0.8" fill="none" />
        </svg>
      );
    case "ZA":
      return (
        <svg width={size} height={size} viewBox="0 0 30 20" className="rounded-full overflow-hidden border border-zinc-200 dark:border-zinc-800 shrink-0">
          <rect width="30" height="10" y="0" fill="#E21C21" />
          <rect width="30" height="10" y="10" fill="#002387" />
          <path d="M 0,0 L 12,8 L 30,8 L 30,12 L 12,12 L 0,20 Z" fill="#007C3C" />
          <path d="M 0,0 L 12,8 L 30,8 L 30,12 L 12,12 L 0,20 Z" stroke="#FFFFFF" strokeWidth="1" fill="none" />
          <path d="M 0,2 L 9,10 L 0,18 Z" fill="#000000" />
          <path d="M 0,2 L 9,10 L 0,18 Z" stroke="#FCB514" strokeWidth="0.8" fill="none" />
        </svg>
      );
    default:
      return null;
  }
}
