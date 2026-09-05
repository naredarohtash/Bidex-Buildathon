"use client";

/**
 * A date picker built for a birth date.
 *
 * ── Why not a calendar ─────────────────────────────────────────────────────
 *
 * Every calendar is built for "pick a day near today": a month grid, chevrons
 * either side, and the current month on arrival. A birth date is the opposite
 * errand. The year is the hard part and it is thirty or fifty pages away, so
 * the month grid — the biggest, most expensive thing on the panel — is the one
 * step you cannot use until the other two are settled. The version before this
 * one put a month dropdown and a hundred-item year dropdown above a full grid,
 * which is a 300px panel where two thirds of it is unusable on arrival.
 *
 * So it asks in the order a person actually knows the answer: **year, then
 * month, then day.** Each step is one small grid, and a step you have already
 * answered becomes a crumb you can tap to go back — the year and the month are
 * each their own chip in the header, so correcting a year is one tap from the
 * days rather than two, and the chips carry a caret because on a phone there is
 * no hover to discover them with. The panel is the width of the field it hangs
 * off (240–320px): it never has to hold more than twenty cells at once, and one
 * that matched the field reads as that field's menu.
 *
 * Opening on a filled field starts at the day, because that is an adjustment
 * rather than an answer.
 *
 * ── Why the panel is portalled ─────────────────────────────────────────────
 *
 * It used to be `absolute` inside the field. The field lives on the KYC card,
 * the card lives in the account panel, and the panel is a fixed overlay that
 * clips what overflows it — so the calendar was cut off down its right edge
 * and across its footer, taking Sunday, four dates and the confirmation line
 * with it. An absolutely positioned child cannot escape an ancestor's
 * `overflow: hidden`.
 *
 * So it renders into `document.body` and positions itself against the
 * trigger's rectangle, clamped to the viewport on both axes: it flips above
 * the field when there is no room below, and slides back inside the window
 * when the field is near an edge. It re-measures while it is open, because a
 * panel left behind by a scroll is worse than one that is clipped.
 *
 * Horizontally it is clamped to that clipping ancestor as well — see
 * `clipFrame`. Escaping the card is what the portal is for; *looking* like it
 * escaped the card is not, and a panel hanging over the side of the one it
 * belongs to reads as a bug even though nothing is cut off any more.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

const MIN_AGE = 18;
const MAX_AGE = 120;

/** Twenty years to a page: four across, five down, no scrolling. */
const YEARS_PER_PAGE = 20;

/** The panel takes the field's width, between these two. Narrower than 240 and
    seven day-columns stop being tappable; wider than 320 and a picker starts to
    look like a page. */
const PANEL_MIN_W = 240;
const PANEL_MAX_W = 320;
/** Only used to decide which way to open, before the panel has been drawn. */
const PANEL_H_GUESS = 290;
const GAP = 8;
/** Breathing room between the panel and the edge of the card it belongs to. */
const FRAME_INSET = 6;

/**
 * The frame this field sits in.
 *
 * The panel is portalled to `body`, so nothing clips it any more — which is
 * what stopped it being cut in half, and also what let it hang out over the
 * side of the card. Being *visible* past the card's edge is not the same as
 * belonging to it: a menu that starts inside a panel and ends on the page
 * behind it reads as a rendering fault, not as a menu.
 *
 * So it is clamped to the nearest ancestor that would have clipped it — the
 * card, the dialog, or the scrolling panel body, whichever comes first. That
 * ancestor is exactly the "frame" a person sees, which is why it is the right
 * thing to stay inside of.
 */
function clipFrame(el: HTMLElement, minWidth: number): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const s = getComputedStyle(node);
    if (/(auto|scroll|hidden|clip)/.test(`${s.overflowX} ${s.overflowY}`)) {
      /* Keep going past anything too narrow to hold the panel. `truncate` is
         `overflow: hidden` too, so the first clipping ancestor is quite often
         a one-line label rather than the card — clamping to that would pin the
         panel to a 60px box. */
      if (node.getBoundingClientRect().width >= minWidth) return node;
    }
    node = node.parentElement;
  }
  return null;
}

function bounds() {
  const now = new Date();
  return {
    maxYear: now.getFullYear() - MIN_AGE,
    minYear: now.getFullYear() - MAX_AGE,
  };
}

/** Monday-first offset for the 1st of a month. */
function leadingBlanks(year: number, month: number) {
  const day = new Date(year, month, 1).getDay(); // 0 = Sunday
  return (day + 6) % 7;
}

