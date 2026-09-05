"use client";

/**
 * The dialog kit.
 *
 * One place for the parts every modal in this product is made of, so that a
 * new dialog is assembled rather than drawn, and the twenty-first one cannot
 * quietly disagree with the first twenty about how far a title sits from a
 * divider.
 *
 * ── The shape, and where it comes from ─────────────────────────────────────
 *
 * Every dialog here is the same object seen from different distances:
 *
 *   ┌──────────────────────────────────────────┐
 *   │ Title                                [×] │   header: what this is
 *   │ One line saying what it does             │
 *   ├──────────────────────────────────────────┤   a rule, edge to edge
 *   │ [!] The consequence, in a tinted panel   │   notice: what to know
 *   │                                          │
 *   │ Label*                                   │   fields: what to give
 *   │ [ input                                ] │
 *   │ Must contain at least 2 characters       │   helper, under the field
 *   ├──────────────────────────────────────────┤
 *   │ [Cancel]                    [Do the thing]│  footer: out, and on
 *   └──────────────────────────────────────────┘
 *
 * Rules that hold across all of them, and are the whole reason this file
 * exists:
 *
 * 1. **The title is left-aligned and the subtitle is one line.** Centred
 *    dialogs are for a single question with two answers; anything with a field
 *    in it is a form, and a form needs a left edge to run down.
 * 2. **Rules go edge to edge.** A divider with margins separates rows inside a
 *    block. A divider to the edges is the end of one block and the start of
 *    another, which is what these are.
 * 3. **One saturated thing per dialog**, and it is the button that does the
 *    work. Everything else is the surface, the border, or grey type.
 * 4. **The way out is always in two places**: the × in the corner and Cancel
 *    in the footer, at opposite ends from the action, so a slipped click lands
 *    on nothing.
 * 5. **A consequence goes in a `Notice`, never in a paragraph.** The tint and
 *    the round glyph are what make somebody read a sentence they have already
 *    scrolled past twice.
 *
 * ── Colour ────────────────────────────────────────────────────────────────
 *
 * The reference this was drawn from uses mint green for its primary button.
 * Ours is blue, deliberately: this is a trading product, where green and red
 * are already spoken for — they mean a position went up or down, and a green
 * "Confirm" one panel away from a green P&L figure is the wrong kind of
 * familiar. So:
 *
 *   - **blue** (`--brand`) is *go*: the button that completes the errand.
 *   - **red** (`--danger-solid`) is *destructive*, and only that.
 *   - **green** (`--verified`) never fills a button. It is the colour of a
 *     state that is already true: a ticked box, a satisfied field, a method
 *     that is switched on.
 *   - **amber** (`--warning`) is the notice that says "read this first".
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── the shell ───────────────────────────────────────────────────────────── */

/**
 * The popup itself.
 *
 * What the shell is responsible for:
 *
 * - **Being on top of everything.** It portals to `document.body`, because
 *   these cards render inside panels that are themselves fixed overlays with
 *   `overflow: hidden` — a dialog positioned inside one is clipped by the
 *   scroller it lives in and sits under that panel's own backdrop.
 * - **Taking the page away.** The ground behind is a terminal: tickers moving,
 *   a chart repainting. A plain dim leaves all of it legible and in motion
 *   behind the one screen that wants somebody to stop and read, so the scrim
 *   dims *and* blurs.
 * - **Escape and the scrim**, both of which close it — unless the caller says
 *   it is not closable, which is what a request already in flight looks like.
 * - **Fitting on a laptop.** The card scrolls inside itself rather than
 *   growing past the viewport, because a form whose buttons are off-screen is
 *   a form with no buttons.
 */
export function Modal({
  open,
  onClose,
  closable = true,
  className,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** False while something irreversible is in flight — Escape and the scrim go dead. */
  closable?: boolean;
  /** Width, as a Tailwind class. Everything else about the card is fixed. */
  className?: string;
  label: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !closable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closable, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="fixed inset-0 z-[10050] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={label}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            onClick={() => closable && onClose()}
          />

          <motion.div
            /* Up and in, and small enough to read as one movement. A spring
               here would overshoot a dialog that is about to ask for a
               decision, which is the wrong register entirely. */
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              /* `--popover`, not `--card`: this is a floating surface and the
                 theme has a value for that, two points lighter than a card. On
                 `--card` the dialog was the same colour as the panels behind
                 it and only its shadow said it was in front — which is what
                 reads as glass rather than as a sheet of paper on top. */
              "relative w-full overflow-hidden rounded-xl border border-border bg-popover shadow-2xl",
              "max-h-[calc(100dvh-2rem)] overflow-y-auto",
              className || "max-w-[440px]"
            )}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** The × in the corner, in the size and place every dialog here keeps it. */
