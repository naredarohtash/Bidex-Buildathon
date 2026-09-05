"use client";

/**
 * Everything about the ticket that is not the conversation.
 *
 * Third column on a wide screen, a sheet over the thread below `xl`. It exists
 * because the header of a chat can carry about two facts before it stops being
 * a header, and a support ticket has a dozen: who is handling it, whether they
 * were quick, what it is filed under, where it was routed, which payment it
 * concerns, every file anyone attached, and the reference number an agent will
 * ask for on the phone.
 *
 * ── What this pass changed ───────────────────────────────────────────────
 *
 * It was a column of grey captions over grey values — every row the same
 * weight, the same colour, and in the same order as the interface that
 * happened to build them. Nothing on it could be found without reading all of
 * it, which for a pane whose whole job is "answer a question at a glance" is
 * the one failure that matters.
 *
 * Three changes:
 *
 * - **A summary at the top.** Status, priority and where the ticket sits
 *   against its target, in one block, on the category's own colour. That is
 *   the answer to "what is happening with my ticket"; everything below it is
 *   the detail behind that answer.
 * - **Colour that means the subject.** The category carries a hue — see
 *   `ACCENT` in ./support-kit — and it is used in exactly three places: the
 *   summary's edge, the category chip, and the section marks. State keeps the
 *   theme's own tokens, so a red still only ever means something is wrong.
 * - **Derived facts, not stored ones.** The department and the service level
 *   are both computed: routing is a fact about how support is organised, and
 *   `responseTime` on its own tells nobody anything until it is read against
 *   the promise made for that priority. Neither is a column, and neither can
 *   go stale.
 *
 * There is no "product" row and there is not going to be. A ticket belongs to
 * a *subject* — the category — and support is organised into teams, which is
 * the department. A third name for the same thing is a third thing to keep in
 * step.
 */

import { memo, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowDown,
  Languages,
  Ban,
  Check,
  CircleSlash,
  Reply,
  Ticket as TicketIcon,
  Clock3,
  Headphones,
  Loader2,
  Timer,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canonicalZoneId, findZone, utcOffset } from "@/lib/time-zones";
import { renderTzFlag } from "@/components/blocks/chart-switcher/pair-info-control";
import { TIME_ZONE_KEY } from "../../lib/time-zone-sync";
import { CopyValue } from "../modals/account/copy-value";
import { categoryOf, freeTagsOf, topicOf, transactionIdOf } from "./support-catalog";
import { fileNameOf, isImageUrl, type Ticket, type ThreadMessage } from "./use-tickets";
import {
  AttachmentTile,
  CategoryChip,
  FLOATING,
  ImportanceMeter,
  QUIET_BUTTON,
  SLA_TONE,
  StatusPill,
  ticketRef,
  Tag,
  humanMinutes,
  tableTime,
  slaFor,
  stateOf,
  type TicketState,
} from "./support-kit";
import { TransactionLine, referenceOf, type TxnRow } from "./transaction-picker";

