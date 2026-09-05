"use client";

/**
 * Everything this workspace knows about tickets.
 *
 * One hook rather than fetch calls scattered through the panes, because the
 * three panes are three views of the same ticket and they have to agree: the
 * list shows the status, the thread appends to the messages, the detail pane
 * reads the agent and the tags. When those were three components each calling
 * the API for themselves, replying moved the status in the thread's copy and
 * left the list showing the old one until it was refetched.
 *
 * ── The wire format, and what it can and cannot carry ─────────────────────
 *
 * A stored message is `{ type, text, time, userId, attachment? }` and the
 * reply route rebuilds exactly those five fields — anything else in the body
 * is discarded. So there is no `attachments: string[]` to send, however much
 * the model's own TypeScript suggests otherwise, and a send carrying three
 * files has to become three messages.
 *
 * That is what `sendReply` does, and it is not a workaround so much as the
 * honest shape: the agent's console renders one attachment per bubble too, so
 * a thread written this way reads correctly at both ends. The thread view
 * groups a run of messages from the same sender back into one cluster, which
 * is what a chat client does anyway.
 *
 * The route also rejects an empty `text`, so a file sent on its own carries
 * its own filename as the text. That reads as a caption rather than as a
 * workaround, and it is what an agent would want written there in any case.
 *
 * ── Legacy messages ───────────────────────────────────────────────────────
 *
 * The panel this replaces composed in a `contenteditable` and posted the
 * resulting HTML as the message text, with attachment URLs appended as
 * `\nAttachment: <url>` lines underneath. It then rendered that back through
 * `dangerouslySetInnerHTML` — agent-supplied markup, injected into the page of
 * an authenticated trading session.
 *
 * Both halves are handled here instead of at the render site: the trailer
 * lines are lifted back out into real attachments, and the markup is flattened
 * to text. Nothing downstream of `normaliseMessages` is HTML, so no view in
 * this workspace has to be trusted to escape it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { $fetch } from "@/lib/api";
import { imageUploader } from "@/utils/upload";
import { useUserStore } from "@/store/user";
import { wsManager, ConnectionStatus } from "@/services/ws-manager";
import { TRANSACTION_NOTE, type Importance } from "./support-catalog";

export type TicketStatus = "PENDING" | "OPEN" | "REPLIED" | "CLOSED";

export interface Ticket {
  id: string;
  userId: string;
  agentId?: string | null;
  agentName?: string | null;
  subject: string;
  importance: Importance;
  status: TicketStatus;
  type?: "LIVE" | "TICKET";
  tags?: string[] | null;
  messages?: any;
  satisfaction?: number | null;
  responseTime?: number | null;
  createdAt: string;
  updatedAt: string;
  agent?: {
    avatar?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    lastLogin?: string | null;
  } | null;
}

export interface ThreadMessage {
  /** Stable across refetches: the server gives messages no id of their own. */
  key: string;
  sender: "user" | "agent";
  text: string;
  /**
   * The payment this ticket was opened about, as the wizard wrote it.
   *
   * Split out of `text` rather than left in it: it is a caption on the
   * message, not part of what the person said, and four lines of reference
   * data at the top of the first bubble buries the sentence underneath.
   */
  context?: string;
  attachments: string[];
  /** Epoch ms. `NaN` never reaches here — an unparseable time becomes 0. */
  time: number;
  /** In flight, drawn at reduced opacity. */
  pending?: boolean;
  /** The send failed and can be retried. */
  failed?: boolean;
}

/* ── Normalising what the server holds ─────────────────────────────────── */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

/**
 * HTML to text, without a DOM and without trusting the input.
 *
 * Deliberately not `innerHTML` on a detached node: that parses the markup,
 * which fires `<img onerror>` in some browsers even when the node is never
 * inserted. Tags are removed by pattern and the handful of entities a rich
 * editor actually emits are decoded from a table. Anything else stays as
 * written, which is the safe direction to fail in — an undecoded `&pound;`
 * is a cosmetic flaw, an executed handler is not.
 */
