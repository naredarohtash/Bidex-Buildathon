"use client";

/**
 * The 30-minute demo somebody gets before they have an account.
 *
 * Someone who lands on the terminal without signing in used to get a terminal
 * that half worked: the chart streamed, a demo balance appeared, and every
 * trade failed because the order write 401s. This gives them a real, bounded
 * go at the product instead — an identity, a demo balance, working trades, and
 * a clock.
 *
 * Nothing a guest does is written anywhere. No order rows, no wallet, no user.
 * The whole session is this store plus what the trade store already keeps in
 * memory, which is why the trades settle in the browser
 * (see lib/guest/guest-settlement.ts).
 *
 * The session is kept in localStorage rather than memory so that a reload
 * continues the same 30 minutes rather than granting another 30, and the
 * expiry is remembered for the same reason. None of that is a security
 * boundary — clearing site data or opening a private window starts again, and
 * that is fine. It is a nudge with an honest deadline, not a lock.
 */

import { create } from "zustand";
import { createGuestIdentity, type GuestIdentity } from "@/lib/guest/guest-identity";

export const GUEST_SESSION_MINUTES = 30;
const GUEST_SESSION_MS = GUEST_SESSION_MINUTES * 60 * 1000;
const STORAGE_KEY = "bidex_guest_session";

/** Show the countdown only once it means something. */
export const GUEST_WARN_AT_MS = 5 * 60 * 1000;

/**
 * How long a finished session keeps someone locked out before they are offered
 * a fresh one.
 *
 * Without this the expiry was permanent. `expired: true` went into localStorage
 * and every later visit resurrected the same dead session — the terminal opened
 * reading "0:00 LEFT" for ever, and because an identity was still attached it
 * still looked like a tradeable guest to the order path. A demo that can only
 * ever be used once per browser, and is a corpse afterwards, is not what a
 * 30-minute limit means. Come back tomorrow and you get another half hour;
 * reload during the same visit and you do not.
 */
const GUEST_RESET_AFTER_MS = 24 * 60 * 60 * 1000;

interface StoredSession {
  identity: GuestIdentity;
  startedAt: number;
  /** Set when the clock ran out, so a reload does not hand out a fresh 30. */
  expired?: boolean;
  /**
   * The `startedAt` of the session whose opening watchlist has already been
   * drawn. Stored rather than derived because the twelve tabs themselves live
   * in the trade store's own persisted state: without this marker a reload
   * would redraw them, and the assets a guest was watching would change under
   * them every refresh.
   */
  tabsSeededAt?: number;
}

function read(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.identity?.email || typeof parsed.startedAt !== "number") return null;
    return parsed as StoredSession;
  } catch {
    return null;
  }
}

function write(session: StoredSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode, quota — the session just becomes memory-only */
  }
}

interface GuestSessionState {
  identity: GuestIdentity | null;
  startedAt: number | null;
  expired: boolean;
  /** Recomputed by tick() so components can render a countdown. */
  msRemaining: number;
  /** @see StoredSession.tabsSeededAt */
  tabsSeededAt: number | null;

  /** Begin, or resume, a demo session. Safe to call repeatedly. */
  begin: () => void;
  /** Recompute the clock. Called once a second while the terminal is open. */
  tick: () => void;
  /** Note that this session's opening watchlist has been drawn. */
  markTabsSeeded: () => void;
  /** Forget everything — used when a real account signs in. */
  clear: () => void;
}

export const useGuestSession = create<GuestSessionState>((set, get) => ({
  identity: null,
  startedAt: null,
  expired: false,
  msRemaining: GUEST_SESSION_MS,
  tabsSeededAt: null,

  begin: () => {
    if (get().identity) return;

    const stored = read();
    if (stored && Date.now() - stored.startedAt > GUEST_RESET_AFTER_MS) {
      // Long enough ago that this is a new visit, not a reload. Start again.
      write(null);
    } else if (stored) {
      const remaining = stored.startedAt + GUEST_SESSION_MS - Date.now();
      const expired = !!stored.expired || remaining <= 0;
      set({
        identity: stored.identity,
        startedAt: stored.startedAt,
        expired,
        msRemaining: Math.max(0, remaining),
        tabsSeededAt: stored.tabsSeededAt ?? null,
      });
      if (expired && !stored.expired) write({ ...stored, expired: true });
      return;
    }

    const session: StoredSession = {
      identity: createGuestIdentity(),
      startedAt: Date.now(),
    };
    write(session);
    set({
      identity: session.identity,
      startedAt: session.startedAt,
      expired: false,
      msRemaining: GUEST_SESSION_MS,
      tabsSeededAt: null,
    });
  },

  tick: () => {
    const { startedAt, expired } = get();
    if (startedAt === null || expired) return;

    const remaining = startedAt + GUEST_SESSION_MS - Date.now();
    if (remaining <= 0) {
      const stored = read();
      if (stored) write({ ...stored, expired: true });
      set({ msRemaining: 0, expired: true });
      return;
    }
    set({ msRemaining: remaining });
  },

  markTabsSeeded: () => {
    const { startedAt } = get();
    if (startedAt === null) return;
    const stored = read();
    if (stored) write({ ...stored, tabsSeededAt: startedAt });
    set({ tabsSeededAt: startedAt });
  },

  clear: () => {
    write(null);
    set({
      identity: null,
      startedAt: null,
      expired: false,
      msRemaining: GUEST_SESSION_MS,
      tabsSeededAt: null,
    });
  },
}));

/** mm:ss for the countdown. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