export function CloseButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Close"
      className={cn(
        "absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg",
        "bg-muted text-muted-foreground hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

/* ── the three blocks ────────────────────────────────────────────────────── */

/**
 * Title, one line under it, and the way out.
 *
 * `mark` is for the dialogs that carry a drawing or a state glyph — the bin on
 * the delete flow, the shield once two-factor is on. It sits *beside* the
 * title rather than above it: a mark on its own line pushes the first field
 * below the fold on a laptop, and centres a header that the rest of the dialog
 * then has to disagree with.
 */
export function DialogHeader({
  title,
  subtitle,
  mark,
  onClose,
  closeDisabled,
  ruled = true,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  mark?: ReactNode;
  onClose?: () => void;
  closeDisabled?: boolean;
  /** The rule under the header. Off when the header opens straight onto a notice. */
  ruled?: boolean;
  /** Anything that belongs with the header rather than the body — a notice, usually. */
  children?: ReactNode;
}) {
  return (
    <>
      <div className="relative px-5 pb-4 pt-5 sm:px-6">
        {onClose && <CloseButton onClick={onClose} disabled={closeDisabled} />}

        <div className={cn("flex gap-3", mark ? "items-center" : "items-start")}>
          {mark && <span className="shrink-0">{mark}</span>}
          <div className="min-w-0 pr-9">
            <h2 className="text-[19px] font-bold leading-[25px] tracking-[-0.015em] text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {children && <div className="mt-4">{children}</div>}
      </div>
      {ruled && <Rule />}
    </>
  );
}

/** Edge to edge, always. See rule 2 at the top of this file. */
export function Rule() {
  return <div className="border-t border-border" />;
}

/** The middle of the dialog: whatever is being asked for. */
export function DialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}

/**
 * Out on the left, on with it on the right.
 *
 * Apart, at opposite ends, rather than side by side: the pointer that slips
 * off one of them lands on nothing instead of on the other. The rule above is
 * optional because a footer that follows a field already has one.
 */
export function DialogFooter({
  cancel,
  action,
  ruled = false,
}: {
  cancel?: ReactNode;
  action: ReactNode;
  ruled?: boolean;
}) {
  return (
    <>
      {ruled && <Rule />}
      <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
        {cancel || <span />}
        {action}
      </div>
    </>
  );
}

/* ── the notice ──────────────────────────────────────────────────────────── */

export type Tone = "info" | "warn" | "danger" | "ok";

const TONE: Record<Tone, { panel: string; dot: string; glyph: ReactNode }> = {
  /* Blue is *go* here as everywhere: an info notice is the one that tells you
     how the thing you asked for is going to work. */
  info: {
    panel: "border-brand/20 bg-brand/[0.07]",
    dot: "bg-brand text-brand-foreground",
    glyph: "i",
  },
  /* Amber, not red. Red here would be the second red on a dialog whose button
     is already red, and a panel that shouts as loudly as the control it is
     warning about stops being a warning. */
  warn: {
    panel: "border-warning/20 bg-warning/[0.08]",
    dot: "bg-warning text-black",
    glyph: "!",
  },
  danger: {
    panel: "border-danger/25 bg-danger/[0.07]",
    dot: "bg-danger-solid text-white",
    glyph: "!",
  },
  ok: {
    panel: "border-verified/25 bg-verified/[0.08]",
    dot: "bg-verified text-background",
    glyph: <Check className="h-3 w-3" strokeWidth={3} />,
  },
};

/**
 * The one paragraph on a dialog that is allowed a ground of its own.
 *
 * Everything else on a dialog is asking or offering; this is the part that is
 * telling. The tint separates "read this" from "fill this in" without a single
 * extra word — and it is faint on purpose, 7-8% of the ink, so it reads as a
 * tinted sheet of paper rather than as an alert.
 */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("flex gap-3 rounded-xl border p-3.5", t.panel)}>
      <span
        aria-hidden
        className={cn(
          "mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold leading-none",
          t.dot
        )}
      >
        {t.glyph}
      </span>
      <div className="min-w-0 text-[12.5px] leading-[18px] text-foreground/85">{children}</div>
    </div>
  );
}

/* ── fields ──────────────────────────────────────────────────────────────── */

