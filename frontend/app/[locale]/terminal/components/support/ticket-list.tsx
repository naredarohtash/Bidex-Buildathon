"use client";

/**
 * Every ticket this person has, down the left.
 *
 * The panel this replaces put tickets behind a tab, which meant that opening
 * support to check on yesterday's problem started with a screen that did not
 * mention it — a "How can we help?" card, two big buttons and three topic
 * rows, none of which was the thing you came back for. Somebody who has an
 * open ticket almost always came back for the open ticket.
 *
 * So the list is not a destination, it is the furniture: always there, always
 * showing where every conversation stands, and the one control above it opens
 * a new one. It is the same relationship a mail client has with its message
 * list, for the same reason.
 *
 * Rows report where a ticket *stands* rather than what it is filed under.
 * Category and priority live in the detail pane; what a list of tickets has to
 * answer at a glance is "is anyone waiting on me?", and that is one mark, one
 * line of the last thing said, and how long ago.
 */

import { memo, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Inbox, Plus, Search, SearchX, Loader2, Ticket as TicketIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SupportIcon } from "../layout/terminal-icons";
import { categoryOf } from "./support-catalog";
import { type Ticket, type TicketStatus } from "./use-tickets";
import { CATEGORY_MARK } from "./support-marks";
import {
  ACCENT,
  EmptyNote,
  FIELD,
  PRIMARY_BUTTON,
  SLA_PROMISE,
  CategoryChip,
  StatusPill,
  shortAgo,
  stateOf,
  ticketRef,
  type TicketState,
} from "./support-kit";

/**
 * The four places a ticket can be, from the reader's chair.
 *
 * Two before, "open" and "all", which hid the one distinction that matters
 * inside a bucket: whether the ticket is sitting with support or sitting with
 * you. A person with six open tickets wants to know which one is waiting on
 * *them*, and "open" cannot answer that.
 *
 * These map onto the wire enum without inventing anything — `PENDING` and
 * `REPLIED` both mean support has the ball, `OPEN` means they answered and it
 * is back with the reader. Those names are written from the system's point of
 * view; these are written from theirs.
 */
/**
 * Two buckets, not six.
 *
 * There were six — All and each of the five states — and on a 316px column
 * they wrapped onto two rows and became a wall of chips above the thing they
 * were meant to filter. Six ways to slice eleven tickets is not a feature.
 *
 * The five states still exist and still show on every row; this is the one
 * cut worth making a control out of, because it is the only one somebody
 * actually arrives wanting: is this thing still going, or is it done. The
 * finer distinction — whether an open ticket is waiting on support or on you
 * — is a glance down the rows, not a click.
 */
type Filter = "open" | "resolved";

const FILTERS: Array<{ id: Filter; label: string; done: boolean }> = [
  { id: "open", label: "Open", done: false },
  { id: "resolved", label: "Resolved", done: true },
];

/** The one state where the reader is the one being waited on. */
const isUnanswered = (status: TicketStatus) => status === "OPEN";

