"use client";

/**
 * The vocabulary the settings panel is built from.
 *
 * Four rules, all learned the hard way:
 *
 * 1. **A setting is a label and its control.** Not a card, not a subtitle
 *    restating the title. The stack of seven identical `SettingSection` cards
 *    this replaced gave a chart grid line the same weight on screen as a daily
 *    loss limit that can stop you trading.
 *
 * 2. **Rows run edge to edge.** The pass before this one put every group in an
 *    inset rounded box with a hairline around it, so a 320px column spent 32px
 *    of its width on frames and every screen was a stack of little containers.
 *    A settings list is one sheet: full-bleed rows, a hairline between them,
 *    and the only thing inset is the content. It also buys back the width the
 *    controls actually needed.
 *
 * 3. **A control that takes a value gets the full width, under its label.**
 *    Label-left / control-right is right for a switch — the switch is small and
 *    binary. It is wrong for a select or a slider: those get squeezed into
 *    whatever is left at the end of the row, which is how the time zone picker
 *    ended up truncating city names in a 104px box.
 *
 * 4. **Contrast comes from surfaces; colour comes from one hue.** An earlier
 *    pass had everything on `bg-background` inside a 1px border, so on a dark
 *    theme the panel was black rows on black with hairlines between them. Now
 *    controls sit on a filled surface that steps up from the sheet, and there
 *    is exactly one accent — blue — for the thing that is *chosen* or *on*.
 *    Amber and red are not accents here; they are states, and appear only when
 *    a figure is near a limit or past it. If nothing is wrong, nothing is warm.
 *
 * Every colour is a workspace token or a blue defined for light and dark, so
 * all three themes are one code path. Where a transition is needed it is
 * written inline: `styles/theme.css` has an unlayered
 * `* { transition: background-color, border-color, color }` that overrides every
 * Tailwind transition utility in the app, so `transition-transform` and friends
 * silently do nothing.
 */

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// SURFACES
// ============================================================================

/**
 * Four levels, each one a step away from the one it sits on.
 *
 * The panel kept failing on navy and light for the same reason: whatever the
 * levels were, two of them landed on nearly the same colour once the theme
 * changed, and the sections stopped being findable. Alternating solves it —
 * every level goes the *opposite* direction from its parent, so no two adjacent
 * surfaces can converge on any theme:
 *
 *     sheet      bg-background   the terminal's own surface, as every other
 *                                panel uses — the settings column must not be
 *                                the one panel that is a different colour
 *     card       #121214         the terminal's card, copied from the container
 *                                the order panel wraps the positions list in,
 *                                so the two read as the same material
 *     header     one step up      so a card's name reads as a header
 *     field      bg-background   back down, recessed into the card it sits in
 *
 * The border on a card is not decoration. A fill has to survive three themes
 * and whatever the chart is doing behind it; an edge does not. Anything you can
 * click keeps its own edge for the same reason.
 */
const FIELD = "bg-background border border-border/70";
/** Where a live figure lives: the one place a neutral sheet is allowed colour. */
const STAT = "bg-blue-500/[0.09] border border-blue-500/25";

const ACCENT_SOLID = "bg-blue-600 text-white";
const ACCENT_SOFT = "bg-blue-500/10 text-blue-600 dark:text-blue-400";
const ROW = "px-3 py-2.5";

/**
 * How much risk a choice allows.
 *
 * The panel's rule everywhere else is "blue means chosen, warm means something
 * is wrong". Inside the risk section that rule wastes the one thing colour is
 * uniquely good at: these settings are a *scale*, and the scale runs from a
 * choice that protects you to a choice that barely does.
 *
 * So a chip is coloured by what picking it costs you in protection, in one
 * direction, always: green is the safest option on the row, red the loosest.
 * Pausing after 2 losses is green and after 5 is red; a 30-minute pause is
 * green and a 5-minute one is red; warning at 60% of the daily cap is green
 * and at 90% is red. Nothing is coloured for variety — you can read your own
 * setup's strictness off the row of chips without reading a single number.
 */
export type RiskTone = "safe" | "neutral" | "caution" | "loose";

const TONE_SOLID: Record<RiskTone, string> = {
  safe: "bg-emerald-600 text-white",
  neutral: "bg-blue-600 text-white",
  caution: "bg-amber-600 text-white",
  loose: "bg-red-600 text-white",
};

/** The same four tones as text, for naming a level in a sentence. */
export const TONE_TEXT: Record<RiskTone, string> = {
  safe: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-blue-600 dark:text-blue-400",
  caution: "text-amber-600 dark:text-amber-400",
  loose: "text-red-600 dark:text-red-400",
};

/** Green → red across four options, in the order they are offered. */
export const RISK_SCALE: readonly RiskTone[] = ["safe", "neutral", "caution", "loose"];
/** The same scale for a row whose *first* option is the loosest. */
export const RISK_SCALE_REVERSED: readonly RiskTone[] = ["loose", "caution", "neutral", "safe"];

// ============================================================================
// STRUCTURE
// ============================================================================

