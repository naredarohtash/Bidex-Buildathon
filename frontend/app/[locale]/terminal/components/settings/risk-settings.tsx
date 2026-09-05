"use client";

/**
 * The two rules that can stop you trading.
 *
 * Everything else in this panel is a preference — a grid line, a theme, whether
 * a sound plays. These two are different in kind: they hold live state (a
 * running loss, a losing streak, a clock), and when they fire they take the
 * ability to place an order away from you. So they are the only sections drawn
 * as cards, and the only ones allowed a line of explanation.
 *
 * The shape each one takes follows from one question: *what do you need to see
 * before you change it?* You cannot sensibly pick a daily cap without knowing
 * what today has already cost, or a losing-streak trigger without seeing the
 * streak you are on. The live figure comes first in both, above the controls
 * that set it — not below as a summary, and not on some other screen.
 */

import { useEffect, useMemo, useState } from "react";
import { OctagonMinus, TimerReset } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CooldownSettings, DailyLimitSettings } from "../risk-management/risk-management-types";
import {
  Chips,
  FieldLabel,
  RISK_SCALE,
  RISK_SCALE_REVERSED,
  TONE_TEXT,
  type RiskTone,
  Meter,
  NumberField,
  PanelCard,
  PipMeter,
  Segmented,
  Switch,
} from "./settings-controls";

// ============================================================================
// SHARED
// ============================================================================

/** `754000` → `12:34`. Minutes past an hour keep counting up: `75:00`. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * How protective a setup is, in one word.
 *
 * The chips already say it in colour — green is the safest option on a row, red
 * the loosest — but a row of colours tells you about one choice at a time, and
 * protection is the two choices together: pausing after 5 losses for 30 minutes
 * is not the same posture as pausing after 2 for 5. The word is the pair read
 * as one thing, in the language someone would actually use about it.
 */
function levelFrom(score: number): { label: string; tone: RiskTone } {
  if (score >= 5) return { label: "Strong", tone: "safe" };
  if (score >= 3) return { label: "Balanced", tone: "neutral" };
  if (score >= 2) return { label: "Light", tone: "caution" };
  return { label: "Minimal", tone: "loose" };
}

/** A level named inline, coloured to match the chips that set it. */
function Level({ level }: { level: { label: string; tone: RiskTone } }) {
  return <span className={cn("font-semibold", TONE_TEXT[level.tone])}>{level.label}</span>;
}

/**
 * The strip that appears when a rule has actually fired.
 *
 * Red, and above the controls, because at that moment the panel is not settings
 * any more — it is the explanation for why the buy button stopped working. The
 * way out sits inside the strip rather than somewhere further down, so the
 * answer to "how do I trade again" is in the same place as the news that you
 * cannot.
 */
