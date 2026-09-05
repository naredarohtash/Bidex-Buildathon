"use client";

/**
 * Ranking — the trader leaderboard.
 *
 * Built to the reference design. What was wrong with the version this replaces:
 *
 * - **It floated over the chart, translucent.** `bg-[#121214]/90` on an
 *   `absolute` layer, so the drawing toolbar, the asset tabs and the timeframe
 *   control read straight through the rankings. It is a docked column now: a
 *   flex sibling of the chart, like the positions sidebar beside it, so opening
 *   it moves the chart across instead of covering it.
 * - **Two full-width segmented rows** — period, then metric — spent ~110px on
 *   chrome before a single trader appeared. The board is one thing now: today,
 *   ranked on profit. Everything a row used to spell out inline is in the card
 *   that opens when you point at it.
 * - **Your own summary was hidden exactly when you were doing well.** It
 *   rendered only for `!rank || rank > 25`, so breaking into the top 25 took
 *   your figures off the screen. Pinned at the top now, always — "where am I"
 *   is the first question anyone opens a ranking to answer.
 * - **The rules were invisible.** Real money only, settled trades only, five of
 *   them minimum, resets daily. None of it was written anywhere, so a trader
 *   with four trades saw an empty board and no reason for it.
 *
 * Surfaces use the platform tokens (`background`/`muted`/`border`) rather than
 * per-theme zinc literals, so light, dark and navy are one code path.
 */

import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Banknote,
  History,
  Info,
  ListChecks,
  Trophy,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { AnimalAvatar } from "@/components/ui/animal-avatar";
import { useUserStore } from "@/store/user";
import { cn } from "@/lib/utils";
import { MOBILE_NAV_HEIGHT } from "../navigation/mobile-navigation";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DOCK_WIDTH, DOCK_WIDTH_WIDE, DOCK_TRANSITION, LARGE_SCREEN } from "../layout/dock";
import {
  RANKING_RULES_EVENT,
  rankingRulesTriggerProps,
  type RankingRulesAnchor,
} from "../../lib/ranking-rules";

// ============================================================================
// TYPES
// ============================================================================

interface LeaderboardTrader {
  rank: number;
  username: string;
  /** ISO 3166-1 alpha-2, when the server knows it. Drives the flag. */
  country?: string | null;
  avatar: string | null;
  /** Picks the generated animal when `avatar` is null. Stable per trader, and
      a hash of their id rather than their id — see the server's
      `avatarSeedFor`. */
  avatarSeed?: string | null;
  totalProfit: number;
  winRate: number;
  totalTrades: number;
  wins: number;
  losses: number;
  /** Where in the field they stand, as a percent. Computed by the server, so
      the size of the field never has to be sent — see api/…/leaderboard. */
  percentile?: number | null;
}

interface LeaderboardData {
  period: string;
  metric: string;
  updatedAt: string;
  traders: LeaderboardTrader[];
}

interface UserPosition {
  rank: number | null;
  avatarSeed?: string | null;
  percentile: number | null;
  qualified: boolean;
  minTradesRequired: number;
  stats: {
    totalProfit: number;
    winRate: number;
    totalTrades: number;
    wins: number;
    losses: number;
    avgProfit: number;
  };
}

/**
 * The rules, as a card that hangs off the ⓘ.
 *
 * Portalled to `body` and positioned against the button's own rectangle, then
 * clamped to the window — the ranking column has `overflow-hidden` on it, and
 * an absolutely positioned child cannot escape that. No scrim: this explains
 * the list behind it, and covering that list to do so is the wrong trade.
 *
 * It follows the pointer: hovering the ⓘ shows it and leaving hides it again,
 * because five lines of housekeeping are something you glance at rather than
 * something you open and then have to put away. Focus does the same for a
 * keyboard, a tap does it on a touchscreen, and Escape closes it there.
 */