/**
 * The name of a group of settings.
 *
 * Small caps, wide-tracked and quiet: a heading here labels what follows, it
 * does not compete with the settings under it.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * A group of settings: a heading, then rows.
 *
 * **Not a card.** Every group used to be one — a rounded border, a filled
 * header band, three of them stacked down Appearance — on the reasoning that
 * one container used everywhere makes a panel read as one designed thing. What
 * it actually made was a panel where the framing meant nothing: the two Risk
 * boxes are framed *because* they hold live state and can take the buy button
 * away from you, and if a theme picker gets the same box then a box says
 * nothing at all. The worst of it was "Interface" — a whole card, header band
 * and all, around a single segmented control.
 *
 * So: the frame belongs to `PanelCard` and to the two rules that can stop you
 * trading. Everything else is a heading and a run of full-bleed rows separated
 * by hairlines, which is the shape a settings list has had since long before
 * any of this, and it lets a group of one row cost one row.
 *
 * No icon. A group of preferences is named, not illustrated.
 */
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-1.5">
      <div className="px-4 pb-1.5 pt-3">
        <SectionLabel>{title}</SectionLabel>
      </div>
      <div className="divide-y divide-border/60 border-y border-border/60">{children}</div>
    </section>
  );
}

/**
 * A field with its name notched into its own top border.
 *
 * A settings panel is a column of controls, and a label set *above* a control
 * is a line of text that belongs to whichever of the two it happens to sit
 * nearer — which in a tight column is a coin toss. Cut into the border, the
 * name is unambiguously part of the box, and the box is one object rather than
 * a caption and a control that have to be read as a pair.
 *
 * The notch is painted `--background` because that is the panel's own surface
 * (`SETTINGS_PANEL_SURFACE`); it has to match, or the label sits in a stripe.
 */
