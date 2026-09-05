"use client";

/**
 * The pieces every pane of the support workspace draws with.
 *
 * Defined once because the three panes describe the same ticket from three
 * distances, and a status that is amber in the list and blue in the header is
 * two different tickets as far as the eye is concerned.
 *
 * Everything here is built from the theme's own tokens — `--verified`,
 * `--attention`, `--danger`, `--brand` and the surface ramp — and never from a
 * palette colour. The panel this replaces hard-coded `#0e1626`, `#162036`,
 * `zinc-800` and `emerald-500` and then branched on `darkMode` and `isNavy` at
 * every single call site, which is why it could only ever look right in one
 * theme at a time. Nothing in this directory takes a `darkMode` prop.
 */

import { memo } from "react";
import {
  Check,
  CheckCheck,
  CircleDot,
  Clock,
  FileText,
  Loader2,
  MessageSquareReply,
  Minus,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Accent, Importance, SupportCategory } from "./support-catalog";
import type { TicketStatus } from "./use-tickets";

/* ── Subject colour ────────────────────────────────────────────────────────
 *
 * Six hues, one per category, and the only colours in this directory that are
 * not theme tokens. The exception is bounded on purpose: state stays on
 * `--brand`, `--verified`, `--attention` and `--danger` so those keep meaning
 * what they mean, and this set answers a different question — what is the
 * ticket *about* — which no state token can answer.
 *
 * Written out in full rather than assembled from the key, because Tailwind
 * scans source text: `text-${accent}-600` is a class that ships unstyled.
 *
 * The `dark:` half covers navy as well — globals.css defines the variant as
 * `&:is(.dark *, .navy *)` precisely so a colour does not have to be picked
 * three times in JS. The 600/400 split is the usual one: a 600 is legible on
 * white and disappears on near-black, and a 400 is the reverse.
 */
/* Light takes Tailwind's ramp; dark does not.
 *
 * `-400` is mixed to sit on white at high chroma, and dropped onto a 3.9%
 * ground it fluoresces — six categories rendered as six highlighter pens, on
 * a screen whose other greens are a settled payment and a passed check. This
 * theme already had the answer written down: `--verified` is 38% saturated in
 * dark where the trading palette's green is 71%, because "it still reads
 * unambiguously green next to grey, and it stops reading as a highlighter".
 *
 * So the dark half is stated in HSL at 28-34% saturation rather than taken
 * from a palette — the same instruction, applied to six hues instead of one.
 * The light half is unchanged: `-600` on white is already ink.
 */
export const ACCENT: Record<
  Accent,
  {
    ink: string;
    tile: string;
    chip: string;
    /** Filled pill, mixed the way the status pills are — see `CategoryChip`. */
    solid: string;
    /** The same value as ink, for a glyph sitting in a white disc on `solid`. */
    solidInk: string;
    edge: string;
    dot: string;
  }
