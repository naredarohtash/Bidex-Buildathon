"use client";

/**
 * Dynamic Trading Buttons Component
 *
 * Displays trading buttons that adapt to the selected binary order type.
 * Each type has different sides (RISE/FALL, HIGHER/LOWER, etc.)
 */

import type {
  BinaryOrderType,
  OrderSide,
} from "@/types/binary-trading";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { getChartSynchronizedTime } from "@/utils/time-sync";
import {
  RiseIcon,
  FallIcon,
  HigherIcon,
  LowerIcon,
  TouchIcon,
  NoTouchIcon,
  CallIcon,
  PutIcon,
  TurboUpIcon,
  TurboDownIcon,
} from "./order-type-icons";

// ============================================================================
// TYPES
// ============================================================================

interface DynamicTradingButtonsProps {
  orderType: BinaryOrderType;
  handlePlaceOrder: (side: OrderSide) => void | Promise<void>;
  profitPercentage: number;
  disabled?: boolean;
  isMobile?: boolean;
  darkMode?: boolean;
  oneClickEnabled?: boolean;
  isLoading?: boolean;
  isCooldownActive?: boolean;
  isDailyLimitReached?: boolean;
  /** Epoch ms the cooldown lifts at, so the reason line can count down. */
  cooldownEndsAt?: number;
}

// ============================================================================
// BUTTON CONFIGURATION
// ============================================================================

type ButtonConfig = {
  side: OrderSide;
  label: string;
  icon: React.ElementType;
  bgClass: string;
  glowClass: string;
  activeClass: string;
};

const BUTTON_CONFIGS: Record<BinaryOrderType, [ButtonConfig, ButtonConfig]> = {
  RISE_FALL: [
    {
      side: "RISE",
      label: "Call",
      icon: RiseIcon,
      bgClass: "bg-[#089981] hover:bg-[#09a88d] active:bg-[#078570]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(8,153,129,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
    {
      side: "FALL",
      label: "Put",
      icon: FallIcon,
      bgClass: "bg-[#f23645] hover:bg-[#f34e5b] active:bg-[#d02e3b]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(242,54,69,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
  ],
  HIGHER_LOWER: [
    {
      side: "HIGHER",
      label: "Higher",
      icon: HigherIcon,
      bgClass: "bg-[#2563eb] hover:bg-[#3b82f6] active:bg-[#1d4ed8]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(37,99,235,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
    {
      side: "LOWER",
      label: "Lower",
      icon: LowerIcon,
      bgClass: "bg-[#7c3aed] hover:bg-[#8b5cf6] active:bg-[#6d28d9]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(124,58,237,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
  ],
  TOUCH_NO_TOUCH: [
    {
      side: "TOUCH",
      label: "Touch",
      icon: TouchIcon,
      bgClass: "bg-[#d97706] hover:bg-[#f59e0b] active:bg-[#b45309]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(217,119,6,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
    {
      side: "NO_TOUCH",
      label: "No Touch",
      icon: NoTouchIcon,
      bgClass: "bg-[#475569] hover:bg-[#64748b] active:bg-[#334155]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(71,85,105,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
  ],
  CALL_PUT: [
    {
      side: "CALL",
      label: "Call",
      icon: CallIcon,
      bgClass: "bg-[#089981] hover:bg-[#09a88d] active:bg-[#078570]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(8,153,129,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
    {
      side: "PUT",
      label: "Put",
      icon: PutIcon,
      bgClass: "bg-[#f23645] hover:bg-[#f34e5b] active:bg-[#d02e3b]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(242,54,69,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
  ],
  TURBO: [
    {
      side: "UP",
      label: "Up",
      icon: TurboUpIcon,
      bgClass: "bg-[#d97706] hover:bg-[#f59e0b] active:bg-[#b45309]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(217,119,6,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
    {
      side: "DOWN",
      label: "Down",
      icon: TurboDownIcon,
      bgClass: "bg-[#7c3aed] hover:bg-[#8b5cf6] active:bg-[#5b21b6]",
      glowClass: "hover:shadow-[0_0_20px_5px_rgba(124,58,237,0.30)]",
      activeClass: "active:scale-[0.985]",
    },
  ],
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function DynamicTradingButtons({
  orderType,
  handlePlaceOrder,
  profitPercentage,
  disabled = false,
  isMobile = false,
  darkMode = true,
  isLoading = false,
  isCooldownActive = false,
  isDailyLimitReached = false,
  cooldownEndsAt,
}: DynamicTradingButtonsProps) {
  const t = useTranslations("binary_components");
  const [button1, button2] = BUTTON_CONFIGS[orderType];
  const isLocked = isCooldownActive || isDailyLimitReached;

  // Ticks only while a cooldown is actually counting down, so the panel is not
  // re-rendering every second the rest of the time.
  const [nowTs, setNowTs] = useState(() => getChartSynchronizedTime().getTime());
  useEffect(() => {
    if (!isCooldownActive || !cooldownEndsAt) return;
    setNowTs(getChartSynchronizedTime().getTime());
    const id = setInterval(() => setNowTs(getChartSynchronizedTime().getTime()), 1000);
    return () => clearInterval(id);
  }, [isCooldownActive, cooldownEndsAt]);

  const cooldownLeftMs = cooldownEndsAt ? Math.max(0, cooldownEndsAt - nowTs) : 0;
  const lockReason = isCooldownActive
    ? cooldownLeftMs > 0
      ? `Cooldown ${Math.floor(cooldownLeftMs / 60000)}:${String(Math.floor((cooldownLeftMs % 60000) / 1000)).padStart(2, "0")}`
      : "Cooldown period"
    : "Daily limit reached";

  const renderButton = (config: ButtonConfig) => {
    const Icon = config.icon;

    return (
      <div key={config.side} className="relative">
      <button
        onClick={() => handlePlaceOrder(config.side)}
        disabled={disabled || isLoading || isLocked}
        className={`
          w-full h-[57px] relative cursor-pointer
          ${config.bgClass}
          ${config.glowClass}
          ${config.activeClass}
          text-white px-4 rounded-lg shadow-sm
          flex items-center justify-between font-bold text-sm
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-all duration-100 ease-out
        `}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 w-full">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            <span>{t("placing_ellipsis")}</span>
          </div>
        ) : (
          <>
            {!isLocked && (
              <span className="text-[15px] font-bold uppercase tracking-wide text-white leading-none font-sans">
                {config.label}
              </span>
            )}
            <div className={`flex items-center justify-center w-9 h-9 rounded-full bg-white/15 border border-white/10 shrink-0 ${isLocked ? "ml-auto" : ""}`}>
              <Icon size={18} className="text-white" />
            </div>
          </>
        )}
      </button>
      {isLocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[4px] pointer-events-none">
          <div className={`flex items-center gap-1 ${darkMode ? "text-white/65" : "text-zinc-900/55"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] font-sans leading-none">Trading Paused</span>
          </div>
          <span className={`text-[10px] font-medium font-sans leading-none tabular-nums ${darkMode ? "text-white/45" : "text-zinc-900/40"}`}>
            {lockReason}
          </span>
        </div>
      )}
      </div>
    );
  };

  const containerClass = "p-2";

  return (
    <div className={`${containerClass} relative`}>
      <div className="flex flex-col gap-2">
        {renderButton(button1)}
        {renderButton(button2)}
      </div>

    </div>
  );
}