export function FieldBox({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative rounded-lg border border-border", className)}>
      <span className="pointer-events-none absolute -top-[6px] left-3 bg-background px-1.5 text-[10.5px] font-medium leading-none text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * The colours one theme paints the workspace in, so a picture of it can be
 * painted in the same ones.
 *
 * Copied per theme out of `globals.css`, token for token, rather than mixed by
 * hand until it "looks navy". A preview painted in the thing it is previewing
 * is the only kind that cannot drift out of date.
 */
export interface ThemePreviewPalette {
  /** `--background`: the sheet everything else sits on. */
  bg: string;
  /** `--card`: the title bar, the rail down the left, the panel in the middle. */
  card: string;
  /** `--border`: every hairline in the picture. */
  border: string;
  /** The bars standing in for text — `--muted`, lifted until it reads at 90px. */
  line: string;
  /** `--foreground`: the one piece of real text in the picture. */
  text: string;
  /** The blue that means *chosen* in that theme. */
  accent: string;
}

/** A theme as the picker needs it: what to call it, and what to paint it in. */
export interface ThemeOption {
  value: string;
  label: string;
  /** Announced and shown on hover; there is no room for it under the tile. */
  description?: string;
  palette: ThemePreviewPalette;
}

/**
 * A small drawing of the workspace, painted in one theme's own colours.
 *
 * Neither a swatch nor a screenshot. A swatch tells you a theme is dark and
 * stops there — which is why Navy and Dark, two near-blacks, needed a glyph
 * bolted on to tell them apart. A screenshot at this size is mush. A *window* —
 * title bar, side rail, a panel with a heading and a button — is recognised
 * before it is read, so three of them in a row are three layouts you already
 * know, differing in nothing but colour. That is the comparison being asked for.
 *
 * `viewBox` with the width at 100% and the height left to follow: one drawing
 * serves the ~90px column in the desktop dock and the wider one on a phone,
 * with no second set of numbers.
 */
function ThemeWindow({ palette }: { palette: ThemePreviewPalette }) {
  /* Per instance. Three of these render at once and a shared `clipPath` id
     would point all three at whichever rect mounted first. */
  const clip = useId();
  return (
    <svg viewBox="0 0 160 108" aria-hidden="true" focusable="false" className="block h-auto w-full">
      <defs>
        <clipPath id={clip}>
          <rect width="160" height="108" rx="6" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="160" height="108" fill={palette.bg} />

        {/* The title bar and its three lights. The lights keep their own
            colours on every theme, because that is what they do on a real
            window and it is what makes the shape read as one at a glance. */}
        <rect width="160" height="16" fill={palette.card} />
        <circle cx="11" cy="8" r="2.3" fill="#ec6a5e" />
        <circle cx="19" cy="8" r="2.3" fill="#f4bf4f" />
        <circle cx="27" cy="8" r="2.3" fill="#61c554" />
        <line x1="0" y1="16" x2="160" y2="16" stroke={palette.border} />

        {/* The rail, with the one item in it that is on — the accent doing the
            same job here that blue does in the panel around it. */}
        <rect y="16" width="46" height="92" fill={palette.card} />
        <line x1="46" y1="16" x2="46" y2="108" stroke={palette.border} />
        <circle cx="12" cy="29" r="3.4" fill={palette.accent} />
        <rect x="19" y="27.5" width="17" height="3" rx="1.5" fill={palette.accent} />
        <rect x="8" y="42" width="30" height="3" rx="1.5" fill={palette.line} />
        <rect x="8" y="49" width="22" height="3" rx="1.5" fill={palette.line} />
        <rect x="8" y="56" width="27" height="3" rx="1.5" fill={palette.line} />
        <rect x="8" y="63" width="19" height="3" rx="1.5" fill={palette.line} />

        {/* A heading, two buttons beside it, and the panel under both. */}
        <rect x="56" y="25" width="38" height="4.5" rx="2.2" fill={palette.text} />
        <rect x="110" y="23" width="17" height="8" rx="2.6" fill={palette.line} />
        <rect x="131" y="23" width="21" height="8" rx="2.6" fill={palette.accent} />
        <rect x="56" y="40" width="96" height="60" rx="4" fill={palette.card} stroke={palette.border} />
      </g>
      {/* Last, so the edge sits over the fills it contains. */}
      <rect x="0.5" y="0.5" width="159" height="107" rx="5.5" fill="none" stroke={palette.border} />
    </svg>
  );
}

/**
 * Pick a theme by looking at it.
 *
 * This was three rows in a bordered field, each a colour tile, a name and a
 * sentence — readable, and still asking you to take the panel's word for what
 * "Navy" is going to do to your screen. The choice is a visual one, so the
 * control shows the outcome: three previews side by side, the chosen one ringed
 * in blue, the name and its mark under each.
 *
 * The tile is the target, not the little circle beside the name — the whole
 * card is one button, so on a phone the thing you press is 90px wide instead of
 * 15px. The circle stays because it is what says *one of these three*; a ring
 * alone reads as a highlight, and highlights do not look mutually exclusive.
 *
 * Keyboard: one tab stop for the group, arrows to move inside it, the way a
 * radio group behaves everywhere else. Three tab stops to get past a theme
 * picker is the alternative.
 */
export function ThemeChoice({
  options,
  value,
  onSelect,
  label = "Interface theme",
}: {
  options: readonly ThemeOption[];
  value: string;
  onSelect: (value: string) => void;
  label?: string;
}) {
  const current = options.findIndex((o) => o.value === value);
  /* An unknown saved theme (an old value, or none yet) must not leave the group
     with no tab stop at all, so the roving index falls back to the first tile. */
  const index = current < 0 ? 0 : current;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onSelect(options[next].value);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="grid grid-cols-3 gap-2"
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.description ? `${option.label} — ${option.description}` : option.label}
            title={option.description}
            tabIndex={i === index ? 0 : -1}
            onClick={() => onSelect(option.value)}
            className="group flex min-w-0 flex-col items-center gap-1.5 focus:outline-none"
          >
            {/* The ring is a border on a padded box rather than an outline, so
                the gap between blue and artwork is real space and the tile does
                not move by two pixels when it becomes the chosen one. */}
            <span
              className={cn(
                "block w-full rounded-[9px] border-2 p-[2px]",
                selected
                  ? "border-blue-600"
                  : "border-transparent group-hover:border-border group-focus-visible:border-blue-600/60"
              )}
            >
              <ThemeWindow palette={option.palette} />
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full",
                  selected ? ACCENT_SOLID : "border border-muted-foreground/45"
                )}
              >
                {selected && <Check size={9} strokeWidth={3.4} />}
              </span>
              <span
                className={cn(
                  "truncate text-[11.5px] leading-none",
                  selected ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {option.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The mark beside a name that has more to say than fits next to it.
 *
 * A hint line under a label is the right place for a sentence the reader needs
 * every time. This is for the one they need once — what a setting actually
 * governs — and it costs 13px instead of a line, which is what lets a group
 * carry a title and an explanation in the same row.
 */
export function InfoHint({ text }: { text: string }) {
  return (
    <span
      role="img"
      title={text}
      aria-label={text}
      className="inline-flex shrink-0 cursor-help items-center text-muted-foreground"
    >
      <Info size={13} strokeWidth={2} />
    </span>
  );
}

/**
 * A value with a minus and a plus either side of it.
 *
 * Three separate objects, not two buttons crowded into one field: the targets
 * are the size of a fingertip and the value between them is wide enough to read
 * at a glance, which is the shape this control has on every platform that gets
 * it right.
 *
 * Squared off to the same 8px the fields around it use. Circles and capsules
 * put a third radius in a panel that already has two, and at this size they
 * read as a media player rather than as a setting.
 *
 * `disabled` greys the figure rather than hiding the control. A stepper that
 * appears and disappears with the switch above it changes the height of the
 * card underneath the pointer, so the thing you were about to press moves as
 * you reach for it; greyed, the setting stays where it is and says plainly that
 * it is waiting on the switch.
 *
 * The figure carries the accent while it is live, in the same tint `StatBlock`
 * uses: it is the one thing in the group being *reported* rather than pressed,
 * and between two neutral buttons a neutral readout was the quietest part of
 * the control it is the point of. Off, the tint goes with it — the whole group
 * greys down to say the switch above is what to press first.
 */
export function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
  disabled = false,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label: string;
  /** How the figure reads — "Medium", "5.5%". Defaults to the number itself. */
  format?: (value: number) => string;
  disabled?: boolean;
}) {
  const round = cn(
    "grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border",
    "text-[18px] leading-none text-foreground",
    "hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400",
    "active:scale-[0.96]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40",
    "disabled:pointer-events-none disabled:opacity-40"
  );
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className={round}
      >
        −
      </button>
      <div
        aria-live="polite"
        className={cn(
          "flex h-10 min-w-0 flex-1 items-center justify-center rounded-lg border px-3",
          "truncate text-[14px] font-semibold tabular-nums",
          disabled
            ? "border-border text-muted-foreground"
            : "border-blue-500/25 bg-blue-500/[0.09] text-blue-600 dark:text-blue-400"
        )}
      >
        {format ? format(value) : value}
      </div>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className={round}
      >
        +
      </button>
    </div>
  );
}