> = {
  emerald: {
    ink: "text-emerald-600 dark:text-[hsl(155_32%_64%)]",
    tile: "bg-emerald-500/12 text-emerald-600 dark:bg-[hsl(155_28%_55%/0.13)] dark:text-[hsl(155_32%_64%)]",
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:bg-[hsl(155_28%_55%/0.13)] dark:text-[hsl(155_30%_70%)] dark:ring-[hsl(155_28%_55%/0.3)]",
    solid: "bg-emerald-600 dark:bg-[hsl(155_34%_32%)]",
    solidInk: "text-emerald-600 dark:text-[hsl(155_34%_32%)]",
    edge: "bg-emerald-500 dark:bg-[hsl(155_30%_46%)]",
    dot: "bg-emerald-500 dark:bg-[hsl(155_30%_52%)]",
  },
  sky: {
    ink: "text-sky-600 dark:text-[hsl(202_34%_64%)]",
    tile: "bg-sky-500/12 text-sky-600 dark:bg-[hsl(202_30%_55%/0.13)] dark:text-[hsl(202_34%_64%)]",
    chip: "bg-sky-500/12 text-sky-700 ring-sky-500/25 dark:bg-[hsl(202_30%_55%/0.13)] dark:text-[hsl(202_32%_70%)] dark:ring-[hsl(202_30%_55%/0.3)]",
    solid: "bg-sky-600 dark:bg-[hsl(202_42%_38%)]",
    solidInk: "text-sky-600 dark:text-[hsl(202_42%_38%)]",
    edge: "bg-sky-500 dark:bg-[hsl(202_34%_46%)]",
    dot: "bg-sky-500 dark:bg-[hsl(202_32%_52%)]",
  },
  violet: {
    ink: "text-violet-600 dark:text-[hsl(262_30%_70%)]",
    tile: "bg-violet-500/12 text-violet-600 dark:bg-[hsl(262_28%_60%/0.14)] dark:text-[hsl(262_30%_70%)]",
    chip: "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:bg-[hsl(262_28%_60%/0.14)] dark:text-[hsl(262_30%_75%)] dark:ring-[hsl(262_28%_60%/0.3)]",
    solid: "bg-violet-600 dark:bg-[hsl(262_32%_44%)]",
    solidInk: "text-violet-600 dark:text-[hsl(262_32%_44%)]",
    edge: "bg-violet-500 dark:bg-[hsl(262_30%_54%)]",
    dot: "bg-violet-500 dark:bg-[hsl(262_30%_60%)]",
  },
  amber: {
    ink: "text-amber-600 dark:text-[hsl(36_38%_64%)]",
    tile: "bg-amber-500/12 text-amber-600 dark:bg-[hsl(36_34%_55%/0.13)] dark:text-[hsl(36_38%_64%)]",
    chip: "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:bg-[hsl(36_34%_55%/0.13)] dark:text-[hsl(36_36%_70%)] dark:ring-[hsl(36_34%_55%/0.3)]",
    solid: "bg-amber-600 dark:bg-[hsl(36_42%_34%)]",
    solidInk: "text-amber-600 dark:text-[hsl(36_42%_34%)]",
    edge: "bg-amber-500 dark:bg-[hsl(36_38%_46%)]",
    dot: "bg-amber-500 dark:bg-[hsl(36_36%_52%)]",
  },
  cyan: {
    ink: "text-cyan-600 dark:text-[hsl(187_28%_62%)]",
    tile: "bg-cyan-500/12 text-cyan-600 dark:bg-[hsl(187_26%_55%/0.13)] dark:text-[hsl(187_28%_62%)]",
    chip: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25 dark:bg-[hsl(187_26%_55%/0.13)] dark:text-[hsl(187_28%_68%)] dark:ring-[hsl(187_26%_55%/0.3)]",
    solid: "bg-cyan-600 dark:bg-[hsl(187_36%_30%)]",
    solidInk: "text-cyan-600 dark:text-[hsl(187_36%_30%)]",
    edge: "bg-cyan-500 dark:bg-[hsl(187_28%_44%)]",
    dot: "bg-cyan-500 dark:bg-[hsl(187_28%_50%)]",
  },
  slate: {
    ink: "text-slate-600 dark:text-[hsl(215_12%_68%)]",
    tile: "bg-slate-500/12 text-slate-600 dark:bg-[hsl(215_10%_60%/0.13)] dark:text-[hsl(215_12%_68%)]",
    chip: "bg-slate-500/12 text-slate-700 ring-slate-500/25 dark:bg-[hsl(215_10%_60%/0.13)] dark:text-[hsl(215_12%_72%)] dark:ring-[hsl(215_10%_60%/0.3)]",
    solid: "bg-slate-600 dark:bg-[hsl(215_14%_38%)]",
    solidInk: "text-slate-600 dark:text-[hsl(215_14%_38%)]",
    edge: "bg-slate-400 dark:bg-[hsl(215_10%_46%)]",
    dot: "bg-slate-400 dark:bg-[hsl(215_10%_52%)]",
  },
};

