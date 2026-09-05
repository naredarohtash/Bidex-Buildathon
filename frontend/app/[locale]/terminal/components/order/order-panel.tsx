"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import type { Symbol, OrderSide } from "@/store/trade/use-binary-store";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import type { BinaryOrderType } from "@/types/binary-trading";
import { ORDER_TYPE_CONFIGS, getProfitPercentageForType } from "@/types/binary-trading";
import { getAssetCategoryLabel } from "../../lib/asset-name";
import AmountSelector from "./amount-selector";
import { EXCHANGE_RATES, CURRENCY_SYMBOLS } from "../header/header";
import { TIERS, TIER_LIST, resolveTierByUsdBalance } from "../../lib/account-tiers";
import ExpirySelector, { buildClockOptions } from "./expiry-selector";
import ProfitDisplay from "./profit-display";
import TradingButtons from "./trading-buttons";
import DynamicTradingButtons from "./dynamic-trading-buttons";
import BinaryTypeSelector from "./binary-type-selector";
import OrderTypeModal from "./order-type-modal";
import BarrierInput from "./barrier-input";
import StrikePriceInput from "./strike-price-input";
import PayoutPerPointInput from "./payout-per-point-input";
import InlineTradeConfirm from "./inline-trade-confirm";
import ActivePositions from "../positions/active-positions";
import Image from "next/image";
import { getCryptoImageUrl, handleImageError, getAssetDisplayName } from "@/utils/image-fallback";

import { OrderTypeIcon, ORDER_TYPE_COLORS } from "./order-type-icons";
import {
  getChartSynchronizedTime,
  formatChartTime,
  calculateNextExpiryTime,
  useSystemTimezone,
  nextClockOccurrence,
} from "@/utils/time-sync";
import { useTranslations } from "next-intl";

// CandleData interface for chart data
interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}
import { Sparkles, Zap, Minus, Plus, Info } from "lucide-react";
import { useOneClickTrading } from "../settings/one-click-toggle";
import { useRiskManagement } from "../risk-management/use-risk-management";
import { toast } from "sonner";
import { useTradingSettingsStore } from "@/store/trade/use-trading-settings-store";
import { AudioFeedback } from "@/components/binary/audio-feedback";

// Define the binary duration interface
interface BinaryDurationAttributes {
  id: string;
  duration: number;

  // Type-specific profit percentages
  profitPercentageRiseFall: number;
  profitPercentageHigherLower: number;
  profitPercentageTouchNoTouch: number;
  profitPercentageCallPut: number;
  profitPercentageTurbo: number;

  // Deprecated - kept for backward compatibility
  profitPercentage?: number;

  status: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

// Add the darkMode prop to the OrderPanelProps interface
interface OrderPanelProps {
  currentPrice?: number;
  symbol: Symbol;
  onPlaceOrder: (
    side: OrderSide,
    amount: number,
    expiryMinutes: number
  ) => Promise<boolean>;
  onExpiryChange?: (minutes: number) => void;
  balance?: number;
  candleData: CandleData[];
  priceMovement?: {
    direction: "up" | "down" | "neutral";
    percent: number;
    strength: "strong" | "medium" | "weak";
  };
  isInSafeZone?: boolean;
  tradingMode?: "demo" | "real";
  isMobile?: boolean;
  darkMode?: boolean;
}

const getCoinColors = (coin: string) => {
  const c = coin.toUpperCase();
  if (c === "BTC") return { bg: "bg-gradient-to-br from-amber-400 to-amber-500", text: "text-white", symbol: "₿" };
  if (c === "ETH") return { bg: "bg-gradient-to-br from-indigo-400 to-indigo-500", text: "text-white", symbol: "Ξ" };
  if (c === "USDT") return { bg: "bg-gradient-to-br from-emerald-400 to-emerald-500", text: "text-white", symbol: "₮" };
  if (c === "SOL") return { bg: "bg-gradient-to-br from-purple-500 to-indigo-500", text: "text-white", symbol: "S" };
  if (c === "ADA") return { bg: "bg-gradient-to-br from-blue-500 to-blue-600", text: "text-white", symbol: "A" };
  if (c === "XRP") return { bg: "bg-gradient-to-br from-sky-400 to-sky-500", text: "text-white", symbol: "X" };
  return { bg: "bg-gradient-to-br from-zinc-600 to-zinc-800", text: "text-zinc-300", symbol: coin[0] || "?" };
};

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL", "PKR", "BDT", "CNY", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP"
]);

