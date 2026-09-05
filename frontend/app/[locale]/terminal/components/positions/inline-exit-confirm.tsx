"use client";

/**
 * Exit confirmation, anchored to the Exit Position button.
 *
 * This replaced a full-screen AlertDialog, for the same reason the trade
 * confirmation stopped being one: a position is exited while the trader is
 * watching the candle that made them want out, and a dialog that dims the chart
 * and moves the controls to the centre of the screen interrupts exactly that.
 * Scale made the point — roughly 700px of dialog, three bordered sections and a
 * price table, to answer "take this now or not".
 *
 * It carries what the decision needs: what comes back, and what that is against
 * the stake. Entry and current price are gone. The close price is struck by the
 * server when the request lands, not when the card is drawn, so a price shown
 * here is stale the moment it is read — and it was the panel's own chart price,
 * which belongs to whatever instrument the chart is showing rather than to this
 * position, and was frequently 0. That is what rendered "Current Price: 0.00
 * (-100.00%)" beside a position claiming to be in profit.
 *
 * There is deliberately no countdown. The trade confirmation auto-confirms
 * because the trader has already chosen to trade and the timer only paces it;
 * exiting a live position on a timer would close trades nobody asked to close.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { confirmCardPalette, type TerminalTheme } from "../../lib/confirm-card-theme";

interface InlineExitConfirmProps {
  /** Net return if this is taken now — stake plus winnings, less the fee. */
  exitValue: number;
  /** That value against the stake: positive is a gain, negative a loss. */
  netChange: number;
  /** Early-close fee already deducted from exitValue, if any. */
  fee: number;
  /** What the trader put in. Called "invest" everywhere the terminal shows it. */
  invested: number;
  currencySymbol: string;
  isWinning: boolean;
  /** Blocked with a reason (too soon after entry, too close to expiry). */
  blockedReason?: string | null;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /* Which of the three themes, not whether it is dark. Navy is its own palette
     and was being painted with the dark one. */
  theme?: TerminalTheme;
  /** Fill the height the caller allotted, rather than the content's own. */
  fill?: boolean;
}

export default function InlineExitConfirm({
  exitValue,
  netChange,
  fee,
  invested,
  currencySymbol,
  isWinning,
  blockedReason,
  error,
  onConfirm,
  onCancel,
  theme = "dark",
  fill = false,
}: InlineExitConfirmProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const money = (n: number) =>
    `${currencySymbol}${Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const handleConfirm = useCallback(async () => {
    if (isProcessing || blockedReason) return;
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      // Unlike the trade confirmation, this stays mounted on failure so the
      // reason can be read, so the button has to become pressable again.
      setIsProcessing(false);
    }
  }, [isProcessing, blockedReason, onConfirm]);

  /* Escape cancels, matching the trade confirmation. Capture phase, because the
     chart's drawing tools listen for the same key and would otherwise consume
     it first. */
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
  const accentText = isWinning ? palette.up : palette.down;
  const accentBg = isWinning
    ? "bg-emerald-500 hover:bg-emerald-400"
    : "bg-orange-500 hover:bg-orange-400";
  const { shell, muted, strong } = palette;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      /* Shadow, because it floats over the chart and has to separate from the
         candles rather than blend into a panel. */
      className={`rounded-xl border p-2.5 flex flex-col gap-2 shadow-2xl backdrop-blur-sm ${shell} ${
        fill ? "h-full justify-center" : ""
      }`}
      data-tutorial="exit-confirm"
    >
      {/* nowrap throughout: this card sits beside the chart at a fixed width,
          and a wrapped figure is what made the first version read as cramped. */}
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        <span className={`text-[11px] font-bold uppercase tracking-[0.08em] ${accentText}`}>
          Exit Now
        </span>
        {/* "Invest", the word the order panel and the position rows already use
            for the same figure. */}
        <span className={`text-[11px] font-medium ${muted}`}>
          Invest {money(invested)}
        </span>
      </div>

      {/* Two figures to a row, never three.

          The fee used to trail the net change on this line, so at a ₹250,000
          stake the row carried "₹430,460.66", "+₹180,460.66" and "fee ₹9,539.34"
          across 268px of nowrap card and simply ran out past the edge — the fee,
          the one figure a trader has not agreed to yet, being the part that left
          the box.

          It gets its own line, which also suits it better: the two figures above
          are the deal, and the fee is the qualification on them. Decimals stay
          at two throughout, unlike the panel strips, because this is the last
          screen before real money moves and rounding here would be quoting a
          number that is not the number. */}
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
        <span className={`text-[13px] font-bold tabular-nums truncate ${strong}`}>
          {money(exitValue)}
        </span>
        <span
          className={`text-[13px] font-bold tabular-nums shrink-0 ${
            netChange >= 0 ? palette.up : palette.down
          }`}
        >
          {netChange >= 0 ? "+" : "−"}
          {money(netChange)}
        </span>
      </div>

      {fee > 0 && (
        <div
          className={`flex items-baseline justify-between gap-2 whitespace-nowrap text-[11px] font-semibold ${muted}`}
        >
          <span className="truncate">Early-close fee</span>
          <span className="tabular-nums shrink-0">−{money(fee)}</span>
        </div>
      )}

      {(blockedReason || error) && (
        <div
          className={`text-[10.5px] font-medium leading-tight px-1.5 py-1 rounded-md ${palette.notice}`}
        >
          {blockedReason || error}
        </div>
      )}

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
          disabled={isProcessing || !!blockedReason}
          className={`flex-1 h-[36px] rounded-lg text-[12px] font-bold text-white transition-colors ${accentBg} ${
            isProcessing || blockedReason ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            {isProcessing ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Closing…
              </>
            ) : (
              "Exit Position"
            )}
          </span>
        </button>
      </div>
    </motion.div>
  );
}
