"use client";

/**
 * The building blocks the account settings pages are made of.
 *
 * Two rules hold this together, and both are reactions to what was here before.
 *
 * ── Semantic tokens only ───────────────────────────────────────────────────
 * Nothing in this file names a colour. Every surface is `bg-card`, every rule
 * `border-border`, every quiet line `text-muted-foreground`. Those tokens are
 * defined once per theme in globals.css — including `.navy`, which the previous
 * pages did not know about: they were written in literal zinc classes and
 * `dark:` pairs, so navy silently inherited the dark values and a blue-tinted
 * theme was painted in neutral greys. Naming the role instead of the colour
 * means a third theme costs nothing and cannot be forgotten.
 *
 * ── Nothing decorative that implies data ───────────────────────────────────
 * The pages this replaces showed a session list with invented IP addresses and
 * locations, an activity feed of events that never happened, and a phone
 * verification screen wired to a mock `$fetch` that slept two seconds and
 * returned success. A settings page is where someone checks whether their
 * account is safe; inventing that is worse than showing nothing. Every
 * component here renders what it is given, and the pages only give it what the
 * server actually returned — see `EmptyState`, which exists so an honest blank
 * has somewhere to go.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Loader2, ShieldCheck } from "lucide-react";

/* ── page scaffolding ─────────────────────────────────────────────────────── */

export function SettingsPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[19px] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
        <p className="mt-1.5 text-[13px] leading-[19px] text-muted-foreground">{description}</p>
      </header>
      {children}
    </div>
  );
}

/**
 * A settings card.
 *
 * ── No icon ────────────────────────────────────────────────────────────────
 *
 * Every card used to open with a bordered rounded square holding a grey lucide
 * glyph — a key for the password card, a shield for two-factor, a bin for
 * deletion. Stacked down a page they are the single most recognisable mark of
 * an interface nobody drew: eight identical tiles, each restating in a
 * pictogram the word printed two millimetres to its right. A shield does not
 * tell you anything "Two-factor authentication" has not already said, and it
 * costs 44px of the row it sits in.
 *
 * They are gone, and the prop with them, so no call site can put one back by
 * habit. Where a glyph genuinely carries information — a phone against a
 * laptop in the device list — it sits bare in the row, at the row's own
 * colour, with no tile around it.
 *
 * ── Where the action goes ──────────────────────────────────────────────────
 *
 * Two places, and the difference is whether the card has content. `action`
 * puts the control on the title row, which is right when the card IS that one
 * control: a title, a sentence and a button in a strip below them makes an
 * eight-word card 96px tall for no reason. `footer` keeps the separated strip,
 * which is right when there are fields above it and "this writes to my
 * account" needs saying before it is pressed.
 */
export function Card({
  title,
  description,
  children,
  action,
  footer,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  /** A control on the title row, for a card that is only that control. */
  action?: ReactNode;
  /** A control on its own strip below the content. */
  footer?: ReactNode;
  className?: string;
  /** For a card that has to fill a height it did not ask for.

      A card in a two-column grid is as tall as the tallest thing in its row,
      and by default its content sits at the top of that with the leftover
      space below it. Passing `flex flex-1 flex-col` here hands the body that
      leftover space, so the card can decide where it goes — usually by
      pushing a footing row down to the bottom edge with `mt-auto`. */
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card overflow-hidden",
        className
      )}
    >
      {/* The header is on its own ground.

          A hairline was the only thing separating the header from the body,
          and a hairline between two identical whites is a line you have to
          look for: down a column of four cards the titles, the sentences under
          them and the fields below all read as one continuous stack of text.
          A band — the same `--muted` the footer strip already uses — is what
          makes a card look like a card with a head and a body, in every theme
          and without a single extra pixel of height.

          Only when there is something under it. A band across a card that is
          nothing but its own header is a heading with a highlighter through
          it. */}
      <div
        className={cn(
          /* Tighter than the body it sits over. A header is a label for what
             is below it, and with a fill behind it the old 16px top and bottom
             made a 60px band carrying two short lines — the card looked like
             it had a title bar rather than a title. */
          "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3",
          (children || footer) && "border-b border-border bg-muted"
        )}
      >
        <div className="min-w-0 flex-1">
          {/* 15px, and it is the only thing on the card at that size. The
              title, its sentence and the labels below it were 14, 12 and 11 —
              a three-step ramp inside four points, which on a light ground
              reads as one grey block rather than as a hierarchy. */}
          <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-[12px] leading-[17px] text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>}
      {footer && (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted px-5 py-3">
          {footer}
        </div>
      )}
    </section>
  );
}

