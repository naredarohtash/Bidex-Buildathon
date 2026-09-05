"use client";

/**
 * The mobile trade panel — everything needed to place a trade, on one screen,
 * under the chart.
 *
 * This replaces a slide-in panel that covered the chart entirely. That is the
 * wrong trade for this instrument: a binary position is a bet on a price that
 * is moving while you size the stake, and the panel that took the stake hid the
 * price it was a bet on. Here the chart keeps the top two-thirds and never
 * moves; the controls live below it and are always visible, so the sequence is
 * look-at-price → set → commit without a screen transition in the middle.
 *
 * Four rows, in the order a trade is actually decided:
 *
 *   timer + investment  when does it settle, and for how much
 *   invest / payout     what goes in, what comes back
 *   Up / Down           the call
 *
 * The first row is the desktop ExpirySelector and AmountSelector, unchanged —
 * see the note above them for why nothing here is hand-rolled.
 *
 * The order-type selector, barrier inputs, martingale and the positions table
 * are not here — they are the desktop panel's job. A phone gets Rise/Fall,
 * which is what the other 90% of trades are, and the panel forces the store
 * back to RISE_FALL if it arrives holding a type this layout cannot express
 * (barrier types would place an order with no barrier and be rejected).
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useBinaryStore,
  isSameSymbol,
  MIN_TRADE_DURATION_SECONDS,
  type Symbol,
  type OrderSide,
} from "@/store/trade/use-binary-store";
import {
  ORDER_TYPE_CONFIGS,
  getProfitPercentageForType,
} from "@/types/binary-trading";
import AmountSelector from "./amount-selector";
import ExpirySelector from "./expiry-selector";
import { EXCHANGE_RATES, CURRENCY_SYMBOLS } from "../header/header";
import { TIERS, resolveTierByUsdBalance } from "../../lib/account-tiers";
import {
  getChartSynchronizedTime,
  formatChartTime,
  calculateNextExpiryTime,
} from "@/utils/time-sync";
import { toast } from "sonner";

interface MobileTradePanelProps {
  symbol: Symbol;
  balance: number;
  isInSafeZone?: boolean;
  darkMode?: boolean;
  onPlaceOrder: (
    side: OrderSide,
    amount: number,
    expiryMinutes: number
  ) => Promise<boolean>;
  onExpiryChange?: (minutes: number) => void;
}

/** Money without the decimals nobody reads: 187 ₹, but 187.50 ₹ when it matters. */
function formatMoney(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const whole = Math.abs(rounded - Math.round(rounded)) < 0.005;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default function MobileTradePanel({
  symbol,
  balance,
  isInSafeZone = false,
  darkMode = false,
  onPlaceOrder,
  onExpiryChange,
}: MobileTradePanelProps) {
  const t = useTranslations("binary_components");

  /* The desktop expiry selector owns its own dropdown; these are the two
     things it needs from outside it. */
  const [showExpiryDropdown, setShowExpiryDropdown] = useState(false);
  const expiryButtonRef = useRef<HTMLDivElement>(null);

  // ── store ────────────────────────────────────────────────────────────────
  const binaryMarkets = useBinaryStore((s) => s.binaryMarkets);
  const binaryDurations = useBinaryStore((s) => s.binaryDurations);
  const selectedOrderType = useBinaryStore((s) => s.selectedOrderType);
  const setOrderType = useBinaryStore((s) => s.setOrderType);
  const selectedAmount = useBinaryStore((s) => s.selectedAmount);
  const setSelectedAmount = useBinaryStore((s) => s.setSelectedAmount);
  const expiryMinutes = useBinaryStore((s) => s.selectedExpiryMinutes);
  const setSelectedExpiryMinutes = useBinaryStore(
    (s) => s.setSelectedExpiryMinutes
  );
  const durationMode = useBinaryStore((s) => s.durationMode);
  const setDurationMode = useBinaryStore((s) => s.setDurationMode);
  const customDurationSeconds = useBinaryStore((s) => s.customDurationSeconds);
  const setCustomDurationSeconds = useBinaryStore(
    (s) => s.setCustomDurationSeconds
  );
  const realBalanceUsd = useBinaryStore((s) => s.realBalance ?? 0);

  /* A barrier type reaching a panel with no barrier field would place an order
     the server rejects for a reason nothing on screen explains. There is no
     type selector here, so there is no choice being overridden. */
  useEffect(() => {
    const cfg = ORDER_TYPE_CONFIGS[selectedOrderType];
    if (
      cfg &&
      (cfg.requiresBarrier ||
        cfg.requiresStrikePrice ||
        cfg.requiresPayoutPerPoint)
    ) {
      setOrderType("RISE_FALL");
    }
  }, [selectedOrderType, setOrderType]);

  // ── currency ─────────────────────────────────────────────────────────────
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
  const currencySymbol = CURRENCY_SYMBOLS[preferredCurrency] || "$";

  // ── market, limits, payout ───────────────────────────────────────────────
  const market = useMemo(
    () =>
      binaryMarkets.find(
        (m: any) =>
          isSameSymbol(m.symbol, symbol) ||
          isSameSymbol(`${m.currency}/${m.pair}`, symbol)
      ),
    [binaryMarkets, symbol]
  );

  const limits = useMemo(() => {
    const tier = TIERS[resolveTierByUsdBalance(realBalanceUsd)];
    let min = 1;
    let max = tier.maxTradeUsd;
    if (market?.metadata) {
      const meta =
        typeof market.metadata === "string"
          ? JSON.parse(market.metadata)
          : market.metadata;
      min = Number(meta?.limits?.amount?.min || 1);
      max = Math.min(Number(meta?.limits?.amount?.max || 100000), tier.maxTradeUsd);
    }
    return { min: min * rate, max: max * rate, tierName: tier.name };
  }, [market, realBalanceUsd, rate]);

  const activeDurations = useMemo(
    () =>
      binaryDurations
        .filter((d: any) => d.status === true)
        .sort((a: any, b: any) => a.duration - b.duration),
    [binaryDurations]
  );

  const profitPercentage = useMemo(() => {
    const duration =
      binaryDurations.find((d: any) => d.duration === expiryMinutes) ||
      activeDurations[0];
    const base = duration
      ? getProfitPercentageForType(duration as any, selectedOrderType)
      : 85;
    const sym = String(symbol);
    if (sym.toUpperCase().includes("OTC")) return base;
    /* Same per-symbol spread the desktop panel applies, so a pair does not
       quote one payout on a phone and another on a desktop. */
    const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.min(95, Math.max(72, base - (hash % 7)));
  }, [binaryDurations, activeDurations, expiryMinutes, selectedOrderType, symbol]);

  /* The ceiling is an account-level entitlement, so the notice names the level
     that sets it rather than quoting a bare number — the sentence the desktop
     amount field shows. */
  const stakeLimitNotice = useMemo(
    () =>
      `Maximum ${currencySymbol}${limits.max.toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })} per position at ${limits.tierName} level.`,
    [currencySymbol, limits]
  );

  const amount = selectedAmount || 100;
  const convertedBalance = balance * rate;
  const payout = amount + (amount * profitPercentage) / 100;

  // ── timer display ────────────────────────────────────────────────────────
  /* CLOCK mode names a wall-clock instant, which moves on its own; DURATION
     names a length, which does not. Only the first needs a ticker. */
  /* CLOCK mode names a wall-clock instant, which moves on its own; DURATION
     names a length, which does not. Only the first needs a ticker, and only
     while the dropdown is shut — the selector writes its own value through
     setExpiryTime and a ticker running underneath would overwrite it. */
  const [expiryTime, setExpiryTime] = useState("--:--");
  useEffect(() => {
    if (durationMode !== "CLOCK" || showExpiryDropdown) return;
    const tick = () =>
      setExpiryTime(formatChartTime(calculateNextExpiryTime(expiryMinutes)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [durationMode, expiryMinutes, showExpiryDropdown]);

  /* One duration choice, written to both places that read it. DURATION mode
     settles on customDurationSeconds and CLOCK mode validates against the
     duration list, so setting only one of them settles a trade at a length the
     trader did not pick — or fails validation with no visible cause. */
  const selectDuration = useCallback(
    (minutes: number) => {
      setSelectedExpiryMinutes(minutes);
      setCustomDurationSeconds(
        Math.max(MIN_TRADE_DURATION_SECONDS, minutes * 60)
      );
      onExpiryChange?.(minutes);
    },
    [setSelectedExpiryMinutes, setCustomDurationSeconds, onExpiryChange]
  );

  /* The store ships CLOCK mode, which names the wall-clock instant a trade
     settles at — "23:11". On a phone the useful question is not when it lands
     but how long it runs, so this panel opens on the countdown instead. Done
     once, ever, and recorded: after that a SWITCH is a decision and has to
     survive a reload. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "bidex_mobile_timer_mode_init";
    if (localStorage.getItem(KEY)) return;
    localStorage.setItem(KEY, "1");
    setDurationMode("DURATION");
  }, [setDurationMode]);

  /* Keep the two in step when the panel mounts against a persisted expiry — a
     stored 5-minute selection with a stored 60-second custom duration would
     show 00:05:00 and settle in one minute. */
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current || activeDurations.length === 0) return;
    syncedRef.current = true;
    const valid = activeDurations.some((d: any) => d.duration === expiryMinutes);
    const minutes = valid ? expiryMinutes : activeDurations[0].duration;
    if (!valid) setSelectedExpiryMinutes(minutes);
    if (customDurationSeconds !== minutes * 60) {
      setCustomDurationSeconds(Math.max(MIN_TRADE_DURATION_SECONDS, minutes * 60));
    }
  }, [
    activeDurations,
    expiryMinutes,
    customDurationSeconds,
    setSelectedExpiryMinutes,
    setCustomDurationSeconds,
  ]);

  // ── amount ───────────────────────────────────────────────────────────────
  /* The stepper the selector's +/- call. AmountSelector owns the percentage
     mode and the manual entry; this only has to clamp. */
  const step = useCallback(
    (delta: number) => {
      const ceiling = Math.min(convertedBalance, limits.max);
      setSelectedAmount(
        Math.max(limits.min, Math.min(Math.round(amount + delta), ceiling))
      );
    },
    [amount, convertedBalance, limits, setSelectedAmount]
  );

  // ── place ────────────────────────────────────────────────────────────────
  const [placing, setPlacing] = useState<OrderSide | null>(null);

  const place = useCallback(
    async (side: OrderSide) => {
      if (isInSafeZone) {
        toast.warning(t("trading_paused_within_15_seconds_of_expiry"));
        return;
      }
      if (amount < limits.min) {
        toast.error(
          `Minimum stake is ${currencySymbol}${formatMoney(limits.min)}.`
        );
        return;
      }
      if (amount > limits.max) {
        toast.error(
          `${currencySymbol}${formatMoney(limits.max)} is the maximum on a single position at your ${limits.tierName} level.`
        );
        return;
      }
      if (amount > convertedBalance) {
        toast.error("Insufficient balance.");
        return;
      }

      setPlacing(side);
      try {
        const ok = await onPlaceOrder(side, amount / rate, expiryMinutes);
        if (!ok) toast.error("Order placement failed — please try again.");
      } catch {
        toast.error("Order placement failed — please try again.");
      } finally {
        setPlacing(null);
      }
    },
    [
      isInSafeZone,
      amount,
      limits,
      convertedBalance,
      currencySymbol,
      onPlaceOrder,
      rate,
      expiryMinutes,
      t,
    ]
  );

  // ── theme ────────────────────────────────────────────────────────────────
  const c = darkMode
    ? {
        surface: "bg-[#0f1115]",
        chip: "bg-[#1b1f26]",
        border: "border-[#262b34]",
        text: "text-zinc-100",
        muted: "text-zinc-400",
        faint: "text-zinc-500",
        control: "text-zinc-300",
      }
    : {
        surface: "bg-white",
        chip: "bg-[#f2f4f7]",
        border: "border-[#e4e7ec]",
        text: "text-zinc-900",
        muted: "text-zinc-500",
        faint: "text-zinc-400",
        control: "text-zinc-600",
      };

  return (
    /* A rule and real air above the first control.
       The chart's time axis ran straight into the Time/Amount row — the last
       row of the chart and the first row of the form were a few pixels apart
       with nothing between them, so the axis labels read as part of the panel
       and the whole bottom third looked congested. The border says where the
       chart stops, and pt-4 gives the axis its own space to sit in. */
    <div className={`shrink-0 ${c.surface} ${c.border} border-t px-3 pt-4 pb-2`}>
      {/* ── Timer and Investment ──────────────────────────────────────────
          These are the desktop controls, not mobile lookalikes of them.

          Three passes were spent building a phone version of this row — an
          outlined pair, then a shared box with segmented bars, then a compact
          two-line field — and each was a worse copy of a control that already
          exists, already handles CLOCK and DURATION, already has the
          stake-as-percentage mode, and already opens the expiry dropdown a
          trader knows from the desktop. Both take an isMobile flag; that is
          the whole job.

          The gutter matches the Up/Down row below, so the four boxes read as
          one grid of two columns rather than two rows that happen to be
          stacked. */}
      <div className="flex gap-2.5">
        <div data-tutorial="expiry-selector" className="flex-1 min-w-0">
          <ExpirySelector
            expiryMinutes={expiryMinutes}
            expiryTime={expiryTime}
            /* Dead on the desktop control too — it steps its own state. Passed
               because the interface still asks for them. */
            increaseExpiry={() => {}}
            decreaseExpiry={() => {}}
            setExpiryMinutes={selectDuration}
            setExpiryTime={setExpiryTime}
            showExpiryDropdown={showExpiryDropdown}
            setShowExpiryDropdown={setShowExpiryDropdown}
            expiryButtonRef={expiryButtonRef}
            presetExpiryTimes={[]}
            isMobile={true}
            darkMode={darkMode}
          />
        </div>

        <div data-tutorial="amount-input" className="flex-1 min-w-0">
          <AmountSelector
            amount={amount}
            balance={convertedBalance}
            increaseAmount={() => step(100)}
            decreaseAmount={() => step(-100)}
            setAmount={setSelectedAmount}
            darkMode={darkMode}
            minAmount={limits.min}
            maxAmount={limits.max}
            maxAmountNotice={stakeLimitNotice}
            currencySymbol={currencySymbol}
            isMobile={true}
          />
        </div>
      </div>

      {/* ── Row 3: what goes in, what comes back ──────────────────────────
          Reference, not a decision the trader is making here — the Amount
          box above is where that number actually gets set. No card, no
          weight: a quiet line between the fields and the buttons, not a
          third box asking to be read as carefully as the first two. */}
      <div
        className={`flex items-center justify-center gap-x-1.5 mt-1.5 text-[11px] tabular-nums tracking-tight whitespace-nowrap overflow-hidden select-none ${
          darkMode ? "text-zinc-500" : "text-zinc-400"
        }`}
      >
        <span>
          Invest:{" "}
          <span className={`font-semibold ${darkMode ? "text-zinc-400" : "text-zinc-500"}`}>
            {formatMoney(amount)} {currencySymbol}
          </span>
        </span>
        <span className="opacity-60">|</span>
        <span>
          Payout:{" "}
          <span className="font-semibold text-emerald-600/70 dark:text-emerald-400/70">
            {formatMoney(payout)} {currencySymbol}
          </span>
        </span>
      </div>

      {/* ── Row 4: the call ───────────────────────────────────────────── */}
      <div className="flex gap-2.5 mt-1.5">
        <TradeButton
          label="Call"
          icon={<ArrowUp size={17} strokeWidth={3} />}
          color="#22c55e"
          active="#16a34a"
          disabled={isInSafeZone || placing !== null}
          loading={placing === "RISE"}
          onClick={() => place("RISE" as OrderSide)}
        />
        <TradeButton
          label="Put"
          icon={<ArrowDown size={17} strokeWidth={3} />}
          color="#ef4444"
          active="#dc2626"
          disabled={isInSafeZone || placing !== null}
          loading={placing === "FALL"}
          onClick={() => place("FALL" as OrderSide)}
        />
      </div>

    </div>
  );
}

/** Up / Down. Equal halves, because the choice between them is the whole panel. */
function TradeButton({
  label,
  icon,
  color,
  active,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  color: string;
  active: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ backgroundColor: disabled ? `${color}80` : color }}
      onTouchStart={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = active;
      }}
      onTouchEnd={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = color;
      }}
      className="flex-1 h-[41px] rounded-lg flex items-center justify-between px-5 text-white transition-colors disabled:cursor-not-allowed"
    >
      <span className="text-[15px] font-semibold">{label}</span>
      <span className="w-[22px] h-[22px] rounded-full bg-white/25 flex items-center justify-center">
        {loading ? (
          <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          icon
        )}
      </span>
    </button>
  );
}