/**
 * The category, as a tag — built exactly the way `StatusPill` is.
 *
 * It used to be a tinted chip with a coloured ring and coloured lettering,
 * which put a pale green "Deposits" beside a filled blue "Open" on the same
 * row: two facts of the same kind — what this ticket is about, and where it
 * has got to — drawn as two different classes of object, and the tinted one
 * read as fluorescent next to the solid one rather than quieter than it.
 *
 * Same construction, then: a filled pill, white lettering, and the glyph in a
 * white disc that carries the fill's own colour. The fills are mixed the way
 * the status fills are — a 600 in light, a desaturated third of a turn down in
 * dark — so a row of these is a row of pills rather than a paint chart.
 */
export const CategoryChip = memo(function CategoryChip({
  category,
  size = "md",
}: {
  category: SupportCategory;
  size?: "sm" | "md";
}) {
  const Icon = category.icon;
  const accent = ACCENT[category.accent];
  const compact = size === "sm";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md font-semibold text-white",
        compact ? "gap-1 px-1 py-[1px] text-[9.5px]" : "gap-1 px-1.5 py-[1.5px] text-[10.5px]",
        accent.solid
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-white",
          compact ? "h-2.5 w-2.5" : "h-3 w-3",
          accent.solidInk
        )}
      >
        <Icon className={compact ? "h-[7px] w-[7px]" : "h-2 w-2"} strokeWidth={3} />
      </span>
      {category.label}
    </span>
  );
});

/**
 * A free tag, coloured by what it says.
 *
 * The hue is a hash of the text, which sounds arbitrary and is the point: the
 * same word is always the same colour, so `chargeback` is recognisable at a
 * glance across a list of tickets without anybody having to configure a
 * palette. It is the trick every issue tracker uses on labels. A random colour
 * per render would be decoration; a stable one is a second way to read the
 * word.
 */
export const Tag = memo(function Tag({ label }: { label: string }) {
  const keys = Object.keys(ACCENT) as Accent[];
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  const accent = keys[hash % keys.length];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] font-medium ring-1 ring-inset",
        ACCENT[accent].chip
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ACCENT[accent].dot)} />
      {label}
    </span>
  );
});

/* ── State ────────────────────────────────────────────────────────────────
 *
 * The five places a ticket can be, in the reader's words.
 *
 * The wire enum is written from the system's point of view and two of its
 * four names mean the opposite of what they look like: `OPEN` means an agent
 * has replied and `REPLIED` means the customer has. Anything rendering those
 * verbatim tells somebody their answered ticket is "open" and their waiting
 * one is "replied", which is exactly backwards.
 *
 * So the enum is translated once, here, and nothing downstream reads
 * `ticket.status` to decide what to say. The fifth state is the only derived
 * one: a closed ticket the person rated is one they came back to and marked,
 * which is a different event from a ticket that was simply shut, and it is a
 * distinction the record already holds.
 */
export type TicketState = "open" | "awaiting" | "replied" | "resolved" | "closed";

export function stateOf(ticket: {
  status: TicketStatus;
  satisfaction?: number | null;
}): TicketState {
  if (ticket.status === "CLOSED") return ticket.satisfaction ? "resolved" : "closed";
  if (ticket.status === "OPEN") return "replied";
  /* PENDING is a ticket nobody has touched yet; REPLIED is one the reader
     spoke on last. Both are waiting on support, but only the second is
     waiting on a *reply* — the first has not been picked up at all. */
  if (ticket.status === "REPLIED") return "awaiting";
  return "open";
}

/* `label`, `fill`, `ink`, `icon` — and nothing else.
 
   There were two more: `short`, for a compact label, and `chip`, a pale
   ring-outlined variant. Both existed for `StateTag`, a second way of drawing
   a status that only the list rows used — so one fact had two appearances and
   the quieter one read as a lesser class of thing. `StatusPill` is now the
   only answer to "what state is this ticket in", and the fields that fed the
   alternative went with it. */
export const STATE: Record<
  TicketState,
  { label: string; fill: string; ink: string; icon: typeof Check }
