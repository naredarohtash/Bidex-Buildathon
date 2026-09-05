"use client";
// v3: manual entry only — the quick-amount / % / suggestion dropdown was removed.

import React, { useRef, useEffect, useState, memo } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";

// Kept in step with the popup's `maxWidth` below — the clamp needs the number.
const NOTICE_WIDTH_PX = 220;

interface AmountSelectorProps {
  amount: number;
  balance: number;
  increaseAmount: () => void;
  decreaseAmount: () => void;
  setAmount: (amount: number) => void;
  darkMode?: boolean;
  // Market limits
  minAmount?: number;
  maxAmount?: number;
  /**
   * Shown when the trader asks for more than `maxAmount`. Passed in rather than built
   * here so the wording stays with the code that knows about account levels.
   */
  maxAmountNotice?: string;
  currencySymbol?: string;
  /**
   * Phone sizing. The steppers are 17px squares here, which is fine beside a
   * mouse and roughly a third of the 44px a thumb needs; the mode toggle and
   * the value row are sized to match. Nothing about the behaviour changes.
   */
  isMobile?: boolean;
}

function amountValueClasses(value: string | number): string {
  const str = String(value);
  if (str.length >= 8) return "text-[17px] tracking-tight"; // e.g. "1,000,000"
  if (str.length >= 7) return "text-[17px] tracking-tight"; // e.g. "250,000"
  return "text-[19px] tracking-tight"; // Standard fits comfortably up to 6 chars (e.g. "10,000")
}

