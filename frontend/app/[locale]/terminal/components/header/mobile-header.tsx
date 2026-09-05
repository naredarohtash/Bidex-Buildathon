"use client";

/**
 * Mobile terminal header — two floating controls over the top of the chart.
 *
 *   [ 🇨🇦🇨🇭 CAD/CHF ᴼᵀᶜ 76% ⌄ ]         [ ▮▮ REAL ACCOUNT ⌄  ₹1,224,007.23 ]
 *
 * It has no background. The chart runs to the top edge and these two sit on
 * it, which is 56px of chart bought back on a screen where the chart is the
 * product — and it is how the desktop reads too, where the account box floats
 * over the chart rather than sitting in a bar above it.
 *
 * Both controls are the desktop ones rather than mobile-shaped versions of
 * them: the account box is the desktop trigger (tier bars, "Real Account",
 * balance) opening the desktop panel, and the instrument prints the name and
 * the flags the asset browser prints. A market called "CAD/CHF (OTC)" in the
 * browser and "CAD/CHF_OTC" in the header is one market with two names. The
 * browser it opens is the desktop MarketBrowserPanel, in its phone shape.
 */

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, FlaskConical } from "lucide-react";
import { useTheme } from "next-themes";
import { useShallow } from "zustand/react/shallow";
import { useBinaryStore, isSameSymbol, type Symbol } from "@/store/trade/use-binary-store";
import { useUserStore } from "@/store/user";
import { AuthHeaderControls } from "@/components/auth/auth-header-controls";
import { useGuestGate } from "@/lib/guest/use-guest-gate";
import { getProfitPercentageForType } from "@/types/binary-trading";
import { TIERS, TierBars, resolveTier } from "../../lib/account-tiers";
import MarketBrowserPanel, { AssetIcon } from "./market-browser-panel";
import { getAssetDisplayName } from "@/utils/image-fallback";
import { AccountPanel } from "./account-panel";
import { EXCHANGE_RATES, CURRENCY_SYMBOLS } from "./header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LiveBalance from "./live-balance";

const DepositModal = dynamic(() => import("../modals/deposit-modal"), { ssr: false });
const WithdrawModal = dynamic(() => import("../modals/withdraw-modal"), { ssr: false });
const AccountLevelsModal = dynamic(() => import("../modals/account-levels-modal"), {
  ssr: false,
});

interface MobileHeaderProps {
  symbol?: Symbol;
  balance?: number;
  tradingMode?: "demo" | "real";
  onTradingModeChange?: (mode: "demo" | "real") => void;
  handleMarketSelect?: (marketSymbol: string) => void;
}

