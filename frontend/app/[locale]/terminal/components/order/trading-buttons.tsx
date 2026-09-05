"use client";

import { ArrowUp, ArrowDown } from "lucide-react";
import type { OrderSide } from "@/store/trade/use-binary-store";
import { useTranslations } from "next-intl";

interface TradingButtonsProps {
  handlePlaceOrder: (side: OrderSide) => void;
  profitPercentage: number;
  disabled?: boolean;
  isMobile?: boolean;
  darkMode?: boolean;
  oneClickEnabled?: boolean;
}

export default function TradingButtons({
  handlePlaceOrder,
  profitPercentage,
  disabled = false,
  isMobile = false,
  darkMode = true,
  oneClickEnabled = false,
}: TradingButtonsProps) {
  const tCommon = useTranslations("common");

  // Mobile uses same premium flat design with vertical stacking
  if (isMobile) {
    return (
      <div className="p-2 pb-3">
        <div className="flex flex-col gap-2">
          {/* Rise Button */}
          <button
            onClick={() => handlePlaceOrder("RISE")}
            disabled={disabled}
            className={`
              w-full h-[57px] relative group cursor-pointer
              ${oneClickEnabled
                ? "bg-[#089981] hover:bg-[#09a88d] active:bg-[#078570] ring-2 ring-yellow-400/55"
                : "bg-[#089981] hover:bg-[#09a88d] active:bg-[#078570]"
              }
              text-white px-4 rounded-lg shadow-sm
              flex items-center justify-between font-bold text-sm
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.985] transition-all duration-100 ease-out
            `}
          >
            <span className="text-[15px] font-bold uppercase tracking-wide text-white leading-none font-sans">
              {tCommon("rise")}
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/5 shrink-0">
              <ArrowUp size={18} className="text-white" />
            </div>
          </button>

          {/* Fall Button */}
          <button
            onClick={() => handlePlaceOrder("FALL")}
            disabled={disabled}
            className={`
              w-full h-[57px] relative group cursor-pointer
              ${oneClickEnabled
                ? "bg-[#f23645] hover:bg-[#f34e5b] active:bg-[#d02e3b] ring-2 ring-yellow-400/55"
                : "bg-[#f23645] hover:bg-[#f34e5b] active:bg-[#d02e3b]"
              }
              text-white px-4 rounded-lg shadow-sm
              flex items-center justify-between font-bold text-sm
              disabled:opacity-40 disabled:cursor-not-allowed
              active:scale-[0.985] transition-all duration-100 ease-out
            `}
          >
            <span className="text-[15px] font-bold uppercase tracking-wide text-white leading-none font-sans">
              {tCommon("fall")}
            </span>
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/5 shrink-0">
              <ArrowDown size={18} className="text-white" />
            </div>
          </button>
        </div>
      </div>
    );
  }

  // Desktop uses same design stacked vertically
  return (
    <div className="p-2 pb-3">
      {/* Trading buttons stacked vertically */}
      <div className="flex flex-col gap-2">
        {/* Rise Button */}
        <button
          onClick={() => handlePlaceOrder("RISE")}
          disabled={disabled}
          className={`
            w-full h-[57px] relative group cursor-pointer
            ${oneClickEnabled
              ? "bg-[#089981] hover:bg-[#09a88d] active:bg-[#078570] ring-2 ring-yellow-400/55"
              : "bg-[#089981] hover:bg-[#09a88d] active:bg-[#078570]"
            }
            text-white px-4 rounded-lg shadow-sm
            flex items-center justify-between font-bold text-sm
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-[0.985] transition-all duration-100 ease-out
          `}
        >
          <span className="text-[15px] font-bold uppercase tracking-wide text-white leading-none font-sans">
            {tCommon("rise")}
          </span>
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/5 shrink-0">
            <ArrowUp size={18} className="text-white" />
          </div>
        </button>

        {/* Fall Button */}
        <button
          onClick={() => handlePlaceOrder("FALL")}
          disabled={disabled}
          className={`
            w-full h-[57px] relative group cursor-pointer
            ${oneClickEnabled
              ? "bg-[#f23645] hover:bg-[#f34e5b] active:bg-[#d02e3b] ring-2 ring-yellow-400/55"
              : "bg-[#f23645] hover:bg-[#f34e5b] active:bg-[#d02e3b]"
            }
            text-white px-4 rounded-lg shadow-sm
            flex items-center justify-between font-bold text-sm
            disabled:opacity-40 disabled:cursor-not-allowed
            active:scale-[0.985] transition-all duration-100 ease-out
          `}
        >
          <span className="text-[15px] font-bold uppercase tracking-wide text-white leading-none font-sans">
            {tCommon("fall")}
          </span>
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/5 shrink-0">
            <ArrowDown size={18} className="text-white" />
          </div>
        </button>
      </div>

      {/* Keyboard shortcut hints */}
      <div className="flex items-center justify-center gap-3 mt-2.5 text-gray-400 dark:text-zinc-650">
        <div className="flex items-center gap-1">
          <kbd className="text-[10px] px-1 py-0.5 rounded font-mono bg-gray-200 dark:bg-muted text-gray-500 dark:text-zinc-500">C</kbd>
          <span className="text-[10px]">Rise</span>
        </div>
        <div className="w-px h-2.5 bg-gray-300 dark:bg-border" />
        <div className="flex items-center gap-1">
          <kbd className="text-[10px] px-1 py-0.5 rounded font-mono bg-gray-200 dark:bg-muted text-gray-500 dark:text-zinc-500">P</kbd>
          <span className="text-[10px]">Fall</span>
        </div>
      </div>
    </div>
  );
}
