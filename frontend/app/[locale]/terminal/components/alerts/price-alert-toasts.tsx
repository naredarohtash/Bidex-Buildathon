"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { usePriceAlertStore, type FiredAlertToast } from "@/store/trade/use-price-alert-store";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { getCryptoImageUrl, handleImageError, getAssetDisplayName } from "@/utils/image-fallback";

const AUTO_DISMISS_MS = 9000;

function fmtPrice(n: number): string {
  const abs = Math.abs(n);
  const dp = abs >= 1000 ? 2 : abs >= 100 ? 3 : abs >= 1 ? 5 : 6;
  return n.toFixed(dp);
}

function splitSymbol(symbol: string): { base: string; quote: string; isOtc: boolean } {
  const isOtc = /otc/i.test(symbol);
  const s = symbol.replace(/\s*\(OTC\)/gi, "").replace(/_?OTC$/i, "");
  const parts = s.split("/");
  return {
    base: (parts[0] || s).toUpperCase(),
    quote: (parts[1] || "").toUpperCase(),
    isOtc,
  };
}

/** Small overlapping base/quote flags, matching the asset-browser style. */
function PairFlags({ symbol }: { symbol: string }) {
  const { base, quote } = splitSymbol(symbol);
  return (
    <div className="relative w-6 h-6 shrink-0">
      <div className="absolute left-0 top-0 w-[14px] h-[14px] rounded-full overflow-hidden border border-white/30 dark:border-white/40 bg-zinc-900 z-0">
        <img
          src={getCryptoImageUrl(base)}
          alt={base}
          className="w-full h-full object-cover"
          onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
          loading="lazy"
        />
      </div>
      {quote && (
        <div className="absolute right-0 bottom-0 w-[14px] h-[14px] rounded-full overflow-hidden border border-white/30 dark:border-white/40 bg-zinc-900 z-10">
          <img
            src={getCryptoImageUrl(quote)}
            alt={quote}
            className="w-full h-full object-cover"
            onError={(e) => handleImageError(e, "/img/crypto/generic.webp")}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

function AlertToastCard({ toast }: { toast: FiredAlertToast }) {
  const dismissToast = usePriceAlertStore((s) => s.dismissToast);
  const setCurrentSymbol = useBinaryStore((s) => s.setCurrentSymbol);
  const { isOtc } = splitSymbol(toast.symbol);
  const name = getAssetDisplayName(toast.symbol) || splitSymbol(toast.symbol).base;
  const dirText = toast.condition === "above" ? "rose above" : "fell below";

  useEffect(() => {
    const t = setTimeout(() => dismissToast(toast.toastId), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [toast.toastId, dismissToast]);

  const go = () => {
    setCurrentSymbol(toast.symbol);
    dismissToast(toast.toastId);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={go}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && go()}
      className="group pointer-events-auto flex items-center gap-2 w-[203px] pl-2 pr-1.5 py-1.5 rounded-lg border cursor-pointer shadow-lg backdrop-blur-md transition-all animate-in fade-in slide-in-from-left-1 duration-200
        bg-white/95 border-zinc-200 hover:bg-white dark:bg-[#181a26]/95 dark:border-[#2b3045]/70 dark:hover:bg-[#1e2130]/95"
    >
      <PairFlags symbol={toast.symbol} />
      <div className="flex flex-col min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold truncate text-zinc-900 dark:text-white">{name}</span>
          {isOtc && (
            <span className="inline-block shrink-0 text-[10px] font-extrabold uppercase tracking-tighter leading-none select-none text-zinc-400 dark:text-zinc-400/90 bg-zinc-200/60 dark:bg-[#1a1d28] px-0.5 py-[1px] rounded-[2px] origin-left transform scale-[0.68] -ml-0.5">
              OTC
            </span>
          )}
          <span className="text-[9px] font-bold uppercase tracking-wide text-amber-500 ml-auto">Alert</span>
        </div>
        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
          {dirText}{" "}
          <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
            {fmtPrice(toast.targetPrice)}
          </span>
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          dismissToast(toast.toastId);
        }}
        className="shrink-0 p-0.5 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * Compact price-alert notifications, stacked at the bottom-left INSIDE the chart
 * area, just to the right of the floating chart toolbar. Clicking one switches
 * the chart to that asset.
 */
export default function PriceAlertToasts() {
  const toasts = usePriceAlertStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="absolute bottom-9 left-32 z-40 flex flex-col-reverse gap-1.5 pointer-events-none">
      {toasts.slice(-4).map((t) => (
        <AlertToastCard key={t.toastId} toast={t} />
      ))}
    </div>
  );
}
