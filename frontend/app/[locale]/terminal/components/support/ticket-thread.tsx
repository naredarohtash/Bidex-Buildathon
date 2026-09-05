"use client";

/**
 * The conversation.
 *
 * Middle of three panes on a wide screen, the whole screen on a phone. It is a
 * chat, so it is built like one: messages in clusters, a day divider where the
 * date changes, and a composer pinned to the bottom that accepts a drop, a
 * paste and a click.
 *
 * ── Clusters ──────────────────────────────────────────────────────────────
 *
 * Sending three files produces four messages on the wire — the wire carries
 * one attachment per message, see ./use-tickets — and four separate bubbles
 * each with their own avatar and timestamp would make one act look like four.
 * A run from the same sender inside `CLUSTER_MS` is drawn as one block with a
 * single stamp, which is both the fix and what a chat client does anyway.
 *
 * ── Closed tickets ────────────────────────────────────────────────────────
 *
 * There is no reopen route, and the reply route refuses a closed ticket with a
 * 403. So the composer is replaced rather than disabled: a disabled textarea
 * invites someone to type into it and find out afterwards. What takes its
 * place is the rating — the one thing still worth doing — and a way to open a
 * fresh ticket if the problem came back.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  Bold,
  Code,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Headphones,
  Info,
  Italic,
  Link2,
  List,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  Receipt,
  Send,
  Star,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/user";
import { categoryOf } from "./support-catalog";
import { ATTACHMENT_ACCEPT, fileNameOf, isImageUrl, type Ticket, type ThreadMessage } from "./use-tickets";
import { useAttachments } from "./use-attachments";
import { SupportIllustration } from "./support-illustration";
import { RichText, applyMark, type MarkKind } from "./rich-text";
import {
  AttachmentTile,
  CHAT_CANVAS,
  CategoryChip,
  doodleLayerStyle,
  PRIMARY_BUTTON,
  RAISED,
  SECONDARY_BUTTON,
  StatusMark,
  StatusPill,
  dayLabel,
  stateOf,
  fullTime,
  shortAgo,
} from "./support-kit";

/** A run of messages from one sender inside this window is one block. */
const CLUSTER_MS = 4 * 60 * 1000;

interface Cluster {
  key: string;
  sender: "user" | "agent";
  time: number;
  messages: ThreadMessage[];
}

function cluster(messages: ThreadMessage[]): Cluster[] {
  const out: Cluster[] = [];
  for (const message of messages) {
    const last = out[out.length - 1];
    if (
      last &&
      last.sender === message.sender &&
      Math.abs(message.time - last.messages[last.messages.length - 1].time) < CLUSTER_MS
    ) {
      last.messages.push(message);
      continue;
    }
    out.push({ key: message.key, sender: message.sender, time: message.time, messages: [message] });
  }
  return out;
}