/**
 * A switch and what it switches.
 *
 * `hint` describes the setting, not its current state — it says the same thing
 * whether the switch is on or off. A hint that flips ("Ask for confirmation…"
 * when off, "Trades are placed immediately…" when on) reads as a description of
 * the control, so half the time it tells you the opposite of what the control
 * will do.
 */
export function SettingRow({
  label,
  hint,
  control,
  children,
  sub = false,
}: {
  label: string;
  hint?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
  /** A row that belongs to the one above it — quieter, tighter, indented. */
  sub?: boolean;
}) {
  return (
    <div className={cn(sub ? "py-1.5 pl-7 pr-4" : ROW)}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "leading-tight",
              sub ? "text-[12px] text-muted-foreground" : "text-[12.5px] text-foreground"
            )}
          >
            {label}
          </div>
          {hint && (
            <p className="mt-1 text-[11.5px] leading-[1.5] text-muted-foreground">{hint}</p>
          )}
        </div>
        {control && <div className="shrink-0 pt-px">{control}</div>}
      </div>
      {children && <div className="mt-3.5">{children}</div>}
    </div>
  );
}

/**
 * A control that takes a value: its name above, the control across the row.
 *
 * The label is quieter than a switch row's label on purpose. In a switch row
 * the words *are* the setting; here the words only name the thing you are about
 * to read the value of, and the value is what the eye should land on.
 */
export function FieldRow({
  label,
  value,
  children,
}: {
  label: string;
  /** The current value, set beside the label — for sliders and anything whose control cannot show it. */
  value?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={ROW}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        {value !== undefined && (
          <span className="text-[12.5px] font-semibold tabular-nums text-foreground">{value}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * A line of prose with controls set into it, so "pause after 3 losses for 15
 * minutes" reads as that sentence rather than as four stranded fragments.
 */
export function Phrase({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[12px] leading-none text-muted-foreground">
      {children}
    </p>
  );
}

/** The label above a control inside a card. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[11.5px] text-muted-foreground">{children}</div>;
}

/**
 * The one line of explanation a section is allowed.
 *
 * Reserved for what a control cannot say about itself — why a rule exists, or
 * when a figure resets. A note that repeats the label above it is the padding
 * this panel was rebuilt to get rid of.
 */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-1.5 text-[11px] leading-[1.5] text-muted-foreground">
      <Info size={13} className="mt-[2px] shrink-0 text-blue-500/80" />
      <span>{children}</span>
    </p>
  );
}

// ============================================================================
// NAVIGATION
// ============================================================================

/**
 * The three sections, along the top.
 *
 * This replaced a menu of three rows that opened three pages. The menu was
 * faithful to the reference it was copied from and wrong for this panel: three
 * destinations is not enough to be worth a screen of its own, so opening
 * settings showed a list of three items above six hundred pixels of empty
 * column, and reaching any actual control cost a click there and a click back.
 *
 * Tabs cost nothing, are always showing something, and make the whole shape of
 * the panel visible from anywhere in it — you can see that a risk section
 * exists while you are changing the theme. The underline is 2px of accent under
 * the live tab: enough to find, not a filled pill fighting the switches below
 * it for attention.
 *
 * `badge` marks a tab whose section has live state worth interrupting for — a
 * cooldown counting down, a limit that has stopped you. Never for a setting
 * that is merely switched on.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly { value: T; label: string; icon: ReactNode; badge?: boolean }[];
  value: T;
  onChange: (next: T) => void;
}) {
  const index = Math.max(0, tabs.findIndex((t) => t.value === value));

  return (
    <div className="px-3 pb-1 pt-2.5">
      <div
        role="tablist"
        aria-label="Settings sections"
        className={cn(
          "relative flex h-[34px] items-center overflow-hidden rounded-lg p-1",
          "border border-zinc-300 bg-zinc-100 dark:border-[#1d1e23] dark:bg-black/20",
          "shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-none"
        )}
      >
        {/* The pill, and the reason it is written this way.

            Its transition is an inline style, not `transition-transform`:
            `styles/theme.css` carries an unlayered `* { transition: … }` that
            beats every Tailwind transition utility in the app, so the class
            would do nothing at all. Same 255ms curve as the Live/Settled
            control in the positions panel, because they are the same control.

            No shadow on it. A raised pill with a border *and* a drop shadow, on
            a track with a border and an inset shadow, is five devices marking a
            choice between two words. A fill a couple of steps above the track
            is enough. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute bottom-[3px] top-[3px] rounded-[6px]",
            "border border-zinc-300 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
            "dark:border-[#292a31] dark:bg-[#212227] dark:shadow-none"
          )}
          style={{
            left: 4,
            width: `calc(${100 / tabs.length}% - 4px)`,
            transform: `translateX(${index * 100}%)`,
            transition: "transform 255ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        />

        {tabs.map((t) => {
          const active = t.value === value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.value)}
              className={cn(
                "relative z-10 flex flex-1 items-center justify-center gap-1.5 px-2",
                /* Antialiased and lightly tracked: at this size, light-on-dark
                   bold text thickens and closes its counters, and reads as
                   smudged rather than small. */
                "text-[11.5px] font-bold tracking-[0.015em] antialiased",
                active
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
              )}
            >
              <span className="shrink-0">{t.icon}</span>
              <span className="truncate">{t.label}</span>
              {t.badge && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A small state marker. Blue says "on"; amber and red say something is wrong. */
export function Badge({ label, tone }: { label: string; tone: "blue" | "amber" | "red" }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-[2px] text-[10px] font-semibold uppercase leading-none tracking-wide",
        tone === "red"
          ? "bg-red-500/15 text-red-600 dark:text-red-400"
          : tone === "amber"
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : ACCENT_SOFT
      )}
    >
      {label}
    </span>
  );
}

