/**
 * Chart Result Toasts Component
 *
 * Displays compact system-themed trade result (win/loss) notifications
 * stacked inside the right corner of the chart area.
 */

"use client";

import React, { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useTradingNotificationsStore } from "@/components/binary/notifications";
import { getCryptoImageUrl, handleImageError } from "@/utils/image-fallback";
import { getFullTabDisplayName } from "@/app/[locale]/terminal/lib/asset-name";
import { useBinaryStore } from "@/store/trade/use-binary-store";

interface ChartResultToastsProps {
  symbol: string;
  currency?: string;
  expiryMinutes?: number;
}

/**
 * Format a duration in minutes to M:SS (e.g. 5 → "5:00", 1.5 → "1:30")
 */
const formatMinutes = (minutes: number): string => {
  // Use floor (not round) to avoid server-latency causing 10s to display as 11s
  const totalSec = Math.floor(minutes * 60);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
};

/**
 * Format profit/loss amount with the correct currency symbol.
 * Priority: data.currency (from notification) > currencyProp (chart prop)
 */
const formatAmount = (val: number, currencyCode: string): string => {
  const absVal = Math.abs(val);
  const sign = val >= 0 ? "+" : "-";
  const cur = (currencyCode || "").toUpperCase();
  if (cur === "INR" || cur === "₹" || cur === "INR_OTC") {
    return `${sign}${absVal.toFixed(2)} ₹`;
  }
  if (cur === "USDT" || cur === "BUSD") {
    return `${sign}${absVal.toFixed(2)} ${cur}`;
  }
  if (cur === "BTC" || cur === "ETH" || cur === "BNB") {
    return `${sign}${absVal.toFixed(6)} ${cur}`;
  }
  // All other currencies (USD, EUR, GBP, etc.) — show as $
  return `${sign}$${absVal.toFixed(2)}`;
};