function RankingRules({
  at,
  onClose,
  minTrades,
}: {
  at: RankingRulesAnchor | null;
  onClose: () => void;
  minTrades: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* Escape still closes it, for the keyboard and for a touch device where the
     ⓘ was tapped rather than hovered. */
  useEffect(() => {
    if (!at) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [at, onClose]);

  if (!at || !mounted || typeof document === "undefined") return null;

  const WIDTH = 252;
  const GAP = 8;
  /* Under the mark, aligned to its left edge, and inside the window on both
     axes — the ⓘ sits near the left edge of a docked column on desktop and near
     the middle of a header bar on a phone. */
  const left = Math.min(Math.max(GAP, at.left - 2), window.innerWidth - WIDTH - GAP);
  const openUp = at.bottom + 260 > window.innerHeight;
  const style: React.CSSProperties = openUp
    ? { left, bottom: Math.max(GAP, window.innerHeight - at.top + GAP), width: WIDTH }
    : { left, top: at.bottom + GAP, width: WIDTH };

  /* Five rules, and a glyph that names each one rather than decorating it: the
     clock resets, the banknote is real money, the ticks are the trades that
     count, the trophy is the cut, the mask is the name. One tone for all five —
     a column of five different colours reads as five alerts, and none of these
     is one. Every line is something the endpoint actually does; see
     api/exchange/binary/leaderboard/index.get.ts. */
  const rules: { Icon: LucideIcon; text: string }[] = [
    { Icon: History, text: "Today's profit only — the board clears at midnight" },
    { Icon: Banknote, text: "Real money only; demo trades are not counted" },
    { Icon: ListChecks, text: `${minTrades} settled trades to qualify` },
    { Icon: Trophy, text: "Top 25, plus your own place wherever it falls" },
    { Icon: VenetianMask, text: "Traders appear as a nickname or initials" },
  ];

  return createPortal(
    <motion.div
      role="dialog"
      aria-label="How ranking works"
      initial={{ opacity: 0, y: openUp ? 6 : -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16, ease: [0.32, 0.72, 0, 1] }}
      style={style}
      /* `pointer-events-none`: it belongs to the ⓘ, not to the pointer. A card
         that can be hovered in its own right has to decide what happens when
         the pointer crosses the gap between the two, and there is nothing in
         here to click. */
      className="pointer-events-none fixed z-[10060] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
    >
      {/* No close button. It follows the pointer off the ⓘ, so a control for
          dismissing it would be a control nobody reaches. */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-3 py-2">
        <Info size={11} className="shrink-0 text-brand" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          How ranking works
        </span>
      </div>

      {/* A tile per glyph, and a rule between the lines.
      
          Five icons floating against text at five different left edges read as
          a bulleted list drawn badly; in a 20px tile each they line up as a
          column, and the hairlines make five separate facts out of what was one
          grey paragraph. */}
      <ul className="divide-y divide-border/60">
        {rules.map(({ Icon, text }) => (
          <li key={text} className="flex items-center gap-2.5 px-3 py-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <Icon size={11} strokeWidth={2.1} />
            </span>
            <span className="text-[11px] leading-[15px] text-foreground/80">{text}</span>
          </li>
        ))}
      </ul>

      {/* The one number on the card that moves, and the reason somebody hovered
          this in the first place: the board is not broken, it is not midnight
          yet. */}
      <div className="border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] leading-[14px] text-muted-foreground">
        Ranked on settled trades — the board updates as they close.
      </div>
    </motion.div>,
    document.body
  );
}

/** The ⓘ beside the word Ranking. Hovered, not pressed — see the trigger props. */
function RulesButton() {
  return (
    <button
      type="button"
      {...rankingRulesTriggerProps()}
      aria-label="How ranking works"
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-md text-muted-foreground",
        "hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      <Info size={13} />
    </button>
  );
}

export interface LeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
  /** When true, renders the full-screen phone surface instead of the docked column. */
  isMobile?: boolean;
  isSidebarCollapsed?: boolean;
  /**
   * Current docked width, in pixels — 0 when closed. Owned by the layout rather
   * than by this component, because the same number is also the header's left
   * inset: the asset tabs and the chart have to move as one, and two components
   * animating the same distance on their own clocks visibly do not.
   */
  dockedWidth?: number;
  /**
   * Fired once, when the docked column first exists in the DOM.
   *
   * This panel is code-split and latched, so on the first open it arrives one
   * or more commits after the click. The layout waits for this before raising
   * the width: otherwise the column mounts at its final width — nothing to
   * transition from — while the header band and the asset tabs slide, and the
   * first open of a session is the one that looks broken.
   */
  onDockReady?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/* One board: today, ranked on profit. The period and metric switchers are gone
   — five combinations of a leaderboard is five boards nobody asked for, and
   they cost two rows of chrome above the only one anyone opened. The API still
   takes both; these are the values it is asked for. */
const PERIOD = "daily";
const METRIC = "profit";

const MEDALS: Record<number, { disc: string; ring: string; ribbon: string }> = {
  1: { disc: "#e0b13c", ring: "#f7d675", ribbon: "#c2903a" },
  2: { disc: "#b0b7c3", ring: "#dbe0e8", ribbon: "#8f97a5" },
  3: { disc: "#bd7f50", ring: "#dda175", ribbon: "#98643c" },
};

/** Delay before a hover card opens, so running the pointer down the list is quiet. */
const HOVER_DELAY_MS = 130;

// ============================================================================
// FORMATTING
// ============================================================================

/* Cents on a ranking are noise: a column of "+$4,993.70" is four characters of
   precision nobody compares, and it pushes the names that are being compared
   into an ellipsis. Kept below $1,000, where they are the difference between
   two rows. */
function money(value: number, signed = true): string {
  const magnitude = Math.abs(value);
  const decimals = magnitude >= 1000 ? 0 : 2;
  const abs = magnitude.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = value < 0 ? "-" : signed ? "+" : "";
  return `${sign}$${abs}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* "PK" → "Pakistan", from the browser rather than from a table: the country
   list this app ships is fetched as JSON and a hover card cannot wait on a
   request. Falls back to the code, which is still more than nothing. */
const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryName(code?: string | null): string | null {
  if (!code) return null;
  try {
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

const profitClass = (v: number) =>
  v >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";

// ============================================================================
// PIECES
// ============================================================================

/* Gold, silver and bronze as a drawn medal rather than an emoji: emoji medals
   rasterise from the OS colour font, so they arrive at a different weight and
   hue on every platform and sit at odds with a UI drawn in one palette. Ranks
   four and down are the plain numeral. The top three do not need their number
   printed — they are the top three rows. */
function RankMark({ rank }: { rank: number }) {
  const m = MEDALS[rank];

  if (!m) {
    return (
      <span className="w-7 shrink-0 text-center text-[10.5px] tabular-nums text-muted-foreground 2xl:w-8 2xl:text-[12px]">
        {rank}
      </span>
    );
  }

  /* The medal is drawn larger on the top three rows, which are themselves
     drawn larger — a 15px medal on a 34px row reads as an ornament that got
     left behind at the old size. */
  return (
    <span className="flex w-7 shrink-0 justify-center 2xl:w-8" aria-label={`Rank ${rank}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="h-[17px] w-[17px] 2xl:h-5 2xl:w-5"
      >
        <path d="M6.6 2h3.1l3 7.2-3.1 1.5L6.6 2Z" fill={m.ribbon} />
        <path d="M17.4 2h-3.1l-3 7.2 3.1 1.5L17.4 2Z" fill={m.ribbon} />
        <circle cx="12" cy="15.6" r="6.4" fill={m.disc} />
        <circle cx="12" cy="15.6" r="6.4" fill="none" stroke={m.ring} strokeWidth="1" />
        <circle cx="12" cy="15.6" r="3.3" fill="none" stroke={m.ring} strokeWidth="0.9" opacity="0.65" />
      </svg>
    </span>
  );
}

/* Initials beat a generic person glyph: every trader without a picture would
   otherwise get the same silhouette, and a column of identical silhouettes
   carries no information. The handle is already initials plus a suffix
   (`RN***357A`), so its first two characters are the trader's own initials. */
function TraderAvatar({
  avatar,
  seed,
  name,
  className,
}: {
  avatar: string | null;
  /** Picks the animal when there is no photograph. */
  seed?: string | null;
  name: string;
  /** Box size — Tailwind, so it can carry a breakpoint. */
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  /* A dead URL would otherwise leave a torn-image glyph in the middle of the
     row, and hiding the element would leave a hole where the picture belongs.
     Falling through to the generated one is the only outcome that still says
     which row this is. */
  if (avatar && !broken) {
    return (
      <img
        src={avatar}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full bg-muted object-cover", className)}
      />
    );
  }

  /* Nobody gets two grey letters any more. The seed falls back to the display
     name only when the server did not send one — an older cached response, or
     a row this panel built itself — which still gives that trader a stable
     animal, just one that would change if they renamed. */
  return <AnimalAvatar seed={seed || name} title={name} className={className} />;
}

/* Its own slot, not a badge on the corner of the avatar. At 12px a flag is a
   coloured smudge — half the point of showing one is telling India from
   Indonesia, and that needs the width. */
function CountryFlag({
  country,
  className = "w-[18px] h-[13px] 2xl:w-[22px] 2xl:h-4",
}: {
  country?: string | null;
  /** Width and height together — Tailwind, so it can carry a breakpoint. */
  className?: string;
}) {
  if (!country) return <span className={cn("shrink-0 invisible", className)} />;
  return (
    <img
      src={`/img/flag/${country.toLowerCase()}.webp`}
      alt={country}
      title={countryName(country) ?? country}
      loading="lazy"
      onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
      className={cn("shrink-0 rounded-[2px] object-cover", className)}
    />
  );
}

/**
 * Who the row is: their country and their picture, as one mark.
 *
 * A rectangular flag in its own slot beside a round avatar in another was two
 * objects of two different shapes taking 46px of a 320px column, and the names
 * they were introducing ran out of room and truncated. This is the shape the
 * terminal already uses to say "these two things belong together" — the
 * overlapping pair on every asset tab and in every price alert — so the board
 * borrows it rather than inventing a third convention.
 *
 * The flag sits behind on the left and the person in front on the right, both
 * circular. The front disc carries a ring in the panel's own background colour,
 * which is what makes an overlap read as two discs instead of one dented one.
 */
function TraderMark({
  trader,
  big = false,
  diagonal = false,
}: {
  trader: LeaderboardTrader;
  big?: boolean;
  /**
   * Step the person down and to the right of the flag, the way the asset pair
   * is drawn — instead of setting the two side by side on one baseline.
   *
   * The card takes it and the list does not, deliberately. On a card there is
   * one mark and the stagger reads as depth; down a column of twenty-four the
   * same stagger puts every row's second disc on a different line from its
   * neighbours, and the eye follows that ragged edge instead of the names.
   */
  diagonal?: boolean;
}) {
  /* Both discs carry the theme's border. Without it a flag whose edge happens
     to be pale and an initials disc on `bg-muted` both dissolve into the panel
     — which is what they did in all three themes — and the pair reads as one
     smudge rather than two objects. The front disc adds a ring in the panel's
     own background colour, which is what cuts the gap that makes an overlap
     legible as an overlap. */
  /* The box is exactly disc + offset in each direction, so the mark carries no
     slack and the rows are only as tall as the thing inside them. The discs
     overlap by about a third, which is the ratio the asset pair uses — half was
     too much, and the flag behind lost the stripe that tells one country from
     another. */
  const disc = cn(
    "border border-border",
    diagonal
      ? "h-6 w-6 2xl:h-7 2xl:w-7"
      : big
        ? "h-[21px] w-[21px] 2xl:h-6 2xl:w-6"
        : "h-[18px] w-[18px] 2xl:h-[21px] 2xl:w-[21px]"
  );

  return (
    <span
      className={cn(
        "relative block shrink-0",
        diagonal
          ? "h-8 w-[39px] 2xl:h-[37px] 2xl:w-[45px]"
          : big
            ? "h-[21px] w-[35px] 2xl:h-6 2xl:w-10"
            : "h-[18px] w-[30px] 2xl:h-[21px] 2xl:w-[35px]"
      )}
    >
      <CountryFlag
        country={trader.country}
        className={cn("absolute left-0 top-0 rounded-full object-cover", disc)}
      />
      <TraderAvatar
        avatar={trader.avatar}
        seed={trader.avatarSeed}
        name={trader.username}
        className={cn(
          "absolute ring-2 ring-background",
          diagonal
            ? "left-[15px] top-2 text-[9px] 2xl:left-[17px] 2xl:top-[9px] 2xl:text-[10px]"
            : big
              ? "left-3.5 top-0 text-[8px] 2xl:left-4 2xl:text-[9px]"
              : "left-3 top-0 text-[7px] 2xl:left-3.5 2xl:text-[8px]",
          disc
        )}
      />
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-2 px-3 py-[7px]">
      <div className="h-2.5 w-5 shrink-0 rounded bg-muted" />
      <div className="h-5 w-5 shrink-0 rounded-full bg-muted" />
      <div className="h-2.5 flex-1 rounded bg-muted" style={{ maxWidth: 84 }} />
      <div className="h-2.5 w-14 shrink-0 rounded bg-muted" />
    </div>
  );
}

/**
 * The card for the row under the pointer.
 *
 * It used to sit *inside* the column, centred, because a card belonging to the
 * ranking on top of the chart looked like the panel covering the one surface it
 * had been built not to cover. It sits beside the column now, over the chart:
 * a card inside a 320px column has to be narrow, has to be cramped, and covers
 * the very rows you are comparing it against.
 *
 * What it is *not*, having been each of them:
 *
 *  - **Not a label/value list.** Six rows of grey word, black number, and the
 *    figure anybody opened it for buried in the middle of them.
 *  - **Not a page.** 300px, 18px figures, six cells and a footer, for a thing
 *    you open by pointing.
 *  - **Not a tinted green panel with a percentage meter in it.** That reads as
 *    a dashboard widget wherever it appears, which is to say it says nothing
 *    about this being a trader on a ranking. The colour, the box and the bar
 *    were three decorations doing one job.
 *
 * What it is: three zones on one raised surface. Who they are, the money, and
 * one closing line of context. `bg-card` is a real step up from `background` in
 * all three themes — white on 97% grey, 8% on 3.9%, 11% on 8% — so the border
 * and the shadow are the edge of something rather than a drawn rectangle.
 *
 * The bar is the win/loss split with its own counts, not a progress meter: the
 * length is the same information either way, and a split says what it is made
 * of. Colour appears once, on the money, and carries its sign.
 *
 * Portalled to `body` and positioned in viewport coordinates, because the
 * column is `overflow-hidden` — an absolutely positioned child cannot leave it.
 * Placed to the right of the column and clamped to the window, flipping to the
 * left only if there is genuinely no room.
 *
 * Min and max trade amount would fill it out and the leaderboard API does not
 * report them, so they are not here — every figure is one the server sends.
 */
function TraderCard({
  trader,
  anchor,
}: {
  trader: LeaderboardTrader;
  /** Viewport coordinates: the row's band, and the column to sit beside. */
  anchor: { rowTop: number; rowBottom: number; columnRight: number; columnLeft: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const margin = 10;

    /* Centred on the row, then pulled back inside the window. A card that
       hangs off the bottom edge is one you would have to scroll the page to
       read, and this page does not scroll. */
    const wanted = (anchor.rowTop + anchor.rowBottom) / 2 - h / 2;
    const top = Math.max(margin, Math.min(wanted, window.innerHeight - h - margin));

    /* Flush against the column's own edge rather than floating 8px off it.
       The scrollbar is the last thing at that edge, so a card that starts
       there reads as attached to the list it came from; a gap made it look
       like a window that had drifted onto the chart. -2 puts its border over
       the column's, so there is one line between them and not two. */
    const right = anchor.columnRight - 2;
    const left =
      right + w <= window.innerWidth - margin
        ? right
        : Math.max(margin, anchor.columnLeft - w + 2);

    setBox({ top, left });
  }, [anchor, trader]);

  const avg = trader.totalTrades > 0 ? trader.totalProfit / trader.totalTrades : 0;
  const settled = trader.wins + trader.losses;
  const wonPct = settled > 0 ? (trader.wins / settled) * 100 : 0;
  /* Derived from the two counts printed under it rather than read from the
     server's `winRate`, which is computed over a different denominator: a bar
     drawn at 68% of its width beside a figure reading 71.2% is the kind of
     disagreement that reads as a broken card. */
  const accuracy = settled > 0 ? wonPct : null;

  /* Where they sit in the field, which is the one thing a rank alone does not
     tell you — #8 means nothing until you know of how many.

     Read off the row rather than divided out here, because the divisor is not
     sent any more: how many traders are on the board is the platform's own
     figure and it does not belong in a public response. */
  const percentile = trader.percentile ?? null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        top: box?.top ?? -9999,
        left: box?.left ?? -9999,
        /* Measured before it is placed, so the first frame must not be seen. */
        visibility: box ? "visible" : "hidden",
      }}
      className="pointer-events-none fixed z-[60] w-[236px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl 2xl:w-[260px]"
    >
      {/* Who. The same pair mark the row carries, so the card is recognisably
          about the row you are pointing at. */}
      <div className="flex items-center gap-2 px-3.5 pb-3 pt-3">
        <TraderMark trader={trader} big diagonal />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-semibold leading-tight text-foreground 2xl:text-[13.5px]">
            {trader.username}
          </div>
          <div className="truncate text-[10px] leading-tight text-muted-foreground 2xl:text-[11px]">
            {countryName(trader.country) ?? "Country not set"}
          </div>
        </div>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-muted-foreground/70 2xl:text-[14px]">
          #{trader.rank}
        </span>
      </div>

      {/* The money. Unboxed and on the card's own surface — it is the figure
          this card exists to show, and a figure that size does not need a
          panel drawn around it to be found. */}
      <div className="border-t border-border px-3.5 pb-3 pt-2.5">
        {/* The two headline figures share a row of labels and a row of values,
            so naming the second one costs no height. The accuracy used to be an
            unlabelled 68.3% floating between "28 won" and "13 lost", which is
            the one number on the card nobody could name. */}
        <div className="flex items-baseline justify-between gap-2 text-[10px] leading-none text-muted-foreground 2xl:text-[11px]">
          <span>Profit today</span>
          <span>Accuracy</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums 2xl:text-[21px]",
              profitClass(trader.totalProfit)
            )}
          >
            {money(trader.totalProfit)}
          </span>
          <span className="shrink-0 text-[19px] font-bold leading-none tracking-[-0.02em] tabular-nums text-foreground 2xl:text-[21px]">
            {accuracy === null ? "—" : `${accuracy.toFixed(1)}%`}
          </span>
        </div>

        {/* In the money against out of it, at the length it really is — and the
            length is the accuracy above it, drawn from the same two counts so
            the bar and the figure can never disagree.

            At 3px it was a hairline that read as a divider rather than as a
            measurement; 6px is thick enough to be a bar and still quieter than
            the two figures above it. */}
        <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full bg-emerald-500" style={{ width: `${wonPct}%` }} />
          <div className="h-full bg-red-500/70" style={{ width: `${100 - wonPct}%` }} />
        </div>
        {/* ITM and OTM, not won and lost — a binary trade finishes in or out of
            the money, and that is what the rest of this terminal calls it. */}
        <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[10px] tabular-nums text-muted-foreground 2xl:text-[11px]">
          <span className="min-w-0 truncate">
            <span className="text-foreground">{trader.wins}</span> ITM
            {" · "}
            <span className="text-foreground">{trader.losses}</span> OTM
          </span>
          <span className="shrink-0 whitespace-nowrap">{money(avg)}/trade</span>
        </div>
      </div>

      {/* One closing line: the size of the day, and where in it they stand.

          It used to finish "of 4,201", which is the number of traders on the
          board — the platform's own figure, printed on a hover card and sent
          in the JSON behind it. The standing says everything that line was
          for; the count it was divided by is nobody's business. */}
      <div className="border-t border-border px-3.5 py-2 text-[10px] leading-tight text-muted-foreground 2xl:text-[11px]">
        {plural(trader.totalTrades, "trade")} settled
        {percentile !== null && (
          <>
            {" · top "}
            <span className="font-semibold text-foreground">
              {percentile < 1 ? percentile.toFixed(1) : Math.round(percentile)}%
            </span>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// MAIN
// ============================================================================

export default function Leaderboard({
  isOpen,
  onClose,
  isMobile = false,
  dockedWidth = 0,
  onDockReady,
}: LeaderboardProps) {
  const { user } = useUserStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  /* Where the rules card hangs from, or null while it is shut. The rectangle
     is the ⓘ that was pressed. */
  const [rulesAt, setRulesAt] = useState<RankingRulesAnchor | null>(null);

  /* The desktop title bar is drawn by the layout — the band this column
     continues through — so its ⓘ reaches the card through an event rather than
     through two levels of dock plumbing. See lib/ranking-rules. */
  useEffect(() => {
    const open = (e: Event) => {
      /* No rectangle means "hidden": the pointer left the mark. */
      setRulesAt((e as CustomEvent<RankingRulesAnchor | null>).detail ?? null);
    };
    window.addEventListener(RANKING_RULES_EVENT, open);
    return () => window.removeEventListener(RANKING_RULES_EVENT, open);
  }, []);
  const [hover, setHover] = useState<{
    trader: LeaderboardTrader;
    rowTop: number;
    rowBottom: number;
    columnRight: number;
    columnLeft: number;
  } | null>(null);
  /* A pinned row keeps its card when the pointer leaves. Hovering is how you
     run down the list; clicking is how you stop on one, which is what makes
     the figures readable long enough to compare them against the next row. */
  const [pinned, setPinned] = useState<string | null>(null);

  const columnRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* The same breakpoint the `2xl:` classes through this file use, so the column
     and the type it holds step up together — see DOCK_WIDTH_WIDE. */
  const wide = useMediaQuery(LARGE_SCREEN);

  /* Today's board, and only today's.
  
     It is empty every morning until the fifth real trade of the day settles,
     and an empty column is the honest answer for those hours: the longer
     periods are padded with synthetic traders, so filling the gap with this
     week's list would put invented people on a ranking somebody reads as real.
     The empty state says what has to happen for the board to fill. */
  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/exchange/binary/leaderboard?period=${PERIOD}&metric=${METRIC}&limit=25`
      );
      if (!response.ok) throw new Error("Failed to fetch leaderboard");
      setData(await response.json());
    } catch (err: any) {
      setError(err?.message || "Failed to load rankings");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUserPosition = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(
        `/api/exchange/binary/leaderboard/me?period=${PERIOD}&metric=${METRIC}`
      );
      if (!response.ok) return;
      const result = await response.json();
      /* The response is not guaranteed to carry figures. On an account with no
         settled trades the endpoint answers with a position and nothing to put
         in it, and this panel reads `.stats.totalTrades` unconditionally — so
         opening the ranking threw and the terminal's error boundary replaced
         the whole screen with "Something went wrong!". `minTradesRequired` goes
         missing the same way, which is how the card came to read "NaN more
         trades". Normalised once here rather than guarded at each read site:
         the card's job is to say "you are unranked, here is how far off you
         are", and zeroes say that correctly. */
      setUserPosition(
        result && typeof result === "object"
          ? {
              rank: null,
              avatarSeed: null,
              percentile: null,
              qualified: false,
              minTradesRequired: 5,
              ...result,
              stats: {
                totalProfit: 0,
                winRate: 0,
                totalTrades: 0,
                wins: 0,
                losses: 0,
                avgProfit: 0,
                ...(result.stats ?? {}),
              },
            }
          : null
      );
    } catch {
      // Optional — the board stands on its own without it.
    }
  }, [user]);

  useEffect(() => {
    if (isMobile) return;
    onDockReady?.();
  }, [isMobile, onDockReady]);

  /* Two effects, not one. Combined, the board was fetched twice every time the
     panel opened: `fetchUserPosition` closes over `user`, which resolves a
     moment after mount, and the new identity re-ran the whole effect — taking
     the board's own request with it. */
  useEffect(() => {
    if (!isOpen) return;
    fetchLeaderboard();
    /* Trades settle while the panel is open, so a board fetched once is a
       photograph. Twenty seconds is slow enough not to make the column twitch
       and fast enough that a place change is something you watch happen. */
    const t = setInterval(fetchLeaderboard, 20_000);
    return () => clearInterval(t);
  }, [isOpen, fetchLeaderboard]);

  useEffect(() => {
    if (!isOpen) return;
    fetchUserPosition();
  }, [isOpen, fetchUserPosition]);

  /* Escape lets a pinned card go before it closes the panel — one key, the
     innermost thing first, which is what Escape means everywhere else here. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pinned) {
        setPinned(null);
        setHover(null);
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, pinned]);

  /* Nothing should be pointing at a row of a board that is closing, or at a row
     that has scrolled out from under the pointer. */
  useEffect(() => {
    if (!isOpen) {
      setHover(null);
      setPinned(null);
    }
  }, [isOpen]);

  useEffect(
    () => () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    },
    []
  );

  const traders = useMemo(() => data?.traders.slice(0, 25) ?? [], [data]);

  /* Which listed row is you. The board anonymises every handle including your
     own, so it cannot be matched by name. `me` is computed over the same period
     and metric, so rank plus the trade figures identify the row; the extra
     fields guard the case where two traders tie and the two endpoints — one
     sorting in SQL, one in JS — break that tie differently. */
  const myRank = userPosition?.rank ?? null;
  const isMyRow = useCallback(
    (t: LeaderboardTrader) =>
      !!userPosition &&
      t.rank === myRank &&
      t.totalTrades === userPosition.stats.totalTrades &&
      t.wins === userPosition.stats.wins &&
      t.losses === userPosition.stats.losses,
    [userPosition, myRank]
  );

  /* Viewport coordinates, because the card is portalled to `body` and placed
     beside the column rather than inside it. Both rectangles are read at the
     moment of hovering, so a scrolled list and a resized window both give the
     right answer without either being watched. */
  const anchorFor = useCallback((el: HTMLElement) => {
    const column = columnRef.current;
    if (!column) return null;
    const row = el.getBoundingClientRect();
    const col = column.getBoundingClientRect();
    return {
      rowTop: row.top,
      rowBottom: row.bottom,
      columnRight: col.right,
      columnLeft: col.left,
    };
  }, []);

  const openHoverCard = useCallback(
    (trader: LeaderboardTrader, el: HTMLElement) => {
      if (isMobile) return;
      if (pinned) return;
      const anchor = anchorFor(el);
      if (!anchor) return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      hoverTimer.current = setTimeout(() => setHover({ trader, ...anchor }), HOVER_DELAY_MS);
    },
    [isMobile, pinned, anchorFor]
  );

  const closeHoverCard = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    /* A pinned card outlives the pointer; only the pin puts it away. */
    setHover((h) => (pinned ? h : null));
  }, [pinned]);

  /* Clicking pins the row under the pointer, and clicking it again lets go.
     Without the immediate `setHover` a click that lands inside the hover delay
     would pin a row and show nothing. */
  const togglePin = useCallback(
    (trader: LeaderboardTrader, el: HTMLElement) => {
      if (isMobile) return;
      const key = `${trader.rank}-${trader.username}`;
      if (pinned === key) {
        setPinned(null);
        return;
      }
      const anchor = anchorFor(el);
      if (!anchor) return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setPinned(key);
      setHover({ trader, ...anchor });
    },
    [isMobile, pinned, anchorFor]
  );

  /* The nickname first, exactly as the server names everybody else on the
     board — see `displayNameFor` in api/exchange/binary/leaderboard. This read
     the legal name only, so somebody who set a nickname to keep their name off
     the ranking saw their own row still carrying it, one line above a list of
     nicknames. */
  const myName = useMemo(() => {
    const raw = (user as any)?.profile;
    let profile: any = raw;
    if (typeof raw === "string") {
      try {
        profile = JSON.parse(raw);
      } catch {
        profile = null;
      }
    }
    const nickname = String(profile?.nickname || profile?.displayName || "").trim();
    if (nickname) return nickname;
    return `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "You";
  }, [user]);

  // ──────────────────────────────────────────────────────────────────────────

  const body = (
    <>
      {/* Title. On desktop it is drawn one row up, in the header band the docked
          column continues through — see the header row in desktop-layout — so
          the column reads from the top edge of the window rather than starting
          below the asset tabs.

          Phone: the layout draws one dismiss control for every full-screen
          surface, fixed at top-right. A second X here put two of them side by
          side, so this row only clears its footprint. */}
      {isMobile && (
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-3 pr-14">
          <h2 className="text-[12.5px] font-semibold text-foreground 2xl:text-[14px]">Global Leaderboard</h2>
          <RulesButton />
        </div>
      )}

      {/* You.

          The box sat 10px under a header band that already has its own
          breathing room, which read as a gap the panel had forgotten to close.
          Pulled up to 4px and given the height back on the inside, where it
          buys a row you can actually read rather than air above one. */}
      {user && (
        <div className="shrink-0 px-3 pb-1.5 pt-1">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 px-2.5 py-2 2xl:gap-3 2xl:px-3 2xl:py-2.5">
            <TraderAvatar
              avatar={user.avatar && user.avatar !== "/user/placeholder.svg" ? user.avatar : null}
              seed={userPosition?.avatarSeed}
              name={myName}
              className="h-[26px] w-[26px] text-[10px] 2xl:h-[30px] 2xl:w-[30px] 2xl:text-[12px]"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold leading-tight text-foreground 2xl:text-[13.5px]">
                {myName}
              </div>
              <div className="truncate text-[10px] leading-tight text-muted-foreground 2xl:text-[11.5px]">
                {!userPosition
                  ? " "
                  : userPosition.qualified && myRank
                    ? /* Just the place. "#3,542 of 4,007" reads as how far from
                         the bottom you are, which is not what anyone opens a
                         ranking to find out. */
                      `Ranked #${myRank.toLocaleString()}`
                    : userPosition.stats.totalTrades === 0
                      ? "No settled trades today"
                      : `${plural(
                          Math.max(
                            0,
                            userPosition.minTradesRequired - userPosition.stats.totalTrades
                          ),
                          "trade"
                        )} to qualify`}
              </div>
            </div>
            {userPosition && (
              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    "text-[12px] font-semibold leading-tight tabular-nums 2xl:text-[13.5px]",
                    profitClass(userPosition.stats.totalProfit)
                  )}
                >
                  {money(userPosition.stats.totalProfit)}
                </div>
                <div className="text-[10px] leading-tight text-muted-foreground tabular-nums 2xl:text-[11.5px]">
                  {plural(userPosition.stats.totalTrades, "trade")}
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Column headings */}
      {/* Padded to line up with the rows, which are inset by their own rounded
          highlight — px-1.5 on the track plus px-1.5 inside the row. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 pb-1 pt-1 2xl:gap-2.5">
        <span className="w-7 shrink-0 text-center text-[10px] text-muted-foreground 2xl:w-8 2xl:text-[11.5px]">
          Rank
        </span>
        <span className="flex-1 text-[10px] text-muted-foreground 2xl:text-[11.5px]">Trader</span>
        <span className="shrink-0 text-[10px] text-muted-foreground 2xl:text-[11.5px]">P&amp;L</span>
      </div>

      {/* List */}
      {/* Scrollable, but without the bar: at 320px the track sits on top of the
          P&L column and is the widest piece of chrome on the panel, for a list
          whose scrollability is obvious from the rows running off the bottom.
          Written as arbitrary variants rather than reaching for one of the
          three scrollbar classes in globals/trading css, so it does not depend
          on which of those sheets is loaded here. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={() => {
          if (hoverTimer.current) clearTimeout(hoverTimer.current);
          setPinned(null);
          setHover(null);
        }}
      >
        {loading ? (
          <div className="pt-1">
            {Array.from({ length: 14 }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p className="text-[11px] text-muted-foreground">{error}</p>
            <button
              onClick={() => {
                fetchLeaderboard();
                fetchUserPosition();
              }}
              className="rounded border border-border px-2.5 py-1 text-[10.5px] text-foreground transition-colors hover:bg-muted"
            >
              Try again
            </button>
          </div>
        ) : traders.length === 0 ? (
          <div className="flex flex-col items-center gap-1 px-6 py-10 text-center">
            <p className="text-[11.5px] font-medium text-foreground">
              Nobody has qualified today yet
            </p>
            <p className="text-[10px] leading-[1.5] text-muted-foreground">
              The board fills as traders settle their{" "}
              {userPosition?.minTradesRequired ?? 5}th real-money trade of the day.
            </p>
          </div>
        ) : (
          <>
            {traders.map((trader) => {
              const mine = isMyRow(trader);
              const key = `${trader.rank}-${trader.username}`;
              /* The podium. Taller, with larger type and a larger avatar, so
                 the first three read as the first three from across the room
                 rather than as three rows that happen to carry a medal. */
              const top = trader.rank <= 3;
              const active = hover?.trader === trader;
              return (
                <div key={key} className="px-1.5">
                  <button
                    type="button"
                    onMouseEnter={(e) => openHoverCard(trader, e.currentTarget)}
                    onMouseLeave={closeHoverCard}
                    onClick={(e) => togglePin(trader, e.currentTarget)}
                    aria-pressed={pinned === key}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-1.5 text-left transition-colors 2xl:gap-2.5",
                      /* The podium is bigger through its mark and its type, not
                         through padding: at 9px it stood 12px taller than the
                         row under it and the three of them read as a separate
                         block that had drifted away from the list.

                         The list's own mark is the side-by-side one, so the
                         row is only as tall as a disc and this padding is the
                         whole of the gap between two names. */
                      top ? "py-[4px] 2xl:py-[5px]" : "py-[5px] 2xl:py-[6px]",
                      /* The pointed-at row is the brightest thing in the list,
                         and it is inset and rounded so it reads as one object
                         lifted out of the column rather than a band across it. */
                      active
                        ? "bg-muted ring-1 ring-border"
                        : mine
                          ? "bg-blue-500/[0.09]"
                          : top
                            ? "bg-muted/35 hover:bg-muted/60"
                            : "hover:bg-muted/40"
                    )}
                  >
                    <RankMark rank={trader.rank} />
                    <TraderMark trader={trader} big={top} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-foreground",
                        top
                          ? "text-[12.5px] font-semibold 2xl:text-[14px]"
                          : "text-[11px] 2xl:text-[12.5px]"
                      )}
                    >
                      {trader.username}
                      {mine && (
                        <span className="ml-1.5 text-[9px] font-semibold text-blue-600 dark:text-blue-400 2xl:text-[10px]">
                          You
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        top
                          ? "text-[12.5px] font-semibold 2xl:text-[14px]"
                          : "text-[11px] font-medium 2xl:text-[12.5px]",
                        profitClass(trader.totalProfit)
                      )}
                    >
                      {money(trader.totalProfit)}
                    </span>
                  </button>
                </div>
              );
            })}

          </>
        )}
      </div>
    </>
  );

  /* The rules, hanging off the ⓘ that asked for them.
  
     They were an accordion opened by a 10px line of text — a control the size
     of a caption, sitting where a caption goes, on the one screen where
     somebody missing from the board needs to find out why. Then briefly a
     centred dialog, which is the shape this product uses for a decision: a
     scrim over the whole terminal, a header, a footer and a button, for five
     lines of housekeeping nobody has to agree to.
  
     A small card at the mark instead. Each line carries its own glyph rather
     than a bullet, because the five rules are five different kinds of thing —
     a clock, a wallet, a counter, a cut-off, a name — and a column of identical
     dots makes them read as one paragraph broken into pieces. */
  const rulesCard = <RankingRules at={rulesAt} onClose={() => setRulesAt(null)} minTrades={userPosition?.minTradesRequired ?? 5} />;

  /* Phone: a full-screen surface over the chart, stopping at the navigation bar
     so the bar stays reachable. No hover card — there is no pointer to hover
     with, and the figures it carries are not worth a second screen. */
  if (isMobile) {
    if (!isOpen) return null;
    return (
      <div
        style={{ bottom: MOBILE_NAV_HEIGHT }}
        className="absolute inset-x-0 top-0 z-50 flex flex-col bg-background"
      >
        {body}
        {rulesCard}
      </div>
    );
  }

  /* Desktop: a docked column, not an overlay — opening it moves the chart over
     rather than covering it.

     The width is a plain CSS transition on a number the layout owns, matching
     the header's transition exactly. It was a framer spring before, against the
     header's CSS ease, and a spring and an ease-in-out do not agree at any
     frame between their endpoints — so the asset tabs and the chart beneath
     them slid apart and snapped back together at the end.

     The inner column keeps its full width throughout, so the content does not
     reflow while the frame around it moves. */
  return (
    <aside
      style={{ width: dockedWidth, transition: DOCK_TRANSITION }}
      /* The column stays mounted at zero width so it has something to animate
         from, which leaves real buttons inside a strip nobody can see. `inert`
         takes them out of the tab order and out of the accessibility tree
         together — `aria-hidden` alone would hide them from a screen reader
         while still letting Tab land on them, which is worse than either. */
      inert={!isOpen}
      className={cn(
        "relative z-30 h-full shrink-0 overflow-hidden bg-background",
        dockedWidth > 0 && "border-r border-border"
      )}
    >
      <div
        ref={columnRef}
        className="relative flex h-full flex-col"
        style={{ width: wide ? DOCK_WIDTH_WIDE : DOCK_WIDTH }}
      >
        {body}
        {isOpen && hover && (
          <TraderCard trader={hover.trader} anchor={hover} />
        )}
        {rulesCard}
      </div>
    </aside>
  );
}