export const TicketDetails = memo(function TicketDetails({
  ticket,
  messages,
  transaction,
  transactionsLoading,
  onClose,
  onDismiss,
  closing,
  onOpenImage,
  isMobile = false,
}: {
  ticket: Ticket;
  messages: ThreadMessage[];
  /** Resolved from the ticket's `txn:` tag, or null if it has none. */
  transaction: TxnRow | null;
  transactionsLoading: boolean;
  onClose: () => void;
  /** Only on the narrow layout, where this pane is a sheet. */
  onDismiss?: () => void;
  closing: boolean;
  onOpenImage: (url: string, gallery: string[]) => void;
  /** See the same prop on ./ticket-thread — the phone's floating dismiss. */
  isMobile?: boolean;
}) {
  const params = useParams();
  const locale = (params?.locale as string) || "en";

  const category = categoryOf(ticket.tags, ticket.subject);
  const topic = topicOf(ticket.tags);
  /* A tag that only repeats what the Category field says is not information,
     it is the same word twice — and it is the common case rather than a rare
     one, because the panel this replaced wrote the category in as a bare tag
     and that is exactly what `categoryOf` now reads to work the category out.
     So the ticket that gives us "Verification" is guaranteed to show
     "verification" underneath it unless this filters. */
  const freeTags = useMemo(() => {
    const shown = new Set(
      [category?.id, category?.label, topic?.id, topic?.label]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase())
    );
    return freeTagsOf(ticket.tags).filter((t) => !shown.has(t.toLowerCase()));
  }, [ticket.tags, category, topic]);
  const linkedId = transactionIdOf(ticket.tags);

  /* The trader's own clock, the one they picked for the chart. Falls back to
     the browser's, and to UTC when even that is unrecognised, so it never
     renders empty. */
  const zone = useMemo(() => {
    const stored =
      (typeof window !== "undefined" && localStorage.getItem(TIME_ZONE_KEY)) ||
      (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
    return (
      findZone(canonicalZoneId(stored)) || {
        id: "UTC",
        label: "UTC",
        name: "Universal Time",
        flagCode: "GLO",
      }
    );
  }, []);
  const zoneOffset = useMemo(() => utcOffset(zone.id), [zone.id]);

  /* The language written the way it is written in itself — "Deutsch", not
     "German" — because that is the name the person reading it recognises. */
  const languageName = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "language" }).of(locale) || locale.toUpperCase();
    } catch {
      return locale.toUpperCase();
    }
  }, [locale]);

  const files = useMemo(() => messages.flatMap((m) => m.attachments), [messages]);
  const gallery = useMemo(() => files.filter(isImageUrl), [files]);

  const sla = useMemo(
    () => slaFor(ticket.importance, ticket.responseTime, new Date(ticket.createdAt).getTime()),
    [ticket.importance, ticket.responseTime, ticket.createdAt]
  );

  const agentName =
    ticket.agentName ||
    [ticket.agent?.firstName, ticket.agent?.lastName].filter(Boolean).join(" ") ||
    null;

  return (
    /* A recessed well, not a third flat column.
    
       The pane is a stack of separate facts, and a stack of facts drawn as
       bordered rectangles on the same wash as the rectangles is a list of
       hairlines — you can see there are eight of something but not that any
       one of them is a thing. Sinking the ground and lifting the cards off it
       gives every block an edge the eye reads before it reads a word.
    
       The inner shadow along the left is what makes it a well rather than a
       darker column: light falls from the top, so the wall nearest the
       conversation casts. It is 12px of blur at 40% and does not survive a
       screenshot on its own — it survives as the reason the pane looks
       inset. */
    <aside
      className={cn(
        "flex h-full min-h-0 w-full min-w-0 flex-col border-border bg-muted/50 dark:bg-background p-2.5",
        "shadow-[inset_10px_0_20px_-14px_rgb(0_0_0/0.45)]",
        "xl:w-[338px] xl:shrink-0 xl:border-l"
      )}
    >
      {/* The pane is a card, not a column.
      
          Its header used to run edge to edge and butt straight into the rule
          between this and the conversation, so the blue strip and the divider
          fused into one L-shaped piece of chrome and the pane read as part of
          the window frame. Inset on all four sides and given the same rounded,
          raised treatment as the blocks inside it, it reads as what it is: the
          ticket itself, lifted off the desk, with the conversation continuing
          underneath. */}
      <div
        className={cn(
          /* Tighter at the top than the bottom. A 12px radius under a filled
             blue strip cuts a visible bite out of each top corner and the
             header stops reading as a band; 6px keeps the edge crisp and still
             says the pane is a card. The bottom keeps the larger radius —
             there is no fill there for a curve to eat into. */
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-md rounded-b-xl border border-border bg-card",
          FLOATING
        )}
      >
      {/* The band is the workspace's own blue, at 5%, so the three panes are
          topped by one continuous header rather than by three unrelated bars.
          See the matching wash on the list and the thread. */}
      {/* No bar. The title is the first line of the record, set like one.

          It was a filled blue strip with the title reversed out of it, which
          is a *window* header — the chrome a panel gets when it is a separate
          thing you opened. This pane is a document about the ticket, and a
          document starts with its own name in its own ink. The workspace's
          blue is still on the New ticket button and through the thread, so
          nothing has lost the theme; what has gone is a band of it sitting
          above content that is not blue. */}
      {/* White ground, tinted fields — not the other way round.
      
          It was a recessed grey with grey fields on it, which put a 3% wash
          against a 3.5% one: two surfaces half a point apart, so nothing had
          an edge and the whole column read as muddy. A record reads as light
          boxes on a light page, which is also what makes the *values* the only
          things with any weight on them. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-card px-3.5 pb-4 pt-3.5">
        <div className={cn("mb-3 flex items-start justify-between gap-2", isMobile && "pr-10 xl:pr-0")}>
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">
              Ticket details
            </h3>
            {/* The reference, directly under the name of the thing it
                references. It was at the bottom of the attributes table, which
                is where you put a fact nobody needs — and this is the one
                string a person reads out on the phone or pastes into an
                email. */}
            <div className="mt-1">
              <CopyText value={ticket.id} display={ticketRef(ticket.id)} />
            </div>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Hide details"
              className="-mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground xl:hidden"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
          )}
        </div>

        {/* Label above, value in a box.
        
            The pane was eight cards, each with an uppercase caption and a
            tinted icon tile — which is a lot of chrome to say "here is one
            fact", and it made a column of simple values look like a dashboard.
            A plain label in ordinary sentence case, with its value in a quiet
            field underneath, is how a form reads and how a record reads, and
            it lets the values be the only things with any weight on them.
        
            The category's colour has not gone: it is on the chip, which is the
            one place in here that is *about* the category. */}
        <div className="flex flex-col gap-3">
          {/* Who is reading it, and what clock they are on.

              An agent answering at 09:00 their time needs to know that is
              02:30 at the other end before promising "later today", and the
              language is the difference between replying in English and
              replying at all. Both are read from the session rather than
              stored on the ticket: the zone is the one the trader picked for
              their own chart — see terminal/lib/time-zone-sync — and the
              language is the locale the app is being served in. Neither is a
              guess, and neither needs a column. */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Language">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                <Languages className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2} />
                <span className="truncate">{languageName}</span>
              </span>
            </Field>
            <Field label="Time zone">
              <span className="flex min-w-0 items-center gap-1.5">
                {renderTzFlag(zone.id, zone.label)}
                <span className="truncate text-[13px] font-medium text-foreground">{zone.label}</span>
                <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                  {zoneOffset}
                </span>
              </span>
            </Field>
          </div>

          {/* Status and service level in one box.
          
              They were two labelled groups answering halves of the same
              question — where does this stand, and are we late — and a reader
              checking on a ticket wants both in the same glance. Two labels
              and two boxes for that is a label and a box too many. */}
          <Field label="Status">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill state={stateOf(ticket)} />
              <ImportanceMeter importance={ticket.importance} withLabel />
            </div>
            {/* `responseTime` alone tells nobody anything — 26 minutes is
                excellent for a question and slow for missing money. Read
                against the target for that priority it becomes an answer. */}
            <div className="mt-2 flex items-start gap-2 border-t border-border pt-2">
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] font-semibold ring-1 ring-inset",
                  SLA_TONE[sla.state]
                )}
              >
                <Clock3 className="h-3 w-3" strokeWidth={2.4} />
                {sla.label}
              </span>
              <span className="min-w-0 flex-1 text-[11.5px] leading-[16px] text-muted-foreground">
                {sla.detail}
              </span>
            </div>
          </Field>

          {/* Category and department, side by side.

              They were stacked, with the department as a muted line under the
              chip — which reads as a footnote on the category rather than as
              its own fact, and the department is what tells somebody their
              ticket went to a desk rather than into a queue. Parallel columns
              say they are two answers of equal standing: what is this, and who
              has it. */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              {category ? (
                <CategoryChip category={category} />
              ) : (
                /* Nothing in the tags and nothing in the subject gave it away.
                   Rare, and it says so plainly rather than pretending. */
                <span className="text-[12.5px] text-muted-foreground">Unfiled</span>
              )}
            </Field>
            <Field label="Department">
              <span className="text-[13px] font-medium leading-[17px] text-foreground">
                {category ? category.department : "To be routed"}
              </span>
            </Field>
          </div>

          {/* The topic only when it says something the subject does not — a
              ticket opened through the wizard takes the topic verbatim as its
              subject. */}
          {topic && topic.label.trim() !== ticket.subject.trim() && (
            <Field label="About">
              <span className="text-[12.5px] leading-[17px] text-foreground/85">{topic.label}</span>
            </Field>
          )}

          <Field label="Assigned to">
            {agentName ? (
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-brand/15 text-brand ring-1 ring-inset ring-brand/20">
                  {ticket.agent?.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ticket.agent.avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Headphones className="h-4 w-4" strokeWidth={2.1} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-foreground">
                    {agentName}
                  </span>
                  <span className="block text-[11.5px] leading-tight text-muted-foreground">
                    Support agent
                  </span>
                </span>
              </div>
            ) : (
              /* Honest about the queue rather than inventing an owner. */
              <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                <Timer className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                In the queue, not yet picked up
              </p>
            )}
          </Field>

          {linkedId && (
            <Field label="Linked payment" bare>
              {transaction ? (
                <div className={cn("overflow-hidden p-0", FIELD_BOX)}>
                  <div className="px-3.5 py-3">
                    <TransactionLine row={transaction} />
                  </div>
                  {/* The reference in full, as an attributes row rather than
                      through `CopyValue` — that control draws its own
                      uppercase caption, which is the one type style this pane
                      no longer uses anywhere. `TransactionLine` truncates the
                      reference for the dropdown it was built for; here it is
                      the single most useful string on the card. */}
                  {referenceOf(transaction) && (
                    <div className="border-t border-border">
                      <Attribute label="Reference">
                        <CopyText value={referenceOf(transaction)} />
                      </Attribute>
                    </div>
                  )}
                </div>
              ) : (
                <div className={FIELD_BOX}>
                  {transactionsLoading ? (
                    <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Looking it up…
                    </p>
                  ) : (
                    <>
                      {/* The tag survives a payment that has rolled off the
                          page this fetches. The id beats nothing — it is what
                          an agent searches. */}
                      <p className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <CircleSlash className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                        Not in your recent history
                      </p>
                      <CopyValue label="Transaction ID" value={linkedId} />
                    </>
                  )}
                </div>
              )}
            </Field>
          )}

          {files.length > 0 && (
            <Field label={`Attachments (${files.length})`}>
              {/* Small here. These are a reminder that files exist and a way
                  into the viewer; the thread above is where they are actually
                  looked at, at full size. */}
              <div className="flex flex-wrap gap-1.5">
                {files.map((url, i) => (
                  <AttachmentTile
                    key={`${url}-${i}`}
                    url={url}
                    name={fileNameOf(url)}
                    isImage={isImageUrl(url)}
                    compact
                    onOpen={isImageUrl(url) ? () => onOpenImage(url, gallery) : undefined}
                  />
                ))}
              </div>
            </Field>
          )}

          {freeTags.length > 0 && (
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5">
                {freeTags.map((tag) => (
                  <Tag key={tag} label={tag} />
                ))}
              </div>
            </Field>
          )}

          {/* One box, several rows — the shape a record has everywhere. Three
              separate fields for three one-line facts would be three labels
              nobody reads and a lot of vertical space for very little. */}
          {/* What has happened to it, in order.

              The pane could say the ticket was opened on one date and last
              touched on another, and left the reader to work out whether
              anything happened in between. A support ticket has a shape —
              raised, answered, settled — and that shape is what somebody opens
              this pane to check. Every step is real: `createdAt`,
              `createdAt + responseTime`, and `updatedAt` on a closed ticket. A
              step that has not happened is drawn as not having happened rather
              than left out, because "no first reply yet" is itself the answer
              to the question being asked. */}
          <div>
            <p className="mb-1 text-[12.5px] font-semibold leading-tight text-foreground">
              Progress
            </p>
            <div className={cn("px-0 py-1.5", FIELD_BOX)}>
              <Timeline ticket={ticket} />
            </div>
          </div>

          {/* No Attributes table.
          
              It ended up as a place to put facts that had nowhere else to go —
              channel ("Ticket", on every ticket), a message count, a file
              count that the Attachments heading above was already giving. None
              of it was a thing anybody opened this pane to find out, and three
              rows of it sat under a heading a size larger than every real
              section on the page.
          
              The one row that mattered was the reference, and it is at the top
              now, under the name of the thing it references. */}
        </div>
      </div>

      {/* ── The one destructive control, at the bottom where they live ─── */}
      {ticket.status !== "CLOSED" && (
        <div className="shrink-0 border-t border-border bg-foreground/[0.03] p-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={closing}
            className={cn(QUIET_BUTTON, "w-full hover:border-danger/35 hover:bg-danger/10 hover:text-danger")}
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" strokeWidth={2.1} />}
            {closing ? "Closing…" : "Close this ticket"}
          </button>
          {/* Closing cannot be undone from here — the reply route refuses a
              closed ticket and there is no reopen. Said before the click, not
              in a dialog after it. */}
          <p className="mt-1.5 text-center text-[11px] leading-[15px] text-muted-foreground">
            Closed tickets cannot be reopened. You can always open a new one.
          </p>
        </div>
      )}
      </div>
    </aside>
  );
});

