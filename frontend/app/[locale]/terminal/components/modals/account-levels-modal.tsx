"use client";

import { memo } from "react";
import { X, Info, CircleDollarSign } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTheme } from "next-themes";
import { TIERS, TIER_LIST, TierBars, resolveTier, type TierKey } from "../../lib/account-tiers";

interface AccountLevelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  realBalance: number;
  currency: string;
  theme?: "dark" | "light" | "navy";
}

const EXCHANGE_RATES: Record<string, number> = {
  USDT: 1.0, USD: 1.0, EUR: 0.92, GBP: 0.79, INR: 83.5, BRL: 5.4, TRY: 32.5,
  MYR: 4.7, IDR: 16300.0, THB: 36.7, NGN: 1500.0, KES: 129.0, ZAR: 18.4,
  AED: 3.67, VND: 25400.0,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USDT: "₮", USD: "$", EUR: "€", GBP: "£", INR: "₹", BRL: "R$", TRY: "₺",
  MYR: "RM", IDR: "Rp", THB: "฿", NGN: "₦", KES: "KSh", ZAR: "R",
  AED: "د.إ", VND: "₫",
};

export const AccountLevelsModal = memo(function AccountLevelsModal({
  isOpen,
  onClose,
  realBalance,
  currency = "USDT",
}: AccountLevelsModalProps) {
  /* The modal took a `theme` prop and ignored it, so every surface stayed dark
     and it opened as a black sheet on the light theme. Read from next-themes
     instead — the prop was never wired by the caller either.

     Surfaces are written light-first with dark:/navy overrides, matching how the
     rest of the header is themed. Navy shares dark's treatment here: this is a
     small centred sheet, not a large panel sitting on the navy background, so a
     separate blue-tinted set would be a difference nobody sees. */
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark" || resolvedTheme === "navy";

  const rate = EXCHANGE_RATES[currency] || 1.0;
  const sym = CURRENCY_SYMBOLS[currency] || "$";

  // Thresholds come from the shared tier table in USD and are converted here, so
  // the requirement is "$5,000 / $12,000 or the equivalent" in every currency. The
  // old INR carve-out (₹475,000 / ₹950,000) was not a conversion of either figure.
  const advancedMin = TIERS.advanced.minBalanceUsd * rate;
  const eliteMin = TIERS.elite.minBalanceUsd * rate;
  const balance = realBalance * rate;

  const money = (v: number) =>
    `${sym}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmt = (v: number) => `${sym}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const activeTier: TierKey = resolveTier(balance, advancedMin, eliteMin);
  const activeIndex = TIER_LIST.findIndex((t) => t.key === activeTier);

  const minValue: Record<TierKey, number> = { basic: 0, advanced: advancedMin, elite: eliteMin };

  const next =
    activeTier === "basic"
      ? { tier: TIERS.advanced, floor: 0, target: advancedMin }
      : activeTier === "advanced"
      ? { tier: TIERS.elite, floor: advancedMin, target: eliteMin }
      : null;

  const progress = next
    ? Math.max(0, Math.min(100, ((balance - next.floor) / (next.target - next.floor)) * 100))
    : 100;
  const remaining = next ? Math.max(0, next.target - balance) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* DialogContent defaults to size="md", contributing `sm:max-w-md` (448px).
          tailwind-merge does not treat an sm:-modified max-width as conflicting with an
          unmodified one, so both survive and the sm: variant wins on desktop. The sm:
          modifier below is what actually applies the width; gap-0 cancels the dialog
          grid's own gap-4. max-h + overflow-y keeps the taller layout usable on short
          viewports. */}
      <DialogContent
        size="sm"
        className={`max-w-[409px] sm:max-w-[409px] w-[94vw] max-h-[88vh] overflow-y-auto p-0 gap-0 rounded-2xl border shadow-2xl z-[9999] [&>button]:hidden ${
          isDark ? "border-[#2b3045] bg-[#151a26]" : "border-zinc-200 bg-white"
        }`}
      >
        <DialogTitle className="sr-only">Account Levels</DialogTitle>
        <DialogDescription className="sr-only">
          Compare the Basic, Advanced and Elite account levels and track progress toward the next one.
        </DialogDescription>

        {/* ── Header ── */}
        <div className={`sticky top-0 z-10 px-4 pt-4 pb-3 ${isDark ? "bg-[#151a26]" : "bg-white"}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.05] border-white/[0.08]" : "bg-zinc-100 border-zinc-200"}`}>
                <Info size={14} strokeWidth={2.4} className={isDark ? "text-zinc-300" : "text-zinc-600"} />
              </span>
              <h2 className={`text-[16px] font-bold tracking-tight truncate ${isDark ? "text-white" : "text-zinc-900"}`}>Account levels</h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className={`w-7 h-7 -mt-0.5 -mr-1 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0 ${isDark ? "text-zinc-500 hover:text-white hover:bg-white/[0.06]" : "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"}`}
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2.5 pl-[36px]">
            Your level is set by your real balance ·{" "}
            <span className={`font-bold tabular-nums ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>{money(balance)}</span>
          </p>
          <div className={`mt-3 h-px ${isDark ? "bg-[#2b3045]/70" : "bg-zinc-200"}`} />
        </div>

        {/* ── Levels ──
            One tall card per level, stacked. A left rail carries the level meter and
            its ACTIVE / INACTIVE state so status is readable without parsing the copy,
            and the benefit rows each get their own icon tile with the entitlement
            written out in full rather than clipped to fit a column. */}
        <div className="px-4 pb-1 flex flex-col gap-3">
          {TIER_LIST.map(({ key, level, name, subtitle, payout, benefits, accent, maxTradeUsd }, i) => {
            const isActive = activeTier === key;
            const isUnlocked = i <= activeIndex;
            return (
              <div
                key={key}
                className={`flex gap-3.5 rounded-xl border p-3.5 ${
                  isActive
                    ? `border-transparent ring-1 ${accent.ring} ${accent.wash}`
                    : isDark
                    ? "border-[#2b3045]/50 bg-[#13151f]"
                    : "border-zinc-200 bg-zinc-50"
                }`}
              >
                {/* Left rail — meter + state */}
                <div className="flex flex-col items-center gap-2.5 w-[59px] shrink-0">
                  <span
                    className={`w-[49px] h-[49px] rounded-xl border flex items-center justify-center ${
                      isUnlocked ? accent.iconTile : isDark ? "bg-white/[0.03] border-white/[0.06]" : "bg-zinc-100 border-zinc-200"
                    }`}
                  >
                    <TierBars
                      level={level}
                      size={26}
                      filledClass={isUnlocked ? accent.fill : "bg-zinc-300 dark:bg-zinc-600"}
                    />
                  </span>
                  <span
                    className={`w-full text-center px-1 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider leading-none border ${
                      isActive ? accent.badge : isDark ? "bg-white/[0.03] text-zinc-500 border-white/[0.06]" : "bg-zinc-100 text-zinc-500 border-zinc-200"
                    }`}
                  >
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Right — name, threshold, benefits */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-[15px] font-extrabold uppercase tracking-tight leading-none ${
                      isActive ? (isDark ? "text-white" : "text-zinc-900") : isDark ? "text-zinc-300" : "text-zinc-600"
                    }`}>
                      {name}
                    </p>
                    <span className={`px-2 py-1 rounded-md border text-[10px] font-semibold leading-none tabular-nums ${isDark ? "bg-white/[0.05] border-white/[0.06] text-zinc-400" : "bg-zinc-100 border-zinc-200 text-zinc-600"}`}>
                      {minValue[key] === 0 ? "Free to start" : `Balance from ${fmt(minValue[key])}`}
                    </span>
                    <span className={`ml-auto text-[13px] font-extrabold tabular-nums leading-none ${
                      isUnlocked ? accent.text : "text-zinc-600"
                    }`}>
                      {payout}
                    </span>
                  </div>

                  <p className="text-[11px] font-semibold text-zinc-400 mt-2">
                    Level for {subtitle.toLowerCase()}s
                  </p>

                  {/* The stake cap is rendered here rather than carried as a string on
                      the tier table because it has to be shown in the display currency —
                      a hardcoded "$3,000" would be plainly wrong on an INR account. */}
                  <ul className="mt-2.5 flex flex-col gap-2">
                    {[
                      ...benefits,
                      {
                        Icon: CircleDollarSign,
                        text: `Up to ${fmt(maxTradeUsd * rate)} on a single position`,
                      },
                    ].map(({ Icon, text }) => (
                      <li key={text} className="flex items-start gap-2.5">
                        <span
                          className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 ${
                            isUnlocked ? accent.iconTile : isDark ? "bg-white/[0.03] border-white/[0.06]" : "bg-zinc-100 border-zinc-200"
                          }`}
                        >
                          <Icon
                            size={13}
                            strokeWidth={2.2}
                            className={isUnlocked ? accent.icon : "text-zinc-600"}
                          />
                        </span>
                        <span className={`text-[11px] leading-[1.45] pt-1 ${
                          isUnlocked ? (isDark ? "text-zinc-300" : "text-zinc-700") : "text-zinc-500"
                        }`}>
                          {text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Progress ── */}
        <div className="p-4">
          {next ? (
            <div className={`rounded-xl border px-3.5 py-3 ${isDark ? "border-[#2b3045]/50 bg-[#13151f]" : "border-zinc-200 bg-zinc-50"}`}>
              <div className="flex items-baseline justify-between gap-3 mb-2.5">
                <p className="text-[11px] text-zinc-500 truncate">
                  <span className={`font-bold ${isDark ? "text-zinc-200" : "text-zinc-900"}`}>{fmt(remaining)}</span> more to reach{" "}
                  <span className={`font-bold ${next.tier.accent.text}`}>{next.tier.name}</span>
                </p>
                <p className={`text-[11px] font-bold tabular-nums shrink-0 ${next.tier.accent.text}`}>
                  {Math.round(progress)}%
                </p>
              </div>
              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-white/[0.07]" : "bg-zinc-200"}`}>
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out ${next.tier.accent.fill}`}
                  style={{ width: `${progress}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Progress to ${next.tier.name}`}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-3.5 py-3 flex items-center gap-3">
              <TierBars level={3} size={16} filledClass="bg-amber-400" emptyClass="bg-amber-400" />
              <p className="text-[11px] text-zinc-400">
                Highest tier held. The maximum{" "}
                <span className="font-bold text-amber-400">+4%</span> payout rate is applied to every position.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

export default AccountLevelsModal;