export function TicketThread({
  ticket,
  messages,
  loading,
  sending,
  onSend,
  onBack,
  onShowDetails,
  detailsOpen,
  onNewTicket,
  onRate,
  onOpenImage,
  isMobile = false,
}: {
  ticket: Ticket | null;
  messages: ThreadMessage[];
  loading: boolean;
  sending: boolean;
  onSend: (text: string, attachments: string[]) => Promise<boolean>;
  /** Phone only: back to the ticket list. */
  onBack?: () => void;
  onShowDetails?: () => void;
  detailsOpen?: boolean;
  onNewTicket: () => void;
  onRate: (score: number) => Promise<boolean>;
  /* The viewer is owned by the workspace, not by this pane: the details pane
     opens the same images from its own gallery, and two viewers that can both
     be open is one viewer too many. */
  onOpenImage: (url: string, gallery: string[]) => void;
  /**
   * The phone layout floats its own dismiss control — a black disc at
   * `top-3 right-3`, above everything — over whatever surface is open. It is
   * the way out of the whole workspace and every full-screen panel in the
   * terminal lives under it, so this header gets out of its way rather than
   * competing for the corner. Without the extra padding the details button sat
   * directly beneath it and could not be tapped at all.
   */
  isMobile?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const attachments = useAttachments();
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragging, setDragging] = useState(false);

  const closed = ticket?.status === "CLOSED";
  const state = ticket ? stateOf(ticket) : "open";
  const clusters = useMemo(() => cluster(messages), [messages]);

  /* Every attachment in the thread, in order, so the lightbox can page through
     the conversation rather than only through the one message it opened from. */
  const gallery = useMemo(
    () => messages.flatMap((m) => m.attachments).filter(isImageUrl),
    [messages]
  );

  /* Pin to the newest message, but only when the reader was already there. A
     jump to the bottom while somebody is reading back through a thread is the
     single most annoying thing a chat view can do. `useLayoutEffect` so it
     lands before paint and the list never visibly jumps. */
  useLayoutEffect(() => {
    if (!atBottom) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [clusters.length, messages.length, atBottom, ticket?.id]);

  /* A new ticket starts at the bottom whatever the previous one's state was. */
  useEffect(() => {
    setAtBottom(true);
    setDraft("");
    attachments.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
  }, []);

  /* The textarea grows with what is typed, up to a ceiling. Reset to `auto`
     first or it can only ever grow — `scrollHeight` on an element already
     sized to its content reports that size, not the content's. */
  const resize = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, []);

  useEffect(resize, [draft, resize]);

  /* Applying a mark is a pure transform on the value plus a caret position —
     see `applyMark`. Restoring the selection has to wait for React to have
     written the new value into the DOM, hence the frame. */
  const mark = useCallback(
    (kind: MarkKind) => {
      const el = textRef.current;
      if (!el) return;
      const next = applyMark(draft, el.selectionStart, el.selectionEnd, kind);
      setDraft(next.value);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.start, next.end);
      });
    },
    [draft]
  );

  const send = useCallback(async () => {
    if (sending || attachments.busy) return;
    const text = draft.trim();
    if (!text && attachments.urls.length === 0) return;
    const sent = await onSend(text, attachments.urls);
    if (sent) {
      setDraft("");
      attachments.clear();
      setAtBottom(true);
      requestAnimationFrame(resize);
    }
  }, [draft, attachments, onSend, sending, resize]);

  if (!ticket) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          /* The illustrated version, not a grey tile.
          
             This is the first thing anybody sees on this screen, and it was a
             20px glyph in a bordered square on an empty pane — the emptiest
             possible reading of an empty state. It shows the same drawing the
             new-ticket flow opens with, so the screen you land on and the
             screen the button takes you to are visibly one place. */
          <div className="flex h-full flex-col items-center justify-center px-8 py-12 text-center">
            {/* No band, no ground. This pane is one drawing and two lines on
                an open surface, and every attempt to give it a panel — a grey
                box, a bordered card, a grid behind the illustration — has made
                it look like something failed to load inside a container. The
                new-ticket flow gets a band because it has a form under it that
                needs a head; this has nothing to head.
            
                Sized by width, not height — see the note on the prop. At 120px
                tall the drawing was 192px wide in the middle of a pane three
                times that, which reads as a placeholder for the picture rather
                than the picture. */}
            <div className="w-full max-w-[486px]">
              <SupportIllustration height="auto" />
            </div>
            <p className="mt-5 text-[18px] font-semibold tracking-[-0.015em] text-foreground">
              Pick a ticket, or start a new one
            </p>
            <p className="mt-1.5 max-w-[42ch] text-[13.5px] leading-[20px] text-muted-foreground">
              Your conversations with support live here. Everything you send stays on this
              account.
            </p>
            <button
              type="button"
              onClick={onNewTicket}
              className={cn(PRIMARY_BUTTON, "mt-4")}
            >
              <Plus className="h-4 w-4" strokeWidth={2.6} />
              New ticket
            </button>
          </div>
        )}
      </div>
    );
  }

  const category = categoryOf(ticket.tags, ticket.subject);

  return (
    <div
      /* `min-w-0` is not decoration.
      
         A flex item's `min-width` defaults to `auto`, which means "never
         narrower than your content" — and `overflow-wrap: break-word`, which
         is what `break-words` sets, wraps a long token when the box is already
         narrow but does *not* reduce the box's min-content width. So a single
         transaction hash in a message made this pane 538px wide inside a 390px
         phone: the header ran off the right edge, the status pill was clipped
         away entirely, and every bubble was cut in half. Nothing looked like a
         wrapping problem, because it was a sizing one. */
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (closed || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        if (closed || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        void attachments.add(e.dataTransfer.files);
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          /* The blue band, third of three — see the note on the list's header.
             Together the panes are topped by one continuous header instead of
             by three bars that happen to be the same height. */
          "flex shrink-0 items-center gap-2.5 border-b border-border bg-brand/[0.05] px-3 py-2.5 md:px-5",
          isMobile && "pr-14 md:pr-14 lg:pr-5"
        )}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to tickets"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight text-foreground">
            {ticket.subject}
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
            {/* The category as its chip rather than as a grey word, so the
                subject line carries the same colour the list row and the
                details pane already use for it. */}
            {category && <CategoryChip category={category} size="sm" />}
            <span className="truncate">
              Opened {shortAgo(new Date(ticket.createdAt).getTime())} ago
            </span>
          </p>
        </div>

        {/* The mark alone on a phone: "Waiting for support" beside a
            two-line subject on a 390px header leaves the subject four
            characters wide. The word is in the details pane, one tap away. */}
        <span className="hidden sm:inline-flex">
          <StatusPill state={state} />
        </span>
        <span className="inline-flex sm:hidden">
          <StatusMark state={state} />
        </span>

        {onShowDetails && (
          <button
            type="button"
            onClick={onShowDetails}
            aria-label="Ticket details"
            aria-pressed={detailsOpen}
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg xl:hidden",
              detailsOpen
                ? "bg-foreground/[0.09] text-foreground"
                : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            )}
          >
            <Info className="h-4 w-4" strokeWidth={2.1} />
          </button>
        )}
      </div>

      {/* ── Messages ───────────────────────────────────────────────────── */}
      {/* The conversation gets its own ground — see `CHAT_CANVAS`. It was
          drawn straight onto the page, so a bordered agent bubble floated on
          nothing and the reader's own messages were the only thing with any
          weight on the screen.

          Two elements rather than one, because the wallpaper must not scroll:
          a pattern that slides under the messages turns a quiet texture into
          motion, and the eye follows motion. The tile sits still and the
          conversation moves over it, the way a wall stays put behind a
          conversation in a room. */}
      {/* One canvas, from the first message to the bottom of the composer.
      
          The composer used to sit outside it on its own `--background` strip
          with a rule above — so the wallpaper stopped at an arbitrary line and
          the box you type in was mounted on a shelf. Bringing it inside means
          the doodles run behind it, there is no rule anywhere, and the card
          floats on the same ground the conversation does. */}
      <div className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col", CHAT_CANVAS)}>
        <div
          aria-hidden
          style={doodleLayerStyle}
          className="pointer-events-none absolute inset-0 bg-foreground/[0.055]"
        />
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="relative min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5"
        >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
            {clusters.map((group, i) => {
              const previous = clusters[i - 1];
              const newDay =
                !previous || new Date(previous.time).toDateString() !== new Date(group.time).toDateString();
              return (
                <div key={group.key} className="flex flex-col gap-3">
                  {newDay && <DayDivider time={group.time} />}
                  <MessageCluster
                    group={group}
                    agentName={ticket.agentName || undefined}
                    agentAvatar={ticket.agent?.avatar || undefined}
                    onOpenImage={(url) => onOpenImage(url, gallery)}
                  />
                </div>
              );
            })}

            {closed && <ClosedNote ticket={ticket} onRate={onRate} />}
          </div>
        )}
        </div>

      {/* Only while there is something below to go back to. */}
      <AnimatePresence>
        {!atBottom && !loading && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            onClick={jumpToBottom}
            aria-label="Jump to the newest message"
            className="absolute bottom-[104px] left-1/2 z-10 grid h-8 w-8 -translate-x-1/2 place-items-center rounded-full border border-border bg-popover text-foreground shadow-lg"
          >
            <ArrowDown className="h-4 w-4" strokeWidth={2.2} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Composer ───────────────────────────────────────────────────── */}
      {closed ? (
        /* Where the composer would be. It is not a call to action — it is the
           reason the composer is missing — so it is drawn as a notice: a lock,
           a sentence, and a way out that is coloured but not filled. A solid
           blue slab here competed with the New ticket button in the list, and
           the two do exactly the same thing.

           Braces would open an object literal in this slot, not a comment. */
        <div className="relative shrink-0 px-3 py-2.5 md:px-5">
          <div className={cn(
            "mx-auto flex w-full max-w-[820px] items-center justify-between gap-3",
            /* A card, like the composer it stands in for — it is in the same
               place and it has to be the same kind of object, or the thread
               looks like it lost a piece. */
            "rounded-2xl border border-border bg-card px-3 py-2",
            "shadow-[0_1px_2px_rgb(0_0_0/0.05)]"
          )}>
            <p className="flex min-w-0 items-center gap-2 text-[12.5px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
              <span className="truncate">
                This ticket is closed. Replies are no longer accepted on it.
              </span>
            </p>
            <button type="button" onClick={onNewTicket} className={SECONDARY_BUTTON}>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
              Open a new ticket
            </button>
          </div>
        </div>
      ) : (
        /* The composer sits on the page rather than on the canvas, so the
           thread visibly ends and the place you type is a different surface
           from the place you read. A braced JSX comment cannot go here — this
           is an expression slot, where the braces open an object literal. */
        <div className="relative shrink-0 px-3 pb-3 pt-1 md:px-5">
          <div className="mx-auto w-full max-w-[820px]">
            {attachments.items.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2.5">
                {attachments.items.map((item) => (
                  <AttachmentTile
                    key={item.id}
                    url={item.url || item.preview}
                    name={item.name}
                    isImage={item.isImage}
                    uploading={item.uploading}
                    onRemove={() => attachments.remove(item.id)}
                  />
                ))}
              </div>
            )}

            {attachments.error && (
              <p role="alert" className="mb-2 text-[12px] font-medium text-danger">
                {attachments.error}
              </p>
            )}

            {/* A card the message is written on, not a field it is typed into.
            
                The difference is the whole look: a `--field` fill with a rule
                above the tools reads as a form control with a strip bolted
                underneath — grey, flat, and clearly a lesser thing than the
                bubbles above it. A card is `--card`, which is white in the
                light theme, and it carries the tools *inside* it with no
                divider at all. The composer becomes the brightest thing on the
                canvas, which is correct: it is where you are going to act.
            
                The formatting buttons write Markdown into the textarea rather
                than manipulating a `contenteditable`. That is not a shortcut —
                it is the reason this panel no longer has an XSS hole. See
                ./rich-text. */}
            <div
              className={cn(
                "rounded-2xl border border-border bg-card px-1.5 pb-1.5 pt-1",
                "shadow-[0_1px_2px_rgb(0_0_0/0.05),0_8px_24px_-12px_rgb(0_0_0/0.18)]",
                "dark:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_8px_24px_-12px_rgb(0_0_0/0.6)]",
                "focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/15"
              )}
            >
              <textarea
                ref={textRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  if (attachments.takePastedFiles(e.clipboardData)) e.preventDefault();
                }}
                onKeyDown={(e) => {
                  /* The shortcuts every editor has. Without them the buttons
                     are the only way to emphasise anything, and nobody reaches
                     for a toolbar mid-sentence. */
                  const mod = e.metaKey || e.ctrlKey;
                  if (mod && (e.key === "b" || e.key === "i")) {
                    e.preventDefault();
                    mark(e.key === "b" ? "bold" : "italic");
                    return;
                  }
                  /* Enter sends, Shift+Enter breaks the line. The old panel
                     used a contenteditable where Enter did neither reliably.
                     IME composition is excluded or the first Enter of a
                     Japanese or Korean word would post the half-typed word. */
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Type your message here…"
                aria-label="Reply"
                className={cn(
                  "min-h-[52px] w-full resize-none border-0 bg-transparent px-2.5 pb-1 pt-2.5",
                  "text-[13.5px] leading-[21px] text-foreground placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-0"
                )}
              />

              {/* No rule above this. A divider turns one object into two, and
                  the tools belong to the box they are sitting in. */}
              <div className="flex items-center gap-0.5 px-1">
                <ToolButton label="Bold" hint="Bold (⌘B)" onClick={() => mark("bold")}>
                  <Bold className="h-[17px] w-[17px]" strokeWidth={2.5} />
                </ToolButton>
                <ToolButton label="Italic" hint="Italic (⌘I)" onClick={() => mark("italic")}>
                  <Italic className="h-[17px] w-[17px]" strokeWidth={2.5} />
                </ToolButton>
                <ToolButton label="Bulleted list" onClick={() => mark("bullet")}>
                  <List className="h-[17px] w-[17px]" strokeWidth={2.2} />
                </ToolButton>
                <ToolButton label="Code" onClick={() => mark("code")}>
                  <Code className="h-[17px] w-[17px]" strokeWidth={2.2} />
                </ToolButton>
                <ToolButton label="Link" onClick={() => mark("link")}>
                  <Link2 className="h-[17px] w-[17px]" strokeWidth={2.2} />
                </ToolButton>

                <span className="mx-1 h-4 w-px shrink-0 bg-border" />

                <ToolButton label="Attach a file" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="h-[17px] w-[17px]" strokeWidth={2.2} />
                </ToolButton>

                <span className="flex-1" />

                {/* Ink, not brand.
                
                    The reference draws this as a near-black square, and it is
                    right for a reason beyond taste: every other blue thing on
                    this screen is a *destination* — New ticket, a link, the
                    details header — and send is the one control that commits
                    something. `--foreground` on `--background` is the highest
                    contrast pair the theme has, it is unmistakably a button,
                    and it inverts cleanly: near-black on white, near-white on
                    the dark palettes. */}
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || attachments.busy || (!draft.trim() && attachments.urls.length === 0)}
                  aria-label="Send"
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                    "bg-foreground text-background",
                    "hover:opacity-90 active:scale-[0.96]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    "disabled:pointer-events-none disabled:bg-foreground/25"
                  )}
                >
                  {sending ? (
                    <Loader2 className="h-[17px] w-[17px] animate-spin" />
                  ) : (
                    <Send className="h-[17px] w-[17px]" strokeWidth={2.3} />
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
      </div>

      {/* A drop target that only appears when something is being dragged over
          it — an outline that is always there is a form control nobody asked
          for. */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-brand/60 bg-background/80"
          >
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Paperclip className="h-4 w-4" strokeWidth={2.2} />
              Drop to attach
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          void attachments.add(e.target.files);
          e.target.value = "";
        }}
      />

    </div>
  );
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

