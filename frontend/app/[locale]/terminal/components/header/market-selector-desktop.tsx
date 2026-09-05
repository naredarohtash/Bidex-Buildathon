/**
 * MarketSelector (Desktop Header — Compact Button)
 *
 * A single compact dropdown button showing:
 *   [icon] SYMBOL  OTC  95% ▾
 *
 * Clicking opens the MarketBrowserPanel slide-in panel.
 */
"use client";

import { useState, useCallback, useMemo, useEffect, useRef, memo } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import {
  useBinaryStore,
  type Symbol,
  type Order,
  extractBaseCurrency,
  extractQuoteCurrency,
} from "@/store/trade/use-binary-store";
import { getCryptoImageUrl, handleImageError, getAssetDisplayName } from "@/utils/image-fallback";
import MarketBrowserPanel from "./market-browser-panel";

export interface MarketSelectorProps {
  onAddMarket?: (symbol: Symbol) => void;
  activeMarkets?: { symbol: Symbol; price: number; change: number }[];
  currentSymbol?: Symbol;
  onSelectSymbol?: (symbol: Symbol) => void;
  onRemoveMarket?: (symbol: Symbol) => void;
  orders?: Order[];
  currentPrice?: number;
  handleMarketSelect?: (marketSymbol: string) => void;
}

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL", "PKR", "BDT", "CNY", "CNH", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP", "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "THB"
]);

