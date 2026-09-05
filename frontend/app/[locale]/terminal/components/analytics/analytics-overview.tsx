"use client";

/**
 * The performance dashboard.
 *
 * This replaces a deck of twelve equal cards laid out on a fixed-height grid.
 * That deck had one idea — every metric is a card, every card is the same size —
 * and the idea was wrong in three ways at once. It gave a headline figure and a
 * scatter of five markets identical weight, so nothing on the page was more
 * important than anything else. It pinned rows to a measured pixel floor, so the
 * page could not reflow and a phone got a desktop grid with a scrollbar. And it
 * carried three cards nobody read (best & worst, by market, recent trades) whose
 * real content already existed elsewhere in the terminal.
 *
 * What is here instead is the ordinary shape of an analytics page, because it is
 * ordinary for a reason: the eye needs a route through the screen.
 *
 *   header        what am I looking at, over what window, filtered how
 *   four figures  the numbers you would quote to someone
 *   the trend     the one chart worth the width, this window against the last
 *   the splits    where the volume goes, when you trade, how trades end, and
 *                 whether the win rate clears its own break-even
 *   the table     which markets are actually earning
 *
 * Three rules hold it together.
 *
 * ONE WINDOW. Range and filters live in the header and nowhere else. Every
 * figure, every series and every row on the page describes the same set of
 * trades, so the parts cannot contradict each other — the previous-period
 * comparison is drawn from the same filtered subset as the current one, which is
 * why filtering happens before the window is cut (see use-trading-analytics).
 *
 * SEMANTIC COLOUR, NOT A THEME MAP. The old file carried three hand-tuned token
 * sets for dark, navy and light, which is three chances to forget one. Surfaces
 * here are the same `bg-card` / `border-border` / `text-muted-foreground` the
 * account and security pages are built from, so all three themes come free and
 * stay in step with the rest of the product. Charts need raw colour strings for
 * SVG, and take them from the same variables through `hsl(var(--…))`.
 *
 * NOTHING IS A FIXED HEIGHT. Cards size to their content and the page scrolls.
 * That is the whole of the responsive story: the grids drop from four columns to
 * two to one, the chart keeps a fluid aspect, and the leaderboard becomes a list
 * of cards below `md` rather than a table with a horizontal scrollbar.
 *
 * A note on animation: `styles/theme.css` sets a global `* { transition: … }`
 * covering colour and background only, and it outranks Tailwind's `transition-*`
 * utilities. Hover tints therefore animate on their own; anything else that moves
 * — arcs, bars, the chart reveal — is framer-motion, which writes inline styles
 * and is unaffected.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  ListFilter,
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  CONTROL,
  CloseButton,
  MenuItem,
  PageHeader,
  Popover,
} from "./page-chrome";
import type { TradingStats } from "@/types/binary-trading";
import type { BinaryMarket, CompletedOrder } from "@/store/trade/use-binary-store";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { useUserStore } from "@/store/user";
import { FactorMark, PnlMark, TradesMark, WinRateMark } from "./analytics-marks";
import { breakEvenWinRate, tradePnl } from "./trading-analytics";
import {
  ANALYTICS_RANGES,
  activeFilterCount,
  rangeBounds,
  rangeBuckets,
  type AnalyticsFilters,
  type AnalyticsRange,
} from "./use-trading-analytics";
import { downloadTrades } from "./export-trades";
import { getAssetDisplayName } from "@/utils/image-fallback";
import { getMarketDisplayName } from "../header/market-browser-panel";
import { AssetIcon, classifyMarket } from "@/components/markets/asset-icon";

/* ══ palette ═══════════════════════════════════════════════════════════════
   Two families, kept apart on purpose.

   OUTCOME colours carry meaning and never change: the terminal's green and red,
   the same two the chart and the order panel use, so a profit is the same green
   everywhere in the product.

   SERIES colours carry no meaning at all — they only have to be distinguishable
   from each other, and to stay distinguishable on a white card and on a near
   black one. They are ordered so the first two (the brand indigo and its blue)
   take the largest shares, which is what puts the page's dominant colour next to
   the page's dominant fact. */

const UP = "#089981";
const DOWN = "#f23645";
const NEUTRAL = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";
const TRACK = "hsl(var(--border))";
const BRAND = "hsl(var(--brand))";