function daysIn(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function toISO(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function formatLong(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

type Step = "year" | "month" | "day";

/** One look for every cell on the panel, whichever step drew it. */
const cell =
  "grid place-items-center rounded-lg text-[12px] tabular-nums outline-none " +
  "focus-visible:ring-2 focus-visible:ring-ring/40";

/** One step of the header: the year, or the month, as a control you can see is
    a control. */
function Crumb({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-0 shrink items-center gap-0.5 rounded-md border border-border bg-background px-1.5 py-0.5",
        "text-[12px] font-semibold text-foreground hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      <span className="truncate">{children}</span>
      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
  );
}

export const DateOfBirthPicker = memo(function DateOfBirthPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  /** Overrides the trigger's own height and radius, for forms that set one
      size for every control on them. See CONTROL in kyc/profile-details. */
  className?: string;
}) {
  const { minYear, maxYear } = bounds();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /* Found once per opening, then only measured. Walking the ancestors reads a
     computed style per level, and `place` runs on every scroll of every
     scrollable thing above the field. */
  const frameRef = useRef<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const initial = useMemo(() => {
    const [y, m, d] = (value || "").split("-").map(Number);
    return {
      year: y && y >= minYear && y <= maxYear ? y : null,
      month: m ? m - 1 : null,
      day: d || null,
    };
  }, [value, minYear, maxYear]);

  const [year, setYear] = useState<number | null>(initial.year);
  const [month, setMonth] = useState<number | null>(initial.month);
  const [step, setStep] = useState<Step>(initial.year == null ? "year" : "day");

  /* The newest year on the current page of twenty, aligned so paging always
     lands on the same boundaries however you arrived. */
  const alignTop = useCallback(
    (y: number) => maxYear - Math.floor((maxYear - y) / YEARS_PER_PAGE) * YEARS_PER_PAGE,
    [maxYear]
  );
  const [pageTop, setPageTop] = useState(() => alignTop(initial.year ?? maxYear - 20));

  // Re-sync when the field is filled from elsewhere (e.g. a fresh profile load).
  useEffect(() => {
    setYear(initial.year);
    setMonth(initial.month);
  }, [initial.year, initial.month]);

  /* Opening is the moment to decide what is being asked: a blank field wants
     the year, a filled one is being adjusted and wants the day. */
  useEffect(() => {
    if (!open) return;
    setStep(initial.year == null ? "year" : "day");
    setPageTop(alignTop(initial.year ?? maxYear - 20));
  }, [open, initial.year, alignTop, maxYear]);

  /* Against the trigger, inside the window. Height comes from the panel itself
     once it exists, so a step taller than the guess is not left hanging off
     the bottom of a short window. */
  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const height = panelRef.current?.offsetHeight || PANEL_H_GUESS;

    /* The field's own width, so the panel reads as that field's menu rather
       than as a box that happens to be near it. */
    const width = Math.min(
      Math.max(PANEL_MIN_W, Math.min(r.width, PANEL_MAX_W)),
      window.innerWidth - GAP * 2
    );

    /* Inside the window, and inside the card — but the card only while it is
       actually wide enough to hold the panel, since a clamp that cannot be
       satisfied is worse than none. */
    let minLeft = GAP;
    let maxRight = window.innerWidth - GAP;
    if (!frameRef.current) frameRef.current = clipFrame(el, width + FRAME_INSET * 2);
    const frame = frameRef.current?.getBoundingClientRect();
    if (frame && frame.width >= width + FRAME_INSET * 2) {
      minLeft = Math.max(minLeft, frame.left + FRAME_INSET);
      maxRight = Math.min(maxRight, frame.right - FRAME_INSET);
    }

    let left = r.left;
    if (left + width > maxRight) left = maxRight - width;
    if (left < minLeft) left = minLeft;

    const roomBelow = window.innerHeight - r.bottom - GAP;
    const openUp = roomBelow < height && r.top - GAP > roomBelow;
    let top = openUp ? r.top - height - GAP : r.bottom + GAP;
    top = Math.max(GAP, Math.min(top, window.innerHeight - height - GAP));

    setPos({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    /* The account panel scrolls, and so does the page behind it. Capture, so a
       scroll inside any ancestor moves the panel with the field. */
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      /* The next opening may be in a different card — a dialog that has since
         been replaced, or a field that moved between them. */
      frameRef.current = null;
    };
  }, [open, place]);

  /* Steps are different heights, so the panel is measured again after each. */
  useLayoutEffect(() => {
    if (open) place();
  }, [open, step, month, year, place]);

  // Close on outside click and on Escape, so it behaves like every other menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation(); // don't also close the account panel
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const selected = value || "";
  const pageBottom = Math.max(minYear, pageTop - YEARS_PER_PAGE + 1);
  const pageYears = useMemo(() => {
    const out: number[] = [];
    for (let y = pageTop; y >= pageBottom; y--) out.push(y);
    return out;
  }, [pageTop, pageBottom]);

  /* Only the year step has a title. The other two are crumbs, which say the
     same thing and go somewhere. */
  const title = `${pageBottom} – ${pageTop}`;

  const pageBy = (delta: number) => {
    if (step === "year") {
      const next = pageTop + delta * YEARS_PER_PAGE;
      if (next > maxYear || next - YEARS_PER_PAGE + 1 < minYear - YEARS_PER_PAGE) return;
      setPageTop(Math.min(maxYear, Math.max(alignTop(minYear), next)));
      return;
    }
    if (step === "month") {
      const next = (year ?? maxYear) + delta;
      if (next < minYear || next > maxYear) return;
      setYear(next);
      return;
    }
    let m = (month ?? 0) + delta;
    let y = year ?? maxYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    if (y < minYear || y > maxYear) return;
    setMonth(m);
    setYear(y);
  };

  const panel = (
    <div
      ref={panelRef}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { opacity: 0 }}
      className={cn(
        "fixed z-[10060] overflow-hidden rounded-xl border border-border bg-popover",
        "shadow-2xl animate-in fade-in-0 zoom-in-95"
      )}
    >
      {/* The crumbs, and the only navigation on the panel.

          A year you have chosen is a button back to the years; a month you
          have chosen is a button back to the months. Nothing here is a
          dropdown: the two lists that used to be dropdowns are the two steps,
          and a step you can see is faster than a list you have to open. */}
      <div className="flex items-center gap-1 border-b border-border bg-muted px-2 py-1.5">
        <button
          type="button"
          onClick={() => pageBy(-1)}
          aria-label="Back"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Two crumbs, not one title.
        
            The title used to be a single button that went up exactly one level:
            from the days to the months, and only then to the years. Correcting a
            year — which is what somebody sent back by a reviewer is usually
            here to do — was two taps on a control that did not look like a
            control at all, and everybody else paged through it a month at a
            time with the chevron. The year and the month are each their own
            chip now, each going straight to its own step, and a chip with a
            caret in it says it can be opened without needing to be hovered
            first, which is the only way it could say so on a phone. */}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          {step === "year" ? (
            <span className="truncate px-1 text-[12.5px] font-semibold text-foreground">{title}</span>
          ) : (
            <>
              <Crumb onClick={() => setStep("year")}>{year}</Crumb>
              {step === "day" && (
                <Crumb onClick={() => setStep("month")}>{MONTHS[month ?? 0]}</Crumb>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => pageBy(1)}
          aria-label="Forward"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-2">
        <AnimatePresence mode="wait" initial={false}>
          {step === "year" && (
            <motion.div
              key="year"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.13, ease: [0.32, 0.72, 0, 1] }}
              className="grid grid-cols-4 gap-1"
            >
              {pageYears.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setYear(y);
                    setStep("month");
                  }}
                  className={cn(
                    cell,
                    "h-8",
                    y === year
                      ? "bg-brand font-semibold text-brand-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {y}
                </button>
              ))}
            </motion.div>
          )}

          {step === "month" && (
            <motion.div
              key="month"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.13, ease: [0.32, 0.72, 0, 1] }}
              className="grid grid-cols-3 gap-1"
            >
              {SHORT.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMonth(i);
                    setStep("day");
                  }}
                  className={cn(
                    cell,
                    "h-9",
                    i === month
                      ? "bg-brand font-semibold text-brand-foreground"
                      : "text-foreground hover:bg-muted"
                  )}
                >
                  {m}
                </button>
              ))}
            </motion.div>
          )}

          {step === "day" && year != null && (
            <motion.div
              key="day"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.13, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((d, i) => (
                  <div
                    key={i}
                    className="grid h-5 place-items-center text-[9.5px] font-semibold text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: leadingBlanks(year, month ?? 0) }).map((_, i) => (
                  <div key={`b${i}`} />
                ))}
                {Array.from({ length: daysIn(year, month ?? 0) }).map((_, i) => {
                  const day = i + 1;
                  const iso = toISO(year, month ?? 0, day);
                  const isSelected = iso === selected;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        onChange(iso);
                        setOpen(false);
                      }}
                      className={cn(
                        cell,
                        /* Round, and the width of its own column. A circle is
                           what a chosen day looks like everywhere else, and at
                           this size a rounded square reads as a button in a
                           grid of buttons rather than as a date.
                        
                           Sized from the column rather than fixed at 28px: the
                           panel is as wide as the field it hangs off, so the
                           column is not always the same width, and a fixed cell
                           either overflowed a narrow one or floated in a wide
                           one with the hit area nowhere near the number. */
                        "mx-auto aspect-square w-full max-w-[32px] rounded-full",
                        isSelected
                          ? "bg-brand font-semibold text-brand-foreground"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-1.5">
        <span className="text-[10.5px] text-muted-foreground">
          {step === "year" ? `${MIN_AGE} or over` : selected ? "" : "Pick a day"}
        </span>
        {selected && (
          <span className="flex shrink-0 items-center gap-1 text-[10.5px] font-medium text-verified">
            <Check className="h-2.5 w-2.5" />
            {formatLong(selected)}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3",
          "text-[13px] transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
          disabled
            ? "cursor-not-allowed bg-muted/50 text-muted-foreground"
            : "cursor-pointer hover:bg-muted/40",
          !selected && "text-muted-foreground",
          className
        )}
      >
        <span className="truncate">{selected ? formatLong(selected) : "Pick a date"}</span>
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </>
  );
});

export default DateOfBirthPicker;