> = {
  open: {
    label: "Open",
    /* The other four fills are already theme tokens mixed for both grounds —
       `--attention-solid`, `--verified-solid`, `--brand`, `--muted-foreground`.
       This one was raw `sky-500`, the only pill on the screen taken from a
       palette, and it was the brightest thing in the dark theme. */
    fill: "bg-sky-600 dark:bg-[hsl(202_42%_38%)]",
    ink: "text-sky-600 dark:text-[hsl(202_42%_38%)]",
    icon: CircleDot,
  },
  awaiting: {
    label: "Awaiting response",
    fill: "bg-attention-solid",
    ink: "text-attention-solid",
    icon: Clock,
  },
  replied: {
    label: "Replied",
    fill: "bg-brand",
    ink: "text-brand",
    icon: MessageSquareReply,
  },
  resolved: {
    label: "Resolved",
    fill: "bg-verified-solid",
    ink: "text-verified-solid",
    icon: CheckCheck,
  },
  closed: {
    label: "Closed",
    fill: "bg-muted-foreground",
    ink: "text-muted-foreground",
    icon: Check,
  },
};

/**
 * A filled pill with a white disc and the pill's own colour as the mark.
 *
 * The same construction the transactions ledger uses for its statuses, and
 * deliberately so: a trader scanning a list of tickets and a list of payments
 * is doing the same job with the same eye. An outlined chip is not something
 * you find at a glance down twenty rows — see the note over `StatusChip` in
 * account/transactions-panel.
 */
export const StatusPill = memo(function StatusPill({
  state,
  compact = false,
}: {
  state: TicketState;
  compact?: boolean;
}) {
  const tone = STATE[state] ?? STATE.open;
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md font-semibold text-white",
        compact ? "gap-1 px-1 py-[1px] text-[9.5px]" : "gap-1 px-1.5 py-[1.5px] text-[10.5px]",
        tone.fill
      )}
    >
      {/* The disc names its own ink rather than inheriting: the pill's colour
          is a *background* token, so there is nothing on the wrapper for a
          glyph to inherit — `currentColor` inside here is the white label. */}
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-full bg-white",
          compact ? "h-2.5 w-2.5" : "h-3 w-3",
          tone.ink
        )}
      >
        {/* Stroke does not come down with the box — a tick at 3.5 on a 7px
            glyph closes into a blob. See the same note in transactions-panel. */}
        <Icon className={compact ? "h-[7px] w-[7px]" : "h-2 w-2"} strokeWidth={3} />
      </span>
      {tone.label}
    </span>
  );
});

export const StatusMark = memo(function StatusMark({ state }: { state: TicketState }) {
  const tone = STATE[state] ?? STATE.open;
  const Icon = tone.icon;
  return (
    <span className={cn("grid h-3 w-3 shrink-0 place-items-center rounded-full bg-white", tone.ink)}>
      <Icon className="h-2 w-2" strokeWidth={3} />
    </span>
  );
});

/* ── Priority ──────────────────────────────────────────────────────────── */

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  LOW: "Low",
  MEDIUM: "Normal",
  HIGH: "Urgent",
};

/**
 * Priority as three bars, not three colours.
 *
 * A red "HIGH" chip next to a red status chip next to a red unread dot is
 * three alarms for one ticket. Priority is an ordinal — low, normal, urgent —
 * and an ordinal is best drawn as a quantity: one bar, two, three. Only the
 * third takes a colour, because only "urgent" is a claim about the world
 * rather than a position on a scale.
 */
export const ImportanceMeter = memo(function ImportanceMeter({
  importance,
  withLabel = false,
}: {
  importance: Importance;
  withLabel?: boolean;
}) {
  const filled = importance === "HIGH" ? 3 : importance === "MEDIUM" ? 2 : 1;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        importance === "HIGH" ? "text-danger" : "text-muted-foreground"
      )}
      title={`${IMPORTANCE_LABEL[importance]} priority`}
    >
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-[1px]",
              i === 0 ? "h-[5px]" : i === 1 ? "h-[8px]" : "h-[11px]",
              i < filled ? "bg-current" : "bg-current opacity-25"
            )}
          />
        ))}
      </span>
      {withLabel && (
        <span className="text-[12px] font-medium leading-none">{IMPORTANCE_LABEL[importance]}</span>
      )}
      <span className="sr-only">{IMPORTANCE_LABEL[importance]} priority</span>
    </span>
  );
});