/**
 * A label, a required mark, and the sentence under the field.
 *
 * The helper line is the reference's best small idea: the rule a field will be
 * judged by, said *under the field, before it is typed in*, in the quietest
 * type on the dialog. It is the difference between a form that explains itself
 * and one that waits to reject you.
 */
export function Labelled({
  label,
  htmlFor,
  required,
  helper,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  helper?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-[12.5px] font-medium text-muted-foreground">
        {label}
        {required && <span className="text-danger">*</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-[11.5px] font-medium leading-[16px] text-danger">{error}</p>
      ) : helper ? (
        <p className="mt-1.5 text-[11.5px] italic leading-[16px] text-muted-foreground/85">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

/** The field itself, at the size dialogs use — a step up from the page's forms. */
export const dialogInput =
  "h-11 w-full rounded-lg border border-border bg-background px-3.5 text-[13.5px] text-foreground " +
  "placeholder:text-muted-foreground/70 outline-none " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

/* ── choices ─────────────────────────────────────────────────────────────── */

/**
 * A row you pick: a mark, what it is, what it means, and where it stands.
 *
 * The reference draws these as a bordered row with an icon tile on the left
 * and a radio on the right, and it is the right shape for every "which of
 * these" on this product — a two-factor method, a media source, a generation
 * mode. Selected is a filled ring in the brand blue, not a green tick: green
 * is a state that is already true, and a choice you are making is not one yet.
 */
export function ChoiceRow({
  mark,
  title,
  description,
  selected,
  onSelect,
  disabled,
  control,
}: {
  mark?: ReactNode;
  title: string;
  description?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  /** Replaces the radio — a switch, say, where the row toggles rather than picks. */
  control?: ReactNode;
}) {
  const Tag = onSelect ? "button" : "div";
  return (
    <Tag
      {...(onSelect ? { type: "button" as const, onClick: onSelect, disabled } : {})}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left",
        selected ? "border-brand/50 bg-brand/[0.06]" : "border-border bg-background",
        onSelect && !disabled && "hover:border-foreground/25",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      {mark && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">{mark}</span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium leading-[18px] text-foreground">
          {title}
        </span>
        {description && (
          <span className="mt-0.5 block text-[12px] leading-[16px] text-muted-foreground">
            {description}
          </span>
        )}
      </span>

      {control ?? (
        <span
          aria-hidden
          className={cn(
            "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border",
            selected ? "border-brand bg-brand" : "border-border"
          )}
        >
          {selected && <span className="h-1.5 w-1.5 rounded-full bg-brand-foreground" />}
        </span>
      )}
    </Tag>
  );
}

/**
 * The box you tick to say you have read something.
 *
 * Bigger than the kit's form checkbox, because this one is the
 * acknowledgement rather than a preference, and green because it is the colour
 * of a thing that is now true.
 */
export function Ack({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] border",
          checked ? "border-verified bg-verified text-background" : "border-border bg-background"
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3.2} />}
      </span>
      <span className="text-[13px] leading-[18px] text-foreground/85">{children}</span>
    </label>
  );
}

/* ── buttons ─────────────────────────────────────────────────────────────── */

/**
 * The two buttons a dialog has.
 *
 * `tone` is what the action *does*, not how it looks: "go" fills with the
 * brand blue, "destructive" with the one red this product reserves for
 * irreversible things. Disabled keeps the fill and drops it to a third rather
 * than going grey — a control that changes colour when it is not ready reads
 * as a different button rather than as the same one waiting.
 */
export function DialogButton({
  children,
  onClick,
  tone = "go",
  busy,
  disabled,
  icon,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "go" | "destructive" | "quiet";
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  type?: "button" | "submit";
}) {
  const dead = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={dead}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[13px] font-semibold",
        "focus-visible:outline-none focus-visible:ring-2",
        tone === "quiet" &&
          "bg-muted text-foreground hover:opacity-90 focus-visible:ring-foreground/20 disabled:pointer-events-none disabled:opacity-50",
        tone === "go" &&
          cn(
            "text-brand-foreground focus-visible:ring-brand/40",
            dead ? "cursor-not-allowed bg-brand/35 text-brand-foreground/70" : "bg-brand hover:opacity-90 active:scale-[0.98]"
          ),
        tone === "destructive" &&
          cn(
            "text-white focus-visible:ring-danger/40",
            dead ? "cursor-not-allowed bg-danger-solid/35 text-white/70" : "bg-danger-solid hover:opacity-90 active:scale-[0.98]"
          )
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