/**
 * A label, and its value in a quiet box.
 *
 * `bare` skips the box for a value that brings its own — the linked payment
 * and the attributes table are both bordered containers already, and a box
 * inside a box is a border nobody asked for.
 *
 * The wash is `--foreground` at 3.5% rather than `--muted`: this sits on a
 * card that is itself on a recessed ground, and `--muted` is within half a
 * point of `--card` on the dark ramp, so a muted field would have vanished on
 * exactly the theme that needed it most. A fraction of the foreground is
 * always a step away from whatever is behind it, in whichever direction that
 * theme needs.
 */
function Field({
  label,
  bare = false,
  children,
}: {
  label: string;
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    /* Fills its cell. Two of these sit side by side in a grid — Language and
       Time zone, Category and Department — and "Identity & compliance" wraps to
       two lines in a 150px column while "Verification" does not. Without this
       the taller value made one box 54px and left the other at 38, and a pair
       of fields at different heights reads as a fault rather than as a longer
       word. */
    <div className="flex min-w-0 flex-col">
      <p className="mb-1 text-[12.5px] font-semibold leading-tight text-foreground">{label}</p>
      {bare ? children : <div className={cn(FIELD_BOX, "flex-1")}>{children}</div>}
    </div>
  );
}

/**
 * The box a value sits in.
 *
 * `--muted` at 40% over a card, which in the light theme is the near-white
 * grey a form field is, and in dark falls back to a fraction of the
 * foreground — `--muted` is within half a point of `--card` on that ramp, so a
 * muted field would be invisible on exactly the theme that needs it most.
 *
 * Padding and type are a step up from where they were: 12px text in a 10px
 * box is a caption, and every one of these is a fact somebody came here to
 * read.
 */
