"use client";

import type { LucideIcon } from "lucide-react";
import { Percent, Layers, Tag, Headset } from "lucide-react";

/**
 * Single source of truth for account tiers.
 *
 * The tier glyph, name, colour and thresholds were previously duplicated across the
 * Account Levels modal, the header status block and the balance-card button, and had
 * drifted — the status block coloured Elite purple while the balance card coloured it
 * amber, and each surface used a different icon set. Everything now reads from here so
 * the three cannot disagree.
 */

export type TierKey = "basic" | "advanced" | "elite";

export interface TierAccent {
  /** glyph / check colour */
  icon: string;
  /** glyph tile background + border */
  iconTile: string;
  /** payout figure colour */
  text: string;
  /** payout pill background */
  pill: string;
  /** ring on the active card */
  ring: string;
  /** wash behind the active card */
  wash: string;
  /** progress + indicator fill, and the filled level bars */
  fill: string;
  /** "NOW" badge on the active card */
  badge: string;
}

export interface TierBenefit {
  Icon: LucideIcon;
  text: string;
}

export interface Tier {
  key: TierKey;
  /** 1-3, drives the level bars */
  level: 1 | 2 | 3;
  /**
   * Real balance, in USD, at or above which the account sits at this level.
   * Denominated in USD because that is what the backend charges and validates
   * against; every display surface multiplies by the display-currency rate.
   */
  minBalanceUsd: number;
  /** Largest stake, in USD, allowed on a single position at this level. */
  maxTradeUsd: number;
  name: string;
  /** short enough that it never wraps beside the name */
  subtitle: string;
  payout: string;
  /** payout uplift as a label fragment, e.g. "+2% Payout" */
  payoutLabel: string;
  /** uppercase status label used in the header */
  statusLabel: string;
  /**
   * These are the same four entitlements the tier list has always carried, written
   * out in full rather than clipped to fit a narrow column. No new commercial
   * promises are introduced here — inventing entitlements would put claims in front
   * of real customers that the platform has not agreed to honour.
   */
  benefits: TierBenefit[];
  accent: TierAccent;
}

/**
 * Escalating level bars — 1, 2 or 3 of three filled, ascending in height like a
 * signal meter.
 *
 * Replaces the pictorial icons (shield/rocket/crown, then candlestick/trend/gem,
 * then wallet/bolt/trophy). A rank meter cannot be misread the way a metaphor can,
 * and because it is drawn from `size` rather than a fixed glyph it stays crisp at
 * the 12px the header status block uses as well as the 20px the modal uses.
 */
export function TierBars({
  level,
  size = 18,
  filledClass,
  emptyClass = "bg-white/[0.13]",
  className = "",
}: {
  level: 1 | 2 | 3;
  size?: number;
  filledClass: string;
  emptyClass?: string;
  className?: string;
}) {
  const barW = Math.max(2, Math.round(size / 4.5));
  const gap = Math.max(1.5, size / 9);
  const heights = [size * 0.45, size * 0.72, size];
  return (
    <span
      className={`inline-flex items-end ${className}`}
      style={{ gap, height: size }}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <span
          key={i}
          className={`${i < level ? filledClass : emptyClass} rounded-[1.5px] block`}
          style={{ width: barW, height: Math.round(h) }}
        />
      ))}
    </span>
  );
}

export const TIERS: Record<TierKey, Tier> = {
  basic: {
    key: "basic",
    level: 1,
    minBalanceUsd: 0,
    maxTradeUsd: 1000,
    name: "Basic",
    subtitle: "Beginner",
    payout: "+0%",
    payoutLabel: "+0% Payout",
    statusLabel: "BASIC STATUS",
    benefits: [
      { Icon: Percent, text: "Standard payout rate on every instrument" },
      { Icon: Layers, text: "Full access to all available markets" },
    ],
    accent: {
      icon: "text-zinc-600 dark:text-zinc-300",
      iconTile: "bg-zinc-100 border-zinc-200 dark:bg-white/[0.05] dark:border-white/[0.08]",
      text: "text-zinc-600 dark:text-zinc-300",
      pill: "bg-zinc-100 dark:bg-white/[0.05]",
      ring: "ring-zinc-400/40",
      wash: "bg-zinc-50 dark:bg-white/[0.025]",
      fill: "bg-zinc-500 dark:bg-zinc-300",
      badge: "bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-400/15 dark:text-zinc-100 dark:border-zinc-400/30",
    },
  },
  advanced: {
    key: "advanced",
    level: 2,
    minBalanceUsd: 5000,
    maxTradeUsd: 2000,
    name: "Advanced",
    subtitle: "Active trader",
    payout: "+2%",
    payoutLabel: "+2% Payout",
    statusLabel: "ADVANCED STATUS",
    benefits: [
      { Icon: Percent, text: "+2% added to your payout on every trade" },
      { Icon: Tag, text: "Promo codes from mailings and promotions" },
    ],
    accent: {
      icon: "text-emerald-700 dark:text-emerald-400",
      iconTile: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/[0.08] dark:border-emerald-500/20",
      text: "text-emerald-700 dark:text-emerald-400",
      pill: "bg-emerald-50 dark:bg-emerald-500/10",
      ring: "ring-emerald-500/50",
      wash: "bg-emerald-50/60 dark:bg-emerald-500/[0.035]",
      fill: "bg-emerald-600 dark:bg-emerald-400",
      badge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    },
  },
  elite: {
    key: "elite",
    level: 3,
    minBalanceUsd: 12000,
    maxTradeUsd: 3000,
    name: "Elite",
    subtitle: "Professional",
    payout: "+4%",
    payoutLabel: "+4% Payout",
    statusLabel: "ELITE STATUS",
    benefits: [
      { Icon: Percent, text: "+4% added to your payout rate — the maximum available" },
      { Icon: Headset, text: "A dedicated account manager for your account" },
    ],
    accent: {
      icon: "text-amber-700 dark:text-amber-400",
      iconTile: "bg-amber-50 border-amber-200 dark:bg-amber-500/[0.08] dark:border-amber-500/20",
      text: "text-amber-700 dark:text-amber-400",
      pill: "bg-amber-50 dark:bg-amber-500/10",
      ring: "ring-amber-500/50",
      wash: "bg-amber-50/60 dark:bg-amber-500/[0.035]",
      fill: "bg-amber-600 dark:bg-amber-400",
      badge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    },
  },
};

export const TIER_ORDER: TierKey[] = ["basic", "advanced", "elite"];
export const TIER_LIST: Tier[] = TIER_ORDER.map((k) => TIERS[k]);

/** Resolve the tier for a balance already converted to the display currency. */
export function resolveTier(balance: number, advancedMin: number, eliteMin: number): TierKey {
  if (balance >= eliteMin) return "elite";
  if (balance >= advancedMin) return "advanced";
  return "basic";
}

/**
 * Resolve the tier straight from a USD real balance, using the thresholds on the
 * tier table itself. Callers that already work in USD (the order panel, the stake
 * cap) should use this rather than converting to the display currency and back —
 * a round trip through a display rate is where a $5,000 balance turns into
 * $4,999.99 and silently drops a level.
 */
export function resolveTierByUsdBalance(balanceUsd: number): TierKey {
  if (balanceUsd >= TIERS.elite.minBalanceUsd) return "elite";
  if (balanceUsd >= TIERS.advanced.minBalanceUsd) return "advanced";
  return "basic";
}

/** Largest single-position stake, in USD, permitted for a given USD real balance. */
export function maxTradeUsdForBalance(balanceUsd: number): number {
  return TIERS[resolveTierByUsdBalance(balanceUsd)].maxTradeUsd;
}
