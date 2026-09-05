"use client";

/**
 * Support, as a workspace.
 *
 * ── What was wrong with the thing this replaces ───────────────────────────
 *
 * It was a 360px column docked beside the chart, and it was a column because
 * it had started life as a drawer. Everything else followed from that width:
 *
 * - A conversation lived in 360px, so a reply from an agent wrapped every
 *   eight words and a screenshot came out as a 76px thumbnail of a chart.
 * - There was nowhere to put what a ticket *is* — who has it, how quickly
 *   they answered, what it is filed under, its reference — so none of it was
 *   shown at all. The one number an agent asks for on the phone, the ticket
 *   id, was not on screen anywhere in the product.
 * - Tickets sat behind a tab, so opening support to check on yesterday's
 *   problem began on a screen that did not mention it: a "How can we help?"
 *   card, two buttons, and three topic rows.
 * - Every surface in it branched on `darkMode` and `isNavy` and then wrote a
 *   hex code, so it could only be correct in one theme at a time.
 * - The composer was a `contenteditable` with a bold/italic toolbar whose
 *   output was posted as raw HTML and rendered back through
 *   `dangerouslySetInnerHTML` — agent-supplied markup injected into an
 *   authenticated trading session.
 *
 * ── What this is ──────────────────────────────────────────────────────────
 *
 * The same full-screen surface the account panel is, with the same portal, the
 * same backdrop, the same settle-in-place motion, and the same rule about
 * width: nothing is capped, the layout uses what it is given. Three columns
 * from left to right — the tickets, the conversation, the ticket — collapsing
 * to two below `xl` and to one below `lg`, where the list and the thread
 * become a push navigation and the details a sheet over the thread.
 *
 * State lives here and only here: three panes describing one ticket have to
 * agree about it, so there is one `useTickets` and the panes are given what
 * they draw. See ./use-tickets for why that matters.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useGuestGate } from "@/lib/guest/use-guest-gate";
import { MOBILE_NAV_HEIGHT } from "../navigation/mobile-navigation";
import { transactionIdOf } from "./support-catalog";
import { useTickets } from "./use-tickets";
import { useTransactions } from "./transaction-picker";
import { TicketList } from "./ticket-list";
import { TicketThread, Lightbox } from "./ticket-thread";
import { TicketDetails } from "./ticket-details";
import { NewTicketFlow } from "./new-ticket-flow";

export interface SupportOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  /** The icon rail's 46px, unless it is collapsed. Desktop only. */
  isSidebarCollapsed?: boolean;
  /** Phone: stop at the bottom bar so the navigation stays reachable. */
  isMobile?: boolean;
}