const FIELD_BOX = cn(
  /* 38px and 8px of padding, not 46 and 12.
  
     Most of these hold a single short line — a department, a state, a chip —
     and a 46px box around "Payments" is a form control's worth of furniture
     for one word. The reference fits eight groups in the height this pane was
     spending on five. The minimum still exists so that a one-line value and a
     chip make boxes of the same height; it is just set to what a line of 13px
     text with 8px above and below actually needs. */
  "min-h-[38px] rounded-lg border border-border bg-muted/30 px-3 py-2",
  "dark:bg-foreground/[0.045]"
);

/**
 * A value you can copy, with no control drawn around it.
 *
 * This was a whole row with a copy glyph pinned to its right edge — the only
 * icon in the table, sitting beside one of four values and making that row
 * look like the important one. It is not important, it is just the one worth
 * pasting.
 *
 * So the value *is* the button: click it and it copies, and the only feedback
 * is the word "Copied" replacing it for a moment. `display` shows the short
 * reference while copying the full id — `#A28D89` is what you read out, the
 * UUID is what you paste — and the title carries the full value, so a row
 * that shows one and copies the other is never silent about it.
 */
function CopyText({ value, display }: { value: string; display?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`${value} — click to copy`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* A refused clipboard is not worth a dialog — the value is on
             screen and can be selected by hand. */
        }
      }}
      className={cn(
        "max-w-full truncate rounded text-left font-mono text-[12.5px] font-medium",
        "underline decoration-transparent underline-offset-2 transition-colors",
        "hover:decoration-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        done ? "text-verified" : "text-foreground"
      )}
    >
      {done ? "Copied" : display || value}
    </button>
  );
}

