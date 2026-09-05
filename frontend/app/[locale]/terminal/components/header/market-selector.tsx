/**
 * MarketSelector (Unified Modal)
 *
 * Premium responsive 1-column market selector Dialog modal.
 * Design inspired by the Pocket Option watchlist layout.
 * Supports both light and dark modes perfectly.
 */
"use client";

import type React from "react";
import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import Image from "next/image";
import { Search, X, Star, Coins, Bitcoin, Droplet, Briefcase } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";

import {
  useBinaryStore,
  type Symbol,
  type BinaryMarket,
  isSameSymbol,
} from "@/store/trade/use-binary-store";
import { wishlistService } from "../../../../../services/wishlist-service";
import { tickersWs } from "@/services/tickers-ws";
import type { TickerData } from "@/services/market-data-ws";
import { getCryptoImageUrl, handleImageError, getAssetDisplayName } from "@/utils/image-fallback";

// ─── Types ───────────────────────────────────────────────────────────────────

type CategoryTab = "currencies" | "crypto" | "commodities" | "stocks";

const COMMODITY_CURRENCIES = new Set([
  "XAU", "XAG", "OIL", "WTI", "BRENT", "USOIL", "UKOIL", "XPT", "XPD", "WHEAT", "CORN", "NGAS"
]);

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL", "PKR", "BDT", "CNY", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP",
  "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "THB", "CNH"
]);

const STOCKS = new Set([
  "AAPL", "MSFT", "TSLA", "AMZN", "GOOGL", "NVDA", "NFLX", "META", "BABA", "AMD", "INTC", "TSMC",
  "DIS", "BA", "JPM", "V", "MA", "PFE", "JNJ", "KO", "PEP", "WMT", "XOM", "COIN", "PYPL", "SQ", "UBER"
]);

export function classifyMarketToCategory(market: BinaryMarket): CategoryTab {
  if (market.category) {
    const cat = market.category.toLowerCase();
    if (cat === "currency" || cat === "currencies") return "currencies";
    if (cat === "commodity" || cat === "commodities") return "commodities";
    if (cat === "stock" || cat === "stocks") return "stocks";
    if (cat === "crypto") return "crypto";
  }
  let base = (market.currency || "").toUpperCase();
  if (base.includes("/")) {
    base = base.split("/")[0];
  }
  if (COMMODITY_CURRENCIES.has(base)) return "commodities";
  if (FIAT_CURRENCIES.has(base)) return "currencies";
  if (STOCKS.has(base)) return "stocks";
  return "crypto";
}

/**
 * The name the asset browser prints for a market — "CAD/CHF", with the OTC
 * badge rendered separately by whoever is displaying it.
 *
 * Exported because the header used to build its own label from the raw symbol
 * and printed "CAD/CHF_OTC" beside a browser row reading "CAD/CHF (OTC)". One
 * market, two names, on the same screen.
 */
export function marketDisplayName(market: { currency?: string; pair?: string } | null | undefined, symbol?: string): string {
  const base = market?.currency || "";
  const quote = (market?.pair || "").replace(/_OTC$/i, "");
  if (base && quote && quote !== "OTC" && FIAT_CURRENCIES.has(base.toUpperCase())) {
    return `${base}/${quote}`;
  }
  if (base) return base;
  return String(symbol || "").replace(/_?OTC/gi, "").replace(/\s*\(OTC\)/gi, "").trim();
}

/** Whether a market is an OTC one, by the same test the browser rows use. */
export function isOtcMarket(market: { symbol?: string; currency?: string; pair?: string; label?: string } | null | undefined, symbol?: string): boolean {
  if (!market) return String(symbol || "").toUpperCase().includes("OTC");
  return (
    String(market.symbol || `${market.currency}${market.pair}`).toUpperCase().includes("OTC") ||
    (!!market.label && String(market.label).toUpperCase().includes("OTC"))
  );
}

// ─── Double Currency Flags Component ───────────────────────────────────────────

