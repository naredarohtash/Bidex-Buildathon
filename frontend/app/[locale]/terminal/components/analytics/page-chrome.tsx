"use client";

/**
 * The furniture both analytics pages wear.
 *
 * The overview grew a header — a title, a greeting addressed to the reader, and
 * a row of pill controls ending in the close button — and the journal, one tab
 * away, had none of it: a chrome bar with its name in it, and its period and
 * export controls buried in the filter bar halfway down the page. Two tabs of
 * one panel, wearing two different hats.
 *
 * So the hat lives here and both wear it. Nothing in this file knows what a
 * trade is; it is a title, a greeting, a dropdown and a button, and the two
 * pages supply the meaning.
 */

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ══ controls ══════════════════════════════════════════════════════════════ */

export const CONTROL =
  "inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-[12px] font-medium text-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-[13px]";

export const CONTROL_BRAND =
  "inline-flex h-9 items-center gap-2 rounded-md bg-brand px-3 text-[12px] font-semibold text-brand-foreground hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:px-3.5 sm:text-[13px]";

/** Closes a popover on an outside press or on Escape. Pointerdown, not click, so
    it closes on the press that opens something else rather than on its release. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);
  return ref;
}

export function Popover({
  icon,
  label,
  badge,
  panelWidth = 232,
  children,
  ariaLabel,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  badge?: number;
  panelWidth?: number;
  children: (close: () => void) => React.ReactNode;
  ariaLabel: string;
  /** "brand" is the one filled control on the page. Everything else narrows what
      is shown; only Export does something, and it is the only thing that looks
      like it does. */
  variant?: "default" | "brand";
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          variant === "brand" ? CONTROL_BRAND : CONTROL,
          open && (variant === "brand" ? "brightness-[0.94]" : "bg-muted")
        )}
      >
        {icon}
        <span className="max-w-[52vw] truncate sm:max-w-none">{label}</span>
        {badge ? (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
            {badge}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            variant === "brand" ? "opacity-80" : "text-muted-foreground"
          )}
        />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: [0.4, 0, 0.2, 1] }}
          className="absolute right-0 top-full z-50 mt-1.5 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
          style={{ width: panelWidth }}
        >
          {children(() => setOpen(false))}
        </motion.div>
      )}
    </div>
  );
}

export function MenuItem({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] text-popover-foreground hover:bg-muted focus:outline-none focus-visible:bg-muted"
    >
      <span className="min-w-0 truncate">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-brand" />}
    </button>
  );
}

/** The close button, when the page is the whole of an overlay and there is no
    chrome bar above it to hold one. */
export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

/* ══ the greeting ══════════════════════════════════════════════════════════ */

/**
 * Morning, afternoon or evening — resolved on the client, after mount.
 *
 * The hour is a fact about the reader's machine, and the server has no access
 * to it. Rendering a guess and correcting it is a hydration mismatch on a
 * heading; rendering nothing until the effect runs is one frame without a
 * greeting, which nobody sees and React is happy with. That is why this starts
 * empty rather than at "Good morning".
 */
export function useGreeting(): string {
  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return greeting;
}

/**
 * The waving hand beside the greeting.
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
export function Wave() {
  return (
    <motion.span
      aria-hidden
      className="inline-block origin-[70%_80%] text-[19px] leading-none sm:text-[23px]"
      initial={false}
      animate={{ rotate: [0, 16, -8, 14, -4, 10, 0, 0, 0, 0] }}
      transition={{
        duration: 4.2,
        times: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 0.75, 1],
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      👋
    </motion.span>
  );
}

/* ══ the header ════════════════════════════════════════════════════════════ */

/**
 * Title on the left, the reader in the middle, the controls on the right.
 *
 * The greeting is the one line on either page addressed to a person rather
 * than about the trades, and it used to sit inline after the title, where it
 * read as part of the page's name. It is the header's middle item now — under
 * the title on a phone, the middle of three across a laptop, and pinned to the
 * true centre of the row from `xl`, which is the width at which the title on
 * the left and the controls on the right are finally far enough apart that the
 * exact middle is a hole rather than a collision.
 *
 * `pointer-events-none` on it because it floats over the row from there, and a
 * greeting that can swallow a click meant for Export is worse than no greeting.
 */
export function PageHeader({
  title,
  name,
  children,
}: {
  title: string;
  /** The reader's first name, if it is known. */
  name?: string;
  /** The control row: dropdowns, export, close. */
  children: React.ReactNode;
}) {
  const greeting = useGreeting();
  return (
    <header className="relative flex flex-col gap-2.5 pt-0.5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="min-w-0">
        <h1 className="text-[19px] font-bold tracking-tight text-foreground sm:text-[23px]">
          {title}
        </h1>
      </div>

      {greeting && (
        <p className="pointer-events-none mt-0.5 flex items-center gap-2 whitespace-nowrap text-[16px] font-semibold tracking-tight text-foreground sm:text-[19px] lg:mt-0 xl:absolute xl:left-1/2 xl:top-1/2 xl:-translate-x-1/2 xl:-translate-y-1/2">
          {greeting}
          {name ? `, ${name}` : ""}
          <Wave />
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}