export function MobileHeader({
  symbol,
  balance = 0,
  tradingMode = "demo",
  onTradingModeChange,
  handleMarketSelect,
}: MobileHeaderProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [showMarketSelector, setShowMarketSelector] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);

  const user = useUserStore((state) => state.user);
  /* Same rule as the desktop header — see the note there. A guest has a demo
     identity and a demo balance to show, and `!!user` answers neither that nor
     the hollow-user case the profile 401 leaves behind. */
  const { isGuest, signedIn } = useGuestGate();
  const isAuthenticated = signedIn || isGuest;

  useEffect(() => setMounted(true), []);

  const isDarkMode = mounted
    ? resolvedTheme === "dark" || resolvedTheme === "navy"
    : false;

  const {
    storeTradingMode,
    storeCurrentSymbol,
    storeRealBalance,
    storeDemoBalance,
    binaryMarkets,
    binaryDurations,
    selectedExpiryMinutes,
    selectedOrderType,
  } = useBinaryStore(
    useShallow((s) => ({
      storeTradingMode: s.tradingMode,
      storeCurrentSymbol: s.currentSymbol,
      storeRealBalance: s.realBalance,
      storeDemoBalance: s.demoBalance,
      binaryMarkets: s.binaryMarkets,
      binaryDurations: s.binaryDurations,
      selectedExpiryMinutes: s.selectedExpiryMinutes,
      selectedOrderType: s.selectedOrderType,
    }))
  );

  const effectiveTradingMode = tradingMode || storeTradingMode;
  const effectiveSymbol = symbol || storeCurrentSymbol;
  const isReal = effectiveTradingMode === "real";

  const effectiveBalance =
    balance || (isReal ? storeRealBalance ?? 0 : storeDemoBalance ?? 10000);

  /* Same conversion the trade panel uses, so the balance in the header and the
     stake below it are quoted in one currency. */
  const [preferredCurrency, setPreferredCurrency] = useState("USDT");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () =>
      setPreferredCurrency(localStorage.getItem("preferred_currency") || "USDT");
    read();
    window.addEventListener("currency-changed", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("currency-changed", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  const rate = EXCHANGE_RATES[preferredCurrency] || 1;
  const sym = CURRENCY_SYMBOLS[preferredCurrency] || "$";

  /* The tier that sets the account's payout rate, resolved from the shared
     table exactly as the desktop trigger does — so the bars here, the bars in
     the panel and the Account Levels modal always agree. */
  const tier = useMemo(() => {
    const converted = (storeRealBalance ?? 0) * rate;
    return TIERS[
      resolveTier(
        converted,
        TIERS.advanced.minBalanceUsd * rate,
        TIERS.elite.minBalanceUsd * rate
      )
    ];
  }, [storeRealBalance, rate]);

  // ── the instrument ───────────────────────────────────────────────────────
  const market = useMemo(
    () =>
      binaryMarkets.find(
        (m: any) =>
          isSameSymbol(m.symbol, effectiveSymbol) ||
          isSameSymbol(`${m.currency}/${m.pair}`, effectiveSymbol)
      ),
    [binaryMarkets, effectiveSymbol]
  );

  /* The order panel's name, not the browser's.

     The browser row prints the full title — "Adani Enterprises", "Johnson &
     Johnson" — because it has a whole row to print it in. This box has about
     twelve characters between the flags and the payout, so it uses the short
     form the desktop order panel uses: the ticker for a stock, the pair for a
     currency. Anything still over the cap is cut with an ellipsis, because a
     name that overflows its box is worse than one that is abbreviated. */
  const NAME_CAP = 12;
  const fullName = getAssetDisplayName(String(effectiveSymbol || ""));
  const pairLabel =
    fullName.length > NAME_CAP ? `${fullName.slice(0, NAME_CAP - 1).trimEnd()}…` : fullName;
  const isOTC = String(
    market?.symbol || `${market?.currency ?? ""}${market?.pair ?? ""}` || effectiveSymbol || ""
  ).toUpperCase().includes("OTC");

  /* Same derivation as the desktop order panel, per-symbol spread included, so
     the two never quote different rates for the same market. */
  const profitPercentage = useMemo(() => {
    const active = binaryDurations.filter((d: any) => d.status === true);
    const duration =
      binaryDurations.find((d: any) => d.duration === selectedExpiryMinutes) || active[0];
    const value = duration
      ? getProfitPercentageForType(duration as any, selectedOrderType)
      : 85;
    const s = String(effectiveSymbol || "");
    if (s.toUpperCase().includes("OTC")) return value;
    const hash = s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.min(95, Math.max(72, value - (hash % 7)));
  }, [binaryDurations, selectedExpiryMinutes, selectedOrderType, effectiveSymbol]);

  if (!mounted) return null;

  /* Both controls float on the chart and take the chart's own background.

     --chart-bg, not the bg-chart-base class. The two look interchangeable and
     are not: the engine paints the canvas from the variable, while the class
     carries its own copy of the value — and in the light theme the copy is
     wrong, #ffffff against the #fafafa the canvas actually paints. Sampling the
     canvas confirms it (light #fafafa, dark #09090b, navy #0b111e), and only
     the variable agrees in all three. Matching the class left a seam visible in
     light exactly where the header strip met the plot area.

     Before either, both controls were a flat #1e2230 — a grey belonging to no
     theme, which read as a lighter slab pasted over the dark chart and was the
     wrong hue as well as the wrong value in navy. Now only the hairline border
     separates a control from the chart, which is all the separation a control
     floating over candles needs. */
  const boxStyle = { background: "var(--chart-bg)" } as const;
  const boxClass = isDarkMode
    ? "border-zinc-700/60 text-white shadow-lg"
    : "border-zinc-300 text-zinc-900 shadow-lg";

  return (
    <>
      <header className="absolute top-2 left-2 right-2 z-40 flex items-start justify-between gap-2 pointer-events-none">
        {/* ── the instrument ───────────────────────────────────────────── */}
        <button
          onClick={() => setShowMarketSelector(true)}
          style={boxStyle}
          className={`pointer-events-auto flex items-center gap-1.5 h-[35px] pl-1.5 pr-2 rounded-md border min-w-0 max-w-[54%] active:scale-[0.98] transition-all ${boxClass}`}
        >
          {market ? <AssetIcon market={market as any} /> : <span className="w-9" />}
          <span className="text-[13px] font-semibold truncate">{pairLabel}</span>
          {isOTC && (
            <span
              className={`shrink-0 text-[9px] font-extrabold leading-none px-0.5 py-[1px] rounded-[2px] uppercase tracking-tighter ${
                isDarkMode
                  ? "text-zinc-400 bg-[#12151f]"
                  : "text-zinc-500 bg-zinc-200/70"
              }`}
            >
              OTC
            </span>
          )}
          <span className="text-[13px] font-bold text-[#f59e0b] shrink-0">
            {profitPercentage}%
          </span>
          <ChevronDown
            size={13}
            className={`shrink-0 ${isDarkMode ? "text-zinc-300" : "text-zinc-500"}`}
          />
        </button>

        {isAuthenticated ? (
          /* ── the account: the desktop trigger, unchanged ─────────────── */
          <DropdownMenu open={showAccountPanel} onOpenChange={setShowAccountPanel}>
            <DropdownMenuTrigger asChild>
              <button
                data-tutorial="demo-toggle"
                style={boxStyle}
                className={`pointer-events-auto group flex items-center gap-2 px-2.5 h-[35px] rounded-md border shrink-0 active:scale-[0.98] transition-all sf-pro-selectors ${boxClass}`}
              >
                {isReal ? (
                  <TierBars
                    level={tier.level}
                    size={18}
                    filledClass={tier.accent.fill}
                    className="shrink-0"
                  />
                ) : (
                  <FlaskConical
                    size={19}
                    className="text-orange-600 dark:text-[#f97316] shrink-0"
                  />
                )}

                <div className="flex flex-col items-start leading-none">
                  <div className="flex items-center gap-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide ${
                        isReal
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-orange-700 dark:text-[#f97316]"
                      }`}
                    >
                      {isReal ? "Real Account" : "Demo Account"}
                    </span>
                    <ChevronDown
                      size={12}
                      className={`shrink-0 transition-transform text-zinc-500 dark:text-zinc-300 ${
                        showAccountPanel ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                  {isReal ? (
                    <LiveBalance
                      amount={effectiveBalance * rate}
                      symbol={sym}
                      compact
                      className="text-[13px] font-semibold tabular-nums leading-none mt-0.5"
                    />
                  ) : (
                    <span className="text-[13px] font-semibold tabular-nums leading-none mt-0.5">
                      {sym}
                      {(effectiveBalance * rate).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                </div>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="w-[320px] p-0 flex overflow-hidden bg-white dark:bg-[#181a26] border-zinc-200/80 dark:border-[#2b3045]/70 border rounded-xl shadow-xl z-[999] sf-pro-selectors"
            >
              <AccountPanel
                compact
                onClose={() => setShowAccountPanel(false)}
                onOpenAccountLevels={() => setLevelsOpen(true)}
                onDeposit={() => setDepositOpen(true)}
                onWithdraw={() => setWithdrawOpen(true)}
                onSwitchAccount={(account) =>
                  onTradingModeChange?.(account === "real" ? "real" : "demo")
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div style={boxStyle} className={`pointer-events-auto rounded-md border px-1 ${boxClass}`}>
            <AuthHeaderControls isMobile={true} variant="binary" />
          </div>
        )}
      </header>

      <MarketBrowserPanel
        open={showMarketSelector}
        onClose={() => setShowMarketSelector(false)}
        handleMarketSelect={(m: string) => {
          handleMarketSelect?.(m);
          setShowMarketSelector(false);
        }}
        isMobile={true}
      />

      {depositOpen && <DepositModal isOpen onClose={() => setDepositOpen(false)} />}
      {withdrawOpen && <WithdrawModal isOpen onClose={() => setWithdrawOpen(false)} />}
      {levelsOpen && (
        <AccountLevelsModal
          isOpen
          onClose={() => setLevelsOpen(false)}
          realBalance={storeRealBalance ?? 0}
          currency={preferredCurrency}
          theme={isDarkMode ? "dark" : "light"}
        />
      )}
    </>
  );
}

export default MobileHeader;