function BlockedStrip({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-red-600 dark:text-red-400">
          {title}
        </span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 rounded-md border border-red-500/30 px-2.5 py-1.5 text-[11.5px] font-semibold leading-none text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            {action.label}
          </button>
        )}
      </div>
      {detail && (
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

/** A switch inside a card body, where there is no `SettingRow` to hold it. */
function CardSwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1 text-[12.5px] text-foreground">{label}</span>
      <Switch label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

// ============================================================================
// TRADE COOLDOWN
// ============================================================================

/* Tolerating more losses before the pause is the looser choice, so the scale
   runs green → red with the numbers. A shorter pause is the looser choice, so
   for durations it runs the other way. */
const TRIGGER_VALUES = [5, 8, 10, 15];

/* A value saved before the row offered these four — 3, from the old set — would
   leave every chip unselected, which reads as "no rule" for a rule that is
   running. It is drawn as its own chip instead, in its place on the scale. */
function triggerOptions(current: number) {
  const values = TRIGGER_VALUES.includes(current)
    ? TRIGGER_VALUES
    : [...TRIGGER_VALUES, current].sort((a, b) => a - b);
  return values.map((n, i) => ({
    value: n,
    label: `${n}`,
    tone: RISK_SCALE[Math.min(i, RISK_SCALE.length - 1)],
  }));
}
const DURATION_OPTIONS = [5, 10, 15, 30].map((n, i) => ({
  value: n,
  label: `${n}m`,
  tone: RISK_SCALE_REVERSED[i],
}));

export function TradeCooldownSection({
  cooldown,
  onChange,
  getRemaining,
  onOverride,
}: {
  cooldown: CooldownSettings;
  onChange: (next: Partial<CooldownSettings>) => void;
  getRemaining: () => number;
  onOverride: () => void;
}) {
  const paused = cooldown.enabled && cooldown.isInCooldown;

  const protection = useMemo(() => {
    const byLosses = cooldown.triggerAfterLosses <= 2 ? 3 : cooldown.triggerAfterLosses === 3 ? 2 : cooldown.triggerAfterLosses === 4 ? 1 : 0;
    const byLength = cooldown.cooldownMinutes >= 30 ? 3 : cooldown.cooldownMinutes >= 15 ? 2 : cooldown.cooldownMinutes >= 10 ? 1 : 0;
    return levelFrom(byLosses + byLength);
  }, [cooldown.triggerAfterLosses, cooldown.cooldownMinutes]);

  /* The countdown is re-read from the clock every second rather than counted
     down from a number held in state. A decrementing counter drifts whenever
     the tab is backgrounded — browsers throttle intervals to once a minute or
     stop them entirely — and would come back showing a pause with minutes left
     on it that ended while you were away. Reading the real remaining time makes
     the wrong value impossible: the worst a throttled tab can do is show a
     stale figure for a moment, then jump to the truth. */
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!paused) return;
    setRemaining(getRemaining());
    const tick = setInterval(() => setRemaining(getRemaining()), 1000);
    return () => clearInterval(tick);
  }, [paused, getRemaining]);

  return (
    <PanelCard
      icon={<TimerReset size={14} strokeWidth={1.9} />}
      title="Cooldown after losses"
      meta="Pauses after a losing run"
      checked={cooldown.enabled}
      onCheckedChange={(enabled) => onChange({ enabled })}
    >
      {paused ? (
        <BlockedStrip
          title={`Paused — ${formatRemaining(remaining)} left`}
          detail={
            cooldown.allowOverride
              ? "You can end the pause early, but the streak that started it is still there."
              : "Trading resumes on its own when the pause ends."
          }
          action={cooldown.allowOverride ? { label: "End pause", onClick: onOverride } : undefined}
        />
      ) : (
        <PipMeter
          label="Losses in a row"
          value={cooldown.consecutiveLosses}
          max={cooldown.triggerAfterLosses}
          footnote={<Level level={protection} />}
        />
      )}

      <div>
        <FieldLabel>Pause after this many losses</FieldLabel>
        <Chips
          label="Losses in a row before the pause"
          options={triggerOptions(cooldown.triggerAfterLosses)}
          value={cooldown.triggerAfterLosses}
          onChange={(triggerAfterLosses) => onChange({ triggerAfterLosses })}
        />
      </div>

      <div>
        <FieldLabel>Pause for</FieldLabel>
        <Chips
          label="Length of the pause"
          options={DURATION_OPTIONS}
          value={cooldown.cooldownMinutes}
          onChange={(cooldownMinutes) => onChange({ cooldownMinutes })}
        />
      </div>

      <CardSwitchRow
        label="Let me end a pause early"
        checked={cooldown.allowOverride}
        onChange={(allowOverride) => onChange({ allowOverride })}
      />

    </PanelCard>
  );
}

// ============================================================================
// DAILY LOSS LIMIT
// ============================================================================

const PERCENT_PRESETS = [2, 5, 10, 20];
const FALLBACK_AMOUNTS = [100, 250, 500, 1000];
/* Warning later leaves less room to react, so later is the looser choice. */
const WARN_OPTIONS = [60, 70, 80, 90].map((n, i) => ({
  value: n,
  label: `${n}%`,
  tone: RISK_SCALE[i],
}));

/** Rounds to something a person would actually type: 512.4 → 500, 2317 → 2500. */
function nice(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const step = magnitude / 2;
  return Math.max(step, Math.round(n / step) * step);
}