/** The same three levels, as something you choose. */
export const IMPORTANCE_OPTIONS: Array<{ value: Importance; label: string; blurb: string }> = [
  { value: "LOW", label: "Low", blurb: "A question. Nothing is blocked." },
  { value: "MEDIUM", label: "Normal", blurb: "Something is wrong and I can wait." },
  { value: "HIGH", label: "Urgent", blurb: "Money or account access is affected." },
];

/**
 * A ticket id you can read out.
 *
 * The record's id is a 36-character UUID. It is the right thing to *store*
 * and the wrong thing to put on a list row: nobody quotes it, nobody
 * remembers it, and at 11px it is indistinguishable from the one above it.
 *
 * Derived, not stored — six hex characters off the front of the id itself, so
 * it needs no column, never drifts from the id, and pasting it back into the
 * search box finds the ticket it came from. Six is 16 million values, which is
 * far past the point of collision inside one person's ticket list.
 *
 * `#` because that is what a reference number looks like everywhere else.
 */
export function ticketRef(id: string): string {
  const hex = id.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
  if (hex.length === 6) return `#${hex}`;
  /* Every id the server issues is a UUID, so the line above is the whole
     story in production. A seed row or a fixture can be `tk-1`, though, and
     `#1` beside `#4` reads as a bug rather than as a reference — so anything
     short is hashed up to the same six characters instead. */
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `#${h.toString(16).toUpperCase().padStart(6, "0").slice(-6)}`;
}

/* ── Time ──────────────────────────────────────────────────────────────── */

/**
 * How long ago, in as few characters as it takes.
 *
 * Minutes for the first hour, hours for the first day, then the date. A list
 * of tickets is scanned for which one moved most recently, and "3d" answers
 * that faster than a formatted date does — but past a week the relative form
 * stops meaning anything ("6w" is not a time anyone holds in their head) and
 * the actual date is more use.
 */
export function shortAgo(ms: number): string {
  if (!ms) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * A date for a table: short month, 24-hour clock, no seconds.
 *
 * `fullTime` spells the meridiem out — "Jul 22, 2026, 11:13 AM" — which is
 * four characters of nothing in a 318px column, and it right-pads unevenly
 * against "8:13 PM" on the row below. A record wants every date the same
 * width and the same shape.
 */
export function tableTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** The full thing, for a tooltip or a detail row where there is room to be exact. */
export function fullTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The divider between one day of a conversation and the next. */
export function dayLabel(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

/* ── Attachments ───────────────────────────────────────────────────────── */

/**
 * One attached file.
 *
 * An image is shown, because the whole reason somebody attaches a screenshot
 * is so it can be looked at; anything else is a row with its name, because a
 * generic file icon blown up to thumbnail size communicates nothing that the
 * filename does not. Both are the same height so a message carrying one of
 * each does not come out ragged.
 */
export const AttachmentTile = memo(function AttachmentTile({
  url,
  name,
  isImage,
  onOpen,
  onRemove,
  uploading = false,
  compact = false,
}: {
  url: string;
  name: string;
  isImage: boolean;
  onOpen?: () => void;
  onRemove?: () => void;
  uploading?: boolean;
  /** The details pane, where these summarise rather than display. */
  compact?: boolean;
}) {
  const box = compact ? "h-14 w-14" : "h-[76px] w-[76px]";
  const fileBox = compact ? "h-14 w-[104px] p-2" : "h-[76px] w-[150px] p-2.5";
  return (
    <span className="group/att relative inline-flex">
      {isImage ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "block overflow-hidden rounded-lg border border-border bg-muted/40",
            box,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            onOpen && "cursor-zoom-in"
          )}
          title={name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={name}
            className={cn(
              "h-full w-full object-cover",
              uploading && "opacity-50"
            )}
            loading="lazy"
          />
        </button>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          title={name}
          className={cn(
            "flex flex-col justify-between rounded-lg border border-border bg-muted/40",
            fileBox,
            "hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            uploading && "opacity-50"
          )}
        >
          <FileText className="h-4 w-4 shrink-0 text-danger" strokeWidth={2} />
          <span className="line-clamp-2 break-all text-[11px] font-medium leading-[14px] text-foreground/80">
            {name}
          </span>
        </a>
      )}

      {uploading && (
        <span className="absolute inset-0 grid place-items-center rounded-lg bg-background/50">
          <Loader2 className="h-4 w-4 animate-spin text-foreground" />
        </span>
      )}

      {onRemove && !uploading && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          /* Always present on touch, revealed on hover with a pointer. A
             control that only exists on hover is a control a phone cannot
             reach, and this is the only way to undo an attachment. */
          className={cn(
            "absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full",
            "border border-border bg-card text-muted-foreground shadow-sm",
            "hover:border-danger/40 hover:text-danger",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          )}
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      )}
    </span>
  );
});