/** One control on the composer's tool rail. */
const ToolButton = memo(function ToolButton({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={hint || label}
      /* `onMouseDown` prevented so the textarea keeps its selection: a button
         that steals focus applies its mark to a caret that has just collapsed,
         which is every formatting toolbar's first bug. */
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground",
        "hover:bg-foreground/[0.07] hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      {children}
    </button>
  );
});

const DayDivider = memo(function DayDivider({ time }: { time: number }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-border" />
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {dayLabel(time)}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
});

const MessageCluster = memo(function MessageCluster({
  group,
  agentName,
  agentAvatar,
  onOpenImage,
}: {
  group: Cluster;
  agentName?: string;
  agentAvatar?: string;
  onOpenImage: (url: string) => void;
}) {
  const user = useUserStore((s) => s.user);
  const mine = group.sender === "user";
  const name = mine
    ? [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "You"
    : agentName || "Support";
  const avatar = mine ? user?.avatar : agentAvatar;
  const initials = mine
    ? [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?"
    : "";

  const pending = group.messages.some((m) => m.pending);
  const failed = group.messages.some((m) => m.failed);

  return (
    <div className={cn("flex gap-2.5", mine ? "flex-row-reverse" : "flex-row")}>
      {/* An agent gets a portrait, the reader gets theirs. The old panel drew a
          headset glyph for both sides of every conversation. */}
      <span
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full",
          mine ? "bg-foreground/[0.08] text-foreground/70" : "bg-brand/15 text-brand"
        )}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : mine ? (
          <span className="text-[10.5px] font-bold">{initials}</span>
        ) : (
          <Headphones className="h-3.5 w-3.5" strokeWidth={2.1} />
        )}
      </span>

      <div className={cn("flex min-w-0 max-w-[min(560px,82%)] flex-col gap-1", mine && "items-end")}>
        <span
          className={cn(
            "flex items-baseline gap-1.5 px-0.5 text-[11px]",
            mine && "flex-row-reverse"
          )}
        >
          <span className="font-semibold text-foreground/75">{name}</span>
          <span className="tabular-nums text-muted-foreground" title={fullTime(group.time)}>
            {new Date(group.time).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </span>

        {group.messages.map((message) => (
          <div key={message.key} className={cn("flex w-full flex-col gap-1.5", mine && "items-end")}>
            {(message.text || message.context) && (
              <div
                className={cn(
                  "w-fit overflow-hidden rounded-2xl text-[13px] leading-[19px] shadow-sm",
                  /* The reader's own messages take the same gradient the
                     primary button does, so "this is you / this is the
                     product" is one colour idea used twice rather than a flat
                     blue rectangle and a flat blue button that happen to
                     match. The agent's stay a card with a real border: two
                     filled colours facing each other across a thread is a
                     screen with no quiet side. */
                  mine
                    ? "rounded-br-md bg-brand text-brand-foreground"
                    : "rounded-bl-md border border-border bg-card text-foreground",
                  message.pending && "opacity-60",
                  message.failed && "opacity-70 ring-1 ring-danger/50"
                )}
              >
                {/* The payment the ticket was opened about, as a strip along
                    the top of the first bubble. It reads as a subject line
                    rather than as the opening sentence, which is what it is —
                    and it stays inside the bubble, because it was part of what
                    was sent and an agent sees it there too. */}
                {message.context && (
                  <p
                    className={cn(
                      "flex items-start gap-1.5 px-3 py-1.5 text-[11.5px] leading-[16px]",
                      mine
                        ? "bg-black/15 text-brand-foreground/85"
                        : "border-b border-border bg-foreground/[0.04] text-muted-foreground"
                    )}
                  >
                    <Receipt className="mt-[1px] h-3 w-3 shrink-0" strokeWidth={2.2} />
                    {/* `anywhere`, not `break-word`: a 24-character hash has no
                        break opportunity in it, and this line is nothing but
                        identifiers. */}
                    <span className="[overflow-wrap:anywhere]">{message.context}</span>
                  </p>
                )}
                {message.text && (
                  /* Rendered from Markdown into React elements — never into
                     HTML. See ./rich-text for why that distinction is the
                     whole point: the panel this replaced put agent-supplied
                     markup through `dangerouslySetInnerHTML`. */
                  <RichText text={message.text} className="px-3 py-2" />
                )}
              </div>
            )}

            {message.attachments.length > 0 && (
              <span className={cn("flex flex-wrap gap-2", mine && "justify-end")}>
                {message.attachments.map((url) => (
                  <AttachmentTile
                    key={url}
                    url={url}
                    name={fileNameOf(url)}
                    isImage={isImageUrl(url)}
                    uploading={message.pending}
                    onOpen={isImageUrl(url) ? () => onOpenImage(url) : undefined}
                  />
                ))}
              </span>
            )}
          </div>
        ))}

        {/* One mark for the whole cluster, on the last line, the way a
            messenger reports a send. */}
        {mine && (failed || pending) && (
          <span
            className={cn(
              "flex items-center gap-1 px-0.5 text-[11px] font-medium",
              failed ? "text-danger" : "text-muted-foreground"
            )}
          >
            {failed ? (
              <>
                <TriangleAlert className="h-3 w-3" strokeWidth={2.4} />
                Not sent — check your connection
              </>
            ) : (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Sending
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * What sits at the end of a closed thread.
 *
 * The rating is here rather than in a dialog because this is the moment it
 * makes sense to ask, and because the route accepts it exactly once — a modal
 * that can be dismissed and never returns would lose the only chance.
 */
function ClosedNote({
  ticket,
  onRate,
}: {
  ticket: Ticket;
  onRate: (score: number) => Promise<boolean>;
}) {
  const [hover, setHover] = useState(0);
  const [saving, setSaving] = useState(false);
  const rated = ticket.satisfaction || 0;

  return (
    /* Neutral. Twice now this block has been the loudest thing on the screen:
       first as a white slab on a tinted canvas, then as a green one.
    
       Green was the wrong instinct — `--verified` says "this was checked and
       it passed", and a closed ticket is not a pass, it is an ending. An
       ending is quiet. So: `--muted`, which is a real step off the canvas
       without being a colour, a neutral rule, and the rating as the only
       thing in here with any warmth in it.
    
       Narrow, and centred in the column rather than spanning it. A full-width
       panel reads as a new section of the page; a 420px card at the end of a
       thread reads as the last thing in the thread, which is what it is. */
    <div className="flex justify-center pt-1">
      <div
        className={cn(
          "w-full max-w-[420px] rounded-xl border border-border bg-muted px-4 py-3.5 text-center",
          RAISED
        )}
      >
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground/10 text-foreground/70">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          This ticket was closed
        </span>

        <p className="mt-1 text-[11.5px] text-muted-foreground">
          {fullTime(new Date(ticket.updatedAt).getTime())}
        </p>

        {rated ? (
          <p className="mt-2.5 flex items-center justify-center gap-1.5 border-t border-border pt-2.5 text-[12px] text-muted-foreground">
            You rated this
            <span className="inline-flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn(
                    "h-3.5 w-3.5",
                    n <= rated ? "fill-attention text-attention" : "text-muted-foreground/35"
                  )}
                  strokeWidth={2}
                />
              ))}
            </span>
          </p>
        ) : (
          <div className="mt-2.5 border-t border-border pt-2.5">
            <p className="text-[12px] text-muted-foreground">How did we do?</p>
            <div
              className="mt-1.5 flex items-center justify-center gap-1"
              onMouseLeave={() => setHover(0)}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={saving}
                  onMouseEnter={() => setHover(n)}
                  onFocus={() => setHover(n)}
                  onClick={async () => {
                    setSaving(true);
                    await onRate(n);
                    setSaving(false);
                  }}
                  aria-label={`${n} out of 5`}
                  className="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      n <= hover ? "fill-attention text-attention" : "text-muted-foreground/40"
                    )}
                    strokeWidth={2}
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No button here. The bar below this one already carries "Open a new
            ticket", and it isthe same action — two of them, eight pixels
            apart, is the reader being asked the same question twice. This
            block reports what happened; the bar offers what to do next. */}
      </div>
    </div>
  );
}

/**
 * A full-screen image viewer for the thread's screenshots.
 *
 * Its own rather than the shared `ui/lightbox`, which is an inline zoom on one
 * image. A support thread accumulates screenshots and comparing two of them is
 * the normal case, so this pages through every image in the conversation.
 *
 * Escape is captured, not observed: the workspace behind this also closes on
 * Escape, and a keystroke aimed at the image must not take the whole panel
 * down with it.
 */
export function Lightbox({
  urls,
  index,
  onIndex,
  onClose,
}: {
  urls: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const url = urls[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowRight" && index < urls.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [index, urls.length, onIndex, onClose]);

  if (!url) return null;

  return (
    <div
      className="absolute inset-0 z-[60] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="Attachment"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white">
        <span className="truncate text-[12.5px] font-medium">{fileNameOf(url)}</span>
        <span className="flex shrink-0 items-center gap-1">
          {urls.length > 1 && (
            <span className="mr-2 text-[12px] tabular-nums opacity-75">
              {index + 1} / {urls.length}
            </span>
          )}
          <a
            href={url}
            download
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            aria-label="Download"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15"
          >
            <Download className="h-4 w-4" strokeWidth={2.2} />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/15"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-3 pb-5">
        {urls.length > 1 && (
          <button
            type="button"
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index - 1);
            }}
            aria-label="Previous"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 disabled:opacity-25"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={fileNameOf(url)}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full min-h-0 max-w-full rounded-lg object-contain"
        />
        {urls.length > 1 && (
          <button
            type="button"
            disabled={index === urls.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              onIndex(index + 1);
            }}
            aria-label="Next"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 disabled:opacity-25"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
          </button>
        )}
      </div>
    </div>
  );
}

export default TicketThread;