export const ChartResultToasts = memo(function ChartResultToasts({
  symbol,
  currency = "USD",
  expiryMinutes,
}: ChartResultToastsProps) {
  const activeToasts = useTradingNotificationsStore((state) => state.activeToasts);
  // Needed so a toast can prefer the venue's own name for the instrument,
  // exactly as the browser panel does.
  const binaryMarkets = useBinaryStore((state) => state.binaryMarkets);
  const dismissToast = useTradingNotificationsStore((state) => state.dismissToast);

  const resultToasts = activeToasts.filter(
    (n) =>
      n.type === "trade_win" ||
      n.type === "trade_loss" ||
      // A drawn trade is a result too. It used to be the one outcome that
      // reported nothing: the position disappeared and the stake returned to the
      // balance with no notice given for either.
      n.type === "trade_refund"
  );

  if (resultToasts.length === 0) return null;

  return (
    <div
      /* items-stretch with a fixed width, not items-end with a maximum.
         A max-width lets each toast size to its own contents, so a stack of
         results was a stack of different-width rectangles with ragged left
         edges. One width for all of them makes the stack a column. */
      className="absolute bottom-[38px] right-[86px] z-[45] flex flex-col-reverse gap-2 items-stretch pointer-events-none"
      style={{ width: "146px" }}
    >
      <AnimatePresence mode="sync">
        {resultToasts.map((toast) => {
          const isWin = toast.type === "trade_win";
          const data = toast.data || {};
          const toastSymbol = data.symbol || symbol;

          // Parse base/quote for flags
          const parts = toastSymbol.split("/");
          const base = parts[0] || "BTC";
          const quote = parts[1] || "USDT";
          const cleanBase = base.replace(/_OTC$/i, "").replace(/OTC$/i, "").trim();
          const cleanQuote = quote.replace(/_OTC$/i, "").replace(/OTC$/i, "").trim();

          /* The same name the browser panel, the selector and the tab rail use.

             This was string surgery on the symbol — strip "OTC", print what is
             left — which for a stock left the quote currency attached and
             announced "Johnson & Johnson/USD". JNJ/USD is a pair in the shape of
             the string only; the instrument is a company, and the "/USD" is the
             currency it happens to be priced in, not part of its name. The rule
             for when a slash belongs (both sides are currencies) already existed
             and is now shared rather than approximated here. */
          const market = binaryMarkets.find(
            (m: any) => String(m?.symbol).toUpperCase() === String(toastSymbol).toUpperCase()
          );
          const displaySymbol = getFullTabDisplayName(market, cleanBase, cleanQuote);

          // Duration: prefer the pre-computed durationMinutes stored in notification data,
          // fall back to the expiryMinutes prop passed from the chart container.
          // Never compute from entryTime/expiryTime — they can differ by seconds due to
          // server latency, causing inconsistent timer values across simultaneous trades.
          const durationMinutes = data.durationMinutes ?? expiryMinutes ?? null;
          const durationText = durationMinutes != null ? formatMinutes(durationMinutes) : null;

          // Currency: always use the one stored in the notification data (account currency),
          // which is already multiplied by the correct exchange rate.
          const displayCurrency = data.currency || currency;

          const profit = data.profit ?? 0;
          const isZeroProfit = profit === 0;

          // A refund is neither win nor loss, and is coloured as neither: rose
          // would read as a loss for a trade that cost nothing.
          const isRefund = toast.type === "trade_refund";
          /* The win/loss colour, as the card's own left border.

             It was an absolutely positioned bar, whose square ends sat against
             the card's rounded corners and read as a sliver stuck to the outside
             rather than part of it. A border is the same signal without that
             problem: it follows the radius, so the colour turns the corner with
             the card instead of overhanging it.

             The colour is an inline value rather than a class for the same
             reason the asset tab needs one: border-zinc-200 and its dark
             counterpart set border-color for all four sides and outrank a
             single-class border-l-*, so the accent was being repainted the same
             grey as the rest of the box and no colour showed at all. */
          const accentColor = isWin ? "#10b981" : isRefund ? "#a1a1aa" : "#f43f5e";
          const textColor = isWin
            ? "text-emerald-700 dark:text-emerald-500"
            : isRefund || isZeroProfit
            ? "text-zinc-500 dark:text-zinc-400"
            : "text-rose-700 dark:text-rose-500";

          const isOTC = toastSymbol.toUpperCase().includes("OTC");
          const FIAT_CURRENCIES = new Set([
            "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL", "PKR", "BDT", "CNY", "CNH", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP", "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "THB"
          ]);
          const isSingle = isOTC && !FIAT_CURRENCIES.has(cleanBase.toUpperCase());

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
              style={{ borderLeftColor: accentColor }}
              /* w-full, not w-fit. The card sized itself to its own contents,
                 which is what actually made the stack ragged — the container's
                 width was never the constraint. */
              className={`relative w-full shrink-0 rounded border border-l-[3px] bg-white/97 border-zinc-200 shadow-[0_6px_20px_rgba(0,0,0,0.14)] dark:bg-[#151a25]/95 dark:border-[#2b313e]/85 dark:shadow-[0_6px_20px_rgba(0,0,0,0.6)] overflow-hidden pointer-events-auto flex items-center gap-2 py-2.5 px-2 select-none`}
            >
              {/* Currency icon rendering matching header tabs */}
              {isSingle ? (
                <div className="relative w-6 h-6 shrink-0 flex items-center justify-center select-none ml-0.5">
                  <div className="w-5.5 h-5.5 rounded-full overflow-hidden border border-zinc-300 dark:border-white/50 bg-zinc-900 shadow-sm">
                    <img
                      src={getCryptoImageUrl(cleanBase)}
                      alt={cleanBase}
                      className="object-cover w-full h-full"
                      onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
                      loading="lazy"
                    />
                  </div>
                </div>
              ) : (
                <div className="relative w-6 h-6 shrink-0 flex items-center justify-center select-none ml-0.5">
                  {/* Base Flag (top-left) */}
                  <div className="absolute left-0 top-0 w-[16px] h-[16px] rounded-full overflow-hidden border border-zinc-300 dark:border-white/50 bg-zinc-900 z-0 shadow-sm">
                    <img
                      src={getCryptoImageUrl(cleanBase)}
                      alt={cleanBase}
                      className="object-cover w-full h-full"
                      onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
                      loading="lazy"
                    />
                  </div>
                  {/* Quote Flag (in front, bottom-right) */}
                  <div className="absolute right-0 bottom-0 w-[16px] h-[16px] rounded-full overflow-hidden border border-zinc-300 dark:border-white/50 bg-zinc-900 z-10 shadow-sm">
                    <img
                      src={getCryptoImageUrl(cleanQuote)}
                      alt={cleanQuote}
                      className="object-cover w-full h-full"
                      onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
                      loading="lazy"
                    />
                  </div>
                </div>
              )}

              {/* Text content */}
              <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap flex items-center gap-1">
                  {/* Capped at the width a currency pair needs, and truncated
                      past it. The name was uncapped, so the toast sized itself
                      to whatever the instrument happened to be called:
                      ADANIPORTS made a visibly wider box than AUD/CAD, and a
                      stack of results was a stack of different rectangles. The
                      pair is the longest name that must never be cut — CAD/JPY
                      and CAD/JPX differ by the character an ellipsis eats —
                      so it sets the ceiling, and the long single tickers, which
                      have no such constraint, give way to it. */}
                  <span className="truncate max-w-[66px]">{displaySymbol}</span>
                  {/* No separator dot. It bought nothing a gap does not already
                      give, and every glyph on this line is width the toast has
                      to carry. */}
                  {durationText && (
                    <span className="text-zinc-500 dark:text-zinc-500 tabular-nums">{durationText}</span>
                  )}
                </div>
                <div className={`text-[12px] font-bold tracking-tight leading-none whitespace-nowrap ${textColor}`}>
                  {isRefund ? "Refunded" : formatAmount(profit, displayCurrency)}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});

export default ChartResultToasts;