export function DailyLimitSection({
  dailyLimit,
  onChange,
  onOverride,
  balance,
  currency,
}: {
  dailyLimit: DailyLimitSettings;
  onChange: (next: Partial<DailyLimitSettings>) => void;
  onOverride: () => void;
  balance: number;
  currency: string;
}) {
  const byPercent = dailyLimit.maxDailyLossType === "percentage";
  const ceiling = byPercent ? (balance * dailyLimit.maxDailyLoss) / 100 : dailyLimit.maxDailyLoss;
  const lostToday = Math.max(0, -(dailyLimit.currentDailyPL ?? 0));
  const usedPct = ceiling > 0 ? (lostToday / ceiling) * 100 : 0;
  const remaining = Math.max(0, ceiling - lostToday);

  /* A cap is strict or loose relative to what there is to lose, not in
     absolute money: 500 is a tight leash on 5,000 and no leash at all on
     500,000. */
  const strictness = useMemo(() => {
    const share = balance > 0 ? (ceiling / balance) * 100 : 100;
    const byShare = share <= 2 ? 3 : share <= 5 ? 2 : share <= 10 ? 1 : 0;
    const byWarning = dailyLimit.warningThreshold <= 60 ? 3 : dailyLimit.warningThreshold <= 70 ? 2 : dailyLimit.warningThreshold <= 80 ? 1 : 0;
    return levelFrom(byShare + byWarning);
  }, [balance, ceiling, dailyLimit.warningThreshold]);

  const overridden = !!dailyLimit.overrideUntil && Date.now() < dailyLimit.overrideUntil;
  const stopped = dailyLimit.enabled && dailyLimit.isLimitReached && !overridden;

  /* Presets follow the unit *and* the account. Fixed dollar amounts hardcoded
     into the component offered ₹200 / ₹500 / ₹1,000 / ₹2,000 to someone holding
     ₹50,000 — four caps that are all, in practice, "stop after one trade". They
     are cut from the balance instead, so the choice on offer is always a
     fraction of what there is to lose. */
  const presets = useMemo(() => {
    if (byPercent)
      return PERCENT_PRESETS.map((n, i) => ({ value: n, label: `${n}%`, tone: RISK_SCALE[i] }));
    const fromBalance = [1, 2, 5, 10].map((pct) => nice((balance * pct) / 100));
    const usable = Array.from(new Set(fromBalance.filter((n) => n > 0)));
    const values = usable.length === 4 ? usable : FALLBACK_AMOUNTS;
    /* A bigger cap is the looser choice, whichever unit it is set in. */
    return values.map((n, i) => ({
      value: n,
      label: n.toLocaleString("en-US"),
      tone: RISK_SCALE[i],
    }));
  }, [byPercent, balance]);

  return (
    <PanelCard
      icon={<OctagonMinus size={14} strokeWidth={1.9} />}
      title="Daily Stop Loss"
      meta="Stops the day at your cap"
      checked={dailyLimit.enabled}
      onCheckedChange={(enabled) => onChange({ enabled })}
    >
      {stopped ? (
        <BlockedStrip
          title={`Stopped for today — ${money(lostToday)} ${currency} lost`}
          detail="The limit resets overnight."
          action={{ label: "Trade anyway", onClick: onOverride }}
        />
      ) : (
        <Meter
          label={overridden ? "Lost today · overridden" : "Lost today"}
          value={`${money(lostToday)} / ${money(ceiling)}`}
          pct={usedPct}
          warnAt={dailyLimit.warningThreshold}
          footnote={
            <>
              <Level level={strictness} /> · {money(remaining)} {currency} left
            </>
          }
        />
      )}

      {/* The amount and its unit on one line. They were two stacked rows —
          "Limit set as" above "Most I can lose in a day" — which asked you to
          make a decision about units before you were allowed to type a number,
          and the number was the thing you came here to change. */}
      <div>
        <FieldLabel>Stop me after I lose</FieldLabel>
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <NumberField
              label="Daily stop loss"
              value={dailyLimit.maxDailyLoss}
              min={1}
              max={byPercent ? 100 : undefined}
              onChange={(maxDailyLoss) => onChange({ maxDailyLoss })}
            />
          </div>
          <Segmented
            label="Limit measured in"
            options={[
              { value: "amount", label: currency },
              { value: "percentage", label: "%" },
            ]}
            value={dailyLimit.maxDailyLossType}
            onChange={(maxDailyLossType) => onChange({ maxDailyLossType })}
          />
        </div>
        <div className="mt-2.5">
          <Chips
            label="Daily stop loss presets"
            options={presets}
            value={dailyLimit.maxDailyLoss}
            onChange={(maxDailyLoss) => onChange({ maxDailyLoss })}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Warn me at</FieldLabel>
        <Chips
          label="Point at which the meter warns"
          options={WARN_OPTIONS}
          value={dailyLimit.warningThreshold}
          onChange={(warningThreshold) => onChange({ warningThreshold })}
        />
      </div>

    </PanelCard>
  );
}