// Memoized overlapping double currency icon
const DoubleCryptoIcon = memo(({ base, quote, size = 32, dark }: { base: string; quote: string; size?: number; dark: boolean }) => {
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
  const isSingle = isOTC && !FIAT_CURRENCIES.has(cleanBase.toUpperCase());

  const baseSize = Math.round(size * 0.75); // e.g., 24px
  const quoteSize = Math.round(size * 0.6875); // e.g., 22px
  const leftOffset = Math.round(size * 0.34); // e.g., 11px
  const bgClass = dark || isSingle ? "bg-zinc-900" : "bg-white";
  
  if (isSingle) {
    return (
      <div className="relative z-10 flex items-center shrink-0 select-none justify-center" style={{ width: size, height: size }}>
        <div 
          className={`rounded-full overflow-hidden border-2 ${dark ? "border-white" : "border-zinc-950"} ${bgClass} z-10 shadow-md`}
          style={{ width: baseSize, height: baseSize }}
        >
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
    <div className="relative z-10 flex items-center shrink-0 select-none" style={{ width: size, height: size }}>
      {/* Quote Currency Icon (behind) */}
      <div 
        className={`absolute rounded-full overflow-hidden border-2 ${dark ? "border-white" : "border-zinc-950"} ${bgClass} z-0 shadow-sm`}
        style={{ left: leftOffset, width: quoteSize, height: quoteSize }}
      >
        <img
          src={getCryptoImageUrl(cleanQuote)}
          alt={cleanQuote}
          className="object-cover w-full h-full"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
      {/* Base Currency Icon (in front) */}
      <div 
        className={`absolute left-0 rounded-full overflow-hidden border-2 ${dark ? "border-white" : "border-zinc-950"} ${bgClass} z-10 shadow-md`}
        style={{ width: baseSize, height: baseSize }}
      >
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
DoubleCryptoIcon.displayName = "DoubleCryptoIcon";

export default function MarketSelector({
  onAddMarket,
  activeMarkets: propActiveMarkets,
  currentSymbol: propCurrentSymbol,
  onSelectSymbol,
  onRemoveMarket,
  orders,
  currentPrice,
  handleMarketSelect,
}: MarketSelectorProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  const dark = !mounted ? true : (resolvedTheme === "dark" || resolvedTheme === "navy");

  const {
    activeMarkets: storeActiveMarkets,
    currentSymbol: storeCurrentSymbol,
    binaryMarkets,
    binaryDurations,
    selectedExpiryMinutes,
    selectedOrderType,
  } = useBinaryStore();

  const activeMarkets = propActiveMarkets || storeActiveMarkets;
  const currentSymbol = propCurrentSymbol || storeCurrentSymbol;

  // Extract display values
  const baseCurrency = useMemo(() => extractBaseCurrency(String(currentSymbol), binaryMarkets), [currentSymbol, binaryMarkets]);
  const quoteCurrency = useMemo(() => extractQuoteCurrency(String(currentSymbol), binaryMarkets), [currentSymbol, binaryMarkets]);

  const displayBase = useMemo(() => {
    if (baseCurrency.includes("/")) {
      return baseCurrency.split("/")[0];
    }
    return baseCurrency;
  }, [baseCurrency]);

  const displayQuote = useMemo(() => {
    if (baseCurrency.includes("/")) {
      return baseCurrency.split("/")[1];
    }
    if (quoteCurrency === "OTC") {
      return "USD";
    }
    return quoteCurrency;
  }, [baseCurrency, quoteCurrency]);

  const isOTC = useMemo(() => {
    return String(currentSymbol).toUpperCase().includes("OTC");
  }, [currentSymbol]);

  // Get payout % for current symbol
  const payoutPercent = useMemo(() => {
    const duration = binaryDurations.find((d) => d.duration === selectedExpiryMinutes);
    let baseProfit = 85;
    if (duration) {
      if (selectedOrderType === "RISE_FALL") baseProfit = duration.profitPercentageRiseFall || 85;
      else if (selectedOrderType === "HIGHER_LOWER") baseProfit = duration.profitPercentageHigherLower || 80;
      else if (selectedOrderType === "TOUCH_NO_TOUCH") baseProfit = duration.profitPercentageTouchNoTouch || 82;
      else if (selectedOrderType === "CALL_PUT") baseProfit = duration.profitPercentageCallPut || 85;
      else if (selectedOrderType === "TURBO") baseProfit = duration.profitPercentageTurbo || 80;
    }
    const sym = String(currentSymbol);
    if (sym.toUpperCase().includes("OTC")) {
      return baseProfit;
    }
    const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.min(95, Math.max(72, baseProfit - (hash % 7)));
  }, [binaryDurations, selectedExpiryMinutes, selectedOrderType, currentSymbol]);

  // Determine badge type for current symbol
  const currentMarket = useMemo(() =>
    binaryMarkets.find((m) =>
      m.symbol === currentSymbol ||
      `${m.currency}${m.pair}` === currentSymbol
    ),
    [binaryMarkets, currentSymbol]
  );
  const isHot = currentMarket?.isHot;
  const isTrending = currentMarket?.isTrending;

  const handleSelectMarket = useCallback((sym: string) => {
    if (handleMarketSelect) {
      handleMarketSelect(sym);
    } else if (onSelectSymbol) {
      onSelectSymbol(sym as Symbol);
    }
    setPanelOpen(false);
  }, [handleMarketSelect, onSelectSymbol]);

  if (!mounted) return null;

  return (
    <div className="relative flex items-center h-full">
      {/* ── Compact Market Selector Button ── */}
      <button
        ref={buttonRef}
        onClick={() => setPanelOpen((v) => !v)}
        className={`h-full flex items-center gap-2.5 px-4 cursor-pointer transition-all duration-200 select-none group border-r ${
          panelOpen
            ? dark
              ? "bg-zinc-800/80 border-zinc-700/60"
              : "bg-zinc-100 border-zinc-300"
            : dark
              ? "hover:bg-zinc-800/60 border-zinc-800/60 hover:border-zinc-700/40"
              : "hover:bg-zinc-50 border-zinc-200"
        }`}
        aria-label="Open market browser"
        aria-expanded={panelOpen}
      >
        {/* Overlapping double currency flags */}
        <DoubleCryptoIcon base={baseCurrency} quote={quoteCurrency} size={32} dark={dark} />

        {/* Symbol name */}
        <div className="flex flex-col items-start leading-tight">
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-bold tracking-wide ${dark ? "text-white" : "text-zinc-900"}`}>
              {quoteCurrency.replace(/_OTC$/i, "") !== "OTC" && quoteCurrency && FIAT_CURRENCIES.has(displayBase.toUpperCase())
                ? `${displayBase}/${quoteCurrency.replace(/_OTC$/i, "")}`
                : displayBase}
            </span>
            {isOTC && (
              <span className="inline-block shrink-0 text-[10px] font-extrabold text-zinc-400 dark:text-zinc-400/90 bg-zinc-200/60 dark:bg-[#1a1d28] px-0.5 py-[1px] rounded-[2px] leading-none select-none uppercase tracking-tighter origin-top-left transform scale-[0.68] mt-[1px] -mr-1.5">
                OTC
              </span>
            )}


            {isHot && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 tracking-wide">
                HOT
              </span>
            )}
            {isTrending && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-wide">
                TREND
              </span>
            )}

            {/* Payout badge */}
            <span className="text-[10px] font-extrabold text-blue-500">
              {payoutPercent}%
            </span>
          </div>
        </div>

      </button>

      {/* ── Market Browser Panel ── */}
      <MarketBrowserPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        handleMarketSelect={handleSelectMarket}
      />
    </div>
  );
}