export const DoubleCurrencyFlags = memo(({ base, quote, dark, category }: { base: string; quote: string; dark: boolean; category?: string }) => {
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

  const isOTC = quote === "OTC" || base.includes("/");
  const isSingle = isOTC && category !== "currencies";

  if (isSingle) {
    return (
      <div className="relative w-9 h-5 shrink-0 flex items-center select-none justify-center">
        <div className={`w-5 h-5 rounded-full overflow-hidden border-2 bg-zinc-900 shadow-sm ${dark ? "border-white" : "border-zinc-950"}`}>
          <img
            src={getCryptoImageUrl(cleanBase)}
            alt={cleanBase}
            className="object-cover w-full h-full"
            onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-9 h-5 shrink-0 flex items-center select-none">
      {/* Quote Currency Icon (behind) */}
      <div className={`absolute left-3.5 w-5 h-5 rounded-full overflow-hidden border-2 z-0 bg-zinc-900 shadow-sm ${dark ? "border-white" : "border-zinc-950"}`}>
        <img
          src={getCryptoImageUrl(cleanQuote)}
          alt={cleanQuote}
          className="object-cover w-full h-full"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
      {/* Base Currency Icon (in front) */}
      <div className={`absolute left-0 w-5 h-5 rounded-full overflow-hidden border-2 z-10 bg-zinc-900 shadow-sm ${dark ? "border-white" : "border-zinc-950"}`}>
        <img
          src={getCryptoImageUrl(cleanBase)}
          alt={cleanBase}
          className="object-cover w-full h-full"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
    </div>
  );
});
DoubleCurrencyFlags.displayName = "DoubleCurrencyFlags";

// ─── Change Indicator Component ───────────────────────────────────────────────

const ChangeIndicator = memo(({ change }: { change: number }) => {
  const isPositive = change >= 0;
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${
      isPositive ? "text-emerald-500" : "text-rose-500"
    }`}>
      {isPositive ? "+" : ""}{change.toFixed(2)}%
    </span>
  );
});
ChangeIndicator.displayName = "ChangeIndicator";

// ─── Asset Row Component ──────────────────────────────────────────────────────

interface AssetRowProps {
  market: BinaryMarket;
  change: number;
  profit1Min: number;
  profit5Min: number;
  isFavorite: boolean;
  isActive: boolean;
  dark: boolean;
  onClick: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  /** Two lines and a 56px target instead of a four-column grid. */
  mobile?: boolean;
}

const AssetRow = memo(({
  market,
  change,
  profit1Min,
  profit5Min,
  isFavorite,
  isActive,
  dark,
  onClick,
  onToggleFavorite,
  mobile = false,
}: AssetRowProps) => {
  const base = market.currency || "";
  const quote = market.pair || "";
  const isOTC = String(market.symbol || `${market.currency}${market.pair}`).toUpperCase().includes("OTC") 
    || (market.label && String(market.label).toUpperCase().includes("OTC"));
  const category = classifyMarketToCategory(market);

  /* The desktop row is four columns of 11px type. On a 390px screen those
     columns are 90px wide and the payouts end up closer to the change figure
     than to the asset they belong to. The mobile row is one asset per two
     lines: what it is on top, what it pays underneath. */
  if (mobile) {
    return (
      <div
        onClick={onClick}
        className={`flex items-center gap-3 px-3 py-2.5 min-h-[58px] cursor-pointer border-b ${
          dark ? "border-zinc-900/40" : "border-zinc-100"
        } ${
          isActive
            ? dark
              ? "bg-zinc-900/60"
              : "bg-blue-50/60"
            : "bg-transparent active:bg-zinc-100/60 dark:active:bg-zinc-900/30"
        }`}
      >
        <button
          onClick={onToggleFavorite}
          aria-label="Favourite"
          className={`shrink-0 p-1 -m-1 ${isFavorite ? "text-amber-500" : "text-zinc-300 dark:text-zinc-600"}`}
        >
          <Star size={16} strokeWidth={1.8} className={isFavorite ? "fill-amber-500" : ""} />
        </button>

        <DoubleCurrencyFlags base={base} quote={quote} dark={dark} category={category} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-[14px] font-semibold truncate ${isActive ? "text-blue-500" : dark ? "text-zinc-100" : "text-zinc-900"}`}>
              {quote.replace(/_OTC$/i, "") !== "OTC" && quote && FIAT_CURRENCIES.has(base.toUpperCase())
                ? `${base}/${quote.replace(/_OTC$/i, "")}`
                : base}
            </span>
            {isOTC && (
              <span className={`shrink-0 text-[9px] font-extrabold px-1 py-[1px] rounded-[3px] leading-none uppercase ${
                dark ? "text-zinc-400 bg-[#1a1d28]" : "text-zinc-500 bg-zinc-200/70"
              }`}>
                OTC
              </span>
            )}
          </div>
          <div className={`mt-0.5 text-[11px] ${dark ? "text-zinc-500" : "text-zinc-500"}`}>
            Payout{" "}
            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{profit1Min}%</span>
            <span className="opacity-40"> · 5m </span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{profit5Min}%</span>
          </div>
        </div>

        <div className="shrink-0 select-none">
          <ChangeIndicator change={change} />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`group grid grid-cols-[5.5fr_2.5fr_1.25fr_1.25fr] items-center gap-2 px-4.5 py-2.5 cursor-pointer transition-colors duration-150 border-b ${
        dark ? "border-zinc-900/40" : "border-zinc-100"
      } ${
        isActive
          ? dark
            ? "bg-zinc-900/60 text-white"
            : "bg-zinc-100/70 text-zinc-900"
          : dark
            ? "bg-transparent text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200"
            : "bg-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
      }`}
    >
      {/* 1. Star + Flags + Name */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onToggleFavorite}
          className={`shrink-0 p-0.5 transition-colors duration-150 cursor-pointer ${
            isFavorite
              ? "text-amber-500 hover:text-amber-600"
              : "text-zinc-500 opacity-20 group-hover:opacity-85 hover:text-zinc-400"
          }`}
        >
          <Star size={11} strokeWidth={1.8} className={isFavorite ? "fill-amber-500 text-amber-500" : ""} />
        </button>

        <DoubleCurrencyFlags base={base} quote={quote} dark={dark} category={category} />

        <div className="flex flex-col min-w-0 leading-tight">
          <div className="flex items-center gap-0.5">
            <span className={`text-[11px] font-semibold truncate ${isActive ? "text-blue-500" : dark ? "text-zinc-100" : "text-zinc-900"}`}>
              {quote.replace(/_OTC$/i, "") !== "OTC" && quote && FIAT_CURRENCIES.has(base.toUpperCase())
                ? `${base}/${quote.replace(/_OTC$/i, "")}`
                : base}
            </span>
            {isOTC && (
              <span className="inline-block shrink-0 text-[10px] font-extrabold text-zinc-400 dark:text-zinc-400/90 bg-zinc-200/60 dark:bg-[#1a1d28] px-0.5 py-[1px] rounded-[2px] leading-none select-none uppercase tracking-tighter origin-top-left transform scale-[0.68] mt-[1px] -mr-1.5">
                OTC
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Change Indicator */}
      <div className="text-right shrink-0 select-none">
        <ChangeIndicator change={change} />
      </div>

      {/* 3. Profit 1+ min */}
      <div className="text-right shrink-0 select-none">
        <span className="text-[11px] font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">
          {profit1Min}%
        </span>
      </div>

      {/* 4. Profit 5+ min */}
      <div className="text-right shrink-0 select-none">
        <span className="text-[11px] font-bold text-emerald-500 dark:text-emerald-400 tabular-nums">
          {profit5Min}%
        </span>
      </div>
    </div>
  );
});
AssetRow.displayName = "AssetRow";