const renderCoinIcons = (symbol: string, darkMode: boolean) => {
  const parts = symbol.split("/");
  const base = parts[0] || "BTC";
  let quote = parts[1] || "USDT";

  const isOTC = symbol.toUpperCase().includes("OTC");

  let cleanQuote = quote;
  if (isOTC && quote === "OTC") {
    cleanQuote = "USD";
  }

  const isSingle = isOTC && !FIAT_CURRENCIES.has(base.toUpperCase());

  const bgClass = (darkMode || isSingle) ? "bg-zinc-900" : "bg-white";

  const borderClass = darkMode ? "border-white/30" : "border-zinc-950/20";
  const borderFrontClass = darkMode ? "border-white/50" : "border-zinc-950/30";

  if (isSingle) {
    return (
      <div className="relative flex items-center w-10 h-10 mr-3 shrink-0 select-none justify-center">
        <div className={`w-[29px] h-[29px] rounded-full overflow-hidden border bg-zinc-900 shadow-md z-10 ${borderFrontClass} ${bgClass}`}>
          <img
            src={getCryptoImageUrl(base)}
            alt={base}
            className="object-cover w-full h-full"
            onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex items-center w-10 h-10 mr-3 shrink-0 select-none">
      {/* Base Currency Icon (behind, top-left) */}
      <div className={`absolute left-0 top-0 w-[25px] h-[25px] rounded-full overflow-hidden border z-0 shadow-sm ${borderClass} ${bgClass}`}>
        <img
          src={getCryptoImageUrl(base)}
          alt={base}
          className="object-cover w-full h-full"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
      {/* Quote Currency Icon (in front, bottom-right) */}
      <div className={`absolute right-0 bottom-0 w-[25px] h-[25px] rounded-full overflow-hidden border z-10 shadow-md ${borderFrontClass} ${bgClass}`}>
        <img
          src={getCryptoImageUrl(cleanQuote)}
          alt={cleanQuote}
          className="object-cover w-full h-full"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
    </div>
  );
};

/**
 * Money for the Invest/Payout strip: decimals only when they say something.
 *
 * Both figures were formatted to a fixed two places, so a ₹250,000 stake read
 * "250,000.00 ₹" and its payout "440,000.00 ₹". Those four characters of zero
 * are what pushed the row past its border — the payout ran under the panel edge
 * and the separator was clipped out entirely, leaving "250,000.00 ₹Payout:"
 * jammed together.
 *
 * The room is taken from the padding rather than the type, because the type is
 * the point: these are the two numbers a trader checks before committing a
 * stake, and shrinking them to fit is fixing the wrong thing. A whole amount
 * loses its ".00", which costs no information at all; a fractional one keeps
 * both places, so 1.50 is still 1.50 and never 1.5.
 */
function formatStripAmount(value: number): string {
  /* Rounded to the nearest paisa before asking whether it is whole, not
     Number.isInteger.

     Every figure here is a sum multiplied by a currency rate, so five ₹200,200
     positions total 1000999.9999999999 or 1001000.0000000002 depending on the
     order they were added in. Number.isInteger says false to both, and the row
     went back to printing "₹1,001,000.00" — the exact string this function
     exists to avoid — for the only amounts big enough to overflow it. A figure
     is whole when it is whole to the precision being displayed. */
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.abs(rounded - Math.round(rounded)) < 0.005;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}


export function OrderPanel({
  currentPrice: propCurrentPrice,
  symbol,
  onPlaceOrder,
  onExpiryChange,
  balance = 10000,
  candleData,
  priceMovement: propPriceMovement,
  isInSafeZone = false,
  tradingMode = "demo",
  isMobile = false,
  darkMode = true,
}: OrderPanelProps) {
  const storeCurrentPrice = useBinaryStore((state) => state.currentPrice);
  const { resolvedTheme } = useTheme();
  const [mountedFlag, setMountedFlag] = useState(false);
  useEffect(() => {
    setMountedFlag(true);
  }, []);
  const currentTheme = mountedFlag ? resolvedTheme || (darkMode ? "dark" : "light") : (darkMode ? "dark" : "light");
  const isNavy = currentTheme === "navy";
  const isDarkTheme = currentTheme === "dark" || currentTheme === "navy" || currentTheme === "system" || darkMode;

  const storePriceMovements = useBinaryStore((state) => state.priceMovements);
  const currentPrice = propCurrentPrice ?? storeCurrentPrice;
  const priceMovement = propPriceMovement ?? (storePriceMovements && symbol in storePriceMovements ? storePriceMovements[symbol] : { direction: "neutral" as const, percent: 0, strength: "weak" as const });
  const timezone = useSystemTimezone();
  // The per-second interval below is created once and not re-created when the
  // zone changes, so it reads through a ref rather than closing over a value
  // that would stay pinned at whatever was selected on mount.
  const timezoneRef = useRef(timezone);
  useEffect(() => {
    timezoneRef.current = timezone;
  }, [timezone]);

  const t = useTranslations("binary_components");
  const tCommon = useTranslations("common");
  // Core state - Get selectedExpiryMinutes and selectedAmount from store
  const storeSelectedExpiryMinutes = useBinaryStore((state) => state.selectedExpiryMinutes);
  /* Subscribed, not read through getState(). The confirmation shows the expiry
     it is about to commit to, so it has to re-render when the trader changes it. */
  const durationMode = useBinaryStore((state) => state.durationMode);
  const customDurationSeconds = useBinaryStore((state) => state.customDurationSeconds);

  const storeSelectedAmount = useBinaryStore((state) => state.selectedAmount);

  // Order type state from store
  const selectedOrderType = useBinaryStore((state) => state.selectedOrderType);
  const storeBarrier = useBinaryStore((state) => state.barrier);
  const storeStrikePrice = useBinaryStore((state) => state.strikePrice);
  const storePayoutPerPoint = useBinaryStore((state) => state.payoutPerPoint);
  const setOrderTypeInStore = useBinaryStore((state) => state.setOrderType);
  const setBarrierInStore = useBinaryStore((state) => state.setBarrier);
  const setStrikePriceInStore = useBinaryStore((state) => state.setStrikePrice);
  const setPayoutPerPointInStore = useBinaryStore((state) => state.setPayoutPerPoint);
  const setStoreSelectedAmount = useBinaryStore((state) => state.setSelectedAmount);
  const setStoreSelectedExpiryMinutes = useBinaryStore((state) => state.setSelectedExpiryMinutes);
  const completedOrders = useBinaryStore((state) => state.completedOrders);
  const tradingModeFromStore = useBinaryStore((state) => state.tradingMode);

  // Filter completed orders by current trading mode
  const filteredCompletedOrders = useMemo(() => {
    return completedOrders.filter(order => order.isDemo === (tradingModeFromStore === "demo"));
  }, [completedOrders, tradingModeFromStore]);

  // Orders for active positions panel — same filter as desktop-layout sidebar
  const activeOrders = useBinaryStore((state) => state.orders);
  const filteredActiveOrders = useMemo(() => {
    return (activeOrders || []).filter(
      (order) => order.status === "PENDING" && (order as any).mode === tradingModeFromStore
    );
  }, [activeOrders, tradingModeFromStore]);

  // Get selected barrier/strike level for profit calculation
  const selectedBarrierLevel = useBinaryStore((state) => state.selectedBarrierLevel);
  const selectedStrikeLevel = useBinaryStore((state) => state.selectedStrikeLevel);
  const getProfitForSelectedLevel = useBinaryStore((state) => state.getProfitForSelectedLevel);

  // Market data for validation
  const binaryMarkets = useBinaryStore((state) => state.binaryMarkets);
  const currentSymbol = useBinaryStore((state) => state.currentSymbol);
  // Real balance in USD — the account level (and so the stake ceiling) is a property
  // of the funded account, not of whichever balance is currently selected.
  const realBalanceUsd = useBinaryStore((state) => state.realBalance ?? 0);

  const isOTC = useMemo(() => symbol ? String(symbol).toUpperCase().includes("OTC") : false, [symbol]);
  const categoryLabel = useMemo(() => getAssetCategoryLabel(symbol as string, binaryMarkets), [symbol, binaryMarkets]);

  // Use store values as initial state and sync with it
  const [amount, setInternalAmount] = useState<number>(storeSelectedAmount || 1000);
  const [expiryMinutes, setInternalExpiryMinutes] = useState<number>(storeSelectedExpiryMinutes || 5);
  const [expiryTime, setExpiryTime] = useState<string>("00:00");
  const [pendingSide, setPendingSide] = useState<OrderSide | null>(null);
  const [timeToNextExpiry, setTimeToNextExpiry] = useState<string>("00:00");

  // Custom setter that updates both internal state, store, and notifies parent
  const setAmount = useCallback((newAmount: number) => {
    setInternalAmount(newAmount);
    setStoreSelectedAmount(newAmount);
  }, [setStoreSelectedAmount]);

  // Custom setter that updates both internal state, store, and notifies parent
  const setExpiryMinutes = useCallback((minutes: number) => {
    setInternalExpiryMinutes(minutes);
    setStoreSelectedExpiryMinutes(minutes);
    if (onExpiryChange) {
      onExpiryChange(minutes);
    }
  }, [onExpiryChange, setStoreSelectedExpiryMinutes]);

  // UI state
  const [showExpiryDropdown, setShowExpiryDropdown] = useState<boolean>(false);
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);

  /* The confirmation has to leave this component's box to be seen at all.

     The panel root is overflow-hidden, and so are two containers inside it. An
     absolutely positioned card anchored to the button row and opening leftwards
     was therefore rendered correctly and then clipped away entirely by the
     nearest overflow ancestor — present in the DOM, zero pixels visible. No
     z-index reaches out of an overflow context; only leaving it does.

     So it is portalled to the body and positioned from the button row's own
     rect, which keeps it visually attached to the control while placing it in a
     stacking context nothing here can clip. Recomputed on scroll and resize
     because a fixed element does not follow its anchor by itself. */
  const buttonRowRef = useRef<HTMLDivElement>(null);
  const controlsTopRef = useRef<HTMLDivElement>(null);
  const [confirmAnchor, setConfirmAnchor] = useState<{
    left: number;
    top: number;
    width: number;
    height?: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!showConfirmation || !pendingSide) {
      setConfirmAnchor(null);
      return;
    }
    const CARD = 268;
    const GAP = 8;
    const place = () => {
      const el = buttonRowRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (isMobile) {
        /* No chart beside the panel on mobile, so the card has to sit over the
           panel's own controls. Floating it a fixed distance above the buttons
           put its top edge partway through the Amount and Time values and cut
           the digits in half — the top third of "1,000" and "21:03" showing
           above an opaque card, which reads as a rendering fault rather than an
           overlay.

           So it covers rather than overlaps: from the top of the controls row
           down to just above the buttons, which is a whole number of controls
           and leaves nothing sliced. The height is explicit here, so no
           translate is needed to place it. */
        const top = controlsTopRef.current?.getBoundingClientRect().top;
        const coverTop = top ?? r.top - GAP - 108;
        setConfirmAnchor({
          left: r.left,
          top: coverTop,
          width: r.width,
          height: Math.max(96, r.top - GAP - coverTop),
        });
      } else {
        setConfirmAnchor({
          left: Math.max(GAP, r.left - CARD - GAP),
          top: r.bottom,
          width: CARD,
        });
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [showConfirmation, pendingSide, isMobile]);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [isPendingTrade, setIsPendingTrade] = useState<boolean>(false);
  const [triggerPrice, setTriggerPrice] = useState<number>(currentPrice || 0);
  const hasSetTriggerPriceRef = useRef(false);
  useEffect(() => {
    if (currentPrice > 0 && !hasSetTriggerPriceRef.current) {
      setTriggerPrice(currentPrice);
      hasSetTriggerPriceRef.current = true;
    }
  }, [currentPrice]);
  const [orderPlacementError, setOrderPlacementError] = useState<string | null>(
    null
  );
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
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

  const preferredCurrencyRate = EXCHANGE_RATES[preferredCurrency] || 1.0;
  const preferredCurrencySymbol = CURRENCY_SYMBOLS[preferredCurrency] || "$";
  const convertedBalance = balance * preferredCurrencyRate;


  // Advanced trading state
  const [riskPercent, setRiskPercent] = useState<number>(2);
  const [takeProfitPercent, setTakeProfitPercent] = useState<number>(80);
  const [stopLossPercent, setStopLossPercent] = useState<number>(50);

  // One-click trading
  const oneClickTrading = useOneClickTrading(balance * 0.5); // Max 50% of balance for one-click

  // Risk Management implementation
  const riskManagement = useRiskManagement({
    balance: balance || 0,
    currentPrice: currentPrice || 0,
    onDailyLimitReached: () => {
      toast.error(t("daily_limit_reached") || "Daily limit reached. Trading stopped.");
    },
    onCooldownStarted: () => {
      toast.warning(t("cooling_down") || "Trade cooldown activated.");
    },
  });

  // Check if trading is allowed based on Risk Management
  const tradeCheck = riskManagement.canTrade();

  // Audio feedback - uses global settings store
  const audioConfig = useTradingSettingsStore((state) => state.audio);
  const audioFeedbackRef = useRef<AudioFeedback | null>(null);

  // Initialize audio feedback
  useEffect(() => {
    audioFeedbackRef.current = new AudioFeedback(audioConfig);
    return () => {
      audioFeedbackRef.current?.dispose();
    };
  }, []);

  // Sync audio config when it changes
  useEffect(() => {
    if (audioFeedbackRef.current) {
      audioFeedbackRef.current.setConfig(audioConfig);
    }
  }, [audioConfig]);

  // Get current market for amount validation
  const currentMarket = useMemo(() => {
    return binaryMarkets.find(m =>
      m.symbol === currentSymbol ||
      `${m.currency}/${m.pair}` === currentSymbol
    );
  }, [binaryMarkets, currentSymbol]);

  // Extract market min/max amounts from metadata
  const marketMinAmount = useMemo(() => {
    if (!currentMarket?.metadata) return 1;
    const metadata = typeof currentMarket.metadata === 'string'
      ? JSON.parse(currentMarket.metadata)
      : currentMarket.metadata;
    return Number(metadata?.limits?.amount?.min || 1);
  }, [currentMarket]);

  // Per-position stake ceiling from the account level: Basic 1,000 / Advanced 2,000
  // / Elite 3,000 USD. This used to be a flat 1,000 for everyone. Derived from the
  // REAL balance (not the active one) so the ceiling in demo matches the level shown
  // in the header, and so switching to demo can't unlock a larger stake.
  const accountTier = useMemo(() => TIERS[resolveTierByUsdBalance(realBalanceUsd)], [realBalanceUsd]);
  const nextTier = useMemo(() => {
    const i = TIER_LIST.findIndex((t) => t.key === accountTier.key);
    return i >= 0 && i < TIER_LIST.length - 1 ? TIER_LIST[i + 1] : null;
  }, [accountTier]);

  const marketMaxAmount = useMemo(() => {
    if (!currentMarket?.metadata) return accountTier.maxTradeUsd;
    const metadata = typeof currentMarket.metadata === 'string'
      ? JSON.parse(currentMarket.metadata)
      : currentMarket.metadata;
    const maxAmt = Number(metadata?.limits?.amount?.max || 100000);
    return Math.min(maxAmt, accountTier.maxTradeUsd);
  }, [currentMarket, accountTier]);

  // Shown under the amount field the moment a larger figure is typed. Names the
  // level so the ceiling reads as an account property rather than an arbitrary cap,
  // and points at the next level when there is one to reach.
  const stakeLimitNotice = useMemo(() => {
    const cap = `${preferredCurrencySymbol}${(marketMaxAmount * preferredCurrencyRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    const base = `${cap} is the maximum on a single position at your ${accountTier.name} level.`;
    if (!nextTier) return base;
    const nextCap = `${preferredCurrencySymbol}${(nextTier.maxTradeUsd * preferredCurrencyRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    const nextMin = `${preferredCurrencySymbol}${(nextTier.minBalanceUsd * preferredCurrencyRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return `${base} Reach ${nextTier.name} with a ${nextMin} balance to raise it to ${nextCap}.`;
  }, [marketMaxAmount, accountTier, nextTier, preferredCurrencyRate, preferredCurrencySymbol]);

  // The one-line form for the amount field itself, where there is room for a sentence
  // and not a paragraph. The upgrade path stays on `stakeLimitNotice`, which is what
  // the order-rejection toast shows.
  const stakeLimitShort = useMemo(() => {
    const cap = `${preferredCurrencySymbol}${(marketMaxAmount * preferredCurrencyRate).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return `Maximum ${cap} per position at ${accountTier.name} level.`;
  }, [marketMaxAmount, accountTier, preferredCurrencyRate, preferredCurrencySymbol]);

  // Binary durations - use store directly as single source of truth
  // This will automatically re-render when store durations change
  const storeBinaryDurations = useBinaryStore((state) => state.binaryDurations);
  const storeIsLoadingDurations = useBinaryStore((state) => state.isLoadingDurations);

  // Convert store durations to local format - MEMOIZED to prevent infinite loops
  const binaryDurations: BinaryDurationAttributes[] = useMemo(() =>
    storeBinaryDurations.map((d) => ({
      id: d.id,
      duration: d.duration,
      profitPercentageRiseFall: d.profitPercentageRiseFall,
      profitPercentageHigherLower: d.profitPercentageHigherLower,
      profitPercentageTouchNoTouch: d.profitPercentageTouchNoTouch,
      profitPercentageCallPut: d.profitPercentageCallPut,
      profitPercentageTurbo: d.profitPercentageTurbo,
      profitPercentage: d.profitPercentage,
      status: d.status,
    })),
    [storeBinaryDurations]
  );



  const expiryButtonRef = useRef<HTMLDivElement>(null);

  // Refs to track previous values and prevent unnecessary updates
  const prevExpiryMinutesRef = useRef<number>(expiryMinutes);
  const prevCandleDataLengthRef = useRef<number>(0);
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  // Preset expiry times in minutes with their profit percentages
  const [presetExpiryTimes, setPresetExpiryTimes] = useState<
    Array<{
      minutes: number;
      display: string;
      profit: number;
      remaining: string;
      expiryTime: Date;
    }>
  >([]);

  // Calculate profit percentage and amount based on selected expiry, order type, and barrier/strike level
  const selectedDuration = binaryDurations.find(
    (d) => d.duration === expiryMinutes
  );

  // Get base profit from duration (includes duration adjustment)
  const baseProfitFromDuration = selectedDuration
    ? getProfitPercentageForType(selectedDuration, selectedOrderType)
    : 85;

  // Get binarySettings to access base order type profits for adjustment calculation
  const binarySettings = useBinaryStore((state) => state.binarySettings);

  // Calculate the duration adjustment ratio for barrier/strike types
  // This ratio represents how much the duration adjustments affect the profit
  const durationAdjustmentRatio = useMemo(() => {
    if (!binarySettings || !selectedDuration) return 1;

    // Get the base profit for the order type (before any duration adjustments)
    const orderTypeConfig = binarySettings.orderTypes[selectedOrderType];
    if (!orderTypeConfig) return 1;

    const baseProfit = orderTypeConfig.profitPercentage;
    if (baseProfit <= 0) return 1;

    // The ratio is: adjustedProfit / baseProfit
    // This tells us the multiplier to apply to barrier/strike level profits
    return baseProfitFromDuration / baseProfit;
  }, [binarySettings, selectedDuration, selectedOrderType, baseProfitFromDuration]);

  // For barrier-based types (HIGHER_LOWER, TOUCH_NO_TOUCH), use barrier level profit WITH duration adjustment
  // For CALL_PUT, use strike level profit WITH duration adjustment
  // For RISE_FALL, use duration profit (already adjusted)
  // For TURBO, profit is variable based on price movement (not a fixed percentage)
  const profitPercentage = useMemo(() => {
    let base = baseProfitFromDuration;

    // Check if order type requires barrier and we have a selected barrier level
    if (['HIGHER_LOWER', 'TOUCH_NO_TOUCH'].includes(selectedOrderType) && selectedBarrierLevel) {
      // Apply duration adjustment to barrier level profit
      base = Math.round(selectedBarrierLevel.profitPercent * durationAdjustmentRatio);
    }
    // Check if order type requires strike price and we have a selected strike level
    else if (selectedOrderType === 'CALL_PUT' && selectedStrikeLevel) {
      // Apply duration adjustment to strike level profit
      base = Math.round(selectedStrikeLevel.profitPercent * durationAdjustmentRatio);
    }
    // TURBO is special - profit is based on distance moved × payoutPerPoint, not a fixed percentage
    else if (selectedOrderType === 'TURBO') {
      // For TURBO, calculate estimated profit percentage based on barrier distance and payout
      if (storeBarrier && storePayoutPerPoint && currentPrice > 0 && amount > 0) {
        const distance = Math.abs(storeBarrier - currentPrice);
        const estimatedProfit = distance * storePayoutPerPoint;
        // Convert to percentage for display
        return Math.round((estimatedProfit / amount) * 100);
      }
      // Fallback to barrier level profit with duration adjustment
      const barrierProfit = selectedBarrierLevel?.profitPercent || baseProfitFromDuration;
      base = Math.round(barrierProfit * durationAdjustmentRatio);
    }

    // Apply the same symbol-based hashing logic as other parts of the application
    const sym = String(symbol);
    if (sym.toUpperCase().includes("OTC")) {
      return base;
    }
    const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.min(95, Math.max(72, base - (hash % 7)));
  }, [selectedOrderType, selectedBarrierLevel, selectedStrikeLevel, baseProfitFromDuration, durationAdjustmentRatio, storeBarrier, storePayoutPerPoint, currentPrice, amount, symbol]);

  // For TURBO, profit amount is distance × payoutPerPoint, not percentage-based
  const profitAmount = useMemo(() => {
    if (selectedOrderType === 'TURBO' && storeBarrier && storePayoutPerPoint && currentPrice > 0) {
      const distance = Math.abs(storeBarrier - currentPrice);
      return distance * storePayoutPerPoint;
    }
    return (amount * profitPercentage) / 100;
  }, [selectedOrderType, storeBarrier, storePayoutPerPoint, currentPrice, amount, profitPercentage]);

  // Track candle data length changes (for debugging if needed)
  useEffect(() => {
    const currentCandleLength = candleData?.length || 0;
    if (currentCandleLength !== prevCandleDataLengthRef.current) {
      prevCandleDataLengthRef.current = currentCandleLength;
    }
  }, [candleData, symbol]);

  // Track completed orders to update martingale and risk management states
  const prevCompletedOrdersLengthRef = useRef(filteredCompletedOrders.length);
  const isInitializedRef = useRef(false);
  const notifiedOrderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Skip historical orders already completed before mount
    if (!isInitializedRef.current) {
      if (filteredCompletedOrders.length > 0) {
        filteredCompletedOrders.forEach(o => notifiedOrderIdsRef.current.add(o.id));
        prevCompletedOrdersLengthRef.current = filteredCompletedOrders.length;
        isInitializedRef.current = true;
      }
      return;
    }

    // Check if new orders were completed (in current trading mode)
    if (filteredCompletedOrders.length > prevCompletedOrdersLengthRef.current) {
      // Get the newly completed orders
      const newOrdersCount = filteredCompletedOrders.length - prevCompletedOrdersLengthRef.current;
      const newOrders = filteredCompletedOrders.slice(0, newOrdersCount);

      // Process each new order
      for (const order of newOrders) {
        // Skip duplicate runs
        if (notifiedOrderIdsRef.current.has(order.id)) continue;
        notifiedOrderIdsRef.current.add(order.id);

        const isWin = order.status === "WIN";
        const isDraw = order.status === "DRAW";

        let netProfit = 0;
        if (isWin) {
          netProfit = order.profit || 0;
        } else if (!isDraw) {
          netProfit = -(order.amount || 0);
        }

        // 1. Record in Risk Management (for daily limits and cooldown)
        riskManagement.recordTrade(netProfit);
        if (isWin) {
          riskManagement.recordWin();
        } else if (!isDraw) {
          riskManagement.recordLoss();
        }
      }
    }

    prevCompletedOrdersLengthRef.current = filteredCompletedOrders.length;
  }, [filteredCompletedOrders, riskManagement]);

  // Sync loading state from store
  const [isLoadingDurationsLocal, setIsLoadingDurationsLocal] = useState(true);

  // Sync loading state - derived from store but with local override when we have data
  useEffect(() => {
    if (binaryDurations.length > 0) {
      setIsLoadingDurationsLocal(false);
    } else {
      setIsLoadingDurationsLocal(storeIsLoadingDurations);
    }
  }, [binaryDurations.length, storeIsLoadingDurations]);

  // Track if we've already set the default expiry to prevent re-setting
  const hasSetDefaultExpiryRef = useRef(false);

  // Set default expiry when durations first become available
  useEffect(() => {
    if (binaryDurations.length === 0) return;
    if (hasSetDefaultExpiryRef.current) return;
    if (storeSelectedExpiryMinutes) return; // Store already has a value

    hasSetDefaultExpiryRef.current = true;
    const activeDurations = binaryDurations.filter((d) => d.status === true);
    const defaultDuration = activeDurations.length > 0 ? activeDurations[0] : binaryDurations[0];
    setExpiryMinutes(defaultDuration.duration);
  }, [binaryDurations, storeSelectedExpiryMinutes, setExpiryMinutes]);

  // Set isMounted to true after component mounts
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Sync with store changes - when store value changes, update internal state
  useEffect(() => {
    if (storeSelectedExpiryMinutes && storeSelectedExpiryMinutes !== expiryMinutes) {
      setInternalExpiryMinutes(storeSelectedExpiryMinutes);
    }
  }, [storeSelectedExpiryMinutes]);

  // Sync amount with store changes
  useEffect(() => {
    if (storeSelectedAmount && storeSelectedAmount !== amount) {
      setInternalAmount(storeSelectedAmount);
    }
  }, [storeSelectedAmount]);

  // Calculate expiry times based on adjusted current time and fetched durations
  const calculateExpiryTimes = useCallback(() => {
    if (!binaryDurations.length) {
      return [];
    }

    // Use adjusted time to match chart display
    const now = getChartSynchronizedTime();

    // Calculate remaining time
    const calculateRemaining = (date: Date) => {
      const diff = date.getTime() - now.getTime();
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    };

    // Calculate exact expiry times based on current time and fetched durations
    // Prefer active durations, but fallback to all durations if none are active
    const activeDurations = binaryDurations.filter(
      (duration) => duration.status === true
    );
    const durationsToUse = activeDurations.length > 0 ? activeDurations : binaryDurations;

    const expiryTimes = durationsToUse
      .map((duration) => {
        // Calculate the next expiry time based on the interval
        const nextExpiry = calculateNextExpiryTime(duration.duration);

        const baseProfit = getProfitPercentageForType(duration, selectedOrderType);
        const sym = String(symbol);
        let hashedProfit = baseProfit;
        if (!sym.toUpperCase().includes("OTC")) {
          const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
          hashedProfit = Math.min(95, Math.max(72, baseProfit - (hash % 7)));
        }

        return {
          minutes: duration.duration,
          display: formatChartTime(nextExpiry),
          profit: hashedProfit,
          remaining: calculateRemaining(nextExpiry),
          expiryTime: nextExpiry,
        };
      })
      // Sort by when the trade actually settles, not by the nominal bucket.
      // calculateNextExpiryTime rounds up to the next wall-clock multiple of the
      // duration, so the two orders disagree: at 20:40 the 10m bucket lands on
      // 20:50 while the 15m bucket lands on 20:45. Sorted by minutes, the list
      // showed 20:50 above 20:45.
      .sort((a, b) => a.expiryTime.getTime() - b.expiryTime.getTime());

    // Buckets that round to the same wall-clock instant are the same trade to the
    // trader — at 20:40 the 2m and 3m buckets both settle at 20:42 — and rendered
    // as two rows reading the same time and countdown. Keep the best-paying one.
    const bestByInstant = new Map<number, (typeof expiryTimes)[number]>();
    for (const item of expiryTimes) {
      const key = item.expiryTime.getTime();
      const held = bestByInstant.get(key);
      if (!held || item.profit > held.profit) bestByInstant.set(key, item);
    }

    return expiryTimes.filter((item) => bestByInstant.get(item.expiryTime.getTime()) === item);
  }, [binaryDurations, selectedOrderType, symbol, timezone]);

  // Refs for timer callback to avoid recreating the timer when these values change
  const expiryMinutesRef = useRef(expiryMinutes);
  const calculateExpiryTimesRef = useRef(calculateExpiryTimes);

  // Keep refs updated
  useEffect(() => {
    expiryMinutesRef.current = expiryMinutes;
  }, [expiryMinutes]);

  useEffect(() => {
    calculateExpiryTimesRef.current = calculateExpiryTimes;
  }, [calculateExpiryTimes]);

  // FIXED: Update expiry times every second - separated from error handling
  // Using refs for dynamic values prevents timer restart when they change
  useEffect(() => {
    if (binaryDurations.length === 0) return;

    // Clear any existing timer before setting up new one
    if (updateTimerRef.current) {
      clearTimeout(updateTimerRef.current);
      updateTimerRef.current = null;
    }

    // CRITICAL: Update ref immediately before using it
    // This ensures we have the latest calculateExpiryTimes function with current binaryDurations
    calculateExpiryTimesRef.current = calculateExpiryTimes;

    // Initial calculation - use the function directly to ensure we have current binaryDurations
    const initialExpiryTimes = calculateExpiryTimes();
    setPresetExpiryTimes(initialExpiryTimes);

    // CRITICAL: Also set the initial expiryTime display value
    // This ensures the display shows the correct time immediately when durations load
    if (initialExpiryTimes.length > 0) {
      // Update ref to current value before using it (in case effect order is different)
      expiryMinutesRef.current = expiryMinutes;

      const currentExpiry = expiryMinutes; // Use state directly, not ref
      const matchingExpiry = initialExpiryTimes.find((item) => item.minutes === currentExpiry);
      if (matchingExpiry) {
        setExpiryTime(matchingExpiry.display);
      } else {
        // If current expiryMinutes doesn't match any preset, use the first one
        // Also update expiryMinutes to match the first preset
        const firstPreset = initialExpiryTimes[0];
        setExpiryTime(firstPreset.display);
        setExpiryMinutes(firstPreset.minutes);
        expiryMinutesRef.current = firstPreset.minutes;
      }
    }

    // Update every second to keep times in sync with chart
    const updateTimesAndExpiry = () => {
      const now = Date.now();
      // Only update if at least 500ms have passed since the last update
      if (now - lastUpdateTimeRef.current >= 500) {
        lastUpdateTimeRef.current = now;

        const updatedExpiryTimes = calculateExpiryTimesRef.current();
        setPresetExpiryTimes(updatedExpiryTimes);

        // Update expiryTime display (either clock or custom duration)
        const isDurationMode = useBinaryStore.getState().durationMode === "DURATION";
        const chartTime = getChartSynchronizedTime();

        if (isDurationMode) {
          const customSecs = useBinaryStore.getState().customDurationSeconds;
          const targetDate = new Date(chartTime.getTime() + customSecs * 1000);
          setExpiryTime(formatChartTime(targetDate));
        } else if (clockPinnedRef.current) {
          // A pinned target holds until it is less than 30 seconds away from expiry,
          // then the derived value takes over to prevent sub-30-second trades.
          const target = nextClockOccurrence(expiryTimeRef.current, chartTime, timezoneRef.current);
          if (!target) {
            clockPinnedRef.current = false;
          } else {
            if (target.getTime() - chartTime.getTime() < 30000) {
              clockPinnedRef.current = false;
            } else {
              // Synchronize expiryMinutes with the current difference to target
              const diffMins = Math.max(1, Math.round((target.getTime() - chartTime.getTime()) / 60000));
              if (expiryMinutesRef.current !== diffMins) {
                setExpiryMinutes(diffMins);
              }
            }
          }
        } else {
          // Standard clock mode logic
          const nowTime = getChartSynchronizedTime();
          const clockOptions = buildClockOptions(nowTime, timezoneRef.current);
          if (clockOptions.length > 0) {
            const firstOption = clockOptions[0];
            if (expiryTimeRef.current !== firstOption.display) {
              setExpiryTime(firstOption.display);
            }
            if (expiryMinutesRef.current !== firstOption.minutes) {
              setExpiryMinutes(firstOption.minutes);
            }
          }
        }

        // Update time to next expiry using ref for current expiry minutes
        const currentExpiry = expiryMinutesRef.current;
        const nextExpiry = calculateNextExpiryTime(currentExpiry);
        const timeToExpiry = nextExpiry.getTime() - chartTime.getTime();
        const minutes = Math.floor(timeToExpiry / 60000);
        const seconds = Math.floor((timeToExpiry % 60000) / 1000);
        setTimeToNextExpiry(
          `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        );
      }

      // Schedule next update
      updateTimerRef.current = setTimeout(updateTimesAndExpiry, 1000);
    };

    // Start the update cycle
    updateTimerRef.current = setTimeout(updateTimesAndExpiry, 1000);

    return () => {
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
   
  }, [binaryDurations.length, calculateExpiryTimes]); // Restart when durations become available

  // FIXED: Separate effect for error message clearing
  useEffect(() => {
    if (!orderPlacementError) return;

    const errorTimer = setTimeout(() => setOrderPlacementError(null), 5000);
    return () => clearTimeout(errorTimer);
  }, [orderPlacementError]);

  // Expiry time navigation
  const increaseExpiry = useCallback(() => {
    const isDurationMode = useBinaryStore.getState().durationMode === "DURATION";
    if (isDurationMode) {
      const currentIndex = presetExpiryTimes.findIndex(
        (item) => item.minutes === expiryMinutes
      );
      if (
        presetExpiryTimes.length > 0 &&
        currentIndex < presetExpiryTimes.length - 1
      ) {
        const newMinutes = presetExpiryTimes[currentIndex + 1].minutes;
        setExpiryMinutes(newMinutes);
        setExpiryTime(presetExpiryTimes[currentIndex + 1].display);
      }
    } else {
      const nowTime = getChartSynchronizedTime();
      const options = buildClockOptions(nowTime, timezoneRef.current);
      const currentIndex = options.findIndex(
        (item) => item.display === expiryTime
      );
      if (options.length > 0) {
        let nextIndex = 0;
        if (currentIndex !== -1 && currentIndex < options.length - 1) {
          nextIndex = currentIndex + 1;
        } else if (currentIndex === -1) {
          nextIndex = 0;
        } else {
          return; // already at max
        }
        const option = options[nextIndex];
        clockPinnedRef.current = true;
        setExpiryMinutes(option.minutes);
        setExpiryTime(option.display);
      }
    }
  }, [expiryMinutes, expiryTime, presetExpiryTimes, setExpiryMinutes]);

  const decreaseExpiry = useCallback(() => {
    const isDurationMode = useBinaryStore.getState().durationMode === "DURATION";
    if (isDurationMode) {
      const currentIndex = presetExpiryTimes.findIndex(
        (item) => item.minutes === expiryMinutes
      );
      if (presetExpiryTimes.length > 0 && currentIndex > 0) {
        const newMinutes = presetExpiryTimes[currentIndex - 1].minutes;
        setExpiryMinutes(newMinutes);
        setExpiryTime(presetExpiryTimes[currentIndex - 1].display);
      }
    } else {
      const nowTime = getChartSynchronizedTime();
      const options = buildClockOptions(nowTime, timezoneRef.current);
      const currentIndex = options.findIndex(
        (item) => item.display === expiryTime
      );
      if (options.length > 0 && currentIndex > 0) {
        const option = options[currentIndex - 1];
        clockPinnedRef.current = true;
        setExpiryMinutes(option.minutes);
        setExpiryTime(option.display);
      }
    }
  }, [expiryMinutes, expiryTime, presetExpiryTimes, setExpiryMinutes]);

  // CLOCK mode has two competing ideas of what the expiry is: `expiryMinutes`, a
  // duration bucket, and `expiryTime`, a wall-clock target. Three places derived the
  // second from the first — this effect, the preset-snap below, and the one-second
  // ticker — which meant the +/- stepper could not move the clock more than a step
  // or two before one of them rewrote it back to a bucket boundary.
  //
  // Stepping or typing a time pins it. While pinned, the derivations stand down and
  // `expiryTime` is authoritative. The ticker releases the pin once the chosen time
  // has gone by, so the normal behaviour resumes on its own.
  const clockPinnedRef = useRef(false);
  const expiryTimeRef = useRef(expiryTime);
  useEffect(() => {
    expiryTimeRef.current = expiryTime;
  }, [expiryTime]);

  const setExpiryTimeFromUser = useCallback((value: string) => {
    clockPinnedRef.current = true;
    setExpiryTime(value);
  }, []);

  // Switching between DURATION and CLOCK starts the mode fresh.
  const storeDurationMode = useBinaryStore((state) => state.durationMode);
  useEffect(() => {
    clockPinnedRef.current = false;
    if (storeDurationMode === "CLOCK") {
      const nowTime = getChartSynchronizedTime();
      const clockOptions = buildClockOptions(nowTime, timezoneRef.current);
      if (clockOptions.length > 0) {
        const firstOption = clockOptions[0];
        setExpiryTime(firstOption.display);
        setExpiryMinutes(firstOption.minutes);
      }
    }
  }, [storeDurationMode, setExpiryMinutes]);

  // Update expiry time display
  useEffect(() => {
    if (storeDurationMode === "CLOCK") return; // CLOCK mode display is managed by the ticker or the pin
    if (clockPinnedRef.current) return;
    if (presetExpiryTimes.length > 0) {
      const selectedExpiry = presetExpiryTimes.find(
        (item) => item.minutes === expiryMinutes
      );
      if (selectedExpiry) {
        setExpiryTime(selectedExpiry.display);
      }
    }
  }, [expiryMinutes, presetExpiryTimes, storeDurationMode]);

  // Add a separate effect that only runs when expiryMinutes changes
  useEffect(() => {
    // Only notify parent if the value has actually changed
    if (
      onExpiryChange &&
      expiryMinutes > 0 &&
      expiryMinutes !== prevExpiryMinutesRef.current
    ) {
      prevExpiryMinutesRef.current = expiryMinutes;
      onExpiryChange(expiryMinutes);
    }
  }, [expiryMinutes, onExpiryChange]);

  // Initialize with first option when presetExpiryTimes changes from empty to populated
  // Snaps expiryMinutes to the closest active duration ONLY if it's not a valid active duration.
  // This prevents the duplicate-filtering logic from mutating the user's selected expiry-minutes.
  useEffect(() => {
    if (storeDurationMode === "CLOCK") return;
    if (binaryDurations.length === 0) return;
    if (clockPinnedRef.current) return;

    const activeDurations = binaryDurations.filter((d) => d.status === true);
    const durationsToUse = activeDurations.length > 0 ? activeDurations : binaryDurations;
    const hasValidActiveDuration = durationsToUse.some((d) => d.duration === expiryMinutes);

    if (hasValidActiveDuration) {
      // expiryMinutes is valid, ensure expiryTime matches the computed clock time for this duration
      const nextExpiry = calculateNextExpiryTime(expiryMinutes);
      const nextExpiryStr = formatChartTime(nextExpiry);
      if (expiryTime !== nextExpiryStr) {
        setExpiryTime(nextExpiryStr);
      }
    } else {
      // Find closest active duration and set it
      const closestDuration = durationsToUse.reduce((prev, curr) => {
        return Math.abs(curr.duration - expiryMinutes) < Math.abs(prev.duration - expiryMinutes)
          ? curr
          : prev;
      });

      if (closestDuration) {
        setExpiryMinutes(closestDuration.duration);
        const nextExpiry = calculateNextExpiryTime(closestDuration.duration);
        const nextExpiryStr = formatChartTime(nextExpiry);
        if (expiryTime !== nextExpiryStr) {
          setExpiryTime(nextExpiryStr);
        }
      }
    }
  }, [presetExpiryTimes.length, expiryMinutes, binaryDurations, storeDurationMode]);

  // Add event listener for window resize to update dropdown positions
  useEffect(() => {
    const handleResize = () => {
      // Force re-render to update dropdown positions
      if (showExpiryDropdown) {
        setIsMounted(false);
        setTimeout(() => setIsMounted(true), 0);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [showExpiryDropdown]);

  // Handle amount changes with market min/max validation
  const increaseAmount = useCallback(() => {
    const maxLimit = marketMaxAmount * preferredCurrencyRate;
    const currentBal = balance * preferredCurrencyRate;
    if (amount < Math.min(currentBal, maxLimit)) {
      setAmount(Math.min(amount + 100, currentBal, maxLimit));
    }
  }, [amount, balance, marketMaxAmount, preferredCurrencyRate, setAmount]);

  const decreaseAmount = useCallback(() => {
    const minLimit = marketMinAmount * preferredCurrencyRate;
    if (amount > minLimit) {
      setAmount(Math.max(minLimit, amount - 100));
    }
  }, [amount, marketMinAmount, preferredCurrencyRate, setAmount]);


  // Handle order placement with confirmation or one-click
  const handlePlaceOrder = useCallback(async (side: OrderSide) => {
    // 1. Risk Management Barrier
    if (!tradeCheck.allowed) {
      setOrderPlacementError(tradeCheck.reason || "Trading currently disabled by Risk Management");
      audioFeedbackRef.current?.playError();
      return;
    }

    // Validate amount is within market limits
    const minLimit = marketMinAmount * preferredCurrencyRate;
    const maxLimit = marketMaxAmount * preferredCurrencyRate;
    if (amount < minLimit) {
      setOrderPlacementError(t("amount_below_minimum") || `Amount must be at least ${preferredCurrencySymbol}${minLimit.toFixed(2)}`);
      return;
    }
    if (amount > maxLimit) {
      // The ceiling is an account-level entitlement, so say which level sets it and
      // what raises it rather than just quoting a number.
      setOrderPlacementError(stakeLimitNotice);
      return;
    }
    if (amount > convertedBalance) {
      setOrderPlacementError("Insufficient balance");
      return;
    }

    // Check if one-click trading is enabled and amount is within limit
    if (oneClickTrading.canOneClick(amount)) {
      // Execute trade INSTANTLY — no blocking, supports simultaneous multi-click
      const tradeAmountInUSD = amount / preferredCurrencyRate;
      // placeOrder returns true immediately (optimistic, fire-and-forget API)
      const success = onPlaceOrder(side, tradeAmountInUSD, expiryMinutes);
      // Play sound optimistically
      audioFeedbackRef.current?.playOrderPlaced();
      // Handle async result in background without blocking
      Promise.resolve(success).then((ok) => {
        if (!ok) {
          audioFeedbackRef.current?.playError();
          setOrderPlacementError(
            t("order_placement_failed") || "Order placement failed - check your balance or try again"
          );
        }
      }).catch((error) => {
        console.error("Error placing order:", error);
        audioFeedbackRef.current?.playError();
        setOrderPlacementError(t("order_placement_error") || "Order placement failed - please try again");
      });
      return;
    }

    // Show the advanced confirmation modal
    setPendingSide(side);
    setShowConfirmation(true);
  }, [tradeCheck, isInSafeZone, t, oneClickTrading, amount, onPlaceOrder, expiryMinutes, balance, marketMinAmount, marketMaxAmount, stakeLimitNotice, isPendingTrade, triggerPrice, preferredCurrencyRate, preferredCurrencySymbol, preferredCurrency, convertedBalance]);

  const confirmOrder = useCallback(async () => {
    if (pendingSide) {
      if (amount > marketMaxAmount * preferredCurrencyRate) {
        setShowConfirmation(false);
        setPendingSide(null);
        setOrderPlacementError(stakeLimitNotice);
        return;
      }

      const tradeAmountInUSD = amount / preferredCurrencyRate;
      // placeOrder is now instant (fire-and-forget) — close modal immediately
      const success = onPlaceOrder(pendingSide, tradeAmountInUSD, expiryMinutes);
      audioFeedbackRef.current?.playOrderPlaced();
      setShowConfirmation(false);
      setPendingSide(null);
      // Handle async result in background
      Promise.resolve(success).then((ok) => {
        if (!ok) {
          audioFeedbackRef.current?.playError();
          setOrderPlacementError("Order placement failed - check your balance or try again");
        }
      }).catch((error) => {
        console.error("Error placing order:", error);
        audioFeedbackRef.current?.playError();
        setOrderPlacementError("Order placement failed - please try again");
      });
    }
  }, [pendingSide, onPlaceOrder, amount, expiryMinutes, balance, symbol, convertedBalance, preferredCurrencyRate, marketMaxAmount, stakeLimitNotice]);


  const cancelOrder = useCallback(() => {
    setShowConfirmation(false);
    setPendingSide(null);
  }, []);

  // Render confirmation modal portal

  // Skeleton loader - uses Tailwind dark: variant for proper theme support during SSR
  // This ensures skeleton follows the theme immediately without JavaScript
  const renderSkeleton = () => (
    <div className="space-y-2">
      {/* Order Type button skeleton - compact version matching actual */}
      <div className="w-full px-2.5 py-2 rounded-lg border bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-blue-50 dark:bg-blue-500/20">
            <div className="w-3.5 h-3.5" />
          </div>
          <div className="h-3.5 w-14 rounded bg-gray-200 dark:bg-zinc-700" />
        </div>
      </div>

      {/* Amount and Expiry skeleton row */}
      <div className="flex gap-2">
        {/* Amount skeleton - matches AmountSelector exactly */}
        <div className="relative flex-1 rounded-lg cursor-pointer bg-gray-50 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800/60">
          <div className="p-2">
            {/* Header: label + buttons - text-[10px] uppercase = ~10px height */}
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-500">&nbsp;</span>
              <div className="flex items-center gap-0.5">
                <div className="p-1 rounded bg-gray-200 dark:bg-zinc-800">
                  <div className="w-[10px] h-[10px]" />
                </div>
                <div className="p-1 rounded bg-gray-200 dark:bg-zinc-800">
                  <div className="w-[10px] h-[10px]" />
                </div>
              </div>
            </div>
            {/* Amount value row - text-lg = 18px line height */}
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-transparent">000</span>
              <span className="text-[11px] text-transparent">USDT</span>
              <div className="w-3 h-3 rounded ml-auto bg-gray-300 dark:bg-zinc-700" />
            </div>
            {/* Progress bar section */}
            <div className="mt-1.5">
              <div className="h-0.5 rounded-full overflow-hidden bg-gray-200 dark:bg-zinc-800">
                <div className="h-full w-[10%] rounded-full bg-emerald-500" />
              </div>
              <div className="text-[10px] mt-0.5 text-gray-400 dark:text-zinc-600">
                <span className="text-emerald-500 font-medium">&nbsp;</span>
              </div>
            </div>
          </div>
        </div>
        {/* Expiry skeleton - matches ExpirySelector exactly */}
        <div className="relative flex-1 rounded-lg cursor-pointer bg-gray-50 dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-800/60">
          <div className="p-2">
            {/* Header: label + buttons */}
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-500">&nbsp;</span>
              <div className="flex items-center gap-0.5">
                <div className="p-1 rounded bg-gray-200 dark:bg-zinc-800">
                  <div className="w-[10px] h-[10px]" />
                </div>
                <div className="p-1 rounded bg-gray-200 dark:bg-zinc-800">
                  <div className="w-[10px] h-[10px]" />
                </div>
              </div>
            </div>
            {/* Time value row */}
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-transparent">00:00 PM</span>
              <div className="w-3 h-3 rounded ml-auto bg-gray-300 dark:bg-zinc-700" />
            </div>
            {/* Duration + profit badge */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-gray-400 dark:text-zinc-600">
                <span className="text-blue-500 font-medium">&nbsp;</span>
              </span>
              <div className="h-[17px] w-12 rounded px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-500/10" />
            </div>
          </div>
        </div>
      </div>

      {/* Profit display skeleton - matches ProfitDisplay exactly */}
      <div className="rounded-lg overflow-hidden bg-gray-50 dark:bg-gradient-to-b dark:from-[#131722]/80 dark:to-[#0e1118]/90 border border-gray-200 dark:border-zinc-800/80">
        {/* Profit row */}
        <div className="px-3.5 py-3 bg-emerald-50/20 dark:bg-emerald-950/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg bg-emerald-350 dark:bg-emerald-500/40" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-transparent">POTENTIAL PROFIT</span>
            </div>
            <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full text-transparent bg-emerald-500/10 border border-transparent">+90%</span>
          </div>
          <div className="flex items-baseline justify-between mt-2.5">
            <span className="text-xs font-medium text-transparent">Win</span>
            <span className="text-2xl font-black text-transparent">+$90.00</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full overflow-hidden mt-3 bg-gray-200/80 dark:bg-zinc-800/80">
            <div className="h-full w-[90%] rounded-full bg-gradient-to-r from-emerald-500 to-green-400" />
          </div>
        </div>
        {/* Loss row */}
        <div className="px-3.5 py-2 flex items-center justify-between border-t border-gray-150 dark:border-zinc-800/60 bg-white dark:bg-zinc-950/20">
          <div className="flex items-center gap-2">
            <div className="w-3.5 h-3.5 rounded bg-gray-400 dark:bg-zinc-650" />
            <span className="text-[11px] font-semibold text-transparent">Loss</span>
          </div>
          <span className="text-base font-bold text-transparent">-$100.00</span>
        </div>
        {/* Risk/Reward row */}
        <div className="px-3.5 py-2 flex items-center justify-between border-t border-gray-100 dark:border-zinc-800/40 bg-gray-50/60 dark:bg-[#0e1118]/65">
          <span className="text-[10px] uppercase font-bold tracking-widest text-transparent">RISK/REWARD</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-1.5 rounded-full bg-red-100 dark:bg-red-500/30" />
              <div className="w-4 h-1.5 rounded-full bg-emerald-500" />
            </div>
            <span className="text-xs font-bold text-transparent">1:0.9</span>
          </div>
        </div>
      </div>
    </div>
  );

  const panelBg = isNavy
    ? "#090d16"
    : isDarkTheme
      ? "#09090b"
      : "#f4f4f5";

  return (
    <div
      data-tutorial="order-panel"
      className="flex flex-col h-full relative z-10 overflow-hidden w-full text-foreground bg-transparent"
      style={!isMobile ? { zoom: 0.9 } : {}}
    >
      {/* Main content area */}
      <div className="flex-1 flex flex-col h-0 min-h-0 overflow-hidden">
        {isLoadingDurationsLocal ? (
          <div className="p-2 overflow-y-auto flex-1">{renderSkeleton()}</div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className={`shrink-0 mx-2 mt-2 rounded-lg border overflow-hidden ${
              isNavy
                ? "bg-[#0e1626] border-[#1c2a4a] shadow-md shadow-[#050608]/40"
                : isDarkTheme
                  ? "bg-[#121214] border-zinc-800 shadow-md shadow-black/35"
                  : "bg-white border-zinc-300 shadow-md shadow-zinc-200/50"
            }`}>
              {/* Redesigned Upper Header */}
              <div className={`px-3.5 py-3 flex items-start justify-between border-b transition-colors duration-300 ${
                isNavy
                  ? "bg-[#131b2e] border-[#1c2a4a]/85"
                  : isDarkTheme
                    ? "bg-[#1c1c1f] border-zinc-800/85"
                    : "bg-zinc-50 border-zinc-200"
              }`}>
                <div className="flex items-start">
                  {renderCoinIcons(symbol as string, darkMode)}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1 flex-nowrap min-w-0">
                      <span className={`text-[13px] font-semibold tracking-[0.02em] truncate whitespace-nowrap ${darkMode ? "text-zinc-100" : "text-zinc-800"}`}>
                        {isOTC ? getAssetDisplayName(symbol as string) : String(symbol)}
                      </span>
                      {isOTC && (
                        <span className="text-[9px] font-extrabold text-zinc-550 dark:text-zinc-300 bg-zinc-150 dark:bg-zinc-800 px-1 py-[0.5px] rounded border border-zinc-250 dark:border-zinc-700 leading-none shrink-0 self-start mt-[2px]">
                          OTC
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* A step up in size and two steps up in contrast.

                          zinc-400 on the dark panel and zinc-500 on the light one
                          are the tones this interface uses for text it does not
                          expect anyone to read — timestamps, helper captions. The
                          instrument's market is not that: it is the second thing
                          on the asset header, directly beneath the symbol, and it
                          was fading into the panel behind it. */}
                      {/* Raised again: 12px on zinc-200/zinc-700. The previous pass
                          moved this off the helper-text tones but kept it at 11px,
                          and beside a 14px bold symbol that still read as a caption
                          rather than as the instrument's market. */}
                      <span className={`text-[12px] font-bold tracking-wide ${darkMode ? "text-zinc-200" : "text-zinc-700"}`}>
                        {categoryLabel}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="w-[5px] h-[5px] rounded-full bg-emerald-400 animate-pulse shadow-[0_0_5px_rgba(52,211,153,0.8)]"></span>
                        <span className="text-[10px] font-extrabold text-emerald-400 tracking-wider">Live</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end justify-end self-stretch py-0.5 mt-auto">
                  <span className="text-[13px] font-black text-amber-500 tracking-tight leading-none">
                    {profitPercentage}%
                  </span>
                </div>
              </div>

              {/* Trading controls container with padding */}
              <div className="p-2.5 px-1.5 space-y-2.5">
                  {/* Amount and Expiry row. Reffed because on mobile the
                      confirmation covers everything from here down to the
                      buttons — see the placement effect. */}
                  <div ref={controlsTopRef} className="flex gap-1.5">
                    <div data-tutorial="amount-input" className="flex-1 min-w-0">
                    <AmountSelector
                      amount={amount}
                      balance={convertedBalance}
                      increaseAmount={increaseAmount}
                      decreaseAmount={decreaseAmount}
                      setAmount={setAmount}
                      darkMode={darkMode}
                      minAmount={marketMinAmount * preferredCurrencyRate}
                      maxAmount={marketMaxAmount * preferredCurrencyRate}
                      maxAmountNotice={stakeLimitShort}
                      currencySymbol={preferredCurrencySymbol}
                    />
                    </div>

                    <div data-tutorial="expiry-selector" className="flex-1 min-w-0">
                    <ExpirySelector
                      expiryMinutes={expiryMinutes}
                      expiryTime={expiryTime}
                      increaseExpiry={increaseExpiry}
                      decreaseExpiry={decreaseExpiry}
                      setExpiryMinutes={setExpiryMinutes}
                      setExpiryTime={setExpiryTimeFromUser}
                      showExpiryDropdown={showExpiryDropdown}
                      setShowExpiryDropdown={setShowExpiryDropdown}
                      expiryButtonRef={expiryButtonRef}
                      presetExpiryTimes={presetExpiryTimes}
                      isMobile={isMobile}
                      darkMode={darkMode}
                    />
                    </div>
                  </div>

                  {/* Net Payout and Investment details inline strip */}
                  {/* 12px, not 9.5px. The earlier pass that lifted every small
                      size by a step matched whole numbers only, so this decimal
                      slipped through and stayed the smallest text on the screen —
                      at 9.5px it is roughly a four-pixel x-height on a 1x monitor,
                      which no amount of antialiasing can render cleanly.

                      The labels also carried opacity-70 on top of an already dim
                      zinc-400, compounding to something close to zinc-500 and
                      reading as washed out. Colour now comes from the token
                      alone, so what is chosen is what is displayed. */}
                  {/* One line, and made to fit on it.

                      This wrapped to two lines for a while, which solved the
                      overflow by giving up the single row. The room comes from
                      the parts that are not the numbers instead: the two labels
                      drop a step to 10px, the padding and gaps tighten, and the
                      separator loses its margins. The figures themselves stay at
                      11px — they are what is being read before a stake is
                      committed and are the last thing that should shrink.

                      overflow-hidden is the backstop, not the plan. Past seven
                      figures even this runs out of room, and a number clipped
                      inside the box is contained; the same number spilling past
                      the border, which is what was reported, is not. */}
                  <div className={`rounded-lg px-1.5 py-2 border flex items-center justify-center gap-x-1.5 text-[11px] tabular-nums tracking-tight whitespace-nowrap overflow-hidden transition-colors duration-200 select-none ${
                    darkMode
                      ? "border-border/50 bg-zinc-900/30 text-zinc-300"
                      : "border-zinc-200 bg-zinc-50 text-zinc-600"
                  }`}>
                    <div className="flex items-baseline gap-1 min-w-0 whitespace-nowrap">
                      {/* No size override: these labels were 10px inside an 11px
                          row, so each one was smaller than the figure it
                          introduces. They inherit the row now, and the hierarchy
                          is carried by weight and colour instead — which is what
                          separates a label from its value here anyway. */}
                      <span className="font-semibold shrink-0">Invest:</span>
                      <span className="font-bold text-zinc-900 dark:text-white">
                        {formatStripAmount(amount)} {preferredCurrencySymbol}
                      </span>
                    </div>
                    <span className="opacity-40 font-light shrink-0">|</span>
                    <div className="flex items-baseline gap-1 min-w-0 whitespace-nowrap">
                      <span className="font-semibold shrink-0">Payout:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {formatStripAmount(amount + profitAmount)} {preferredCurrencySymbol}
                      </span>
                    </div>
                  </div>

                  {/* Barrier Input (for HIGHER_LOWER, TOUCH_NO_TOUCH, TURBO) */}
                  {ORDER_TYPE_CONFIGS[selectedOrderType].requiresBarrier && (
                    <BarrierInput
                      orderType={selectedOrderType}
                      currentPrice={currentPrice}
                      barrier={storeBarrier}
                      onChange={setBarrierInStore}
                      darkMode={darkMode}
                      disabled={isInSafeZone || isLoadingDurationsLocal}
                    />
                  )}

                  {/* Strike Price Input (for CALL_PUT) */}
                  {ORDER_TYPE_CONFIGS[selectedOrderType].requiresStrikePrice && (
                    <StrikePriceInput
                      orderType={selectedOrderType}
                      currentPrice={currentPrice}
                      strikePrice={storeStrikePrice}
                      onChange={setStrikePriceInStore}
                      darkMode={darkMode}
                      disabled={isInSafeZone || isLoadingDurationsLocal}
                    />
                  )}

                  {/* Payout Per Point Input (for TURBO) */}
                  {ORDER_TYPE_CONFIGS[selectedOrderType].requiresPayoutPerPoint && (
                    <PayoutPerPointInput
                      orderType={selectedOrderType}
                      currentPrice={currentPrice}
                      payoutPerPoint={storePayoutPerPoint}
                      barrier={storeBarrier}
                      onChange={setPayoutPerPointInStore}
                      darkMode={darkMode}
                      disabled={isInSafeZone || isLoadingDurationsLocal}
                    />
                  )}

                  {/* Trading buttons — or, while a trade is pending, the
                      confirmation in their place. Same footprint, so the chart is
                      never covered and the hand does not travel. */}
                  <div ref={buttonRowRef} className="space-y-2 relative" data-tutorial="trade-buttons">
                    <DynamicTradingButtons
                      orderType={selectedOrderType}
                      handlePlaceOrder={handlePlaceOrder}
                      profitPercentage={profitPercentage}
                      disabled={isInSafeZone || isLoadingDurationsLocal || !tradeCheck.allowed}
                      isCooldownActive={riskManagement.state.cooldown.enabled && riskManagement.state.cooldown.isInCooldown}
                      cooldownEndsAt={riskManagement.state.cooldown.cooldownEndsAt}
                      isDailyLimitReached={riskManagement.state.dailyLimit.enabled && riskManagement.state.dailyLimit.isLimitReached}
                      isMobile={isMobile}
                      darkMode={darkMode}
                      oneClickEnabled={oneClickTrading.enabled}
                      isLoading={isPlacingOrder}
                    />
                  </div>

                  {/* Error message */}
                  {orderPlacementError && (
                    <div className={`px-2 py-1.5 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2 duration-300 ${
                      darkMode
                        ? "bg-red-950/30 border border-red-900/40"
                        : "bg-red-50 border border-red-200"
                    }`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <span className={`text-[10px] ${darkMode ? "text-red-400" : "text-red-600"}`}>
                        {orderPlacementError}
                      </span>
                    </div>
                  )}

                  {/* Safe zone warning */}
                  {isInSafeZone && (
                    <div className={`px-2 py-1.5 rounded-lg flex items-center gap-2 animate-in slide-in-from-top-2 duration-300 ${
                      darkMode
                        ? "bg-amber-950/30 border border-amber-900/40"
                        : "bg-amber-50 border border-amber-200"
                    }`}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                      </svg>
                      <span className={`text-[10px] ${darkMode ? "text-amber-400" : "text-amber-600"}`}>
                        {t("trading_paused_within_15_seconds_of_expiry")}
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {/* ── Active Positions & History ── */}
            <div className="flex-1 min-h-0 px-2 pb-2 pt-2 flex flex-col overflow-hidden">
              <div className={`flex-1 min-h-0 rounded-lg overflow-hidden flex flex-col border ${
                isNavy
                  ? "bg-[#0e1626] border-[#1c2a4a]"
                  : isDarkTheme
                    ? "bg-[#121214] border-zinc-800"
                    : "bg-zinc-50 border-zinc-300 shadow-sm shadow-gray-100/80"
              }`}>
                <ActivePositions
                  orders={filteredActiveOrders}
                  completedOrders={filteredCompletedOrders}
                  currentPrice={currentPrice}
                  isMobile={isMobile}
                  theme={currentTheme as any}
                  isEmbedded={true}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Render confirmation portal */}

      {/* Order Type Modal */}
      <OrderTypeModal
        isOpen={showOrderTypeModal}
        onClose={() => setShowOrderTypeModal(false)}
        selectedType={selectedOrderType}
        onSelectType={setOrderTypeInStore}
        darkMode={darkMode}
      />

      {/* Portalled past this panel's overflow-hidden ancestors — see the
          placement effect above. Fixed, positioned from the button row's rect,
          so it reads as attached to the buttons while living outside the box
          that was clipping it. Still no overlay and no dimming: the chart stays
          live beside it. */}
      {isMounted &&
        showConfirmation &&
        pendingSide &&
        confirmAnchor &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: confirmAnchor.left,
              top: confirmAnchor.top,
              width: confirmAnchor.width,
              /* Mobile gives an explicit height (it covers a known region), so
                 it is placed from its top and needs no transform. Desktop is
                 bottom-aligned to the button row and its height is whatever the
                 content comes to, so it is pulled up by its own height. */
              ...(confirmAnchor.height
                ? { height: confirmAnchor.height }
                : { transform: "translateY(-100%)" }),
              zIndex: 9998,
            }}
          >
            <InlineTradeConfirm
              fill={!!confirmAnchor.height}
              side={pendingSide === "RISE" ? "CALL" : "PUT"}
              amount={amount}
              profitPercentage={profitPercentage}
              currencySymbol={preferredCurrencySymbol}
              expiryLabel={
                durationMode === "DURATION"
                  ? `${Math.floor(customDurationSeconds / 60)}m ${customDurationSeconds % 60}s`
                  : `${expiryMinutes} min`
              }
              onConfirm={confirmOrder}
              onCancel={cancelOrder}
              theme={isNavy ? "navy" : isDarkTheme ? "dark" : "light"}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

// Add default export
export default OrderPanel;