/* ── fields ──────────────────────────────────────────────────────────────── */

/**
 * A labelled field.
 *
 * `hint` carries the reason a field is the way it is — why an email cannot be
 * edited here, what a phone number is used for. The old forms disabled inputs
 * with no explanation, which reads as broken rather than deliberate.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[11px] font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[11px] leading-[15px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground " +
  "placeholder:text-muted-foreground outline-none transition-colors " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 " +
  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

/* ── status ──────────────────────────────────────────────────────────────── */

export type Tone = "ok" | "warn" | "danger" | "neutral";

const TONES: Record<Tone, string> = {
  /* Colour is doubled by a word everywhere it is used, never carried alone.

     No fill. These were tinted blocks in emerald and amber at /10 with a /25
     border, and on a security page — where nearly every row is in its good
     state — the result was a column of coloured tablets that read as alerts.
     A fill also forces a saturated hue, because a 10%-opacity ink green is
     invisible; dropping it is what let the green become `--verified`, which is
     mixed to be read as text rather than seen as a highlight. */
  ok: "border-verified/35 text-verified",
  warn: "border-attention/35 text-attention",
  danger: "border-danger/40 text-danger",
  neutral: "border-border text-muted-foreground",
};

/**
 * A state, said beside the thing it is about.
 *
 * Deliberately a step smaller and lighter than the row title it qualifies —
 * 11px regular against 14px medium. It is an annotation on a fact, and when it
 * was set at the same weight as the title the eye read the pair as two
 * headings and could not tell which was the subject.
 */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-px text-[11px] font-medium leading-[15px]",
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}

/**
 * Verified, said once and the same way everywhere.
 *
 * It was a blue tick — the filled `BadgeCheck` — and a blue tick is somebody
 * else's mark. It means "this is the real account of a known person" on every
 * social network anybody uses, which is a claim this product does not make and
 * cannot back; here it only ever meant "this address answered an email". It
 * also spent the one saturated blue on the page, which now belongs to the
 * button you are meant to press.
 *
 * So: the shield the account rail already uses for exactly this fact, in
 * `--verified`, with the word beside it. One mark, one fact, one colour,
 * whether you meet it in the rail, on the security card or after your address.
 *
 * The tick is drawn at 2.6 rather than lucide's 2: heavier, with round caps
 * and joins, because at 14px a hairline tick inside a shield reads as a smudge
 * — and this is a good-news glyph, which should look soft rather than sharp.
 *
 * Filled, with the tick punched out of it — see `PUNCHED_MARK`. It was an
 * outline, so at 14px the shield was a green hairline around whatever surface
 * it happened to land on, and what a reader saw inside the badge was the page.
 */
/* ── how a badge is filled ─────────────────────────────────────────────────

   A badge is a solid shape with its glyph cut out of it, not an outline. An
   outline at 14px is mostly the surface it is drawn on, so it reads as an empty
   shape rather than as a mark saying a thing has been done.

   `fill-current` with `stroke-current` beside it is the whole trick: the body's
   own outline lands on its own fill and disappears into it. A stroke in any
   other colour draws a rim, and a pale rim on a coloured badge reads as a
   sticker cut out of white paper.

   Everything after the first child is the glyph inside the body — lucide draws
   the body first and the marking after it — and only that is stroked white,
   with `fill-none` alongside because an open path like a tick fills as a
   triangle if you let it and a sliver of the body colour would show past the
   ends of the stroke. (That ordering is checked against the icons actually
   shipped here: ShieldCheck, ShieldAlert and Clock. If a lucide upgrade ever
   reorders an icon's children, its badge inverts into a hollow ring, which is
   visible immediately.)

   White, flat, rather than the surface colour: `--card` is near-white on the
   light theme and near-black on the dark ones, and a black tick in a green
   shield reads as a hole punched through the badge rather than as a tick. A
   badge saying a thing is verified is white-on-colour wherever it appears.

   Which is why the fill goes `-solid` under the dark themes. `--verified` and
   `--attention` are mixed as *ink* there — light enough to be read as text on
   near-black — and white on a 55%-lightness green is not a mark, it is a
   smudge. The `-solid` pair exists for exactly this: a filled shape carrying
   white, the same pair the ledger's status pills are filled with. The stroke
   moves with the fill, or the rim comes back. */
export const PUNCHED_GLYPH =
  "[&>*:not(:first-child)]:fill-none [&>*:not(:first-child)]:stroke-white";

/** A body in the current colour, its own outline invisible, its glyph white. */
export const PUNCHED_MARK = `fill-current stroke-current ${PUNCHED_GLYPH}`;

