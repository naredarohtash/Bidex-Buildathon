"use client";

/**
 * Trade confirmation, in place of the CALL/PUT buttons.
 *
 * This replaced a modal dialog, which was the wrong shape for the decision it
 * was asking about. A binary trade is confirmed in about two seconds while the
 * trader is watching the candle that prompted it — and the dialog opened over
 * the chart, dimmed it, and moved the controls to the middle of the screen.
 * It interrupted the one thing the confirmation exists to protect.
 *
 * So it renders into the footprint the buttons already occupy: the hand is
 * already there, the chart stays visible and undimmed, and confirming is the
 * same gesture as opening, one row lower.
 *
 * Entry price is deliberately absent. A binary option's entry is struck when the
 * order executes, not when it is confirmed, so any price shown here is either
 * stale by the time it matters or — as it was in practice, because the panel's
 * price can still be 0 at this point — simply blank. A figure that is sometimes
 * wrong and sometimes empty is worse than one that was never promised.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { confirmCardPalette, type TerminalTheme } from "../../lib/confirm-card-theme";

const CONFIRM_SECONDS = 10;

interface InlineTradeConfirmProps {
  side: "CALL" | "PUT";
  amount: number;
  profitPercentage: number;
  currencySymbol: string;
  expiryLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /* Which of the three themes, not whether it is dark. Navy is its own palette
     and was being painted with the dark one. */
  theme?: TerminalTheme;
  /* Stretch to the height the caller has given it, rather than taking the
     height of its own content. Mobile covers a fixed region of the panel — see
     the placement effect in order-panel — so the card has to fill that region
     exactly or the controls behind it show through at one edge. */
  fill?: boolean;
}

export default function InlineTradeConfirm({
  side,
  amount,
  profitPercentage,
  currencySymbol,
  expiryLabel,
  onConfirm,
  onCancel,
  theme = "dark",
  fill = false,
}: InlineTradeConfirmProps) {
  const [countdown, setCountdown] = useState(CONFIRM_SECONDS);
  const [isProcessing, setIsProcessing] = useState(false);

  const isCall = side === "CALL";
  const profit = (amount * profitPercentage) / 100;

  const money = (n: number) =>
    `${currencySymbol}${n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const handleConfirm = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await onConfirm();
    } catch {
      setIsProcessing(false);
    }
  }, [isProcessing, onConfirm]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0 && !isProcessing) handleConfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  /* Escape cancels.
     The dialog this replaced was a Radix Dialog, which handled Escape itself, so
     dropping down to a plain card silently removed the only dismissal that did
     not require finding a button. That matters more here than it usually would:
     this card confirms itself when the countdown reaches zero, so a trader who
     turns away has a trade placed, and taking away the fastest way to stop it
     leaves fewer exits than the modal had.

     Capture phase, because the card is the topmost transient thing on screen and
     Escape belongs to it first — the chart's drawing tools listen for it too, and
     without this the same keypress would cancel a drawing instead of the trade.
     Ignored once the order is away: closing the card would not recall it. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isProcessing) return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isProcessing, onCancel]);

  const palette = confirmCardPalette(theme);
  const accentText = isCall ? palette.up : palette.down;
  const accentBg = isCall
    ? "bg-emerald-500 hover:bg-emerald-400"
    : "bg-red-500 hover:bg-red-400";
  const { shell, muted, strong } = palette;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      /* shadow, because it floats over the chart now and needs to separate from
         the candles behind it rather than blend into the panel. */
      /* When filling a taller region the three rows are centred rather than
         packed at the top, so the extra height reads as deliberate spacing
         instead of a card that fell short of its box. */
      className={`rounded-xl border p-2.5 flex flex-col gap-2 shadow-2xl backdrop-blur-sm ${shell} ${
        fill ? "h-full justify-center" : ""
      }`}
      data-tutorial="trade-confirm"
    >
      {/* Three figures, each on one line: direction, stake, and what it returns.
          nowrap throughout — the earlier version wrapped the payout under the
          stake, which is what made it read as congested. */}
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        <span className={`text-[11px] font-bold uppercase tracking-[0.08em] ${accentText}`}>
          {isCall ? "Call · Up" : "Put · Down"}
        </span>
        <span className={`text-[11px] font-medium ${muted}`}>{expiryLabel}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
        <span className={`text-[13px] font-bold tabular-nums ${strong}`}>{money(amount)}</span>
        <span className={`text-[13px] font-bold tabular-nums ${palette.up}`}>
          +{money(profit)}
          <span className="opacity-60 font-semibold text-[11px]"> {profitPercentage}%</span>
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className={`w-[38%] h-[36px] rounded-lg text-[12px] font-semibold border transition-colors ${
            palette.cancel
          } ${isProcessing ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={isProcessing}
          className={`flex-1 h-[36px] rounded-lg text-[12px] font-bold text-white relative overflow-hidden transition-colors ${accentBg} ${
            isProcessing ? "opacity-75 cursor-not-allowed" : ""
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            {isProcessing ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Placing…
              </>
            ) : (
              <>
                Confirm
                <span className="tabular-nums opacity-75">· {countdown}s</span>
              </>
            )}
          </span>
          {!isProcessing && (
            <motion.div
              className="absolute bottom-0 left-0 h-[2px] bg-white/40"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: CONFIRM_SECONDS, ease: "linear" }}
            />
          )}
        </button>
      </div>
    </motion.div>
  );
}