// ─── Dialog Modal Component ──────────────────────────────────────────────────

interface MarketSelectorModalProps {
  open: boolean;
  onClose: () => void;
  handleMarketSelect?: (marketSymbol: string) => void;
  onAddMarket?: (symbol: Symbol) => void;
  isMobile?: boolean;
}

export default function MarketSelectorModal({
  open,
  onClose,
  handleMarketSelect,
  onAddMarket,
  isMobile = false,
}: MarketSelectorModalProps) {
  const {
    activeMarkets,
    currentSymbol,
    setCurrentSymbol,
    addMarket,
    binaryMarkets,
    isLoadingMarkets,
    fetchBinaryMarkets,
    binaryDurations,
    selectedOrderType,
  } = useBinaryStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("crypto");
  const [isFilterFavorites, setIsFilterFavorites] = useState(false);
  const [favoriteMarkets, setFavoriteMarkets] = useState<Symbol[]>([]);
  const [tickerData, setTickerData] = useState<Record<string, TickerData>>({});
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  const dark = !mounted ? true : (resolvedTheme === "dark" || resolvedTheme === "navy");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch markets if needed
  useEffect(() => {
    if (binaryMarkets.length === 0 && !isLoadingMarkets) {
      fetchBinaryMarkets();
    }
  }, [binaryMarkets.length, isLoadingMarkets, fetchBinaryMarkets]);

  // Sync default tab once markets load
  useEffect(() => {
    if (binaryMarkets.length > 0) {
      const categories = binaryMarkets.map(classifyMarketToCategory);
      if (categories.includes("currencies")) {
        setActiveTab("currencies");
      } else if (categories.includes("crypto")) {
        setActiveTab("crypto");
      }
    }
  }, [binaryMarkets]);

  // Focus search input when open
  useEffect(() => {
    if (open && mounted) {
      setTimeout(() => searchRef.current?.focus(), 120);
      setSearchQuery("");
      setIsFilterFavorites(false);
    }
  }, [open, mounted]);

  // Subscribe to wishlist
  useEffect(() => {
    const unsubscribe = wishlistService.subscribe((wishlist) => {
      setFavoriteMarkets(wishlist.map((item) => item.symbol));
    });
    return unsubscribe;
  }, []);

  // Subscribe to ticker WS
  useEffect(() => {
    tickersWs.initialize();
    const unsubscribe = tickersWs.subscribeToSpotData((data) => {
      setTickerData((prevData) => {
        const updatedData = { ...prevData };
        Object.entries(data).forEach(([symbol, tickerData]) => {
          if (tickerData && tickerData.last !== undefined) {
            updatedData[symbol] = tickerData;
          }
        });
        return updatedData;
      });
    });
    return unsubscribe;
  }, []);

  // Calculate profit percentage helper
  const getProfitForDuration = useCallback((market: BinaryMarket, durationMinutes: number): number => {
    const durationObj = binaryDurations.find((d) => d.duration === durationMinutes);
    let baseProfit = 85;
    if (durationObj) {
      if (selectedOrderType === "RISE_FALL") baseProfit = durationObj.profitPercentageRiseFall || 85;
      else if (selectedOrderType === "HIGHER_LOWER") baseProfit = durationObj.profitPercentageHigherLower || 80;
      else if (selectedOrderType === "TOUCH_NO_TOUCH") baseProfit = durationObj.profitPercentageTouchNoTouch || 82;
      else if (selectedOrderType === "CALL_PUT") baseProfit = durationObj.profitPercentageCallPut || 85;
      else if (selectedOrderType === "TURBO") baseProfit = durationObj.profitPercentageTurbo || 80;
    } else {
      if (selectedOrderType === "HIGHER_LOWER") baseProfit = 80;
      else if (selectedOrderType === "TOUCH_NO_TOUCH") baseProfit = 82;
      else if (selectedOrderType === "TURBO") baseProfit = 80;
    }
    const sym = market.symbol || `${market.currency}${market.pair}`;
    if (sym.toUpperCase().includes("OTC")) {
      return baseProfit;
    }
    const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.min(95, Math.max(72, baseProfit - (hash % 7)));
  }, [binaryDurations, selectedOrderType]);

  // Get live price and change
  const getLiveData = useCallback((market: BinaryMarket) => {
    const wsKey = market.label || `${market.currency}/${market.pair}`;
    const sym = market.symbol || `${market.currency}${market.pair}`;
    const live = tickerData[wsKey] || tickerData[sym] || tickerData[`${market.currency}/${market.pair}`];
    const marketEntry = activeMarkets.find((m) => isSameSymbol(m.symbol, sym));
    return {
      price: live?.last || marketEntry?.price || 0,
      change: live?.change || marketEntry?.change || 0,
    };
  }, [tickerData, activeMarkets]);

  // Filter and categorize markets
  const filteredMarkets = useMemo(() => {
    let markets = binaryMarkets;

    // Filter by favorites toggle
    if (isFilterFavorites) {
      markets = markets.filter((m) => {
        const sym = (m.symbol || `${m.currency}${m.pair}`) as Symbol;
        return favoriteMarkets.includes(sym);
      });
    } else {
      markets = markets.filter((m) => classifyMarketToCategory(m) === activeTab);
    }

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      markets = markets.filter((m) =>
        `${m.currency}${m.pair}${m.label || ""}`.toLowerCase().includes(q)
      );
    }

    return markets;
  }, [binaryMarkets, activeTab, isFilterFavorites, searchQuery, favoriteMarkets]);

  // Handle select market
  const handleSelectMarket = useCallback((symbol: Symbol) => {
    if (!isMobile && !activeMarkets.some((m) => isSameSymbol(m.symbol, symbol))) {
      if (onAddMarket) {
        onAddMarket(symbol);
      } else {
        addMarket(symbol);
      }
    }

    if (handleMarketSelect) {
      handleMarketSelect(String(symbol));
    } else {
      setCurrentSymbol(symbol);
    }

    onClose();
  }, [isMobile, activeMarkets, addMarket, onAddMarket, handleMarketSelect, setCurrentSymbol, onClose]);

  // Toggle favorite helper
  const toggleFavorite = useCallback((e: React.MouseEvent, symbol: Symbol) => {
    e.stopPropagation();
    wishlistService.toggleWishlist(symbol);
  }, []);

  const categoryTabs = useMemo(() => [
    { id: "currencies" as CategoryTab, label: "Currencies", icon: <Coins size={12} /> },
    { id: "crypto" as CategoryTab, label: "Crypto", icon: <Bitcoin size={12} /> },
    { id: "commodities" as CategoryTab, label: "Commodities", icon: <Droplet size={12} /> },
    { id: "stocks" as CategoryTab, label: "Stocks", icon: <Briefcase size={12} /> },
  ], []);

  if (!mounted) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className={`${
          isMobile
            ? "w-screen max-w-none h-[100dvh] rounded-none border-0"
            : "w-full max-w-[95vw] md:max-w-[437px] rounded-lg"
        } p-0 gap-0 overflow-hidden font-sans flex flex-col ${
          dark
            ? "bg-[#09090b]/95 border-zinc-800 text-white"
            : "bg-white/98 border-zinc-200 text-zinc-900"
        } border shadow-2xl [&>button]:hidden`}
      >
        <DialogTitle className="sr-only">Select Market</DialogTitle>
        <DialogDescription className="sr-only">Choose a trading pair</DialogDescription>

        {/* Header Title */}
        <div className={`${isMobile ? "px-4 py-3" : "px-4.5 py-2.5"} flex items-center justify-between border-b shrink-0 ${dark ? "border-zinc-800/80 bg-zinc-950/20" : "bg-zinc-50/50 border-zinc-150"}`}>
          <span className={
            isMobile
              ? `text-[17px] font-semibold ${dark ? "text-white" : "text-zinc-900"}`
              : `text-[10px] font-bold uppercase tracking-wider ${dark ? "text-zinc-500" : "text-zinc-400"}`
          }>
            Select trade pair
          </span>
          <button onClick={onClose} aria-label="Close" className={`${isMobile ? "p-2 -m-2" : "p-1"} rounded hover:bg-zinc-800/40 transition-colors cursor-pointer`}>
            <X size={isMobile ? 22 : 13} className={dark ? "text-zinc-500 hover:text-white" : "text-zinc-500 hover:text-zinc-800"} />
          </button>
        </div>

        {/* Categories, as a scrolling strip rather than a 138px sidebar.
            The sidebar spends a third of a 390px screen naming four things, and
            leaves the asset rows — the reason the screen is open — sharing what
            is left with three numeric columns. */}
        {isMobile && (
          <div className={`flex gap-1.5 px-3 py-2 overflow-x-auto shrink-0 border-b ${
            dark ? "border-zinc-800/40" : "border-zinc-150"
          }`} style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setIsFilterFavorites(true)}
              className={`shrink-0 h-9 px-3 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 border ${
                isFilterFavorites
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400"
                  : dark
                    ? "border-transparent bg-zinc-900/60 text-zinc-300"
                    : "border-transparent bg-zinc-100 text-zinc-700"
              }`}
            >
              <Star size={14} className={isFilterFavorites ? "fill-amber-500 text-amber-500" : ""} />
              {favoriteMarkets.length}
            </button>
            {categoryTabs.map((tab) => {
              const isActive = activeTab === tab.id && !isFilterFavorites;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setIsFilterFavorites(false);
                    setActiveTab(tab.id);
                  }}
                  className={`shrink-0 h-9 px-3.5 rounded-lg text-[13px] font-semibold whitespace-nowrap border ${
                    isActive
                      ? "bg-blue-500 border-blue-500 text-white"
                      : dark
                        ? "border-transparent bg-zinc-900/60 text-zinc-300"
                        : "border-transparent bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Split Content Container */}
        <div
          className={`flex flex-1 min-h-0 overflow-hidden ${isMobile ? "flex-col" : "flex-row"}`}
          style={isMobile ? undefined : { height: "420px" }}
        >
          {/* Left Sidebar — desktop only; mobile gets the strip above. */}
          {!isMobile && (
          <div className={`w-[138px] flex flex-col gap-1 p-2 border-r shrink-0 ${
            dark ? "bg-zinc-950/40 border-zinc-800/40" : "bg-zinc-50/50 border-zinc-150"
          }`}>
            {categoryTabs.map((tab) => {
              const isActive = activeTab === tab.id && !isFilterFavorites;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setIsFilterFavorites(false);
                    setActiveTab(tab.id);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded transition-all duration-150 text-left w-full cursor-pointer select-none border ${
                    isActive
                      ? dark
                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400 font-semibold shadow-sm"
                        : "bg-blue-50 border-blue-200 text-blue-600 font-semibold shadow-sm"
                      : `border-transparent ${
                          dark
                            ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                            : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60"
                        }`
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}

            {/* Favorites Sidebar Item */}
            <button
              onClick={() => setIsFilterFavorites(true)}
              className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium rounded transition-all duration-150 text-left w-full cursor-pointer select-none border ${
                isFilterFavorites
                  ? dark
                    ? "bg-blue-500/10 border-blue-500/30 text-blue-400 font-semibold shadow-sm"
                    : "bg-blue-50 border-blue-200 text-blue-600 font-semibold shadow-sm"
                  : `border-transparent ${
                      dark
                        ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                        : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100/60"
                    }`
              }`}
            >
              <Star size={12} className={isFilterFavorites ? "fill-amber-400 text-amber-400" : ""} />
              <span>Favorites</span>
              <span className={`ml-auto text-[10px] tabular-nums font-bold ${
                isFilterFavorites ? "text-amber-400" : dark ? "text-zinc-600" : "text-zinc-400"
              }`}>
                {favoriteMarkets.length}
              </span>
            </button>
          </div>
          )}

          {/* Right Panel Watchlist */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search Row */}
            <div className={`p-2.5 border-b shrink-0 flex items-center ${
              dark ? "border-zinc-800/30" : "border-zinc-150"
            }`}>
              <div className="relative flex-1 flex items-center">
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  className={`w-full ${isMobile ? "h-11 pl-3.5 pr-10 text-[15px] rounded-lg" : "h-8 pl-3 pr-8 text-xs rounded"} outline-none border transition-all duration-200 ${
                    dark
                      ? "bg-zinc-900/50 border-zinc-800/80 text-white placeholder-zinc-700 focus:border-blue-500/50 focus:bg-zinc-900/80 focus:ring-1 focus:ring-blue-500/20"
                      : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-zinc-300 focus:bg-white focus:ring-1 focus:ring-blue-500/20"
                  }`}
                />
                <Search size={13} className={`absolute right-3 ${dark ? "text-zinc-500" : "text-zinc-400"}`} />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-7.5 p-0.5 rounded hover:bg-zinc-800/40 transition-colors"
                  >
                    <X size={11} className="text-zinc-500 hover:text-zinc-350" />
                  </button>
                )}
              </div>
            </div>

            {/* Column Headers — desktop only. */}
            {!isMobile && (
            <div className={`grid grid-cols-[5.5fr_2.5fr_1.25fr_1.25fr] items-center px-4.5 py-1.5 border-b gap-2 ${
              dark ? "bg-zinc-950/20 border-zinc-800/30" : "bg-zinc-50/50 border-zinc-150"
            }`}>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                Asset
              </span>
              <span className={`text-right text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                24h Change
              </span>
              <span className={`text-right text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                1m
              </span>
              <span className={`text-right text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                5m
              </span>
            </div>
            )}

            {/* List scroll container */}
            <div className="flex-1 overflow-y-auto scrollbar-thin dark:scrollbar-thumb-zinc-800 scrollbar-thumb-zinc-200 scrollbar-track-transparent">
              {isLoadingMarkets ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>Loading markets…</span>
                </div>
              ) : filteredMarkets.length === 0 ? (
                <div className={`flex flex-col items-center justify-center py-16 ${dark ? "text-zinc-650" : "text-zinc-400"}`}>
                  <Search size={24} className="mb-2 opacity-30" />
                  <span className="text-xs font-semibold">No assets found</span>
                </div>
              ) : (
                <div className="py-1">
                  {filteredMarkets.map((market) => {
                    const sym = (market.symbol || `${market.currency}${market.pair}`) as Symbol;
                    const { change } = getLiveData(market);
                    const profit1 = getProfitForDuration(market, 1);
                    const profit5 = getProfitForDuration(market, 5);
                    const isFav = favoriteMarkets.includes(sym);
                    const isActive = currentSymbol === sym;

                    return (
                      <AssetRow
                        key={market.id || sym}
                        market={market}
                        change={change}
                        profit1Min={profit1}
                        profit5Min={profit5}
                        isFavorite={isFav}
                        isActive={isActive}
                        dark={dark}
                        onClick={() => handleSelectMarket(sym)}
                        onToggleFavorite={(e) => toggleFavorite(e, sym)}
                        mobile={isMobile}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