// PERFORMANCE: Wrapped in React.memo to prevent unnecessary re-renders
// This component only needs to re-render when its props actually change
const AmountSelector = memo(function AmountSelector({
  amount,
  balance,
  increaseAmount,
  decreaseAmount,
  setAmount,
  darkMode = true,
  minAmount = 100,
  maxAmount,
  maxAmountNotice,
  currencySymbol = "$",
  isMobile = false,
}: AmountSelectorProps) {
  const percentValue = Math.max(1, Math.min(100, Math.round((amount / balance) * 100)));

  const percentInputRef = useRef<HTMLInputElement>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme } = useTheme();
  const [mountedFlag, setMountedFlag] = useState(false);
  useEffect(() => {
    setMountedFlag(true);
  }, []);
  const isNavy = mountedFlag && resolvedTheme === "navy";

  const [inputValue, setInputValue] = useState(amount.toString());
  const [isPercentMode, setIsPercentMode] = useState(false);
  const [percentInputVal, setPercentInputVal] = useState(percentValue.toString());
  // Raised when the trader asks for more than the ceiling. The input still clamps —
  // this only explains why the figure stopped climbing, which is otherwise silent
  // and reads like the field is broken.
  const [showLimitNotice, setShowLimitNotice] = useState(false);
  const [noticeAnchor, setNoticeAnchor] = useState<{ top: number; left: number; arrowLeft: number } | null>(null);
  const limitNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  // The popup is wider than the amount card, and the order panel sits against the
  // right edge of the terminal, so left-aligning it to the card can push it off
  // screen on narrow layouts. Clamp the box and move the arrow to compensate, so it
  // keeps pointing at the field it belongs to.
  const anchorFrom = (rect: DOMRect) => {
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - NOTICE_WIDTH_PX - 8));
    const arrowLeft = Math.min(NOTICE_WIDTH_PX - 16, Math.max(8, rect.left + 16 - left));
    return { top: rect.top, left, arrowLeft };
  };

  const raiseLimitNotice = () => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) setNoticeAnchor(anchorFrom(rect));
    setShowLimitNotice(true);
    if (limitNoticeTimer.current) clearTimeout(limitNoticeTimer.current);
    limitNoticeTimer.current = setTimeout(() => setShowLimitNotice(false), 4000);
  };

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => () => {
    if (limitNoticeTimer.current) clearTimeout(limitNoticeTimer.current);
  }, []);

  // The popup is fixed-positioned, so it would detach from the card if either moved
  // while it is up. Only listens while it is actually showing.
  useEffect(() => {
    if (!showLimitNotice) return;
    const sync = () => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (rect) setNoticeAnchor(anchorFrom(rect));
    };
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [showLimitNotice]);

  useEffect(() => {
    setInputValue(amount > 0 ? amount.toLocaleString() : "");
  }, [amount]);

  useEffect(() => {
    setPercentInputVal(percentValue.toString());
  }, [percentValue]);

  // Percent mode computes off the balance, so it can still land above the ceiling.
  const stakeCeiling = maxAmount || balance;
  const applyAmount = (requested: number) => {
    if (requested > stakeCeiling) raiseLimitNotice();
    else setShowLimitNotice(false);
    setAmount(Math.min(requested, stakeCeiling));
  };

  const focusInput = () => {
    if (isPercentMode) percentInputRef.current?.focus();
    else amountInputRef.current?.focus();
  };

  const handlePercentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value.replace(/[^\d]/g, "");
    setPercentInputVal(valStr);
    const val = Number.parseInt(valStr);
    if (!isNaN(val)) {
      const clampedPercent = Math.min(Math.max(val, 1), 100);
      applyAmount(Math.floor(balance * (clampedPercent / 100)));
    }
  };

  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value.replace(/[^\d]/g, "");
    const val = Number.parseInt(valStr);
    if (!isNaN(val)) {
      const clampLimit = maxAmount || balance;
      if (val > clampLimit) {
        raiseLimitNotice();
        const limitAmt = Math.floor(clampLimit);
        setInputValue(limitAmt.toLocaleString());
        setAmount(limitAmt);
      } else {
        setShowLimitNotice(false);
        setInputValue(val.toLocaleString());
        setAmount(val);
      }
    } else {
      setInputValue("");
      setAmount(0);
    }
  };

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPercentMode) {
      const nextPercent = Math.max(1, percentValue - 1);
      applyAmount(Math.max(minAmount, Math.round(balance * (nextPercent / 100))));
    } else {
      decreaseAmount();
    }
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPercentMode) {
      const nextPercent = Math.min(100, percentValue + 1);
      applyAmount(Math.min(balance, Math.round(balance * (nextPercent / 100))));
    } else {
      increaseAmount();
    }
  };

  const isDecreaseDisabled = isPercentMode ? percentValue <= 1 : amount <= minAmount;
  const isIncreaseDisabled = isPercentMode ? percentValue >= 100 : amount >= Math.min(balance, maxAmount || balance);

  return (
    <div className="relative flex-1 sf-pro-selectors">
      {/* Stake ceiling popup. Floats above the card instead of sitting inside it: an
          in-flow notice grew the card by ~60px and pushed the CALL/PUT buttons down
          under the trader's cursor mid-click. Portalled because the order panel
          clips — the same reason the old amount dropdown was portalled. */}
      {showLimitNotice && maxAmountNotice && noticeAnchor && isMounted &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className={`fixed z-[9999] w-max pointer-events-none
              animate-in fade-in slide-in-from-bottom-1 duration-150
              flex items-center gap-1.5 rounded-lg pl-2 pr-2.5 py-1.5 border shadow-xl ${
              darkMode
                ? "bg-zinc-900 border-amber-500/40 shadow-black/50"
                : "bg-white border-amber-300 shadow-amber-950/10"
            }`}
            style={{
              top: noticeAnchor.top - 8,
              left: noticeAnchor.left,
              maxWidth: NOTICE_WIDTH_PX,
              transform: "translateY(-100%)",
            }}
          >
            <AlertCircle size={12} strokeWidth={2.5} className="text-amber-500 shrink-0" />
            <span className={`text-[10px] leading-[1.35] font-semibold ${
              darkMode ? "text-amber-200" : "text-amber-800"
            }`}>
              {maxAmountNotice}
            </span>
            {/* Arrow, pointing back down at the amount field. */}
            <span
              className={`absolute top-full -mt-[5px] w-2 h-2 rotate-45 border-r border-b ${
                darkMode
                  ? "bg-zinc-900 border-amber-500/40"
                  : "bg-white border-amber-300"
              }`}
              style={{ left: noticeAnchor.arrowLeft }}
            />
          </div>,
          document.body
        )}

      {/* zinc-700, not zinc-800.

          The border was #27272a on a panel of roughly #121214 — about three
          points of luminance between the box and what it sits on, which is not
          an edge so much as a suggestion of one. These two boxes are where the
          trader types the stake and the expiry, so they are the last controls
          that should have to be found by guessing at where they begin. The navy
          theme had the same problem from the same cause and moves with it. Light
          is untouched: zinc-300 on white was already reading. */}
      <div
        ref={cardRef}
        className={`relative rounded-lg cursor-text transition-all duration-300 ${
          isMobile
            ? "h-[46px] overflow-visible"
            : `overflow-hidden ${
                isNavy
                  ? "bg-black/15 border border-[#22345c] shadow-sm hover:border-[#2c4374]"
                  : darkMode
                    ? "bg-black/20 border border-[#2a2d36] shadow-sm hover:border-[#383c48]"
                    : "bg-zinc-50/40 border border-zinc-300 shadow-sm hover:border-zinc-400"
              }`
        }`}
        onClick={focusInput}
      >
        {isMobile ? (
          /* One bordered field — minus, value, plus sharing a single edge —
             rather than the value box and a separate stepper pair beside it.
             Two boxes read as two controls; the trader only ever operates
             one. The %/currency switch stays, floated on the top border the
             same way the label is, so it reads as a property of the field
             instead of a third box competing with it. */
          <div className="relative h-full flex items-center px-1.5">
            <span
              className={`absolute -top-[7px] left-2.5 z-20 px-1 text-[11px] font-semibold leading-none bg-white dark:bg-[#0f1115] ${darkMode ? "text-zinc-400" : "text-zinc-500"}`}
            >
              Amount
            </span>

            <div
              className={`flex-1 h-9 flex items-center rounded-md border transition-all cursor-text overflow-hidden focus-within:ring-2 ${
                isNavy
                  ? "bg-black/20 border-[#2a3f6b] focus-within:border-emerald-500/70 focus-within:ring-emerald-500/10"
                  : darkMode
                    ? "bg-black/35 border-[#333742] focus-within:border-emerald-500/70 focus-within:ring-emerald-500/20"
                    : "bg-zinc-50 border-zinc-300 focus-within:border-emerald-500 focus-within:ring-emerald-550/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                focusInput();
              }}
            >
              <button
                aria-label="Decrease amount"
                className={`m-1 w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center transition-all duration-100 ${
                  isDecreaseDisabled
                    ? darkMode
                      ? "bg-zinc-900/50 text-zinc-700 cursor-not-allowed"
                      : "bg-zinc-100/50 text-zinc-300 cursor-not-allowed"
                    : darkMode
                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white active:scale-[0.92] active:bg-zinc-900 cursor-pointer"
                      : "bg-zinc-150 hover:bg-zinc-200 text-zinc-650 hover:text-zinc-900 active:scale-[0.92] active:bg-zinc-300/80 cursor-pointer"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDecrease(e);
                }}
                disabled={isDecreaseDisabled}
              >
                <Minus size={14} className="stroke-[2.5]" />
              </button>

              <div className="flex-1 min-w-0 flex items-center justify-center gap-0.5">
                {isPercentMode ? (
                  <>
                    <input
                      ref={percentInputRef}
                      type="text"
                      inputMode="numeric"
                      className={`${amountValueClasses(percentInputVal)} font-numeric font-extrabold tabular-nums bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 text-right cursor-text max-w-[64px] ${
                        darkMode ? "text-white" : "text-zinc-900"
                      }`}
                      value={percentInputVal}
                      onChange={handlePercentInputChange}
                      onClick={(e) => e.stopPropagation()}
                    />
                    {/* The unit glyph doubles as the mode switch — one tap target
                        instead of a separate pill fighting the label for the same
                        sliver of space above the border. */}
                    <button
                      aria-label="Switch to amount"
                      title="Switch to amount"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPercentMode(false);
                      }}
                      className={`shrink-0 text-[15px] font-numeric font-bold select-none rounded px-1 py-0.5 -mr-1 transition-colors cursor-pointer ${
                        darkMode ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                      }`}
                    >
                      %
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      aria-label="Switch to percent"
                      title="Switch to percent"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsPercentMode(true);
                      }}
                      className={`shrink-0 text-[15px] font-numeric font-bold select-none rounded px-1 py-0.5 -ml-1 transition-colors cursor-pointer ${
                        darkMode ? "text-zinc-400 hover:text-white hover:bg-zinc-800" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200"
                      }`}
                    >
                      {currencySymbol}
                    </button>
                    <input
                      ref={amountInputRef}
                      type="text"
                      inputMode="numeric"
                      className={`${amountValueClasses(inputValue)} font-numeric font-extrabold tabular-nums bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 text-left cursor-text max-w-[84px] ${
                        darkMode ? "text-white" : "text-zinc-900"
                      }`}
                      value={inputValue}
                      onChange={handleAmountInputChange}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </>
                )}
              </div>

              <button
                aria-label="Increase amount"
                className={`m-1 w-[26px] h-[26px] shrink-0 rounded-full flex items-center justify-center transition-all duration-100 ${
                  isIncreaseDisabled
                    ? darkMode
                      ? "bg-zinc-900/50 text-zinc-700 cursor-not-allowed"
                      : "bg-zinc-100/50 text-zinc-300 cursor-not-allowed"
                    : darkMode
                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white active:scale-[0.92] active:bg-zinc-900 cursor-pointer"
                      : "bg-zinc-150 hover:bg-zinc-200 text-zinc-650 hover:text-zinc-900 active:scale-[0.92] active:bg-zinc-300/80 cursor-pointer"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleIncrease(e);
                }}
                disabled={isIncreaseDisabled}
              >
                <Plus size={14} className="stroke-[2.5]" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col pt-3 pb-1.5 px-1.5">
            {/* Header */}
            <div className="flex justify-between items-center h-5">
              {/* 13px, held deliberately against the terminal's 95% scale. These
                  two words label the only inputs on the panel that take a value,
                  and at 11px they read as a caption rather than a field label. */}
              <span className={`text-[13px] font-extrabold tracking-wide ${darkMode ? "text-zinc-200" : "text-zinc-700"}`}>
                Amount
              </span>

              {/* Separated Flat Buttons */}
              <div className="flex items-center gap-1">
                <button
                  aria-label="Decrease amount"
                  className={`w-[17px] h-[17px] rounded-md flex items-center justify-center transition-all duration-100 ${
                    isDecreaseDisabled
                      ? darkMode
                        ? "bg-zinc-900/50 border border-zinc-800/80 text-zinc-700 cursor-not-allowed"
                        : "bg-zinc-100/50 border border-zinc-200 text-zinc-300 cursor-not-allowed"
                      : darkMode
                        ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/80 active:scale-[0.92] active:bg-zinc-900 active:text-zinc-400 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.7)] cursor-pointer"
                        : "bg-zinc-50 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 border border-zinc-250 active:scale-[0.92] active:bg-zinc-300/80 active:text-zinc-700 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.15)] cursor-pointer"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDecrease(e);
                  }}
                  disabled={isDecreaseDisabled}
                >
                  <Minus size={9.5} className="stroke-[2.5]" />
                </button>

                <button
                  aria-label="Increase amount"
                  className={`w-[17px] h-[17px] rounded-md flex items-center justify-center transition-all duration-100 ${
                    isIncreaseDisabled
                      ? darkMode
                        ? "bg-zinc-900/50 border border-zinc-800/80 text-zinc-700 cursor-not-allowed"
                        : "bg-zinc-100/50 border border-zinc-200 text-zinc-300 cursor-not-allowed"
                      : darkMode
                        ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700/80 active:scale-[0.92] active:bg-zinc-900 active:text-zinc-400 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.7)] cursor-pointer"
                        : "bg-zinc-50 hover:bg-zinc-100 text-zinc-650 hover:text-zinc-900 border border-zinc-250 active:scale-[0.92] active:bg-zinc-300/80 active:text-zinc-700 active:shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.15)] cursor-pointer"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIncrease(e);
                  }}
                  disabled={isIncreaseDisabled}
                >
                  <Plus size={9.5} className="stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Amount Input Box */}
            <div
              /* The inner edges sit a step above the card that holds them.

                  The value field and the mode pill were bordered zinc-800 and
                  zinc-700 at 20% — on a bg-black/35 fill that is very close to no
                  edge at all, so the field a trader types the stake into had no
                  visible boundary inside a card that did. These are small shapes,
                  so a slightly stronger line costs the panel almost no overall
                  brightness while making the control legible; the card around them
                  stays quieter, which keeps the nesting readable. */
              className={`flex items-center px-1 rounded-md border transition-all cursor-text overflow-hidden focus-within:ring-2 w-full h-10 mt-1.5 ${
                isNavy
                  ? "bg-black/20 border-[#2a3f6b] hover:border-[#35508a] focus-within:border-emerald-500/70 focus-within:ring-emerald-500/10"
                  : darkMode
                    ? "bg-black/35 border-[#333742] hover:border-[#3d4250] focus-within:border-emerald-500/70 focus-within:ring-emerald-500/20"
                    : "bg-zinc-50 border-zinc-300 hover:border-zinc-400 focus-within:border-emerald-500 focus-within:ring-emerald-550/15 shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)]"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                focusInput();
              }}
            >
              {/* Symbol and figure are one group, centred together. Baseline alignment
                  put the mark on the digits.' baseline, which reads low next to a
                  figure this much larger; optical centring is what looks right here. */}
              <div className="flex-1 min-w-0 flex items-center gap-0.5">
              {isPercentMode ? (
                <>
                  <input
                    ref={percentInputRef}
                    type="text"
                    inputMode="numeric"
                    className={`${amountValueClasses(percentInputVal)} font-numeric font-extrabold tabular-nums bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 text-left cursor-text flex-1 min-w-0 ${
                      darkMode ? "text-white" : "text-zinc-900"
                    }`}
                    value={percentInputVal}
                    onChange={handlePercentInputChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className={`text-[16px] font-numeric font-bold select-none shrink-0 ${darkMode ? "text-zinc-400" : "text-zinc-500"}`}>
                    %
                  </span>
                </>
              ) : (
                <>
                  <span className={`text-[16px] font-numeric font-bold select-none shrink-0 ${darkMode ? "text-zinc-400" : "text-zinc-500"}`}>
                    {currencySymbol}
                  </span>
                  <input
                    ref={amountInputRef}
                    type="text"
                    inputMode="numeric"
                    className={`${amountValueClasses(inputValue)} font-numeric font-extrabold tabular-nums bg-transparent border-none outline-none focus:outline-none focus:ring-0 p-0 text-left cursor-text flex-1 min-w-0 ${
                      darkMode ? "text-white" : "text-zinc-900"
                    }`}
                    value={inputValue}
                    onChange={handleAmountInputChange}
                    onClick={(e) => e.stopPropagation()}
                  />
                </>
              )}
              </div>
            </div>

            <div className="relative w-full mt-2 h-[27px] flex items-center p-[2px] rounded-full border overflow-hidden select-none border-zinc-200/60 dark:border-zinc-800/80 bg-zinc-250/20 dark:bg-black/30">
              {/* Sliding Pill Background Indicator */}
              <div
                className={`absolute top-[2px] bottom-[2px] w-[calc(50%-3px)] rounded-md ${
                  isNavy
                    ? "bg-[#1c2a4a]/60 border border-[#2f4a7d]"
                    : darkMode
                      ? "bg-zinc-800 border border-[#3a3f4c]"
                      : "bg-white shadow-sm border border-zinc-200"
                }`}
                style={{
                  transform: !isPercentMode ? "translateX(0)" : "translateX(100%)",
                  left: "2px",
                  transition: "transform 255ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                }}
              />

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPercentMode(false);
                }}
                className={`flex-1 h-full flex items-center justify-center text-center text-[10px] font-bold tracking-normal z-10 transition-colors duration-200 cursor-pointer ${
                  !isPercentMode
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {currencySymbol}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPercentMode(true);
                }}
                className={`flex-1 h-full flex items-center justify-center text-center text-[10px] font-bold tracking-normal z-10 transition-colors duration-200 cursor-pointer ${
                  isPercentMode
                    ? "text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                %
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default AmountSelector;