export const TicketList = memo(function TicketList({
  tickets,
  loading,
  selectedId,
  onSelect,
  onNew,
  composing,
}: {
  tickets: Ticket[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  /** True while the new-ticket flow is open, so nothing in the list looks selected. */
  composing: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("open");

  /* State resolved once per ticket rather than in every place that draws one:
     the row, the count and the filter all have to agree, and three callers
     each deriving it is three chances to disagree. */
  const states = useMemo(() => new Map(tickets.map((t) => [t.id, stateOf(t)])), [tickets]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { open: 0, resolved: 0 };
    for (const t of tickets) out[t.status === "CLOSED" ? "resolved" : "open"]++;
    return out;
  }, [tickets]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => (filter === "resolved") === (t.status === "CLOSED"))
      .filter((t) => {
        if (!q) return true;
        const category = categoryOf(t.tags, t.subject)?.label || "";
        /* The short reference is searchable because it is the one thing on
           the row somebody will have written down. */
        return `${t.subject} ${category} ${t.id} ${ticketRef(t.id)}`.toLowerCase().includes(q);
      })
      /* Most recently moved first, whichever side moved it. `updatedAt` rather
         than `createdAt`: a three-week-old ticket an agent answered an hour ago
         is the one you came here for. */
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [tickets, filter, query, states]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-border bg-muted/25 dark:bg-background lg:w-[316px] lg:shrink-0 lg:border-r">
      {/* ── Whose desk this is ─────────────────────────────────────────────
          The workspace opened straight onto a blue button with no title on it
          anywhere — three panes and nothing saying what the screen was. This
          band is that, and it is also where the blue enters: a 5% brand wash
          across the top of all three panes, so they are topped by one
          continuous header rather than by three unrelated bars.

          The response time is here rather than in a card of its own because it
          is the one thing somebody wants to know *before* they write anything,
          and the panel this replaces buried it under a fold of marketing
          ("24/7 Support", "Expert Agents", "Fast Response" — three claims and
          no information). */}
      <div className="shrink-0 border-b border-border bg-brand/[0.05] px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          {/* The rail's own Support glyph, not a lucide stand-in. It is the
              icon somebody clicked to get here and the one they will look for
              in the bar afterwards, and two different marks for one
              destination is two things to learn. Sized down from its native
              22px through the wrapper, because the file hard-codes its own
              width and height. */}
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand ring-1 ring-inset ring-brand/20 [&>svg]:h-[19px] [&>svg]:w-[19px]">
            <SupportIcon />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold leading-tight text-foreground">
              Support Desk
            </span>
            {/* It said "Agents online · replies in ~2h", which is two claims
                this screen is in no position to make: it does not know how
                many agents are on shift and it does not know the depth of the
                queue, so a green pulsing dot was a promise made by a stylesheet.
                What is left is the one commitment the product can actually be
                held to, and it is not written here — it is derived from the
                same table the details pane measures every ticket against, so
                the promise and the measurement cannot drift apart. */}
            <span className="mt-[2px] block text-[11.5px] leading-none text-muted-foreground">
              {SLA_PROMISE}
            </span>
          </span>
        </div>
      </div>

      {/* ── The one action ─────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-3 pb-3 pt-3">
        <button type="button" onClick={onNew} className={cn(PRIMARY_BUTTON, "w-full py-2.5")}>
          <Plus className="h-4 w-4" strokeWidth={2.6} />
          New ticket
        </button>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets"
              aria-label="Search tickets"
              className={cn(FIELD, "py-1.5 pl-8 text-[12.5px]")}
            />
          </div>
        </div>

        {/* A switch, not two buttons.
        
            Two chips side by side are two independent controls that happen to
            be mutually exclusive, and nothing about them says the second one
            turns the first off. A segmented track says it before it is read:
            one groove, one thumb, and the thumb is somewhere. It is the same
            control the terminal's settings use, so it is also a shape this
            product already owns. */}
        <div
          role="tablist"
          aria-label="Filter tickets"
          className="relative mt-2.5 flex rounded-lg border border-border bg-foreground/[0.05] p-0.5"
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 py-1.5",
                  "text-[12px] font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active ? (f.done ? "text-verified" : "text-brand") : "text-muted-foreground hover:text-foreground"
                )}
              >
                {/* The thumb is a shared `layoutId`, so switching slides it
                    across rather than fading one panel out and another in —
                    two events for one action. framer-motion rather than a CSS
                    transition because `styles/theme.css` sets `transition` on
                    `*` for colour only, which resets `transition-property` and
                    kills every transform in the app. See the note in ./dock. */}
                {active && (
                  <motion.span
                    layoutId="support-filter-thumb"
                    transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.7 }}
                    /* The thumb has to be *lighter* than the groove, and on a
                       dark ground `bg-card` is not. The track is a 5% white
                       wash over the column, so a card-coloured thumb sits two
                       points *below* the groove it is supposed to be raised
                       out of — correct in light, where the card is white on a
                       grey track, and inverted in dark and navy, where it was
                       the reason the selected tab could not be found. */
                    className={cn(
                      "absolute inset-0 rounded-[7px] border bg-card shadow-sm dark:bg-foreground/[0.14] dark:shadow-none",
                      f.done ? "border-verified/30" : "border-brand/30"
                    )}
                  />
                )}
                <span className="relative">{f.label}</span>
                {counts[f.id] > 0 && (
                  <span
                    className={cn(
                      "relative rounded px-1 text-[10.5px] font-semibold tabular-nums",
                      active
                        ? f.done
                          ? "bg-verified/15 text-verified"
                          : "bg-brand/15 text-brand"
                        : "bg-foreground/[0.09] text-foreground/70"
                    )}
                  >
                    {counts[f.id]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── The list ───────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <EmptyNote
            icon={query.trim() ? SearchX : Inbox}
            title={
              query.trim()
                ? "Nothing matches"
                : filter === "open"
                  ? "No open tickets"
                  : "Nothing resolved yet"
            }
            body={
              query.trim()
                ? "Try the ticket's subject, or the other tab."
                : filter === "open"
                  ? "Anything finished is under Resolved."
                  : "Tickets you close will be kept here."
            }
          />
        ) : (
          <ul className="flex flex-col gap-1.5 p-2">
            {shown.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                state={states.get(ticket.id) ?? "open"}
                selected={!composing && ticket.id === selectedId}
                onSelect={() => onSelect(ticket.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
});

const TicketRow = memo(function TicketRow({
  ticket,
  state,
  selected,
  onSelect,
}: {
  ticket: Ticket;
  state: TicketState;
  selected: boolean;
  onSelect: () => void;
}) {
  const waiting = isUnanswered(ticket.status);
  const category = categoryOf(ticket.tags, ticket.subject);
  const Mark = category ? CATEGORY_MARK[category.id] : undefined;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          /* A card each, with a real edge.

             They were rows on a shared wash separated by nothing but the gap
             between them, and on the light theme — where the column and the
             card are both near-white — there was no visible boundary at all:
             three tickets read as one block of text. A border and a surface
             per row is the difference between a list of things and a
             paragraph. */
          /* A column, not a glyph beside a column.
          
             The ticket mark used to sit outside the text as a 32px flex item,
             so every subject was written in a lane 40px narrower than the card
             it is in — and a subject is the one thing on this row anybody
             reads. "I sent funds on the wrong network or to the wrong address"
             wrapped to three lines against a rail of white space. The mark now
             rides the reference line above it, where there was room anyway,
             and the subject gets the full width. */
          "relative flex w-full flex-col gap-1 overflow-hidden rounded-lg border px-2.5 py-2.5 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          selected
            ? "border-brand/35 bg-brand/[0.06]"
            : "border-border bg-card hover:border-foreground/20 hover:bg-foreground/[0.02]"
        )}
      >
        {/* The same edge mark the account rail uses for "you are here", so the
            two navigations in this terminal say it the same way — but in the
            category's own colour, which makes it a second reading of what the
            open ticket is about rather than one more grey bar. */}
        {selected && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-0 left-0 w-[3px]",
              category ? ACCENT[category.accent].edge : "bg-foreground/70"
            )}
          />
        )}

        {/* The reference line: the mark, the number, the time.
        
            A ticket drawn as a ticket — the row opened with a 12px status
            disc, which is a mark you have to already know how to read — and it
            carries the category's colour, so what the thing is about is
            legible from the glyph alone. It sits on this line rather than
            beside the whole card, because this is the line with room on it. */}
        <span className="flex w-full items-center gap-2">
          {/* The category's own drawn mark, the one the new-ticket flow opens
              with — so a deposit is the same object on the screen where you
              choose it and on the row it becomes. A generic ticket glyph in a
              tinted circle sat here before, which meant the list had a shape
              for "ticket" and the wizard had a shape for "deposit" and the two
              screens never agreed on what they were showing. Uncategorised
              tickets keep the glyph; there is no object to draw. */}
          {Mark ? (
            <span className="flex shrink-0">
              <Mark size={26} />
            </span>
          ) : (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground/[0.07] text-muted-foreground">
              <TicketIcon className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
          )}
          <span className="truncate font-mono text-[12px] font-semibold tracking-tight text-foreground/80">
            {ticketRef(ticket.id)}
          </span>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {shortAgo(new Date(ticket.updatedAt).getTime())}
          </span>
        </span>

        <span className="flex w-full min-w-0 flex-col gap-1">

          {/* The subject, and nothing else on it.

              A line of the last message used to sit under this, and it was
              noise dressed as information: half of a support thread's messages
              are "ok", "hooo", "I am unable to see this", so the preview mostly
              told the reader which of their tickets had the least useful last
              word in it. */}
          <span
            className={cn(
              "text-[13px] leading-[18px]",
              /* Weight, not colour. A closed ticket is still a ticket you can
                 read; greying the subject makes half the list look disabled. */
              waiting ? "font-semibold text-foreground" : "font-medium text-foreground/85"
            )}
          >
            <span className="line-clamp-2">{ticket.subject}</span>
          </span>

          {/* Two tags, drawn as tags.
          
              The category was set in plain grey text beside a solid status
              pill, which made one of the row's two facts look like a caption
              for the other. They are the same kind of fact — what this ticket
              is about, and where it has got to — so they are the same kind of
              object: the category in its own colour through `CategoryChip`,
              which is the chip the thread header and the details pane already
              use, and the state through `StatusPill`, which is the pill they
              already use. Nothing on this row is now a lesser class of the
              thing it is beside. */}
          <span className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            {category ? (
              <CategoryChip category={category} size="sm" />
            ) : (
              <span className="text-[11px] text-muted-foreground">Uncategorised</span>
            )}
            <StatusPill state={state} compact />
          </span>
        </span>
      </button>
    </li>
  );
});

export default TicketList;