export const SupportOverlay = memo(function SupportOverlay({
  isOpen,
  onClose,
  isSidebarCollapsed = false,
  isMobile = false,
}: SupportOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tickets = useTickets(isOpen);
  const [composing, setComposing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [closing, setClosing] = useState(false);
  /* Narrow layouts only: which of the three panes is on screen. Wide layouts
     show all three and ignore this. */
  const [pane, setPane] = useState<"list" | "thread">("list");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [viewer, setViewer] = useState<{ urls: string[]; index: number } | null>(null);

  const { isGuest } = useGuestGate();

  /* The linked payment is fetched only for a ticket that has one. Most do not,
     and a support panel should not pull a hundred transactions to draw a
     conversation about a rejected document. */
  const linkedId = transactionIdOf(tickets.ticket?.tags);
  const txns = useTransactions("none", !!linkedId);
  const linkedTransaction = useMemo(
    () => (linkedId ? txns.all.find((t) => t.id === linkedId) || null : null),
    [linkedId, txns.all]
  );

  /* Escape closes the workspace — but only when nothing inside it has claimed
     the key first. The image viewer and the payment dropdown both capture it,
     so this listener never sees the keystroke that was meant for them. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /* Closing the panel discards the composer but keeps the selected ticket, so
     reopening support lands back in the conversation you were having. */
  useEffect(() => {
    if (isOpen) return;
    setComposing(false);
    setDetailsOpen(false);
    setViewer(null);
  }, [isOpen]);

  const startNew = useCallback(() => {
    setComposing(true);
    setPane("thread");
    setDetailsOpen(false);
  }, []);

  const selectTicket = useCallback(
    (id: string) => {
      setComposing(false);
      setPane("thread");
      void tickets.openTicket(id);
    },
    [tickets]
  );

  const create = useCallback(
    async (input: Parameters<typeof tickets.createTicket>[0]) => {
      setCreating(true);
      const created = await tickets.createTicket(input);
      setCreating(false);
      if (created) {
        setComposing(false);
        setPane("thread");
      }
      return created;
    },
    [tickets]
  );

  const closeTicket = useCallback(async () => {
    setClosing(true);
    await tickets.closeTicket();
    setClosing(false);
  }, [tickets]);

  const openImage = useCallback((url: string, gallery: string[]) => {
    const urls = gallery.length ? gallery : [url];
    setViewer({ urls, index: Math.max(0, urls.indexOf(url)) });
  }, []);

  if (!mounted) return null;

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      style={isMobile ? { bottom: MOBILE_NAV_HEIGHT } : undefined}
      className={`fixed top-0 ${
        isSidebarCollapsed ? "left-0" : "left-[46px]"
      } right-0 ${isMobile ? "" : "bottom-0"} z-[9999] flex pointer-events-none overflow-hidden`}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* The same settle the account panel uses — see the note there for why a
          full-viewport surface must not slide in from an edge. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-full w-full min-h-0 overflow-hidden bg-background shadow-2xl pointer-events-auto"
      >
        {/* ── The tickets ──────────────────────────────────────────────
            Below `lg` the list and the thread are one pane at a time, so the
            list is hidden rather than narrowed — a 316px column beside a
            conversation on a 390px phone leaves neither of them usable. */}
        <div
          className={`min-h-0 ${pane === "list" ? "flex" : "hidden"} w-full lg:flex lg:w-auto`}
        >
          <TicketList
            tickets={tickets.tickets}
            loading={tickets.listLoading}
            selectedId={tickets.selectedId}
            onSelect={selectTicket}
            onNew={startNew}
            composing={composing}
          />
        </div>

        {/* ── The conversation, or the ticket being written ─────────────── */}
        <div
          className={`min-h-0 min-w-0 flex-1 ${pane === "thread" ? "flex" : "hidden"} lg:flex`}
        >
          {composing ? (
            <div className="flex min-h-0 w-full flex-col">
              <NewTicketFlow
                onCancel={() => {
                  setComposing(false);
                  setPane(tickets.ticket ? "thread" : "list");
                }}
                onCreate={create}
                creating={creating}
              />
            </div>
          ) : (
            <TicketThread
              ticket={tickets.ticket}
              messages={tickets.messages}
              loading={tickets.threadLoading}
              sending={tickets.sending}
              onSend={tickets.sendReply}
              onBack={() => setPane("list")}
              onShowDetails={() => setDetailsOpen((o) => !o)}
              detailsOpen={detailsOpen}
              onNewTicket={startNew}
              onRate={tickets.rateTicket}
              onOpenImage={openImage}
              isMobile={isMobile}
            />
          )}
        </div>

        {/* ── The ticket itself ────────────────────────────────────────
            A column at `xl`, a sheet over the thread below it. Never shown
            while a ticket is being written: there is no ticket yet, and the
            wizard's review step is the equivalent surface. */}
        {tickets.ticket && !composing && (
          <>
            <div className="hidden min-h-0 xl:flex">
              <TicketDetails
                ticket={tickets.ticket}
                messages={tickets.messages}
                transaction={linkedTransaction}
                transactionsLoading={txns.loading}
                onClose={closeTicket}
                closing={closing}
                onOpenImage={openImage}
              />
            </div>

            <AnimatePresence>
              {detailsOpen && (
                <motion.div
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ type: "tween", duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute inset-y-0 right-0 z-20 w-[min(320px,86%)] border-l border-border bg-background shadow-2xl xl:hidden"
                >
                  <TicketDetails
                    ticket={tickets.ticket}
                    messages={tickets.messages}
                    transaction={linkedTransaction}
                    transactionsLoading={txns.loading}
                    onClose={closeTicket}
                    onDismiss={() => setDetailsOpen(false)}
                    closing={closing}
                    onOpenImage={openImage}
                    isMobile={isMobile}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}

        {viewer && (
          <Lightbox
            urls={viewer.urls}
            index={viewer.index}
            onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
            onClose={() => setViewer(null)}
          />
        )}
      </motion.div>
    </motion.div>
  );

  /* A guest has no account to open a ticket against and nobody to reply to
     them — the layouts gate the entry points, and this is the backstop for any
     path that reaches the panel anyway. */
  if (isGuest) return null;

  return createPortal(<AnimatePresence>{isOpen && content}</AnimatePresence>, document.body);
});

export default SupportOverlay;