const SERIES = ["#4f46e5", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#f43f5e"];

/* ══ formatting ════════════════════════════════════════════════════════════ */

const nf = (n: number) => (Number(n) || 0).toLocaleString("en-US");

/** 24,532 → "24.5K". Used wherever a figure shares a line with something else. */
function compact(n: number): string {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const s = v < 0 ? "−" : "";
  for (const [d, suf] of [[1e9, "B"], [1e6, "M"], [1e3, "K"]] as [number, string][]) {
    if (abs >= d) {
      const q = abs / d;
      return `${s}${q >= 100 ? Math.round(q) : q.toFixed(1)}${suf}`;
    }
  }
  return `${s}${abs >= 100 ? Math.round(abs).toLocaleString("en-US") : abs.toFixed(abs % 1 === 0 ? 0 : 2)}`;
}

function money(v: number, sym: string, o: { compact?: boolean; sign?: boolean } = {}): string {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  const s = n < 0 ? "−" : o.sign && n > 0 ? "+" : "";
  if (o.compact && abs >= 1000) return `${s}${sym}${compact(abs)}`;
  return `${s}${sym}${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const pct = (v: number, d = 1) => `${(Number(v) || 0).toFixed(d)}%`;

/** 95 → "1m 35s". The reference's "2h 35m" column, for trade duration. */
function duration(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

const toneOf = (v: number) => (v > 0 ? UP : v < 0 ? DOWN : NEUTRAL);

/* ══ small hooks ═══════════════════════════════════════════════════════════ */

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/* ══ market naming ═════════════════════════════════════════════════════════
   Names come from the market record and the browser's own display function, so
   the dashboard prints "Axis Bank" exactly where the asset browser does. Only a
   symbol with no record left falls back to deriving a name from the ticker. */

const symKey = (s: string) => (s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const stripOtc = (s: string) => symKey(s).replace(/OTC$/, "");

export interface MarketLabel {
  name: string;
  isOTC: boolean;
  market: BinaryMarket | null;
  category: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  crypto: "Crypto",
  currencies: "Forex",
  commodities: "Commodities",
  stocks: "Stocks",
  indian_stocks: "NSE Stocks",
};

/**
 * Every class the platform lists, in a fixed order, with a fixed colour.
 *
 * The ring used to be built from whatever the window happened to contain,
 * sorted by size and coloured by rank. Two things were wrong with that. A class
 * you did not trade this week simply vanished, so "I have stopped trading
 * commodities" — which is a finding — looked identical to "commodities do not
 * exist". And colour by rank means crypto is indigo on a week it leads and blue
 * on a week it comes second, which quietly destroys the one thing a legend is
 * for: being able to glance at the ring afterwards and know what you are
 * looking at.
 *
 * Fixed order, fixed colour, zeroes included.
 */
const CATEGORY_ORDER = ["crypto", "currencies", "commodities", "stocks", "indian_stocks"] as const;

const CATEGORY_COLOUR: Record<string, string> = {
  crypto: "#4f46e5",
  currencies: "#3b82f6",
  commodities: "#f59e0b",
  stocks: "#10b981",
  indian_stocks: "#8b5cf6",
  /* Anything whose market record has gone missing. Deliberately the quietest
     colour on the ring — it is a gap in our data, not a class anybody trades. */
  other: "#94a3b8",
};

function useMarketLabeller() {
  const markets = useBinaryStore((s) => s.binaryMarkets);
  return useMemo(() => {
    const byKey = new Map<string, BinaryMarket>();
    for (const m of markets || []) {
      const raw = String((m as any).symbol || `${(m as any).currency}/${(m as any).pair}`);
      byKey.set(symKey(raw), m);
      byKey.set(stripOtc(raw), m);
    }
    return (symbol: string): MarketLabel => {
      const m = byKey.get(symKey(symbol)) ?? byKey.get(stripOtc(symbol)) ?? null;
      return {
        name: m ? getMarketDisplayName(m) : getAssetDisplayName(symbol),
        isOTC: String(symbol).toUpperCase().includes("OTC"),
        market: m,
        /* No record means no category, and guessing one from the ticker is how
           the same asset ends up filed twice. Unknown is its own bucket. */
        category: m ? classifyMarket(m) : "other",
      };
    };
  }, [markets]);
}

/**
 * The OTC mark, worn on the name's shoulder.
 *
 * It used to be a chip on the baseline beside the name, at the size of a small
 * word — which made it read as a second word in the market's title, so
 * "EUR/USD OTC" looked like the name of a different instrument. It is not part
 * of the name; it is a note about the name. Raised, half the size, and set
 * back from the last letter by a hair rather than a full space, it reads the
 * way a footnote marker does: seen, understood, not read aloud.
 *
 * `self-start` with a small nudge rather than `align-super`, because these
 * sit in flex rows where vertical-align does nothing at all.
 */
function OtcTag() {
  return (
    <span
      title="OTC market"
      /* Two thirds smaller again than the chip this started as: 8px letters in
         a 3px-padded box came to roughly 24×11, then 17×9, then 13×7, and
         this is about 11×6 — a fifth of the original ink. Uppercase and bold
         is what keeps three glyphs legible at this size, and the `title`
         carries the full meaning for anyone who needs more than a marker.
      
         Seven pixels lower than where it started, too. Hung off the top of
         the flex line it floated above the name's capitals with nothing under
         it; at `mt-[4px]` it sits across their upper half, which is what "on
         the corner of the name" actually looks like.
      
         The nudge left it started with (`-ml-px`) was pulling it into the last
         letter of the name — a marker touching the word it marks reads as a
         collision, not as a superscript. It sits a hair clear of it now. */
      className="ml-[1.5px] mt-[4px] shrink-0 self-start rounded-[1.5px] bg-muted px-[1px] text-[4.5px] font-bold uppercase leading-[6px] tracking-[0.04em] text-muted-foreground"
    >
      OTC
    </span>
  );
}

/** Icon for a market, with a lettered disc when the market record is missing. */
function MarketGlyph({ label, size = 24 }: { label: MarketLabel; size?: number }) {
  if (label.market) return <AssetIcon market={label.market} size={size} />;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-muted font-semibold text-muted-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {(label.name || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}

/* ══ shell ═════════════════════════════════════════════════════════════════ */

/** The ⓘ beside a card title. CSS hover rather than a portal — the dashboard is
    itself inside a portalled overlay, and a second portal on top of it lands in
    the wrong place under the terminal's zoom control. */
function Hint({ text, label }: { text: string; label: string }) {
  return (
    <span className="group relative shrink-0">
      <button
        type="button"
        aria-label={`About ${label}`}
        className="grid h-5 w-5 place-items-center rounded text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-40 mt-1.5 hidden w-56 rounded-lg border border-border bg-popover p-2 text-left text-[11px] font-normal leading-relaxed text-popover-foreground shadow-lg group-hover:block"
      >
        {text}
      </span>
    </span>
  );
}

function Card({
  title,
  hint,
  action,
  children,
  className,
  muted,
}: {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** The four headline tiles sit a shade back from the cards that carry charts,
      so the top row reads as a summary band rather than as four more panels. */
  muted?: boolean;
}) {
  return (
    <section
      /* Deliberately not `overflow-hidden`. Two cards open a dropdown from
         their own header, and a clipped popover is a menu that renders as a
         2px sliver at the card's edge. Nothing here paints to the rounded
         corners, so there is nothing for the clip to have been protecting. */
      className={cn(
        "relative flex min-w-0 flex-col rounded-lg border border-border",
        muted ? "bg-muted/40" : "bg-card",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 pb-1.5 pt-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-1">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground sm:text-[15px]">
              {title}
            </h3>
            {hint && <Hint text={hint} label={title || ""} />}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/** "↗ 12.5% vs last week" — the reference's comparison line, under every figure.

    Percentages compare in points, not in percent of a percent: a win rate going
    from 50% to 55% is five points, and calling it "10% higher" is the single
    most common way a dashboard lies to the person reading it. */
function Delta({
  current,
  previous,
  label,
  points = false,
  neutral = false,
}: {
  current: number;
  previous: number | null;
  label: string;
  points?: boolean;
  neutral?: boolean;
}) {
  if (previous == null || !Number.isFinite(previous) || (!points && previous === 0)) {
    return <p className="truncate text-[11px] text-muted-foreground sm:text-[12px]">{label}</p>;
  }
  const change = points ? current - previous : ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change) || Math.abs(change) < 0.05) {
    return (
      <p className="truncate text-[11px] text-muted-foreground sm:text-[12px]">
        <span className="font-semibold text-foreground">No change</span> {label}
      </p>
    );
  }
  const up = change > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const tone = neutral ? NEUTRAL : up ? UP : DOWN;
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:text-[12px]">
      {/* A chip, not a coloured word. Under a 28px figure a bare arrow and a
          number read as a second, smaller figure — two numbers where there is
          one. Sitting on its own tint it reads as an annotation of the one
          above it, which is what it is. `color-mix` because the tone is a hex
          for the outcome colours and an `hsl(var(--…))` for neutral, and only
          one of those takes an appended alpha. */}
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-[2px] font-semibold tabular-nums"
        style={{ color: tone, background: `color-mix(in srgb, ${tone} 13%, transparent)` }}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {Math.abs(change).toFixed(1)}
        {points ? "pts" : "%"}
      </span>
      <span className="truncate">{label}</span>
    </p>
  );
}

/** The window this page describes, printed the way a person would say it. */
function rangeLabel(range: AnalyticsRange, short = false): string {
  if (range === "all") return "All time";
  const { start, end } = rangeBounds(range);
  const from = new Date(start);
  const to = new Date(end - 1);
  const day = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(withYear ? { year: "numeric" as const } : {}),
    });
  if (range === "today") return short ? "Today" : `Today, ${day(to, true)}`;
  if (short) return `${day(from, false)} – ${day(to, false)}`;
  return `${day(from, false)} – ${day(to, true)}`;
}

/**
 * What the two lines on the trend chart are called.
 *
 * They used to be labelled by their dates — "Aug 29 – Sep 4" against "Previous
 * 7 days" — which is precise and is not what anybody is asking. The question a
 * two-line chart answers is "am I doing better than last time", and the words
 * for that are this week and last week.
 */
function seriesNames(range: AnalyticsRange): { cur: string; prev: string | null } {
  if (range === "today") return { cur: "Today", prev: "Yesterday" };
  if (range === "week") return { cur: "This week", prev: "Last week" };
  if (range === "month") return { cur: "This month", prev: "Last month" };
  return { cur: "All time", prev: null };
}

/** How the previous window is named in a comparison line.

    Deliberately short. This sits under a headline figure inside a tile that is
    half a phone wide, and "vs previous 7 days" was long enough to be truncated
    to "vs previous 7 d…" on every one of the four. */
function pastLabel(range: AnalyticsRange): string {
  return range === "today"
    ? "vs yesterday"
    : range === "week"
      ? "vs last 7 days"
      : range === "month"
        ? "vs last 30 days"
        : "across the whole account";
}

/**
 * The waving hand beside the heading.
 *
 * It replaces a whole greeting card — a sun, a rotating slogan, "Good morning,
 * <name>" and an avatar with a pulsing dot, absolutely centred in the header
 * bar above a page about trades. The greeting was never the point; being
 * addressed by name once was. This is that, at one glyph.
 *
 * It waves on a long cycle with most of the cycle at rest, because a hand that
 * never stops moving beside a figure you are trying to read is not friendly,
 * it is a distraction with a smile on it. `transformOrigin` is the wrist —
 * rotating about the centre of the glyph makes it wobble rather than wave.
 */
/* ══ trend chart ═══════════════════════════════════════════════════════════ */

export interface TrendBucket {
  /** Start of the bucket, for labelling. */
  t: number;
  /** Axis tick, e.g. "Mon" or "14:00". */
  short: string;
  /** Tooltip heading, e.g. "Wednesday, Sep 3". */
  full: string;
  cur: number;
  /** Same slot in the preceding window; null when there is no previous window. */
  prev: number | null;
}

/**
 * Monotone cubic interpolation (Fritsch–Carlson).
 *
 * A Catmull-Rom spline is one line shorter and was the first attempt, but it
 * overshoots between points: a day of zero trades sitting between two busy days
 * dips the curve below the axis and draws a negative trade count. Monotone
 * tangents cannot overshoot, so the curve only ever passes through values the
 * data actually contains — the same reason the candle animator clamps.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const m: number[] = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
    }
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${pts[i].x + h} ${pts[i].y + m[i] * h} ${pts[i + 1].x - h} ${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

function TrendChart({
  buckets,
  format,
  curName,
  prevName,
  signed,
  integer = false,
}: {
  buckets: TrendBucket[];
  format: (v: number) => string;
  curName: string;
  prevName: string | null;
  /** The metric can be negative, so a zero rule is drawn and the domain is not
      pinned to the axis. */
  signed: boolean;
  /** Counts have no half. Without this a quiet week is labelled 0 / 0.5 / 1. */
  integer?: boolean;
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  /* Lazy initialiser, not `useRef(expr)`: the argument to useRef is evaluated
     on every render even though only the first is kept, so the plain form ran
     Math.random on every pointer move. */
  const [revealId] = useState(() => `bx-rv-${Math.random().toString(36).slice(2, 9)}`);

  const geo = useMemo(() => {
    const pad = { t: 14, r: 10, b: 24, l: 38 };
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    if (buckets.length < 2 || pw <= 10 || ph <= 10) return null;

    const values: number[] = [];
    for (const b of buckets) {
      values.push(b.cur);
      if (b.prev != null) values.push(b.prev);
    }
    let lo = Math.min(...values, signed ? Infinity : 0);
    let hi = Math.max(...values, 0);
    if (!Number.isFinite(lo)) lo = 0;
    if (hi === lo) hi = lo + 1;
    const headroom = (hi - lo) * 0.14;
    hi += headroom;
    if (signed) lo -= headroom;

    /* Ticks on round numbers rather than on four equal slices of the data, so
       the gridlines read 0 / 1K / 2K / 3K instead of 0 / 1,133 / 2,266. */
    const rawStep = (hi - lo) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
    let step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= rawStep) ?? mag * 10;
    if (integer) step = Math.max(1, Math.round(step));
    const tickLo = Math.floor(lo / step) * step;
    const tickHi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = tickLo; v <= tickHi + step / 2; v += step) ticks.push(v);

    const x = (i: number) => pad.l + (i / (buckets.length - 1)) * pw;
    const y = (v: number) => pad.t + (1 - (v - tickLo) / (tickHi - tickLo || 1)) * ph;
    const base = pad.t + ph;
    const zero = y(0);
    return {
      x,
      y,
      pad,
      pw,
      ph,
      ticks,
      base,
      zero,
      /* The area hangs off the zero line when the metric is signed. Anchored to
         the axis instead, a loss-making day was drawn as a *large* filled block
         reaching down to −200, which is the opposite of what it means. */
      areaBase: signed ? Math.max(pad.t, Math.min(base, zero)) : base,
      tickLo,
      tickHi,
    };
  }, [buckets, w, h, signed, integer]);

  /* Label every bucket while they fit, then every 2nd, 3rd… A 30-day window at
     phone width has room for about five. */
  const labelEvery = useMemo(() => {
    if (!geo) return 1;
    const perLabel = 46;
    return Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor(geo.pw / perLabel))));
  }, [geo, buckets.length]);

  const curPts = useMemo(
    () => (geo ? buckets.map((b, i) => ({ x: geo.x(i), y: geo.y(b.cur) })) : []),
    [geo, buckets]
  );
  const prevPts = useMemo(
    () =>
      geo && prevName
        ? buckets.map((b, i) => ({ x: geo.x(i), y: geo.y(b.prev ?? 0) }))
        : [],
    [geo, buckets, prevName]
  );

  const onMove = (clientX: number) => {
    if (!geo || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const rel = clientX - rect.left - geo.pad.l;
    if (rel < -14 || rel > geo.pw + 14) return setHover(null);
    const f = Math.max(0, Math.min(1, rel / geo.pw));
    setHover(Math.round(f * (buckets.length - 1)));
  };

  const active = hover != null && geo ? buckets[hover] : null;
  const bandW = geo ? Math.min(46, Math.max(14, geo.pw / buckets.length)) : 0;

  return (
    <div
      ref={ref}
      className="relative h-full w-full touch-pan-y"
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      {!geo ? (
        <div className="grid h-full place-items-center px-4 text-center text-[12px] text-muted-foreground">
          Not enough settled trades in this window to plot
        </div>
      ) : (
        <>
          <svg width={w} height={h} className="block overflow-visible">
            <defs>
              {/* The line shades along its own length rather than being one
                  flat blue. It is the cheapest way to give a two-line chart a
                  front and a back: the near end of the series reads as the
                  live one, the far end recedes, and the dashed comparison
                  underneath stops competing for the same plane. */}
              <linearGradient id={`${revealId}-ink`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.55} />
                <stop offset="55%" stopColor={BRAND} stopOpacity={0.9} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={1} />
              </linearGradient>
              {/* A soft bloom, not a drop shadow. Offset shadows put the line
                  above the grid like a sticker; a symmetric blur reads as the
                  ink being lit. */}
              <filter id={`${revealId}-glow`} x="-12%" y="-40%" width="124%" height="180%">
                <feGaussianBlur stdDeviation="3.2" result="b" />
                <feComponentTransfer in="b" result="soft">
                  <feFuncA type="linear" slope="0.42" />
                </feComponentTransfer>
                <feMerge>
                  <feMergeNode in="soft" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <clipPath id={revealId}>
                {/* One reveal for the whole plot, so both lines arrive
                    together and left to right. */}
                <motion.rect
                  x={geo.pad.l}
                  y={0}
                  height={h}
                  initial={{ width: 0 }}
                  animate={{ width: geo.pw + 2 }}
                  transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                />
              </clipPath>
            </defs>

            {/* horizontal rules + y labels */}
            {geo.ticks.map((v) => (
              <g key={`h${v}`}>
                <line
                  x1={geo.pad.l}
                  x2={geo.pad.l + geo.pw}
                  y1={geo.y(v)}
                  y2={geo.y(v)}
                  stroke={GRID}
                  strokeWidth={1}
                  opacity={0.55}
                />
                <text
                  x={geo.pad.l - 7}
                  y={geo.y(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="tabular-nums"
                  fill="hsl(var(--muted-foreground))"
                  style={{ fontSize: 10 }}
                >
                  {compact(v)}
                </text>
              </g>
            ))}

            {/* vertical rules, only where a label sits */}
            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <line
                  key={`v${b.t}`}
                  x1={geo.x(i)}
                  x2={geo.x(i)}
                  y1={geo.pad.t}
                  y2={geo.base}
                  stroke={GRID}
                  strokeWidth={1}
                  opacity={0.4}
                />
              ) : null
            )}

            {signed && geo.zero > geo.pad.t && geo.zero < geo.base && (
              <line
                x1={geo.pad.l}
                x2={geo.pad.l + geo.pw}
                y1={geo.zero}
                y2={geo.zero}
                stroke={NEUTRAL}
                strokeWidth={1}
                opacity={0.5}
              />
            )}

            {/* The hovered column: a band, and a rule down its middle.
            
                The band alone said "somewhere around here" — at 46px wide over
                a day's column that is a fortnight of ambiguity on a monthly
                chart. The rule says which day, and the dot at the top of it
                says which value on that day. */}
            {hover != null && (
              <g>
                <rect
                  x={geo.x(hover) - bandW / 2}
                  y={geo.pad.t}
                  width={bandW}
                  height={geo.ph}
                  rx={4}
                  fill={BRAND}
                  opacity={0.08}
                />
                <line
                  x1={geo.x(hover)}
                  x2={geo.x(hover)}
                  y1={geo.pad.t}
                  y2={geo.base}
                  stroke={BRAND}
                  strokeOpacity={0.4}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              </g>
            )}

            {/* Two lines and nothing under them.
            
                The current series was filled with a gradient down to the axis,
                which is right for one series and wrong for two: the fill reads
                as volume, the dashed line reads as a line, and the pair stop
                being comparable — the eye weighs a shaded region against a
                stroke and calls the shaded one bigger whatever the numbers
                say. A comparison chart draws both halves the same way. */}
            <g clipPath={`url(#${revealId})`}>
              {prevPts.length > 0 && (
                <path
                  d={smoothPath(prevPts)}
                  fill="none"
                  stroke={BRAND}
                  strokeOpacity={0.55}
                  strokeWidth={1.75}
                  strokeDasharray="5 5"
                  strokeLinecap="round"
                />
              )}
              <path
                d={smoothPath(curPts)}
                fill="none"
                stroke={`url(#${revealId}-ink)`}
                strokeWidth={2.4}
                strokeLinejoin="round"
                strokeLinecap="round"
                filter={`url(#${revealId}-glow)`}
              />

              {/* A mark at every reading.
              
                  A smoothed curve is an interpolation, and without dots it is
                  not possible to tell which points on it are measurements and
                  which are the spline's opinion. They are small enough to read
                  as texture until you look for them, and the hovered one grows
                  into the cursor's own marker. */}
              {curPts.map((pt, i) => (
                <circle
                  key={`p${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={hover === i ? 0 : 2.1}
                  fill="hsl(var(--card))"
                  stroke={BRAND}
                  strokeWidth={1.6}
                  opacity={hover != null && hover !== i ? 0.45 : 0.9}
                />
              ))}
            </g>

            {/* Where the series ends — today, still filling. A quiet pulse, so
                the eye lands on the newest reading first rather than having to
                find the right-hand end of the line. */}
            {curPts.length > 0 && hover == null && (
              <g>
                <motion.circle
                  cx={curPts[curPts.length - 1].x}
                  cy={curPts[curPts.length - 1].y}
                  fill={BRAND}
                  initial={{ r: 3, opacity: 0.45 }}
                  animate={{ r: [3, 9, 9], opacity: [0.45, 0, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", times: [0, 0.6, 1] }}
                />
                <circle
                  cx={curPts[curPts.length - 1].x}
                  cy={curPts[curPts.length - 1].y}
                  r={3.4}
                  fill={BRAND}
                  stroke="hsl(var(--card))"
                  strokeWidth={1.6}
                />
              </g>
            )}

            {hover != null && active && (
              <g>
                {/* The comparison point too, when there is one — the tooltip
                    lists both figures, and only one of them was findable on
                    the chart. */}
                {active.prev != null && prevPts.length > 0 && (
                  <circle
                    cx={geo.x(hover)}
                    cy={geo.y(active.prev)}
                    r={3.4}
                    fill="hsl(var(--card))"
                    stroke={BRAND}
                    strokeOpacity={0.55}
                    strokeWidth={2}
                  />
                )}
                <circle
                  cx={geo.x(hover)}
                  cy={geo.y(active.cur)}
                  r={7.5}
                  fill={BRAND}
                  opacity={0.16}
                />
                <circle
                  cx={geo.x(hover)}
                  cy={geo.y(active.cur)}
                  r={4.5}
                  fill="hsl(var(--card))"
                  stroke={BRAND}
                  strokeWidth={2.5}
                />
              </g>
            )}

            {/* x labels */}
            {buckets.map((b, i) =>
              i % labelEvery === 0 ? (
                <text
                  key={`x${b.t}`}
                  x={geo.x(i)}
                  y={h - 7}
                  textAnchor={i === 0 ? "start" : i === buckets.length - 1 ? "end" : "middle"}
                  fill={hover === i ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}
                  style={{ fontSize: 10, fontWeight: hover === i ? 600 : 400 }}
                >
                  {b.short}
                </text>
              ) : null
            )}
          </svg>

          {hover != null && active && (
            <div
              className="pointer-events-none absolute z-30 w-[168px] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-popover p-2.5 shadow-xl"
              style={{
                left: Math.min(Math.max(geo.x(hover), 80), Math.max(80, w - 80)),
                top: Math.max(84, geo.y(active.cur) - 10),
              }}
            >
              <p className="mb-1.5 text-[11px] font-semibold text-popover-foreground">{active.full}</p>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <svg width="10" height="3" aria-hidden>
                    <line x1="0" y1="1.5" x2="10" y2="1.5" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  {curName}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-popover-foreground">
                  {format(active.cur)}
                </span>
              </div>
              {prevName && active.prev != null && (
                <>
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <svg width="10" height="3" aria-hidden>
                        <line
                          x1="0"
                          y1="1.5"
                          x2="10"
                          y2="1.5"
                          stroke={BRAND}
                          strokeOpacity="0.55"
                          strokeWidth="2"
                          strokeDasharray="3 2"
                          strokeLinecap="round"
                        />
                      </svg>
                      {prevName}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                      {format(active.prev)}
                    </span>
                  </div>
                  {/* The answer, rather than the two numbers it is the
                      difference of. This chart exists to be compared, and
                      making the reader do the subtraction in their head is
                      making them do the chart's job. */}
                  <div className="mt-1.5 flex items-center justify-between gap-3 border-t border-border pt-1.5">
                    <span className="text-[11px] text-muted-foreground">Change</span>
                    <span
                      className="text-[11px] font-bold tabular-nums"
                      style={{ color: toneOf(active.cur - active.prev) }}
                    >
                      {active.cur === active.prev
                        ? "—"
                        : `${active.cur > active.prev ? "+" : "−"}${format(Math.abs(active.cur - active.prev)).replace(/^[+−-]/, "")}`}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ══ ring ══════════════════════════════════════════════════════════════════ */

export interface Slice {
  key: string;
  label: string;
  value: number;
  colour: string;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  /* A 360° arc has identical endpoints and draws nothing, so a lone slice that
     owns the whole ring is two half-circles instead. */
  if (to - from >= 359.9) {
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r}`;
  }
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

function Ring({
  slices,
  size,
  thickness,
  centre,
  onHover,
  active,
}: {
  slices: Slice[];
  size: number;
  thickness: number;
  centre?: React.ReactNode;
  onHover?: (key: string | null) => void;
  active?: string | null;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const drawn = slices.filter((x) => x.value > 0);
  /* One slice owning everything is a closed ring, not an arc that happens to be
     360° long: left as an arc it is inset by its own ends and antialiases into
     a visible seam at twelve o'clock, which reads as a missing sliver of data. */
  const sole = drawn.length === 1;

  /* Flat ends and one constant gap.
  
     The first version put round caps on every segment long enough to carry
     them and square ends on the rest, then inset each capped segment by
     exactly what its caps added back. It was arithmetically correct and it
     looked wrong: a ring of eight slices drew four with soft ends and four
     with hard ones, the insets left the gaps unequal, and the eye reads
     unequal gaps as unequal data. A donut is a set of proportions, and the
     only honest way to draw the boundary between two of them is the same cut
     everywhere. The gap is measured in degrees off a fixed arc length so it is
     the same *distance* at any radius, and it is capped at a third of the
     smallest slice so a 1° sliver is never erased by its own margins. */
  const smallestSpan = drawn.length
    ? Math.min(...drawn.map((x) => (x.value / (total || 1)) * 360))
    : 360;
  const gap = sole ? 0 : Math.min((2.5 / r) * (180 / Math.PI), smallestSpan / 3);

  let cursor = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block shrink-0"
      style={{ maxWidth: "100%", height: "auto" }}
      onPointerLeave={() => onHover?.(null)}
    >
      {/* A track only when there is nothing to draw over it. The slices always
          sum to the whole, so a ring behind them is a grey line showing through
          the gaps between segments and nowhere else. */}
      {total <= 0 && (
        <circle cx={cx} cy={cx} r={r} fill="none" stroke={TRACK} strokeWidth={thickness} opacity={0.5} />
      )}
      {slices.map((sl, i) => {
        const span = total > 0 ? (Math.max(0, sl.value) / total) * 360 : 0;
        const from = cursor;
        cursor += span;
        if (span <= 0.01) return null;
        const dim = active != null && active !== sl.key;
        if (sole) {
          return (
            <motion.circle
              key={sl.key}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={sl.colour}
              strokeWidth={thickness}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
              transform={`rotate(-90 ${cx} ${cx})`}
              onPointerEnter={() => onHover?.(sl.key)}
            />
          );
        }
        return (
          <motion.path
            key={sl.key}
            d={arcPath(cx, cx, r, from + gap / 2, from + span - gap / 2)}
            fill="none"
            stroke={sl.colour}
            strokeWidth={thickness}
            strokeLinecap="butt"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: dim ? 0.28 : 1 }}
            transition={{
              pathLength: { duration: 0.8, delay: 0.05 * i, ease: [0.33, 1, 0.68, 1] },
              opacity: { duration: 0.18 },
            }}
            style={{ cursor: onHover ? "default" : undefined }}
            onPointerEnter={() => onHover?.(sl.key)}
          />
        );
      })}
      {centre && (
        <foreignObject x={thickness} y={thickness} width={size - thickness * 2} height={size - thickness * 2}>
          <div className="flex h-full w-full flex-col items-center justify-center text-center leading-none">
            {centre}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

/** The figure in the hole: the total, and the word for what it counts. */
function RingCentre({ value, label }: { value: string; label: string }) {
  return (
    <>
      <span className="text-[21px] font-bold tabular-nums tracking-tight text-foreground sm:text-[24px]">
        {value}
      </span>
      <span className="mt-1.5 text-[11px] font-medium text-muted-foreground">{label}</span>
    </>
  );
}

/** The legend beside a ring: swatch, name, share, count. */
function RingLegend({
  slices,
  total,
  format,
  onHover,
  active,
}: {
  slices: Slice[];
  total: number;
  format: (v: number) => string;
  onHover?: (key: string | null) => void;
  active?: string | null;
}) {
  return (
    <ul className="min-w-0 flex-1 space-y-2" onPointerLeave={() => onHover?.(null)}>
      {slices.map((s) => (
        <li
          key={s.key}
          onPointerEnter={() => onHover?.(s.key)}
          className="flex items-center gap-2 rounded-md px-1 py-0.5"
          style={{
            background: active === s.key ? "hsl(var(--muted))" : "transparent",
            opacity: active != null && active !== s.key ? 0.5 : 1,
          }}
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.colour }} />
          {/* `title` because this truncates by design: "Commodities" beside a
              196px ring in a third of a 1500px page has about 80px, and the
              alternative to an ellipsis is a legend that wraps to two lines. */}
          <span
            className="min-w-0 flex-1 truncate text-[12px] text-foreground sm:text-[13px]"
            title={s.label}
          >
            {s.label}
          </span>
          <span className="shrink-0 text-[12px] font-semibold tabular-nums text-foreground sm:text-[13px]">
            {total > 0 ? pct((s.value / total) * 100) : "—"}
          </span>
          <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
            ({format(s.value)})
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ══ gauge ═════════════════════════════════════════════════════════════════ */

/**
 * The segmented meter.
 *
 * Ticks rather than a solid arc, because a meter made of countable marks reads
 * as a proportion at a glance where a smooth sweep reads as a value to be
 * measured against the ends — and there are no ends drawn here to measure it
 * against. The filled ticks take the outcome colour rather than a house accent:
 * on this page the meter answers "is the win rate clearing its break-even", and
 * that answer has a colour already.
 */
function Gauge({
  value,
  threshold,
  colour,
  size = 220,
}: {
  value: number;
  /** Optional break-even mark on the arc. */
  threshold?: number | null;
  colour: string;
  size?: number;
}) {
  const TICKS = 38;
  const SPAN = 224;
  const START = -SPAN / 2;
  const cx = size / 2;
  const cy = size / 2 + size * 0.04;
  const rOuter = size / 2 - 4;
  const rInner = rOuter - size * 0.115;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const filled = Math.round((v / 100) * TICKS);
  const thresholdTick =
    threshold != null && threshold > 0
      ? Math.round((Math.max(0, Math.min(100, threshold)) / 100) * TICKS)
      : null;

  return (
    <svg
      width={size}
      height={size * 0.74}
      viewBox={`0 0 ${size} ${size * 0.74}`}
      className="block"
      style={{ maxWidth: "100%", height: "auto" }}
    >
      {Array.from({ length: TICKS }, (_, i) => {
        const deg = START + (i / (TICKS - 1)) * SPAN;
        const [x1, y1] = polar(cx, cy, rInner, deg);
        const [x2, y2] = polar(cx, cy, rOuter, deg);
        const on = i < filled;
        const isThreshold = thresholdTick != null && i === thresholdTick;
        return (
          <motion.line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            /* Not `--border`: that is a hairline colour, and a hairline colour
               drawn as an 8px bar on a white card is barely there. The unlit
               half of a dial still has to read as the rest of the dial. */
            stroke={
              isThreshold
                ? "hsl(var(--foreground))"
                : on
                  ? colour
                  : "hsl(var(--muted-foreground) / 0.32)"
            }
            strokeWidth={isThreshold ? 3.5 : size * 0.032}
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: isThreshold ? 0.9 : 1 }}
            transition={{ duration: 0.3, delay: 0.25 + i * 0.014 }}
          />
        );
      })}
    </svg>
  );
}

/* ══ hour profile ══════════════════════════════════════════════════════════ */

/**
 * The day, drawn as a day.
 *
 * This card used to be five rows of a bar list: the five busiest hours, sorted
 * by volume, with the rest behind a "view all hours" toggle. Sorting is what
 * broke it. An hour is a position on a clock, and a list that puts 15:00 above
 * 09:00 above 21:00 throws away the one axis the data has — so the shape of a
 * trading day, the thing the card exists to show, could not be seen at all.
 * You could not tell a trader who works evenings from one who works mornings.
 *
 * Twenty-four columns in clock order, so the profile is a silhouette: where the
 * day starts, where it peaks, whether there is a second session at night.
 * Height is volume. Colour is whether the hour cleared break-even, since "when
 * do I trade" and "when do I win" are different questions and the second is the
 * one worth acting on.
 */
function HourProfile({
  hours,
  bestHour,
  breakEven,
}: {
  hours: { hour: number; trades: number; decided: number; wins: number; winRate: number }[];
  bestHour: number | null;
  /** The rate an hour has to clear to be worth trading, or null when unknown. */
  breakEven: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...hours.map((h) => h.trades));
  const active = hover != null ? hours[hover] : null;

  return (
    /* The columns grow into the card rather than sitting in a fixed 104px box
       at the top of it. This card is stretched to the height of the dial
       beside it, so a fixed plot left a hand's width of dead space between the
       hour labels and the sentence pinned to the bottom — the graph looked
       like it had been pushed up out of its own card. */
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-[168px] flex-1 items-end gap-[2px]"
        onPointerLeave={() => setHover(null)}
      >
        {hours.map((h) => {
          /* An hour with two decided trades at 100% is not a good hour, it is
             two trades. Below the bar it takes to say anything, the column
             keeps its height — the volume is real — and drops its colour. */
          const speaks = breakEven != null && h.decided >= 4;
          const colour = !h.trades ? TRACK : speaks ? toneOf(h.winRate - breakEven) : NEUTRAL;
          const dim = hover != null && hover !== h.hour;
          return (
            <button
              key={h.hour}
              type="button"
              aria-label={`${String(h.hour).padStart(2, "0")}:00, ${h.trades} trades`}
              onPointerEnter={() => setHover(h.hour)}
              onFocus={() => setHover(h.hour)}
              onBlur={() => setHover(null)}
              className="group flex h-full min-w-0 flex-1 flex-col justify-end focus:outline-none"
            >
              <motion.span
                className="block w-full rounded-[2px]"
                style={{
                  background: colour,
                  opacity: dim ? 0.4 : h.trades ? 1 : 0.55,
                  outline: bestHour === h.hour ? `1.5px solid ${colour}` : undefined,
                  outlineOffset: 1.5,
                }}
                initial={{ height: 0 }}
                animate={{ height: `${h.trades ? Math.max(6, (h.trades / max) * 100) : 3}%` }}
                transition={{ duration: 0.6, delay: h.hour * 0.012, ease: [0.33, 1, 0.68, 1] }}
              />
            </button>
          );
        })}
      </div>

      {/* Four marks, not twenty-four labels. The columns are 12px wide on a
          third of a page and "00:00" under each is a grey smear. */}
      <div className="mt-1.5 flex text-[10px] tabular-nums text-muted-foreground">
        {[0, 6, 12, 18].map((h) => (
          <span key={h} className="flex-1 text-left">
            {String(h).padStart(2, "0")}:00
          </span>
        ))}
        <span className="shrink-0">24:00</span>
      </div>

      {active && (
        <div
          className="pointer-events-none absolute -top-1 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-xl"
          style={{ left: `${((active.hour + 0.5) / 24) * 100}%` }}
        >
          <p className="font-semibold text-popover-foreground">
            {String(active.hour).padStart(2, "0")}:00 – {String((active.hour + 1) % 24).padStart(2, "0")}:00
          </p>
          <p className="mt-0.5 text-muted-foreground">
            {nf(active.trades)} {active.trades === 1 ? "trade" : "trades"}
            {active.decided > 0 && (
              <>
                {" · "}
                <span
                  className="font-semibold"
                  style={{ color: breakEven != null ? toneOf(active.winRate - breakEven) : undefined }}
                >
                  {pct(active.winRate, 0)}
                </span>{" "}
                won
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/* ══ aggregation ═══════════════════════════════════════════════════════════ */

const MS_DAY = 86_400_000;

interface MarketRow {
  symbol: string;
  label: MarketLabel;
  trades: number;
  wins: number;
  losses: number;
  decided: number;
  winRate: number;
  pnl: number;
  stake: number;
  avgStake: number;
  avgDuration: number;
}

type Metric = "trades" | "pnl" | "turnover";

const METRICS: { key: Metric; label: string }[] = [
  { key: "trades", label: "Trades" },
  { key: "pnl", label: "Net P&L" },
  { key: "turnover", label: "Turnover" },
];

/**
 * Column boundaries for the trend chart.
 *
 * Built by constructing dates rather than by adding milliseconds, so a window
 * that crosses a daylight-saving change still has one column per day instead of
 * a 23-hour column and a stray hour on the end.
 *
 * `dayShift` slides the whole set back by a whole window, which is how the
 * dashed previous-period series lands in the same columns as the solid one.
 */
function buildEdges(
  range: AnalyticsRange,
  firstTradeTs: number,
  dayShift: number,
  now: Date
): { edges: number[]; unit: "hour" | "day" | "week" } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (range === "today") {
    return {
      unit: "hour",
      edges: Array.from({ length: 25 }, (_, i) => new Date(y, m, d + dayShift, i).getTime()),
    };
  }
  if (range === "week" || range === "month") {
    const n = rangeBuckets(range).count;
    return {
      unit: "day",
      edges: Array.from({ length: n + 1 }, (_, i) =>
        new Date(y, m, d - (n - 1) + dayShift + i).getTime()
      ),
    };
  }

  // All time: the account's own span, in days while that stays readable and in
  // weeks once it does not. A year of trading is 365 columns, which is a smear.
  const first = new Date(firstTradeTs || Date.now());
  const fy = first.getFullYear();
  const fm = first.getMonth();
  const fd = first.getDate();
  const spanDays = Math.max(1, Math.round((new Date(y, m, d + 1).getTime() - new Date(fy, fm, fd).getTime()) / MS_DAY));
  if (spanDays <= 31) {
    return {
      unit: "day",
      edges: Array.from({ length: spanDays + 1 }, (_, i) => new Date(fy, fm, fd + i).getTime()),
    };
  }
  const weeks = Math.min(26, Math.ceil(spanDays / 7));
  const step = Math.ceil(spanDays / weeks);
  /* Anchored to today and stepped backwards, so every column but the first is
     exactly `step` days wide. Counting forwards from the first trade left the
     remainder in the *last* column — a short final bucket holds fewer trades
     than a full one, so the line always ended in a dive, and a dive on the
     right-hand edge of a chart reads as "you have stopped trading". */
  return {
    unit: "week",
    edges: Array.from({ length: weeks + 1 }, (_, i) =>
      new Date(y, m, d + 1 - (weeks - i) * step).getTime()
    ),
  };
}

/** Which column a timestamp falls in, or -1 when it falls outside. */
function edgeIndex(edges: number[], t: number): number {
  if (t < edges[0] || t >= edges[edges.length - 1]) return -1;
  let lo = 0;
  let hi = edges.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (t < edges[mid]) hi = mid;
    else lo = mid;
  }
  return lo;
}

/* ══ tiles, filters, leaderboard ═══════════════════════════════════════════ */

/** One of the four headline figures. Label and icon, the number, the comparison. */
function Kpi({
  title,
  hint,
  icon,
  value,
  valueColour,
  children,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  value: string;
  valueColour?: string;
  children: React.ReactNode;
}) {
  return (
    <Card muted>
      <div className="flex flex-1 flex-col gap-2 px-3.5 py-3 sm:gap-2.5 sm:px-4.5 sm:py-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-0.5">
            <h3 className="truncate text-[12px] font-medium text-muted-foreground sm:text-[13px]">
              {title}
            </h3>
            <Hint text={hint} label={title} />
          </div>
          {/* The drawn mark, with nothing behind it.
          
              This was a lucide glyph in a bordered tile, then a lucide glyph in
              a tinted tile, and both were the same mistake at different
              volumes: a hairline diagram sitting in a box, on a band whose
              opposite number in the account section — the transactions summary
              strip — carries drawn 3D objects. These are those, in the same
              palette, lit by the same lamp, out of the same `Paint`. An object
              does not need a plate to stand on. */}
          <span className="flex shrink-0">{icon}</span>
        </div>
        <p
          className="text-[22px] font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-[26px]"
          style={valueColour ? { color: valueColour } : undefined}
        >
          {value}
        </p>
        <div className="mt-auto">{children}</div>
      </div>
    </Card>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-14 text-center">
      <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
      <h2 className="text-[15px] font-semibold text-foreground sm:text-[16px]">{title}</h2>
      <p className="mt-1.5 max-w-md text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** The quiet link a card header carries — "View all", and its way back. */
function TextAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded text-[12px] font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-[13px]"
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-border bg-muted/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-[11px] font-semibold",
            value === o.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The Filters control.
 *
 * Three narrowings, and every one of them is real — the button next to it exports
 * exactly what these leave behind, and the previous-period series is drawn from
 * the same subset, so a filtered comparison compares like with like.
 *
 * No market is preselected. An empty market list means every market rather than
 * none, because "none" is the state you would land in the first time you opened
 * the menu, and a page that starts by showing nothing reads as broken.
 */
function FiltersMenu({
  filters,
  onChange,
  tradedSymbols,
  labelFor,
  count,
}: {
  filters: AnalyticsFilters;
  onChange: (f: AnalyticsFilters) => void;
  tradedSymbols: string[];
  labelFor: (symbol: string) => MarketLabel;
  count: number;
}) {
  /* Asset classes, not assets.
  
     The list here was every market the account had ever traded, one row each,
     with a search box above it once there were more than six. That is a picker
     for somebody who already knows which symbol they are looking for — and
     nobody opens a performance dashboard's filter menu knowing that. They open
     it to ask "how do I do on crypto", which is a question about a class of
     markets, and answering it meant ticking eleven boxes and hoping none was
     missed. Four classes is a filter you can actually operate.

     The wire format is unchanged: a class is expanded to the symbols it holds
     before it leaves this menu, so everything downstream still filters on the
     one thing an order actually carries. */
  const classes = useMemo(() => {
    const byKey = new Map<string, string[]>();
    for (const symbol of tradedSymbols) {
      const key = labelFor(symbol).category || "other";
      const list = byKey.get(key);
      if (list) list.push(symbol);
      else byKey.set(key, [symbol]);
    }
    return Array.from(byKey.entries())
      .map(([key, symbols]) => ({ key, label: CATEGORY_LABEL[key] || "Other", symbols }))
      .sort((a, b) => b.symbols.length - a.symbols.length || a.label.localeCompare(b.label));
  }, [tradedSymbols, labelFor]);

  const chosen = useMemo(() => new Set(filters.symbols), [filters.symbols]);

  const toggleClass = (symbols: string[]) => {
    const on = symbols.every((sym) => chosen.has(sym));
    const next = new Set(chosen);
    for (const sym of symbols) {
      if (on) next.delete(sym);
      else next.add(sym);
    }
    onChange({ ...filters, symbols: Array.from(next) });
  };

  /* Named when exactly one class is on, counted when more are. "Filters (2)"
     beside two ticked boxes is a button that makes you open it to find out. */
  const onClasses = classes.filter((c) => c.symbols.length > 0 && c.symbols.every((sym) => chosen.has(sym)));
  const label =
    count === 0 ? "Filters" : onClasses.length === 1 && count === 1 ? onClasses[0].label : "Filters";

  return (
    <Popover
      ariaLabel="Filter what this page counts"
      icon={<ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />}
      label={label}
      badge={count || undefined}
      panelWidth={276}
    >
      {() => (
        <div className="flex max-h-[70vh] flex-col">
          <div className="space-y-3 border-b border-border px-3 py-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Direction
              </p>
              <Segmented
                value={filters.side}
                onChange={(side) => onChange({ ...filters, side })}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "UP", label: "Up" },
                  { value: "DOWN", label: "Down" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Outcome
              </p>
              <Segmented
                value={filters.outcome}
                onChange={(outcome) => onChange({ ...filters, outcome })}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "WIN", label: "ITM" },
                  { value: "LOSS", label: "OTM" },
                  { value: "DRAW", label: "Refund" },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Market
            </p>
            {filters.symbols.length > 0 && (
              <TextAction onClick={() => onChange({ ...filters, symbols: [] })}>All markets</TextAction>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pb-1">
            {classes.length === 0 ? (
              <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">
                Nothing traded yet
              </p>
            ) : (
              classes.map((c) => {
                const on = c.symbols.every((sym) => chosen.has(sym));
                const some = !on && c.symbols.some((sym) => chosen.has(sym));
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleClass(c.symbols)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border",
                        on || some ? "border-brand bg-brand text-brand-foreground" : "border-border"
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {/* Half the class ticked is its own state, and a dash is
                          how every checkbox in the world says so. */}
                      {some && <span className="h-[2px] w-2 rounded-full bg-brand-foreground" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-popover-foreground">
                      {c.label}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {nf(c.symbols.length)} {c.symbols.length === 1 ? "market" : "markets"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {count > 0 && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => onChange({ symbols: [], side: "ALL", outcome: "ALL" })}
                className="w-full rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}

/**
 * Which markets are actually earning.
 *
 * A table above `md` and a list of cards below it. Not a table with a horizontal
 * scrollbar: six columns on a 390px screen means every row is read by dragging,
 * and a leaderboard that has to be dragged is not read at all.
 */
function Leaderboard({
  rows,
  total,
  expanded,
  onToggle,
  sym,
  breakEven,
  turnover,
}: {
  rows: MarketRow[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
  sym: string;
  /** Win rates are coloured against this. Null when no payout has settled yet. */
  breakEven: number | null;
  turnover: number;
}) {
  const rateColour = (winRate: number, decided: number) =>
    decided === 0 || breakEven == null ? NEUTRAL : toneOf(winRate - breakEven);

  return (
    <Card
      title="Top performing markets"
      hint="Your most-traded markets in this window. Win rate is coloured against the rate you must beat at the payout on offer, so a green 62% and a red 62% are both possible and both true."
      action={
        total > 5 ? (
          <TextAction onClick={onToggle}>
            {expanded ? "Show top 5" : `View all ${nf(total)} markets`}
          </TextAction>
        ) : undefined
      }
    >
      {/* table, from md up */}
      <div className={cn("mt-2 hidden md:block", expanded && "max-h-[420px] overflow-y-auto")}>
        <table className="w-full border-collapse">
          {/* Sticky lives on the cells, not on the row, and the rules under and
              over the band are inset shadows rather than borders: a collapsed
              table drops the borders of a stuck cell, which left the expanded
              leaderboard's header floating with no edge at all. */}
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-muted [&>th]:shadow-[inset_0_1px_0_hsl(var(--border)),inset_0_-1px_0_hsl(var(--border))]">
              <th className="w-14 px-5 py-2 text-left font-semibold">#</th>
              <th className="px-3 py-2 text-left font-semibold">Market</th>
              <th className="px-3 py-2 text-right font-semibold">Trades</th>
              <th className="px-3 py-2 text-right font-semibold">Avg. duration</th>
              <th className="px-3 py-2 text-right font-semibold">Avg. stake</th>
              <th className="w-[210px] px-3 py-2 text-left font-semibold">Win rate</th>
              <th className="px-5 py-2 text-right font-semibold">Net P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.symbol} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td className="px-5 py-2 text-[13px] font-semibold tabular-nums text-muted-foreground">
                  {i + 1}
                </td>
                <td className="max-w-[240px] px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <MarketGlyph label={r.label} size={24} />
                    {/* The name and its mark are one unit, aligned on the
                        name's cap height rather than on the row's centre. */}
                    <span className="flex min-w-0 items-start">
                      <span className="truncate text-[13px] font-medium leading-[18px] text-foreground">
                        {r.label.name}
                      </span>
                      {r.label.isOTC && <OtcTag />}
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-[13px] tabular-nums text-foreground">
                  {nf(r.trades)}
                </td>
                <td className="px-3 py-2 text-right text-[13px] tabular-nums text-muted-foreground">
                  {duration(r.avgDuration)}
                </td>
                <td className="px-3 py-2 text-right text-[13px] tabular-nums text-muted-foreground">
                  {money(r.avgStake, sym)}
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="w-12 shrink-0 text-[13px] font-semibold tabular-nums"
                      style={{ color: rateColour(r.winRate, r.decided) }}
                    >
                      {r.decided > 0 ? pct(r.winRate) : "—"}
                    </span>
                    <span
                      className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full"
                      style={{ background: TRACK }}
                    >
                      <motion.span
                        className="block h-full rounded-full"
                        style={{ background: rateColour(r.winRate, r.decided) }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(0, Math.min(100, r.winRate))}%` }}
                        transition={{ duration: 0.7, delay: 0.04 * i, ease: [0.33, 1, 0.68, 1] }}
                      />
                    </span>
                  </span>
                </td>
                <td
                  className="px-5 py-2 text-right text-[13px] font-bold tabular-nums"
                  style={{ color: toneOf(r.pnl) }}
                >
                  {money(r.pnl, sym, { sign: true, compact: Math.abs(r.pnl) >= 1e4 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* cards, below md */}
      <ul className={cn("mt-1 md:hidden", expanded && "max-h-[460px] overflow-y-auto")}>
        {rows.map((r, i) => (
          <li key={r.symbol} className="border-t border-border px-4 py-3 first:border-t-0">
            <div className="flex items-center gap-2.5">
              <span className="w-4 shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <MarketGlyph label={r.label} size={24} />
              {/* Name and tag in one group, so the tag stays beside the name
                  rather than being pushed across the row to sit against the
                  P&L, which is what a `flex-1` name does to it. */}
              <span className="flex min-w-0 flex-1 items-start">
                <span className="min-w-0 truncate text-[13px] font-semibold leading-[18px] text-foreground">
                  {r.label.name}
                </span>
                {r.label.isOTC && <OtcTag />}
              </span>
              <span
                className="shrink-0 text-[13px] font-bold tabular-nums"
                style={{ color: toneOf(r.pnl) }}
              >
                {money(r.pnl, sym, { sign: true, compact: Math.abs(r.pnl) >= 1e4 })}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2.5 pl-[26px]">
              <span
                className="w-11 shrink-0 text-[12px] font-semibold tabular-nums"
                style={{ color: rateColour(r.winRate, r.decided) }}
              >
                {r.decided > 0 ? pct(r.winRate) : "—"}
              </span>
              <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: TRACK }}>
                <motion.span
                  className="block h-full rounded-full"
                  style={{ background: rateColour(r.winRate, r.decided) }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, Math.min(100, r.winRate))}%` }}
                  transition={{ duration: 0.7, delay: 0.04 * i, ease: [0.33, 1, 0.68, 1] }}
                />
              </span>
            </div>
            <p className="mt-1.5 pl-[26px] text-[11px] tabular-nums text-muted-foreground">
              {nf(r.trades)} trades · {duration(r.avgDuration)} average · {money(r.avgStake, sym)} stake
            </p>
          </li>
        ))}
      </ul>

      <p className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground sm:px-5 sm:text-[12px]">
        <span className="font-semibold text-foreground">{nf(total)}</span>{" "}
        {total === 1 ? "market" : "markets"} traded in this window, on{" "}
        <span className="font-semibold text-foreground">{money(turnover, sym, { compact: true })}</span>{" "}
        of turnover — volume staked, not profit
      </p>
    </Card>
  );
}

/* ══ the page ══════════════════════════════════════════════════════════════ */

export interface AnalyticsOverviewProps {
  stats: TradingStats;
  previousStats: TradingStats;
  /** Settled trades inside the window, after filters. */
  orders: CompletedOrder[];
  /** The equally-long window before it. Empty on "all time". */
  previousOrders: CompletedOrder[];
  avgPayoutPercent: number;
  turnover: number;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  filters: AnalyticsFilters;
  onFiltersChange: (filters: AnalyticsFilters) => void;
  /** Renders a close button at the end of the control row, when this page is
      the whole of an overlay and there is no chrome bar above it to hold one. */
  onClose?: () => void;
  tradedSymbols: string[];
  /** Whether the account has any settled trade at all, ignoring range and filters. */
  hasAnyHistory: boolean;
  currencySymbol: string;
  /** Ticker of the display currency, for the exported file. */
  currencyCode: string;
  /** Display-currency rate. Raw values arrive; the rate is applied exactly once, here. */
  rate: number;
}

export function AnalyticsOverview({
  stats,
  previousStats,
  orders,
  previousOrders,
  avgPayoutPercent,
  turnover,
  range,
  onRangeChange,
  filters,
  onFiltersChange,
  onClose,
  tradedSymbols,
  hasAnyHistory,
  currencySymbol: sym,
  currencyCode,
  rate,
}: AnalyticsOverviewProps) {
  const labelFor = useMarketLabeller();
  const cv = (v: number) => (Number(v) || 0) * rate;

  const [metric, setMetric] = useState<Metric>("trades");
  const [ringHover, setRingHover] = useState<string | null>(null);
  const [outcomeHover, setOutcomeHover] = useState<string | null>(null);
  const [allMarkets, setAllMarkets] = useState(false);

  const hasPrev = range !== "all" && previousOrders.length > 0;
  const past = pastLabel(range);
  const net = cv(stats.totalPnL);
  const prevNet = cv(previousStats.totalPnL);

  /* Two counts, and the page has to be clear about which is which — the first
     build of this dashboard was not, and headlined 234 above an outcome ring
     reading 243.

     SETTLED is every trade that finished, refunds included. It is what "total
     trades" means to the person reading it, it is the ring's total, and it is
     what the leaderboard's Trades column adds up to.

     DECIDED excludes refunds, because a refunded trade resolved neither for nor
     against the trader and belongs on neither side of a win rate.

     `stats.totalTrades` is the decided count despite its name (see
     calculateTradingStats), which is exactly how the two got mixed up. It is not
     used for a headline here. */
  const settled = orders.length;
  const prevSettled = previousOrders.length;
  const decided = stats.wins + stats.losses;
  const breakEven = breakEvenWinRate(avgPayoutPercent);
  const hasPayout = avgPayoutPercent > 0 && decided > 0;

  /* One pass over the window's trades produces every breakdown on the page — by
     market, by asset class and by hour. Four cards read from this, so they
     cannot drift apart the way separate aggregations did. */
  const agg = useMemo(() => {
    const markets = new Map<string, MarketRow & { durationTotal: number }>();
    const categories = new Map<string, number>();
    const hours = Array.from({ length: 24 }, () => ({ trades: 0, wins: 0, decided: 0 }));

    /* An account with ten thousand settled trades on twelve markets was calling
       the market-browser's name resolver ten thousand times. Twelve is enough. */
    const labelCache = new Map<string, MarketLabel>();
    const nameOf = (symbol: string) => {
      let l = labelCache.get(symbol);
      if (!l) {
        l = labelFor(symbol);
        labelCache.set(symbol, l);
      }
      return l;
    };

    for (const o of orders) {
      const symbol = String(o.symbol || "");
      const label = nameOf(symbol);
      let row = markets.get(symbol);
      if (!row) {
        row = {
          symbol,
          label,
          trades: 0,
          wins: 0,
          losses: 0,
          decided: 0,
          winRate: 0,
          pnl: 0,
          stake: 0,
          avgStake: 0,
          avgDuration: 0,
          durationTotal: 0,
        };
        markets.set(symbol, row);
      }
      row.trades += 1;
      row.pnl += cv(tradePnl(o));
      row.stake += cv(Number(o.amount) || 0);
      row.durationTotal += Math.max(0, (o.expiryTime.getTime() - o.entryTime.getTime()) / 1000);
      if (o.status === "WIN") {
        row.wins += 1;
        row.decided += 1;
      } else if (o.status === "LOSS") {
        row.losses += 1;
        row.decided += 1;
      }

      categories.set(label.category, (categories.get(label.category) || 0) + 1);

      const h = o.expiryTime.getHours();
      hours[h].trades += 1;
      if (o.status === "WIN") {
        hours[h].wins += 1;
        hours[h].decided += 1;
      } else if (o.status === "LOSS") {
        hours[h].decided += 1;
      }
    }

    const marketRows: MarketRow[] = Array.from(markets.values())
      .map((r) => ({
        ...r,
        winRate: r.decided > 0 ? (r.wins / r.decided) * 100 : 0,
        avgStake: r.trades > 0 ? r.stake / r.trades : 0,
        avgDuration: r.trades > 0 ? r.durationTotal / r.trades : 0,
      }))
      .sort((a, b) => b.trades - a.trades || b.pnl - a.pnl);

    return { marketRows, categories, hours };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, labelFor, rate]);

  /* ── trend ───────────────────────────────────────────────────────────── */
  const trend = useMemo(() => {
    if (orders.length === 0) return [] as TrendBucket[];
    const now = new Date();
    let firstTs = Infinity;
    for (const o of orders) firstTs = Math.min(firstTs, o.expiryTime.getTime());

    const { edges, unit } = buildEdges(range, firstTs, 0, now);
    const n = edges.length - 1;
    if (n < 1) return [] as TrendBucket[];

    const windowDays = range === "today" ? 1 : range === "week" ? 7 : range === "month" ? 30 : 0;
    const prevEdges =
      range === "all" ? null : buildEdges(range, firstTs, -windowDays, now).edges;

    const cur = new Array(n).fill(0);
    const prev = prevEdges ? new Array(n).fill(0) : null;

    const add = (bank: number[], edgeSet: number[], list: CompletedOrder[]) => {
      for (const o of list) {
        const i = edgeIndex(edgeSet, o.expiryTime.getTime());
        if (i < 0) continue;
        bank[i] +=
          metric === "trades"
            ? 1
            : metric === "pnl"
              ? cv(tradePnl(o))
              : cv(Number(o.amount) || 0);
      }
    };
    add(cur, edges, orders);
    if (prev && prevEdges) add(prev, prevEdges, previousOrders);

    return Array.from({ length: n }, (_, i) => {
      const start = new Date(edges[i]);
      const short =
        unit === "hour"
          ? `${String(start.getHours()).padStart(2, "0")}:00`
          : unit === "week"
            ? start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : range === "week"
              ? start.toLocaleDateString("en-US", { weekday: "short" })
              : start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const full =
        unit === "hour"
          ? `${start.toLocaleDateString("en-US", { weekday: "long" })}, ${short}`
          : unit === "week"
            ? `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(edges[i + 1] - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
            : start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
      return { t: edges[i], short, full, cur: cur[i], prev: prev ? prev[i] : null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, previousOrders, range, metric, rate]);

  const metricFormat = useMemo(() => {
    if (metric === "trades") return (v: number) => nf(Math.round(v));
    return (v: number) => money(v, sym, { compact: Math.abs(v) >= 1000, sign: metric === "pnl" });
  }, [metric, sym]);

  /* ── asset-class split ───────────────────────────────────────────────── */
  const categorySlices = useMemo<Slice[]>(() => {
    const slices: Slice[] = CATEGORY_ORDER.map((key) => ({
      key,
      label: CATEGORY_LABEL[key],
      value: agg.categories.get(key) ?? 0,
      colour: CATEGORY_COLOUR[key],
    }));
    /* "Other" is not a class anybody chose to trade — it is a symbol whose
       market record we could not find — so it appears only when it has
       something in it, and last. */
    const other = agg.categories.get("other") ?? 0;
    if (other > 0) {
      slices.push({ key: "other", label: "Other", value: other, colour: CATEGORY_COLOUR.other });
    }
    return slices;
  }, [agg.categories]);

  /* ── hours ───────────────────────────────────────────────────────────── */
  /* Clock order, all twenty-four, zeroes included — the profile is a shape and
     a shape with its empty hours removed is a different shape. */
  const hourProfile = useMemo(
    () =>
      agg.hours.map((h, i) => ({
        hour: i,
        trades: h.trades,
        decided: h.decided,
        wins: h.wins,
        winRate: h.decided > 0 ? (h.wins / h.decided) * 100 : 0,
      })),
    [agg.hours]
  );

  const hourRows = useMemo(() => {
    const total = orders.length;
    return agg.hours
      .map((h, i) => ({
        key: String(i),
        hour: i,
        label: `${String(i).padStart(2, "0")}:00 – ${String((i + 1) % 24).padStart(2, "0")}:00`,
        // The hour it opens; the range does not fit a phone's label column.
        short: `${String(i).padStart(2, "0")}:00`,
        value: h.trades,
        decided: h.decided,
        share: total > 0 ? (h.trades / total) * 100 : 0,
        winRate: h.decided > 0 ? (h.wins / h.decided) * 100 : 0,
      }))
      .filter((h) => h.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [agg.hours, orders.length]);

  /* Three trades in an hour can be three winners, and "your best hour is 15:00
     at 100%" off a sample of three is not a finding, it is noise presented as
     advice. The bar scales with the account: 4% of the window's decided trades,
     never fewer than six. */
  const bestHour = useMemo(() => {
    const minSample = Math.max(6, Math.round(decided * 0.04));
    const eligible = hourRows.filter((h) => h.decided >= minSample);
    return eligible.length ? eligible.reduce((a, b) => (b.winRate > a.winRate ? b : a)) : null;
  }, [hourRows, decided]);

  /* ── outcomes ────────────────────────────────────────────────────────── */
  const outcomeSlices = useMemo<Slice[]>(
    () => [
      /* The abbreviation in brackets, not instead of the words. "ITM" alone is
         the trading floor's shorthand and means nothing to somebody on their
         second week; "In the money" alone leaves them unable to match this
         legend to the ITM/OTM the filter menu and the journal both use. */
      { key: "WIN", label: "In the money (ITM)", value: stats.wins, colour: UP },
      { key: "LOSS", label: "Out of the money (OTM)", value: stats.losses, colour: DOWN },
      { key: "DRAW", label: "Refunded (draw)", value: stats.draws, colour: "#f59e0b" },
    ],
    [stats.wins, stats.losses, stats.draws]
  );

  /* Four, not five. The whole page is built to be read without scrolling, and
     the fifth row of a leaderboard is the row that pushes the last card under
     the fold — "view all N markets" is right there for anyone who wants it. */
  const marketsShown = allMarkets ? agg.marketRows : agg.marketRows.slice(0, 4);

  /* Addressed by name once, in the heading — the only thing the greeting card
     above it was ever actually delivering. */
  const firstName = useUserStore((st) => st.user?.firstName) || "";

  const series = seriesNames(range);

  const filterCount = activeFilterCount(filters);
  const clearFilters = () => onFiltersChange({ symbols: [], side: "ALL", outcome: "ALL" });

  /* ── header ──────────────────────────────────────────────────────────── */
  const header = (
    <PageHeader title="Analytics" name={firstName}>
        {/* Window. One control for the whole page — every figure, series and row
            below describes the period named here and no other. */}
        <Popover
          ariaLabel="Change the period"
          icon={<CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />}
          /* The year is dropped on a phone. With it, this pill plus Filters plus
             Export overflowed 390px and Export wrapped onto a line of its own —
             one blue button, alone, under two grey ones. */
          label={
            <>
              <span className="sm:hidden">{rangeLabel(range, true)}</span>
              <span className="hidden sm:inline">{rangeLabel(range)}</span>
            </>
          }
          panelWidth={216}
        >
          {(close) => (
            <div className="py-1">
              {ANALYTICS_RANGES.map((r) => (
                <MenuItem
                  key={r.key}
                  selected={range === r.key}
                  onClick={() => {
                    onRangeChange(r.key);
                    close();
                  }}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-[11px] text-muted-foreground">{rangeLabel(r.key, true)}</span>
                  </span>
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        <FiltersMenu
          filters={filters}
          onChange={onFiltersChange}
          tradedSymbols={tradedSymbols}
          labelFor={labelFor}
          count={filterCount}
        />

        <Popover
          ariaLabel="Export this report"
          variant="brand"
          icon={<Download className="h-4 w-4 shrink-0" />}
          label={<span className="hidden sm:inline">Export Report</span>}
          panelWidth={216}
        >
          {(close) => (
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  downloadTrades(orders, "csv", currencyCode);
                  close();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-popover-foreground hover:bg-muted"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>CSV</span>
                  <span className="text-[11px] text-muted-foreground">
                    {nf(orders.length)} settled {orders.length === 1 ? "trade" : "trades"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadTrades(orders, "excel", currencyCode);
                  close();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-popover-foreground hover:bg-muted"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>Excel</span>
                  <span className="text-[11px] text-muted-foreground">Opens in Sheets or Excel</span>
                </span>
              </button>
            </div>
          )}
        </Popover>

        {/* The overlay's chrome bar used to carry this. Once its title and its
            greeting card were gone it was a 56px band holding one icon and one
            X, so the X came down here to the row that has the page's other
            controls in it. */}
        {onClose && <CloseButton onClose={onClose} />}
    </PageHeader>
  );

  if (!hasAnyHistory) {
    return (
      <div className="mx-auto w-full max-w-[1760px] space-y-3 px-3 pb-4 sm:px-4 lg:px-5">
        {header}
        <Empty
          title="No trading data yet"
          body="Close your first position and this page fills in — your win rate, where your volume goes, and which markets are actually paying."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1760px] space-y-2.5 px-3 pb-3 sm:px-4 lg:px-5">
      {header}

      {orders.length === 0 ? (
        <Empty
          title="Nothing matched"
          body={
            filterCount > 0
              ? "No settled trades in this window match the filters you have set."
              : "You have no settled trades in this window."
          }
          action={
            filterCount > 0 ? (
              <button type="button" onClick={clearFilters} className={CONTROL}>
                Clear filters
              </button>
            ) : range !== "all" ? (
              <button type="button" onClick={() => onRangeChange("all")} className={CONTROL}>
                Show all time
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* ── the four figures ───────────────────────────────────────────
              The marks are drawn, not iconed — see ./analytics-marks, which is
              the transactions strip's set extended with four more in the same
              idiom. A trade is an exchange, so two arrows passing. P&L is
              money, so a stack of coins with the net on top. A win rate is a
              share of a whole, so a ring with the won part filled. A profit
              factor is a reading against a threshold, so a dial. */}
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4 xl:gap-3">
            <Kpi
              title="Total trades"
              hint="Every trade that settled in this window, refunds included. Refunded trades count here and are excluded from the win rate, which is why the two figures differ."
              icon={<TradesMark size={36} />}
              value={nf(settled)}
            >
              <Delta
                current={settled}
                previous={hasPrev ? prevSettled : null}
                label={hasPrev ? past : `across ${nf(agg.marketRows.length)} ${agg.marketRows.length === 1 ? "market" : "markets"}`}
                neutral
              />
            </Kpi>

            <Kpi
              title="Net P&L"
              hint="Payouts received on winners minus stakes lost on losers, after refunds."
              icon={<PnlMark size={36} />}
              value={money(net, sym, { compact: Math.abs(net) >= 1e5, sign: true })}
              valueColour={toneOf(net)}
            >
              <Delta
                current={net}
                previous={hasPrev ? prevNet : null}
                label={hasPrev ? past : `over ${nf(settled)} settled ${settled === 1 ? "trade" : "trades"}`}
              />
            </Kpi>

            <Kpi
              title="Win rate"
              hint="Share of decided trades that finished in the money. Refunded trades are excluded from both sides."
              icon={<WinRateMark size={36} />}
              value={decided > 0 ? pct(stats.winRate) : "—"}
              /* Against break-even, not against 50%. A 55% win rate is a losing
                 account at an 80% payout, and colouring it green because it
                 beat a coin flip is the dashboard telling a comfortable lie. */
              valueColour={hasPayout && decided > 0 ? toneOf(stats.winRate - breakEven) : undefined}
            >
              <Delta
                current={stats.winRate}
                previous={hasPrev && previousStats.wins + previousStats.losses > 0 ? previousStats.winRate : null}
                label={hasPrev ? past : `${nf(stats.wins)} of ${nf(decided)} decided`}
                points
              />
            </Kpi>

            <Kpi
              title="Profit factor"
              hint="Gross winnings divided by gross losses. Above 1.00 the account makes money."
              icon={<FactorMark size={36} />}
              value={stats.losses > 0 ? stats.profitFactor.toFixed(2) : "—"}
              valueColour={stats.losses > 0 ? toneOf(stats.profitFactor - 1) : undefined}
            >
              <Delta
                current={stats.profitFactor}
                previous={hasPrev && previousStats.losses > 0 && stats.losses > 0 ? previousStats.profitFactor : null}
                label={hasPrev && previousStats.losses > 0 && stats.losses > 0 ? past : "1.00 is break-even"}
              />
            </Kpi>
          </div>

          {/* ── the trend, and where the volume goes ─────────────────────── */}
          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-3 xl:gap-3">
            <Card
              className="xl:col-span-2"
              title="Performance over time"
              hint="This window drawn against the equally-long window before it, so a good week is visible as a good week rather than as a number you have to remember."
              action={
                <Popover
                  ariaLabel="Change the metric"
                  icon={null}
                  label={METRICS.find((m) => m.key === metric)?.label ?? "Trades"}
                  panelWidth={168}
                >
                  {(close) => (
                    <div className="py-1">
                      {METRICS.map((m) => (
                        <MenuItem
                          key={m.key}
                          selected={metric === m.key}
                          onClick={() => {
                            setMetric(m.key);
                            close();
                          }}
                        >
                          {m.label}
                        </MenuItem>
                      ))}
                    </div>
                  )}
                </Popover>
              }
            >
              {/* The key sits over the plot on the left, the way the reference
                  does it, with the control it belongs to on the right of the
                  title. It lived in the header row for a while to save 26px on
                  a page that had to fit; the page fits with room now. */}
              <div className="flex items-center gap-4 px-4 pb-0.5 pt-1.5 sm:px-5">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-[12px]">
                  <svg width="18" height="3" aria-hidden>
                    <line x1="0" y1="1.5" x2="18" y2="1.5" stroke={BRAND} strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  {series.cur}
                </span>
                {hasPrev && series.prev && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-[12px]">
                    <svg width="18" height="3" aria-hidden>
                      <line
                        x1="0"
                        y1="1.5"
                        x2="18"
                        y2="1.5"
                        stroke={BRAND}
                        strokeOpacity="0.55"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                        strokeLinecap="round"
                      />
                    </svg>
                    {series.prev}
                  </span>
                )}
              </div>
              <div className="h-[196px] px-2 pb-2 sm:h-[216px] sm:px-3 sm:pb-3">
                <TrendChart
                  buckets={trend}
                  format={metricFormat}
                  curName={series.cur}
                  prevName={hasPrev ? series.prev : null}
                  signed={metric === "pnl"}
                  integer={metric === "trades"}
                />
              </div>
            </Card>

            <Card
              title="Trades by asset class"
              hint="Where your volume actually goes. A trader who believes they trade forex and in fact trades crypto is reading the wrong news."
            >
              {/* Centred and filling, because this card is stretched to the
                  height of the chart beside it: a 168px ring pinned to the top
                  of a 430px card left the bottom half of it empty. */}
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-5 pt-2.5 sm:flex-row sm:gap-4 sm:px-5 lg:gap-5 xl:gap-4">
                <Ring
                  slices={categorySlices}
                  size={160}
                  thickness={25}
                  onHover={setRingHover}
                  active={ringHover}
                  centre={<RingCentre value={compact(orders.length)} label="Total" />}
                />
                <RingLegend
                  slices={categorySlices}
                  total={orders.length}
                  format={(v) => compact(v)}
                  onHover={setRingHover}
                  active={ringHover}
                />
              </div>
            </Card>
          </div>

          {/* ── when, how it ended, and whether it clears break-even ─────── */}
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3 xl:gap-3">
            <Card
              title="Most active hours"
              hint="Settled trades by the hour they closed, in your own time zone. Height is how much you traded in that hour; colour is whether it cleared break-even."
            >
              <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5">
                {orders.length === 0 ? (
                  <p className="py-8 text-center text-[12px] text-muted-foreground">No settled trades yet</p>
                ) : (
                  <HourProfile
                    hours={hourProfile}
                    bestHour={bestHour ? bestHour.hour : null}
                    breakEven={hasPayout ? breakEven : null}
                  />
                )}
                <p className="mt-auto pt-3 text-[11px] leading-snug text-muted-foreground sm:text-[12px]">
                  {bestHour ? (
                    <>
                      Your best hour is{" "}
                      <span className="font-semibold text-foreground">{bestHour.label}</span> at{" "}
                      <span
                        className="font-semibold"
                        style={{ color: hasPayout ? toneOf(bestHour.winRate - breakEven) : NEUTRAL }}
                      >
                        {pct(bestHour.winRate)}
                      </span>{" "}
                      over {nf(bestHour.decided)} decided trades
                    </>
                  ) : (
                    "No single hour has enough decided trades yet for its win rate to mean anything"
                  )}
                </p>
              </div>
            </Card>

            <Card
              title="Outcome split"
              hint="How every settled trade finished. Refunded trades are returned in full and count toward neither side of the win rate."
            >
              {/* Donut beside the legend, not above it — the same shape as the
                  asset-class card next to it, and the shape that fits three
                  cards on one row without the page growing a scrollbar. */}
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-5 pt-2.5 sm:flex-row sm:gap-4 sm:px-5">
                <Ring
                  slices={outcomeSlices}
                  size={154}
                  thickness={25}
                  onHover={setOutcomeHover}
                  active={outcomeHover}
                  centre={<RingCentre value={compact(settled)} label="Settled" />}
                />
                <RingLegend
                  slices={outcomeSlices}
                  total={settled}
                  format={(v) => nf(v)}
                  onHover={setOutcomeHover}
                  active={outcomeHover}
                />
              </div>
            </Card>

            <Card
              title="Win rate vs break-even"
              hint="Your ITM rate measured against the rate you have to beat at the payout on offer. Below the mark, the account loses money however good the run feels."
            >
              <div className="flex flex-1 flex-col items-center px-4 pb-4 pt-2.5 sm:px-5">
                <div className="relative w-full max-w-[190px]">
                  <Gauge
                    value={stats.winRate}
                    threshold={hasPayout ? breakEven : null}
                    colour={hasPayout ? toneOf(stats.winRate - breakEven) : SERIES[0]}
                    size={190}
                  />
                  {/* Padding in percent resolves against the width, which is
                      also what scales the dial — so the figure keeps its place
                      inside the arc at every size. */}
                  <div className="absolute inset-0 flex flex-col items-center justify-end pb-[11%]">
                    <span
                      className="text-[26px] font-bold leading-none tabular-nums sm:text-[29px]"
                      style={{ color: hasPayout ? toneOf(stats.winRate - breakEven) : undefined }}
                    >
                      {decided > 0 ? pct(stats.winRate) : "—"}
                    </span>
                    <span className="mt-1.5 text-[11px] tabular-nums text-muted-foreground sm:text-[12px]">
                      {nf(stats.wins)} / {nf(decided)} in the money
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex w-full justify-center">
                  <Delta
                    current={stats.winRate}
                    previous={hasPrev && previousStats.wins + previousStats.losses > 0 ? previousStats.winRate : null}
                    label={hasPrev ? past : "of decided trades"}
                    points
                  />
                </div>
                <p className="mt-auto pt-3 text-center text-[11px] leading-snug text-muted-foreground sm:text-[12px]">
                  {hasPayout ? (
                    <>
                      Average payout{" "}
                      <span className="font-semibold text-foreground">{pct(avgPayoutPercent, 0)}</span>, so{" "}
                      <span className="font-semibold text-foreground">{pct(breakEven)}</span> is break-even
                      — the mark on the dial
                    </>
                  ) : (
                    "Break-even needs a settled winner to read the payout from"
                  )}
                </p>
              </div>
            </Card>
          </div>

          {/* ── the leaderboard ──────────────────────────────────────────── */}
          <Leaderboard
            rows={marketsShown}
            total={agg.marketRows.length}
            expanded={allMarkets}
            onToggle={() => setAllMarkets((v) => !v)}
            sym={sym}
            breakEven={hasPayout ? breakEven : null}
            turnover={cv(turnover)}
          />
        </>
      )}
    </div>
  );
}

export default AnalyticsOverview;