/**
 * Opened, answered, settled — as the same three tags the rest of the product
 * uses, and how long each step took.
 *
 * The steps were labelled in prose — "Opened", "First reply", "Closed" — which
 * made this the one place in the workspace where a ticket's state was written
 * as a word rather than drawn as its tag. The list rows, the thread header and
 * the Status field above all use `StatusPill`; so does this now, and a
 * milestone that has not been reached is the same pill at reduced opacity
 * rather than a different kind of thing. Nothing has to be learnt twice.
 *
 * The rail between two steps carries the gap, because the number a person
 * actually wants from a ticket's history is how long they waited, and that is
 * the one figure a column of timestamps makes them work out by subtraction.
 * "Open → 26 min → Replied → 44 days → Resolved" is an account of what
 * happened; three dates are not.
 *
 * Every figure is derived — `createdAt`, `createdAt + responseTime`,
 * `updatedAt` — and nothing is stored for it.
 */
function Timeline({ ticket }: { ticket: Ticket }) {
  const opened = new Date(ticket.createdAt).getTime();
  const touched = new Date(ticket.updatedAt).getTime();
  const closed = ticket.status === "CLOSED";
  /* `responseTime` is minutes from opening to the first agent message, written
     by the reply route — so the moment itself is derivable and does not need
     storing twice. */
  const replied =
    typeof ticket.responseTime === "number" && ticket.responseTime >= 0
      ? opened + ticket.responseTime * 60000
      : null;

  const steps: Array<{
    key: string;
    state: TicketState;
    at: number | null;
    icon: React.ElementType;
    note?: string;
  }> = [
    { key: "opened", state: "open", at: opened, icon: TicketIcon },
    replied
      ? { key: "replied", state: "replied", at: replied, icon: Reply }
      : {
          key: "replied",
          state: "awaiting",
          at: null,
          /* A clock, not an hourglass. At 12px an hourglass is two triangles
             touching at a point and reads as a bow tie; a clock face has a
             circle and two hands, which survive the size. It is also the glyph
             the service-level chip already uses for "we are counting". */
          icon: Clock3,
          note: "Waiting on support",
        },
    closed
      ? {
          key: "closed",
          state: ticket.satisfaction ? "resolved" : "closed",
          at: touched,
          icon: Check,
        }
      : { key: "closed", state: "closed", at: null, icon: Activity, note: "Still open" },
  ];

  return (
    <div className="px-3 py-1">
      {steps.map((step, i) => {
        const done = step.at !== null;
        const last = i === steps.length - 1;
        const next = steps[i + 1];
        /* Only when both ends actually happened — a duration measured to an
           event that has not occurred is a countdown, and the service-level
           row above already runs that clock. */
        const gap =
          !last && done && next.at !== null
            ? humanMinutes(Math.max(0, Math.round((next.at - (step.at as number)) / 60000)))
            : null;

        return (
          <div key={step.key} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "relative grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border",
                  done
                    ? "border-brand/30 bg-brand/12 text-brand"
                    : "border-dashed border-border bg-card text-muted-foreground"
                )}
              >
                {/* A pending step breathes. It is the one row here describing
                    something unfinished, and a static outline says "absent"
                    where a pulse says "in progress". */}
                {!done && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-attention/25" />
                )}
                <step.icon className="relative h-3 w-3" strokeWidth={2.4} />
              </span>
              {/* A wire you can see: 2px, rounded, running the full height
                  between the dots, and coloured by whether the path has been
                  walked. It was a 1px `--border` hairline with a gap at each
                  end — about two values of contrast over twelve pixels of
                  actual line, so the steps read as three separate rows rather
                  than as one path. */}
              {!last && (
                <span
                  className={cn(
                    "w-[2px] flex-1 rounded-full",
                    done && next.at !== null
                      ? "bg-brand/30"
                      : "bg-[repeating-linear-gradient(180deg,hsl(var(--foreground)/0.22)_0_3px,transparent_3px_7px)]"
                  )}
                />
              )}
            </div>

            <div className={cn("min-w-0", !last && "pb-3.5")}>
              <div className="flex items-center justify-between gap-2">
                {/* The product's own tag, dimmed when the milestone has not
                    been reached. */}
                <span className={cn("flex min-w-0", !done && "opacity-45 grayscale-[0.35]")}>
                  <StatusPill state={step.state} />
                </span>
                <span className="shrink-0 text-[11.5px] leading-[22px] tabular-nums text-muted-foreground">
                  {step.at !== null ? tableTime(step.at) : "—"}
                </span>
              </div>

              {step.note && (
                <p className="mt-0.5 text-[11px] leading-[15px] text-muted-foreground/80">
                  {step.note}
                </p>
              )}

              {/* The wait, on the rail, in the reader's units. */}
              {gap && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-[2px] text-[10.5px] font-medium text-muted-foreground">
                  <ArrowDown className="h-2.5 w-2.5" strokeWidth={2.6} />
                  {gap} later
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** One row of the attributes table. *//** One row of the attributes table. *//** One row of the attributes table. */
function Attribute({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] items-baseline gap-2 px-3.5 py-[7px]">
      <span className="text-[12.5px] leading-[18px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-[12.5px] font-medium leading-[18px] text-foreground">
        {children}
      </span>
    </div>
  );
}

export default TicketDetails;