export const PUNCHED_VERIFIED =
  `${PUNCHED_MARK} dark:fill-verified-solid dark:stroke-verified-solid`;

export const PUNCHED_ATTENTION =
  `${PUNCHED_MARK} dark:fill-attention-solid dark:stroke-attention-solid`;

export function VerifiedMark({
  label = "Verified",
  size = 14,
}: {
  /** Null for the glyph on its own, where a line has no room for a word. */
  label?: string | null;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-verified"
      title={label || "Verified"}
    >
      <ShieldCheck
        className={PUNCHED_VERIFIED}
        width={size}
        height={size}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      />
      {/* 12px semibold, the same as the badge in the account rail. The two are
          the same fact and are meant to be the same object. */}
      {label && <span className="text-[12px] font-semibold leading-[16px]">{label}</span>}
    </span>
  );
}

/**
 * A labelled row with a status and an action — the shape most of a security
 * page is. Kept as one component so every such row aligns and behaves alike.
 */
export function Row({
  title,
  description,
  status,
  action,
  className,
}: {
  title: string;
  description?: string;
  status?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-medium leading-[19px] text-foreground">{title}</p>
          {status}
        </div>
        {description && (
          <p className="mt-1 text-[12px] leading-[17px] text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-border" />;
}

/* ── actions ─────────────────────────────────────────────────────────────── */

export function Action({
  children,
  onClick,
  loading = false,
  disabled = false,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const styles = {
    /* The brand blue, not `--primary`. `--primary` is shadcn's neutral and in
       the dark theme it is white, so the main action on every settings card
       was a white slab — and next to a grey Cancel and a grey disabled state
       the page had no colour saying which control was the one to press. Blue
       is the same blue as "Email me a reset link" one card over. */
    primary: "bg-brand text-brand-foreground hover:opacity-90 active:opacity-80",
    /* `--muted`, not `--background`. A secondary button sits on a card, and
       `--background` is *darker* than a card in the dark themes — so the fill
       read as a hole punched in the panel rather than as a control raised off
       it, and at a glance the thing looked disabled. `--muted` is the step
       above the card, which is what a button on one should be. */
    secondary: "border border-border bg-muted text-foreground hover:bg-muted/70 active:bg-muted/60",
    /* No resting fill. A red-tinted rectangle sitting on the page at all times
       is a button that is lit before anybody has decided anything, and next to
       a plain bordered "Refresh" it made the dangerous one the more inviting
       of the two. Bordered and quiet at rest; it finds its ground on hover,
       which is the moment the pointer is already committed. */
    danger:
      "border border-danger/40 text-danger hover:bg-danger/10 active:bg-danger/15",
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-medium transition-colors",
        /* Pressed state as a snap, not a fade. An unlayered `*` rule in
           theme.css overrides every transition utility in the app, so an
           animated press would never run and the button felt dead on click. */
        "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        /* Disabled is a *state*, and half-transparency is not one.
           `opacity-50` on the filled primary put white type on a 50% blue —
           about 2:1 against the card in the light theme, which is the "Save
           change" button on the password form and is genuinely unreadable.
           A dead control should still be readable as the words it says: it
           takes the muted fill and the muted ink, which clears 7:1 in every
           theme and says "not yet" instead of "half here". */
        "disabled:cursor-not-allowed disabled:active:scale-100",
        /* The primary keeps its colour and drops to a third of it, which is the
           product's rule for a control that is not ready yet (DIALOG-DESIGN.md,
           rule 7). It used to take the same muted fill as everything else, so
           "Save change" and "Cancel" sat under the password form as two
           identical grey slabs and the form had no primary until every field
           was filled — exactly when a person is looking for one. A third of the
           brand still reads as blue and still reads as words; going grey makes
           the control change identity as well as state.
        
           `border` as well as `border-border` on the rest: the colour utility
           alone sets a colour on a border with no width, which is no border at
           all, so the disabled fill floated on the card with no edge. */
        variant === "primary"
          ? "disabled:bg-brand/30 disabled:text-brand-foreground/75 disabled:hover:opacity-100"
          : cn(
              "disabled:border disabled:border-border disabled:bg-muted disabled:text-muted-foreground",
              "disabled:hover:bg-muted disabled:hover:opacity-100"
            ),
        styles
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

/**
 * What a section shows when it genuinely has nothing.
 *
 * This exists so that "no data" has a designed home, and nobody is tempted to
 * fill the space with an example. The page it replaces filled exactly this gap
 * with invented sessions and a fabricated activity feed.
 */
export function EmptyState({ icon: Icon, title, description }: { icon?: React.ElementType; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
      <p className="text-[14px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-[12px] leading-[17px] text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