function flattenHtml(raw: string): string {
  if (!raw) return "";
  if (!/<[a-z/][\s\S]*>/i.test(raw)) return raw;
  const spaced = raw
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return spaced
    .replace(/&(#\d{1,5}|[a-z]+);/gi, (whole, name: string) => {
      const key = name.toLowerCase();
      if (ENTITIES[key]) return ENTITIES[key];
      if (key.startsWith("#")) {
        const code = Number(key.slice(1));
        return Number.isFinite(code) && code > 0 && code < 0x110000
          ? String.fromCodePoint(code)
          : whole;
      }
      return whole;
    })
    /* Three or more blank lines is what a paste out of a rich editor leaves
       behind; two is a paragraph break somebody meant. */
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `\nAttachment: <url>` trailers, as written by the panel this replaces. */
const LEGACY_TRAILER = /\n?Attachment:\s*(\S+)/gi;

/** The wizard's transaction line, off the front of the opening message. */
function splitContext(text: string): { body: string; context?: string } {
  if (!text.startsWith(TRANSACTION_NOTE)) return { body: text };
  const end = text.indexOf("\n");
  if (end === -1) return { body: "", context: text.slice(TRANSACTION_NOTE.length).trim() };
  return {
    context: text.slice(TRANSACTION_NOTE.length, end).trim(),
    body: text.slice(end).trim(),
  };
}

function splitLegacyAttachments(text: string): { body: string; urls: string[] } {
  const urls: string[] = [];
  const body = text.replace(LEGACY_TRAILER, (_whole, url: string) => {
    urls.push(url);
    return "";
  });
  return { body, urls };
}

function timeOf(value: unknown): number {
  const ms = new Date(String(value ?? "")).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Two copies of one message — from a refetch and from the socket — collide here. */
const identityOf = (m: { sender: string; time: number; text: string }) =>
  `${m.sender}|${m.time}|${m.text}`;

export function normaliseMessages(raw: any): ThreadMessage[] {
  let list: any[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }

  return list.map((m, index) => {
    const flattened = flattenHtml(String(m?.text ?? m?.content ?? ""));
    const { body: withoutAttachments, urls } = splitLegacyAttachments(flattened);
    const { body, context } = splitContext(withoutAttachments.trim());
    const attachments = [
      ...(m?.attachment ? [String(m.attachment)] : []),
      /* The model's own type declares this array and no route writes it, but a
         ticket touched by another client might. Cheap to honour, wrong to
         assume absent. */
      ...(Array.isArray(m?.attachments) ? m.attachments.map(String) : []),
      ...urls,
    ].filter((u, i, all) => u && all.indexOf(u) === i);

    const time = timeOf(m?.time ?? m?.timestamp);
    return {
      key: `${time}-${index}`,
      sender: m?.type === "agent" ? "agent" : "user",
      text: body.trim(),
      ...(context ? { context } : {}),
      attachments,
      time,
    };
  });
}

/* ── Attachments ───────────────────────────────────────────────────────── */

export const ATTACHMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif,.avif";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/avif",
  "application/pdf",
];

/** 20 MB, the same ceiling the panel this replaces enforced. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/* SVG is not in the allow list, and its absence is the point: an SVG is a
   document that can carry script, and these files are served back to an agent
   and rendered in their console. The old panel accepted them. */
export function rejectionFor(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return `${file.name} is not a supported file type. Send an image or a PDF.`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is larger than 20 MB.`;
  }
  return null;
}

/** PDFs cannot go through the image pipeline — it re-encodes what it is given. */
async function uploadRaw(file: File): Promise<string | null> {
  const base64 = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "") || null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
  if (!base64) return null;
  const { data } = await $fetch<{ url: string }>({
    url: "/api/upload",
    method: "POST",
    body: { file: base64, dir: "ticket-attachments", mimeType: file.type, width: 0, height: 0 },
    silent: true,
    silentSuccess: true,
  });
  return data?.url || null;
}

export async function uploadAttachment(file: File): Promise<string | null> {
  if (file.type === "application/pdf") return uploadRaw(file);
  const result = await imageUploader({
    file,
    dir: "ticket-attachments",
    size: { maxWidth: 1600, maxHeight: 1600 },
  });
  return (result as any)?.url || null;
}

export function fileNameOf(url: string): string {
  if (!url) return "attachment";
  try {
    const last = decodeURIComponent(url).split("?")[0].split("/").pop() || "attachment";
    /* Uploads are stored with a timestamp prefix that means nothing to the
       person who chose the file. */
    return last.replace(/^\d{10,}-/, "");
  } catch {
    return "attachment";
  }
}

export const isImageUrl = (url: string) => /\.(jpe?g|png|gif|webp|bmp|tiff?|avif|heic|heif)$/i.test(url.split("?")[0]);

/* ── The hook ──────────────────────────────────────────────────────────── */

export interface CreateTicketInput {
  subject: string;
  message: string;
  importance: Importance;
  tags: string[];
  attachments: string[];
}

export function useTickets(active: boolean) {
  const userId = useUserStore((s) => s.user?.id);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);

  /* The thread is rebuilt from the server on every reply and on every socket
     frame, and both paths need to know what is already on screen without
     re-running the effect that owns the socket. */
  const messagesRef = useRef<ThreadMessage[]>([]);
  messagesRef.current = messages;

  const refreshList = useCallback(async () => {
    const { data } = await $fetch<any>({
      url: "/api/user/support/ticket?perPage=100&sortField=updatedAt&sortOrder=desc",
      silent: true,
      silentSuccess: true,
    });
    const items: Ticket[] = Array.isArray(data) ? data : data?.items || [];
    setTickets(items);
    setListLoaded(true);
    return items;
  }, []);

  /* Once per open, and only once.
  
     The guard was `listLoading` state listed as a dependency, which is a retry
     loop waiting for a bad day: a failed request clears the flag, the effect
     re-runs, and the panel hammers an endpoint that is already unwell. A ref
     cannot re-trigger the effect, and `active` still refetches when the panel
     is reopened — which is the refresh worth having, since replies arrive
     while it is shut. */
  const listInFlight = useRef(false);
  useEffect(() => {
    if (!active || listInFlight.current) return;
    listInFlight.current = true;
    setListLoading(true);
    refreshList().finally(() => {
      setListLoading(false);
      listInFlight.current = false;
    });
  }, [active, refreshList]);

  /* Opening a ticket replaces the thread wholesale rather than merging: the
     server's copy is the record, and a merge is how a failed optimistic
     message survives a reload it should not have survived. */
  const openTicket = useCallback(async (id: string | null) => {
    setSelectedId(id);
    if (!id) {
      setTicket(null);
      setMessages([]);
      return;
    }
    setThreadLoading(true);
    const { data } = await $fetch<Ticket>({
      url: `/api/user/support/ticket/${id}`,
      silent: true,
      silentSuccess: true,
    });
    if (data && (data as any).id) {
      setTicket(data);
      setMessages(normaliseMessages((data as any).messages));
    }
    setThreadLoading(false);
  }, []);

  /* One socket, one subscription, torn down when the selection moves. The
     connection id carries the ticket so two rapid selections cannot leave the
     first one's listener attached to the second one's socket. */
  useEffect(() => {
    if (!active || !selectedId || !userId) return;

    const connId = `support-ticket-${selectedId}`;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host =
      process.env.NODE_ENV === "development"
        ? `${window.location.hostname}:${process.env.NEXT_PUBLIC_BACKEND_PORT || "4000"}`
        : window.location.host;
    const url = `${proto}//${host}/api/user/support/ticket?userId=${userId}`;

    wsManager.connect(url, connId);

    const onStatus = (status: ConnectionStatus) => {
      if (status === ConnectionStatus.CONNECTED) {
        wsManager.sendMessage({ action: "SUBSCRIBE", payload: { id: selectedId } }, connId);
      }
    };

    const onMessage = (frame: any) => {
      if (frame?.method !== "reply" || !frame?.data?.message) return;
      const incoming = normaliseMessages([frame.data.message])[0];
      if (!incoming) return;

      setMessages((prev) => {
        /* Our own reply comes back over the socket as well — the server
           broadcasts to every subscriber including the sender — so the same
           message arrives twice on the happy path. */
        const id = identityOf(incoming);
        if (prev.some((m) => !m.pending && identityOf(m) === id)) return prev;
        /* An optimistic copy of this exact message is still on screen: swap
           it for the server's rather than showing both. */
        const optimistic = prev.findIndex(
          (m) => m.pending && m.sender === incoming.sender && m.text === incoming.text
        );
        if (optimistic !== -1) {
          const next = [...prev];
          next[optimistic] = incoming;
          return next;
        }
        return [...prev, incoming];
      });

      const status: TicketStatus | undefined = frame.data.status;
      if (status) {
        setTicket((t) => (t ? { ...t, status } : t));
        setTickets((all) => all.map((t) => (t.id === selectedId ? { ...t, status } : t)));
      }
    };

    wsManager.addStatusListener(onStatus, connId);
    wsManager.subscribe(`ticket-${selectedId}`, onMessage, connId);

    return () => {
      if (wsManager.getStatus(connId) === ConnectionStatus.CONNECTED) {
        wsManager.sendMessage({ action: "UNSUBSCRIBE", payload: { id: selectedId } }, connId);
      }
      wsManager.removeStatusListener(onStatus, connId);
      wsManager.unsubscribe(`ticket-${selectedId}`, onMessage, connId);
      wsManager.close(connId);
    };
  }, [active, selectedId, userId]);

  /**
   * Post one message. Resolves to the ticket the server returned, or null.
   *
   * `time` is generated per message rather than once per send, so a text
   * message and the files behind it keep their order when the thread is sorted
   * by time on a later read.
   */
  const postMessage = useCallback(
    async (ticketId: string, text: string, attachment?: string) => {
      const { data, error } = await $fetch<{ data: Ticket }>({
        url: `/api/user/support/ticket/${ticketId}`,
        method: "POST",
        body: {
          type: "client",
          time: new Date().toISOString(),
          userId,
          text,
          ...(attachment ? { attachment } : {}),
        },
        silent: true,
        silentSuccess: true,
      });
      return error ? null : (data as any)?.data ?? null;
    },
    [userId]
  );

  /**
   * Send what is in the composer.
   *
   * Optimistic, and honest about it: the bubbles appear immediately marked
   * pending, and if a post fails the ones that did not go are marked failed
   * rather than quietly disappearing. The caller gets `false` and keeps the
   * composer's contents so nothing typed is ever lost to a dropped request.
   */
  const sendReply = useCallback(
    async (text: string, attachments: string[]) => {
      if (!selectedId || !userId) return false;
      const body = text.trim();
      if (!body && attachments.length === 0) return false;

      setSending(true);

      /* One bubble per post, in the order they will be sent, so the thread
         does not reshuffle when the server's copies replace them. */
      const planned: Array<{ text: string; attachment?: string }> = [];
      if (body) planned.push({ text: body });
      attachments.forEach((url, index) => {
        /* The first file rides along with the text when there is none — the
           route rejects an empty body, and a filename is the caption an agent
           would write there anyway. */
        planned.push({ text: index === 0 && !body ? fileNameOf(url) : fileNameOf(url), attachment: url });
      });

      const stamp = Date.now();
      const optimistic: ThreadMessage[] = planned.map((p, i) => ({
        key: `pending-${stamp}-${i}`,
        sender: "user",
        text: p.attachment ? "" : p.text,
        attachments: p.attachment ? [p.attachment] : [],
        time: stamp + i,
        pending: true,
      }));
      setMessages((prev) => [...prev, ...optimistic]);

      let updated: Ticket | null = null;
      let failedFrom = -1;
      for (let i = 0; i < planned.length; i++) {
        const result = await postMessage(selectedId, planned[i].text, planned[i].attachment);
        if (!result) {
          failedFrom = i;
          break;
        }
        updated = result;
      }

      if (failedFrom !== -1) {
        const failedKeys = new Set(optimistic.slice(failedFrom).map((m) => m.key));
        setMessages((prev) =>
          prev.map((m) => (failedKeys.has(m.key) ? { ...m, pending: false, failed: true } : m))
        );
      }

      /* The reply route returns the whole ticket, messages included, so the
         thread is replaced by the record rather than patched toward it — but
         only the part that actually went. Anything that failed stays on screen
         as a failed bubble. */
      if (updated) {
        const confirmed = normaliseMessages((updated as any).messages);
        setMessages((prev) => [...confirmed, ...prev.filter((m) => m.failed)]);
        setTicket((t) => (t ? { ...t, status: updated!.status, updatedAt: updated!.updatedAt } : t));
        setTickets((all) =>
          all.map((t) =>
            t.id === selectedId
              ? { ...t, status: updated!.status, updatedAt: updated!.updatedAt, messages: updated!.messages }
              : t
          )
        );
      }

      setSending(false);
      return failedFrom === -1;
    },
    [selectedId, userId, postMessage]
  );

  /**
   * Open a ticket, then hang its attachments off the opening message.
   *
   * Create takes one `message` and no attachment, so files chosen in the
   * wizard are posted as replies the instant the ticket exists. They land
   * inside the same thread a second later, which is where they belong.
   */
  const createTicket = useCallback(
    async (input: CreateTicketInput): Promise<Ticket | null> => {
      const { data, error } = await $fetch<Ticket>({
        url: "/api/user/support/ticket",
        method: "POST",
        body: {
          subject: input.subject,
          message: input.message,
          importance: input.importance,
          tags: input.tags,
        },
        silent: true,
        silentSuccess: true,
      });
      if (error || !data?.id) return null;

      for (const url of input.attachments) {
        await postMessage(data.id, fileNameOf(url), url);
      }

      const fresh = await refreshList();
      const created = fresh.find((t) => t.id === data.id) || data;
      await openTicket(created.id);
      return created;
    },
    [postMessage, refreshList, openTicket]
  );

  const closeTicket = useCallback(async () => {
    if (!selectedId) return false;
    const { error } = await $fetch({
      url: `/api/user/support/ticket/${selectedId}/close`,
      method: "PUT",
      silent: true,
      silentSuccess: true,
    });
    if (error) return false;
    setTicket((t) => (t ? { ...t, status: "CLOSED" } : t));
    setTickets((all) => all.map((t) => (t.id === selectedId ? { ...t, status: "CLOSED" } : t)));
    return true;
  }, [selectedId]);

  const rateTicket = useCallback(
    async (satisfaction: number) => {
      if (!selectedId) return false;
      const { error } = await $fetch({
        url: `/api/user/support/ticket/${selectedId}/review`,
        method: "PUT",
        body: { satisfaction },
        silent: true,
        silentSuccess: true,
      });
      if (error) return false;
      setTicket((t) => (t ? { ...t, satisfaction } : t));
      setTickets((all) => all.map((t) => (t.id === selectedId ? { ...t, satisfaction } : t)));
      return true;
    },
    [selectedId]
  );

  const open = useMemo(() => tickets.filter((t) => t.status !== "CLOSED").length, [tickets]);

  return {
    tickets,
    openCount: open,
    listLoading: listLoading && !listLoaded,
    refreshList,
    selectedId,
    ticket,
    messages,
    threadLoading,
    sending,
    openTicket,
    sendReply,
    createTicket,
    closeTicket,
    rateTicket,
  };
}