// ============================================================================
// CONTROLS
// ============================================================================

/**
 * The switch. One shape, one colour, everywhere.
 *
 * The old one was a bare `<input type=checkbox class="sr-only peer">` behind a
 * styled div — a checkbox pretending to be a switch: it announced itself as a
 * checkbox and carried no name.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  /** `sm` is for a row that belongs to the switch above it — see `SettingRow`
      and the sound list. Five full-size switches in a column read as five
      decisions of equal weight to the one that turns all of them off. */
  size?: "md" | "sm";
}) {
  const sm = size === "sm";
  const knob = sm ? 14 : 18;
  const inset = 3;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full outline-none",
        sm ? "h-5 w-9" : "h-6 w-11",
        "focus-visible:ring-2 focus-visible:ring-blue-600/40",
        checked ? "bg-blue-600" : "bg-muted-foreground/25",
        disabled && "cursor-not-allowed opacity-40"
      )}
    >
      <span
        className="absolute rounded-full bg-white shadow-sm"
        style={{
          top: inset,
          height: knob,
          width: knob,
          left: checked ? (sm ? 36 : 44) - knob - inset : inset,
          transition: "left 140ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </button>
  );
}

/** The shell every full-width control shares, so a select and a drop zone line up. */
export function FieldShell({
  as: As = "div",
  className,
  children,
  ...rest
}: {
  as?: any;
  className?: string;
  children: ReactNode;
  [key: string]: any;
}) {
  return (
    <As
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-foreground",
        FIELD,
        className
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

/** Two to four mutually exclusive choices, written as words. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  full,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  /** Stretch to the row, for when the choice *is* the setting. */
  full?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "flex items-center rounded-md p-[2px]",
        FIELD,
        full ? "w-full" : "inline-flex"
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded px-2 py-1.5 text-[12px] leading-none",
              full && "flex-1",
              active
                ? cn(ACCENT_SOLID, "font-semibold shadow-sm")
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A row of preset values.
 *
 * A number field asks you to know what a reasonable answer is. Presets answer
 * that: four durations, and the one in force is lit.
 *
 * Filled, not outlined. An outlined chip on a dark panel is a rectangle of
 * background with a hairline round it — four of those in a row is the exact
 * "robotic" look this panel keeps drifting back into. The selected one is solid
 * blue, so which one is chosen survives a glance from across the desk.
 */
export function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; tone?: RiskTone }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            className={cn(
              /* Unselected chips carry no border. Four outlined boxes in a row,
                 inside a bordered card, inside a bordered panel, was three
                 nested frames around one choice — the panel read as boxes
                 rather than as settings. A fill is enough to say "target". */
              "h-8 truncate rounded-md px-1 text-center text-[12px] leading-none",
              active
                ? cn(TONE_SOLID[o.tone ?? "neutral"], "font-semibold")
                : cn(FIELD, "text-muted-foreground hover:text-foreground")
            )}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A numeric input on the field surface, with its unit inside the box. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  label,
  width,
  suffix,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
  /** Left unset the field fills its row; set, it is sized to sit in a sentence. */
  width?: number;
  suffix?: string;
}) {
  return (
    <span
      style={width ? { width } : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-md px-2.5 focus-within:border-blue-600",
        FIELD,
        !width && "w-full"
      )}
    >
      <input
        type="number"
        aria-label={label}
        value={Number.isFinite(value) ? value : ""}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isNaN(n)) return;
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[13px] font-semibold tabular-nums text-foreground outline-none",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          width && "text-center"
        )}
      />
      {suffix && (
        <span className="ml-1 shrink-0 text-[12px] font-medium text-muted-foreground">
          {suffix}
        </span>
      )}
    </span>
  );
}