/* ── Empty states ──────────────────────────────────────────────────────── */

export const EmptyNote = memo(function EmptyNote({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ElementType;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-12 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-muted/40 text-muted-foreground">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <p className="mt-3.5 text-[15px] font-semibold text-foreground">{title}</p>
      {body && <p className="mt-1 max-w-[42ch] text-[13px] leading-[19px] text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
});

/* ── Service level ─────────────────────────────────────────────────────────
 *
 * How long a first reply should take, by how urgent the ticket is.
 *
 * Derived, never stored. The ticket carries `responseTime` — minutes from
 * opening to the first agent message, written by the reply route — and that
 * number on its own tells a reader nothing: 26 minutes is excellent for a
 * routine question and slow for money that has gone missing. Read against the
 * promise made for that priority, it becomes an answer.
 *
 * A ticket nobody has answered yet is measured against the clock instead, so
 * the pane can say "due in 40 min" rather than going quiet exactly when
 * somebody is watching it.
 */
/* 24 hours to 48, and never more than 48.
 
   The first pass promised an hour on an urgent ticket, which is a promise made
   by an interface about people it has never met — one agent covering a night
   shift misses it on every ticket, and a service level nobody can hit is worse
   than none, because it turns a working queue into a wall of red. These are
   targets a human support desk can actually keep, and the spread still says
   which tickets go first. */
const SLA_MINUTES: Record<Importance, number> = {
  HIGH: 24 * 60,
  MEDIUM: 36 * 60,
  LOW: 48 * 60,
};

/**
 * The longest any ticket waits, as a promise fit to print.
 *
 * Derived from the table above rather than typed out beside it, so the line in
 * the list header and the target the pane measures against can never disagree
 * — which is the whole failure mode of putting a service promise in a string.
 */
export const SLA_PROMISE = `Answered within ${humanMinutes(
  Math.max(...Object.values(SLA_MINUTES))
)}`;

export type Sla =
  | { state: "met"; label: string; detail: string }
  | { state: "missed"; label: string; detail: string }
  | { state: "waiting"; label: string; detail: string }
  | { state: "overdue"; label: string; detail: string };

export function slaFor(
  importance: Importance,
  responseTime: number | null | undefined,
  openedAt: number
): Sla {
  const target = SLA_MINUTES[importance] ?? SLA_MINUTES.LOW;
  const within = `Target ${humanMinutes(target)}`;

  if (typeof responseTime === "number" && responseTime >= 0) {
    return responseTime <= target
      ? { state: "met", label: "Met", detail: `Answered in ${humanMinutes(responseTime)} · ${within}` }
      : { state: "missed", label: "Missed", detail: `Answered in ${humanMinutes(responseTime)} · ${within}` };
  }

  const elapsed = Math.max(0, Math.round((Date.now() - openedAt) / 60000));
  const left = target - elapsed;
  return left >= 0
    ? { state: "waiting", label: "On track", detail: `First reply due in ${humanMinutes(left)}` }
    : { state: "overdue", label: "Overdue", detail: `${humanMinutes(-left)} past the ${humanMinutes(target)} target` };
}

/**
 * Minutes as something a person reads rather than counts.
 *
 * Hours run all the way to 48 before days take over, which is one hour past
 * where you would normally switch. It is deliberate: every target in this
 * workspace is stated in hours, and rounding the longest of them to "2 days"
 * made the promise in the list header and the target in the details pane look
 * like two different numbers. Forty-eight hours is also simply how a support
 * desk talks.
 */
export function humanMinutes(total: number): string {
  if (total < 1) return "under a minute";
  if (total < 60) return `${total} min`;
  const hours = Math.round(total / 60);
  if (hours <= 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

export const SLA_TONE: Record<Sla["state"], string> = {
  met: "bg-verified/12 text-verified ring-verified/25",
  waiting: "bg-brand/12 text-brand ring-brand/25",
  missed: "bg-danger/12 text-danger ring-danger/25",
  overdue: "bg-danger/12 text-danger ring-danger/25",
};

/* ── Buttons ───────────────────────────────────────────────────────────── */

/**
 * The one filled control per surface — the settings kit's `Action` primary,
 * to the pixel.
 *
 * It had a vertical gradient, an inset top highlight and a shadow tinted with
 * its own hue, on the theory that a button should look pressable. What that
 * actually produced was the loudest object on the screen: a glowing blue slab
 * in a column of quiet white cards, and a *different* blue from the one every
 * button on the settings and security pages uses. Two blues in one product is
 * one too many, and the one with a glow on it reads as a promotion rather than
 * as a control.
 *
 * So it is `bg-brand`, flat, at the settings kit's height, radius, padding and
 * weight, with its opacity-and-scale press. Same object, same behaviour, in
 * both places — see `Action` in profile/components/kit/settings-kit.
 */
export const PRIMARY_BUTTON = cn(
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-4",
  "bg-brand text-[13px] font-medium text-brand-foreground",
  "hover:opacity-90 active:opacity-80 active:scale-[0.97]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  /* The product's rule for a control that is not ready yet: keep the colour,
     drop to a third of it. Going grey makes the button change identity as well
     as state. */
  "disabled:pointer-events-none disabled:bg-brand/30 disabled:text-brand-foreground/75"
);

/* The quiet one gains the same one-pixel top highlight, so the two read as a
   pair rather than as a button and a box. */
export const QUIET_BUTTON = cn(
  "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2",
  "border border-border bg-card text-[13px] font-medium text-foreground/80",
  "shadow-[0_1px_1px_rgb(0_0_0/0.04),inset_0_1px_0_rgb(255_255_255/0.06)]",
  "hover:border-foreground/20 hover:bg-foreground/[0.05] hover:text-foreground",
  "active:translate-y-px",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:opacity-50"
);

/**
 * The second weight, taken from the settings kit's `Action` secondary.
 *
 * It was a brand-tinted outline — blue border, blue fill at 8%, blue text —
 * and two of them ended up stacked on the closed-ticket screen, one inside a
 * green panel and one in the bar beneath it. Blue on green on a patterned
 * canvas is three colours arguing about a control that only says "start
 * again".
 *
 * The security page had already settled this: a bordered button on `--muted`,
 * which is the step *above* a card rather than below it, so it reads as
 * raised without being lit. Same height, same radius, same 13px medium, same
 * 0.97 press — the terminal and the settings should not have two ideas of
 * what a secondary button is.
 */
export const SECONDARY_BUTTON = cn(
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-4",
  "border border-border bg-muted text-[13px] font-medium text-foreground",
  "hover:bg-muted/70 active:bg-muted/60 active:scale-[0.97]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
  "disabled:pointer-events-none disabled:opacity-50"
);

/** The field style shared by the composer, the search box and the wizard. */
export const FIELD = cn(
  "w-full rounded-lg border border-field-border bg-field px-3 py-2",
  "text-[13px] text-foreground placeholder:text-muted-foreground",
  "focus:border-ring/60 focus:outline-none focus:ring-2 focus:ring-ring/25"
);

/**
 * The chat canvas.
 *
 * The thread was drawn straight onto `--background`, the same surface as the
 * page behind the whole workspace — so an agent's bubble, which is a bordered
 * card, floated on nothing and the reader's own bubbles were the only thing
 * with any weight. Every messaging app in existence puts the conversation on
 * its own ground for this reason.
 *
 * The ground is doodle wallpaper — see `public/img/support-doodles.svg`, which
 * is a 220px tile of line art. It is applied as a **mask** over a
 * `--foreground` fill rather than as a background image, and that is the whole
 * trick: the reference for this was a grey-on-white PNG, and a PNG bakes its
 * ink colour in. Dropped onto the dark themes it would be white scratches on
 * near-black; on navy it would be invisible. Masked, the drawing is a stencil
 * and the theme supplies the ink, so one file is correct in all three.
 *
 * Two properties are set rather than one: Safari still wants the `-webkit-`
 * prefix for masks, and a mask that silently does not apply is a wall of
 * full-strength doodles across the conversation.
 *
 * Written as an inline style, not a class. Tailwind's arbitrary-value syntax
 * has to survive a `url()` with slashes in it, and this file already knows
 * that anything fighting the CSS in this app loses — see the note on
 * transitions in ./dock.
 */
export const DOODLE_TILE = 300;

export const doodleLayerStyle: React.CSSProperties = {
  WebkitMaskImage: "url(/img/support-doodles.svg)",
  maskImage: "url(/img/support-doodles.svg)",
  WebkitMaskSize: `${DOODLE_TILE}px ${DOODLE_TILE}px`,
  maskSize: `${DOODLE_TILE}px ${DOODLE_TILE}px`,
  WebkitMaskRepeat: "repeat",
  maskRepeat: "repeat",
};

/** The tint the wallpaper is drawn on. */
/* `--muted` at 30% is a clear step below a card in the light theme and
   almost exactly level with one in dark: that ramp puts `--muted` near 16%
   and `--card` at 8%, so a 30% wash lands within half a point of the very
   surface it is meant to sit behind. Every card on this canvas — the agent
   bubbles, the composer, the closed notice — was floating on its own colour.
   Dark drops to `--background`, the one surface guaranteed to be under
   `--card` on that ramp. */
export const CHAT_CANVAS = "bg-muted/30 dark:bg-background";

/* ── Elevation ─────────────────────────────────────────────────────────────
 *
 * Two steps, and only two, so "raised" means one thing across the workspace.
 *
 * Each is a triple: a hairline contact shadow so the edge does not float free
 * of the surface, a wide soft shadow for the lift itself, and a one-pixel
 * inset highlight along the top edge. That last one is what actually sells it
 * — a shadow alone reads as a drop shadow, a shadow plus a lit top edge reads
 * as an object with a thickness. The highlight is white at 6-9%, which is
 * invisible on a white card in the light theme and is exactly what the dark
 * ones need.
 *
 * The shadows are neutral black rather than tinted: a coloured shadow under a
 * white card is a coloured card, and these sit under six different accents.
 */
export const RAISED = cn(
  "shadow-[0_1px_2px_rgb(0_0_0/0.06),0_6px_16px_-8px_rgb(0_0_0/0.18)]",
  "dark:shadow-[0_1px_2px_rgb(0_0_0/0.5),0_6px_16px_-8px_rgb(0_0_0/0.55)]",
  "ring-1 ring-inset ring-white/[0.06] dark:ring-white/[0.05]"
);

/** The one that has to look like it is off the page — see the details pane. */
export const FLOATING = cn(
  "shadow-[0_2px_4px_rgb(0_0_0/0.07),0_16px_32px_-12px_rgb(0_0_0/0.26)]",
  "dark:shadow-[0_2px_4px_rgb(0_0_0/0.55),0_18px_36px_-12px_rgb(0_0_0/0.7)]",
  "ring-1 ring-inset ring-white/[0.09] dark:ring-white/[0.07]"
);

export { Minus as DashIcon, TriangleAlert as WarnIcon };