/**
 * A slider, across the row, under its label.
 *
 * The filled half of the track is painted with a gradient stop rather than a
 * second element, so the slider stays one focusable input. Where the number
 * means something on its own it belongs beside the label — pass it to
 * `FieldRow`'s `value` — and where it does not, the ends are named instead.
 * Never both: the second caption is always restating the first.
 */
/* The thumb is 16px, so its centre travels from 8px to (width − 8px) rather
   than from 0 to the full width. Anything drawn on the track — the filled part,
   a tick — has to use the same inset or it drifts away from the handle at both
   ends. */
const THUMB = 16;
const at = (p: number) => `calc(${p * 100}% + ${THUMB / 2 - p * THUMB}px)`;

/**
 * A value along a range.
 *
 * The track and its fill are drawn as elements rather than as a gradient on the
 * input, so that a stepped range can show where its stops are. A slider whose
 * value can only be one of five and gives no sign of it is a control that
 * refuses to land where you dropped it — you drag, it jumps, and there is no
 * way to know that was the point. `ticks` puts a mark at every stop; the ones
 * the value has passed take the accent, so the track reads as a scale rather
 * than as a bar with dirt on it.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  minLabel,
  maxLabel,
  ticks,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  minLabel?: string;
  maxLabel?: string;
  /** Draw a mark at every stop. Only for a range with few enough to count. */
  ticks?: boolean;
  disabled?: boolean;
}) {
  const span = max === min ? 1 : max - min;
  const p = (value - min) / span;
  const stops =
    ticks && step > 0 ? Array.from({ length: Math.floor(span / step) + 1 }, (_, i) => min + i * step) : [];

  return (
    <div className={cn(disabled && "opacity-40")}>
      <div className="relative h-4">
        {/* `bg-muted` is 2.5 points off `bg-background` on the light theme, so
            the unfilled part of the track vanished on the one theme where it is
            widest. Tinted from the foreground instead: one value that stays a
            visible grey on all three. */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted-foreground/20" />
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-600"
          style={{ width: at(p) }}
        />
        {stops.map((stop) => {
          const sp = (stop - min) / span;
          return (
            <span
              key={stop}
              className={cn(
                "absolute top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full",
                stop <= value ? "bg-white/70" : "bg-muted-foreground/45"
              )}
              style={{ left: at(sp) }}
            />
          );
        })}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "absolute inset-0 w-full cursor-pointer appearance-none bg-transparent outline-none",
            /* Ringed in the accent, not plain white: past the filled part of the
               track a white thumb on the light theme is a white circle on a
               near-white bar, and the control loses its handle. */
            "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.35)]",
            "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-blue-600 [&::-moz-range-thumb]:bg-white",
            "focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-blue-600/40",
            disabled && "cursor-not-allowed"
          )}
        />
      </div>
      {(minLabel || maxLabel) && (
        <div className="mt-2 flex justify-between text-[10.5px] text-muted-foreground">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The mark at the head of a row.
 *
 * A neutral tile, not a tinted one: the surface is one step up from the row it
 * sits on and the glyph is the colour of the words under it. Tinting every tile
 * with the accent spends the one colour that is supposed to mean *this is on*
 * on decoration, and a column of six blue squares tells you nothing about which
 * six settings are actually running.
 */
export function RowMark({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-muted/50 text-muted-foreground"
    >
      {children}
    </span>
  );
}

/**
 * The head of a section: its name, a dashed rule, and one line if it needs one.
 *
 * Every section on a tab wears this, the theme picker included, so the tab has
 * one heading style rather than a bold one at the top and small caps for
 * everything under it. Sentence case at 13.5px is the size of a thing you are
 * meant to read; the small caps it replaces were a label filed above a list.
 *
 * The rule is dashed, and that is the whole grammar: **dashed lines separate
 * sections, solid ones separate rows**. Two weights of the same hairline would
 * leave you counting pixels to know whether a line ended a setting or a group.
 */
export function SectionHead({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="px-4 pb-2.5 pt-4">
      <div className="flex items-center gap-2.5">
        <h3 className="shrink-0 text-[13.5px] font-semibold leading-none text-foreground">
          {title}
        </h3>
        <span aria-hidden="true" className="h-0 flex-1 border-t border-dashed border-border" />
      </div>
      {hint && <p className="mt-1.5 text-[11.5px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A setting as a row: a mark, its name, the line that says what it does, and
 * whatever sets it.
 *
 * Every row on the tab is this shape, which is the point. The name is what the
 * setting *is*; the line under it is what it *does*; the right edge is either a
 * switch or a figure, always in the same place, so a column of settings can be
 * read straight down without reading a word of it.
 *
 * A row either **is** a control or **opens** one. With `control` it stays a
 * plain row and the switch inside it takes the press. With `onClick` the whole
 * row becomes the button and gets a chevron — a 320px target instead of a 14px
 * one. Never both: a button inside a button is a row where half the presses go
 * somewhere the finger did not aim.
 */
export function TileRow({
  icon,
  title,
  meta,
  value,
  control,
  onClick,
  expanded,
  dimmed = false,
  compact = false,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  /** One line, under the name. */
  meta?: ReactNode;
  /** A figure at the right edge — the same place on every row that has one. */
  value?: ReactNode;
  /** A switch. Mutually exclusive with `onClick`. */
  control?: ReactNode;
  /** Makes the whole row the button that opens something. */
  onClick?: () => void;
  /** Points the chevron at what is already open. */
  expanded?: boolean;
  /** The row is waiting on a switch above it. */
  dimmed?: boolean;
  /** Inside a box: 12px of side padding instead of the sheet's 16. */
  compact?: boolean;
  /** Anything that belongs under the row, indented to the name. */
  children?: ReactNode;
}) {
  const body = (
    <>
      <RowMark>{icon}</RowMark>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-semibold leading-none text-foreground">
          {title}
        </span>
        {meta && (
          <span className="mt-1.5 block truncate text-[11px] leading-none text-muted-foreground">
            {meta}
          </span>
        )}
      </span>
      {value !== undefined && (
        <span
          className={cn(
            "shrink-0 text-[12px] font-semibold tabular-nums",
            dimmed ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {value}
        </span>
      )}
      {control}
      {onClick && (
        <ChevronDown
          size={14}
          strokeWidth={2}
          aria-hidden="true"
          className={cn("shrink-0 text-muted-foreground", expanded && "rotate-180")}
        />
      )}
    </>
  );

  return (
    /* 12px of air top and bottom. At 10px the two lines of a row and the row
       under it were the same distance apart, so a column of settings read as
       one paragraph. */
    <div className={cn("py-3", compact ? "px-3" : "px-4")}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-expanded={expanded}
          className={cn(
            "flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600/40",
            /* The press target is the row, not the words in it: it reaches back
               out to the padding it sits in. */
            compact ? "-mx-3 w-[calc(100%+1.5rem)] px-3" : "-mx-4 w-[calc(100%+2rem)] px-4"
          )}
        >
          {body}
        </button>
      ) : (
        <div className="flex items-center gap-2.5">{body}</div>
      )}
      {/* Indented to the name rather than the mark: what is under a row belongs
          to its words, and lining it up with the tile would start a column of
          its own. */}
      {children && <div className="mt-2.5 pl-[38px]">{children}</div>}
    </div>
  );
}

/** The one solid button on a page — an action, not a setting. */
export function PrimaryButton({
  onClick,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-9 w-full items-center justify-center gap-2 rounded-md text-[12.5px] font-semibold",
        ACCENT_SOLID,
        "hover:bg-blue-500 disabled:opacity-50"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * A bordered button, for an action that is not the point of the page.
 *
 * `PrimaryButton` is a solid blue slab across the full width of the column, and
 * for a while the only one on Appearance was **Upload a wallpaper** — so the
 * loudest control in the whole of Settings picked a decorative background image,
 * while the theme, which is the thing people actually come here to change, was
 * a quiet segmented control above it. This is what those actions get instead.
 */
export function QuietButton({
  onClick,
  disabled,
  icon,
  tone = "neutral",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  tone?: "neutral" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium",
        "disabled:opacity-50",
        tone === "danger"
          ? "border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400"
          : "border-border bg-background text-foreground hover:bg-muted"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ============================================================================
// LIVE FIGURES
// ============================================================================

/**
 * The block a live figure sits in.
 *
 * The one tinted surface in the panel, and it is tinted for a reason: on a card
 * where everything else is something you *set*, this is the only thing being
 * *reported*. Given the same neutral treatment as the controls around it — which
 * is what an earlier pass did — the number you actually opened the panel to
 * check was the least visible thing on it.
 */
export function StatBlock({ children }: { children: ReactNode }) {
  return <div className={cn("rounded-lg px-3 py-2", STAT)}>{children}</div>;
}

/**
 * A figure against its ceiling.
 *
 * `warnAt` is the point the bar turns amber. It is a prop rather than a
 * constant because the daily limit lets you choose it — a bar that always went
 * amber at 80% while the setting above it said 60% would be describing a
 * different limit than the one in force.
 */
export function Meter({
  label,
  value,
  pct,
  warnAt = 80,
  footnote,
}: {
  label: string;
  value: string;
  pct: number;
  warnAt?: number;
  footnote?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const tone = clamped >= 100 ? "bg-red-500" : clamped >= warnAt ? "bg-amber-500" : "bg-blue-500";
  const text =
    clamped >= 100
      ? "text-red-600 dark:text-red-400"
      : clamped >= warnAt
        ? "text-amber-600 dark:text-amber-400"
        : "text-blue-600 dark:text-blue-400";
  return (
    <StatBlock>
      {/* One line, and the figure earns its place on it by being short. Stacked
          it read beautifully and cost 22px of height in a block that repeats —
          the fix for "8,250.83 / 150,000.00 USD" wrapping was never a second
          line, it was the three characters of currency, which the footnote
          under it already carries. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
        <span className={cn("truncate text-[13px] font-semibold tabular-nums", text)}>{value}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${clamped}%`, minWidth: clamped > 0 ? 4 : 0 }}
        />
      </div>
      {footnote && (
        <div className="mt-1.5 text-[10.5px] leading-tight text-muted-foreground">{footnote}</div>
      )}
    </StatBlock>
  );
}

/**
 * A count against a threshold, drawn as the segments it is counting.
 *
 * Three losses before a pause is three segments, not a percentage of a bar. The
 * distinction matters at this size: "0 / 3" as a continuous track cannot show
 * the second loss as being two thirds of the way to a pause without the reader
 * doing arithmetic, and the point of the meter is to be read without any.
 *
 * The segments warm as they fill — blue for a streak that is going nowhere,
 * amber on the last one before the pause, red on the one that triggers it. This
 * is the exception to "colour means chosen": here it means *how close you are*.
 */
export function PipMeter({
  label,
  value,
  max,
  footnote,
}: {
  label: string;
  value: number;
  max: number;
  footnote?: ReactNode;
}) {
  /* 15, not 12: the losing-streak rule offers up to 15, and a meter that
     stopped at 12 would have shown "3 / 15" with the third of twelve pips lit —
     a picture of a different rule. */
  const segments = Math.max(1, Math.min(15, max));
  const filled = Math.max(0, Math.min(segments, value));
  const tone =
    filled >= segments ? "bg-red-500" : filled >= segments - 1 ? "bg-amber-500" : "bg-blue-500";
  const text =
    filled === 0
      ? "text-muted-foreground"
      : filled >= segments
        ? "text-red-600 dark:text-red-400"
        : filled >= segments - 1
          ? "text-amber-600 dark:text-amber-400"
          : "text-blue-600 dark:text-blue-400";
  return (
    <StatBlock>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className={cn("text-[13px] font-semibold tabular-nums", text)}>
          {filled} / {segments}
        </span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: segments }, (_, i) => (
          <span
            key={i}
            className={cn("h-1.5 flex-1 rounded-full", i < filled ? tone : "bg-foreground/10")}
          />
        ))}
      </div>
      {footnote && (
        <div className="mt-1.5 text-[10.5px] leading-tight text-muted-foreground">{footnote}</div>
      )}
    </StatBlock>
  );
}

// ============================================================================
// CARDS
// ============================================================================

/**
 * A rule with live state attached, drawn like every other section on the panel.
 *
 * Two of these exist — the daily stop loss and the cooldown — and they were the
 * only things in the settings drawn as cards: a rounded, filled box with a
 * header band, inset from the column. Beside a tab whose every group runs edge
 * to edge between hairlines, that read as two screens sharing a scrollbar. The
 * card is gone; what marks these two out is what they *say* — a running loss, a
 * losing streak, a clock — not a border around them.
 *
 * The body is always mounted. It used to appear only while the rule was on, so
 * switching a rule off collapsed the section and everything under it jumped up
 * the column; switching it back on made you find your settings again in a panel
 * that had just moved. Faded and `inert` says the same thing in place — and
 * inert is what makes it honest: those controls cannot be tabbed into or
 * pressed, they are not merely dim.
 */
export function PanelCard({
  icon,
  title,
  meta,
  checked,
  onCheckedChange,
  children,
}: {
  icon: ReactNode;
  title: string;
  /** One line, under the name: what the rule does, in trading words. */
  meta?: ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    /* Dashed, because it separates two *sections*. The panel's grammar is one
       line: dashed lines end a group, solid ones end a row. */
    <section className="border-b border-dashed border-border">
      <div className="flex items-center gap-2.5 px-4 py-3">
        {/* The same neutral mark every row on the other tab wears. It was a
            tinted tile that took the accent when the rule was on — two things
            saying "on" beside a switch that says it better, and the one place
            in the panel where a mark was also a state. */}
        <RowMark>{icon}</RowMark>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold leading-none text-foreground">
            {title}
          </span>
          {meta && (
            <span className="mt-1.5 block truncate text-[11px] leading-none text-muted-foreground">
              {meta}
            </span>
          )}
        </span>
        <Switch label={title} checked={checked} onChange={onCheckedChange} />
      </div>
      {children && (
        <div
          inert={!checked}
          aria-hidden={!checked}
          className={cn(
            "space-y-2.5 px-4 pb-3.5",
            !checked && "pointer-events-none opacity-40"
          )}
        >
          {children}
        </div>
      )}
    </section>
  );
}
