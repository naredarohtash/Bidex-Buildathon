"use client";

/**
 * One time zone, everywhere it is set from.
 *
 * Three places changed it and none of them told the others what they had done:
 * the header's clock picker and the trading settings both wrote
 * `binary_timezone` in localStorage, while the account's own Time zone field
 * wrote `profile.timezone` on the server. So a trader could set their zone in
 * their profile, watch the chart stay on the old one, and come back on their
 * phone to a third answer.
 *
 * They are two halves of one setting, and both halves are written here:
 *
 * - **This device** — localStorage, plus the `binary_timezone_changed` event
 *   the chart, the header clock and the settings panel already listen to.
 * - **This account** — `profile.timezone`, so the next device starts on the
 *   zone this one is using rather than on whatever the browser guesses.
 *
 * `adoptStoredTimeZone` is the read side: on load, an account that carries a
 * zone hands it to a device that has not been told one.
 */

import { useUserStore } from "@/store/user";

export const TIME_ZONE_KEY = "binary_timezone";
export const TIME_ZONE_EVENT = "binary_timezone_changed";

/** The profile column is JSON, and older rows hold it as a string. */
function readProfile(user: any): any {
  const raw = user?.profile;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

/** This device only — used where the account has already been written. */
export function broadcastTimeZone(id: string) {
  if (!id || typeof window === "undefined") return;
  try {
    localStorage.setItem(TIME_ZONE_KEY, id);
    window.dispatchEvent(new CustomEvent(TIME_ZONE_EVENT, { detail: id }));
  } catch {
    /* Private mode, or storage that is full. The event still fires. */
    window.dispatchEvent(new CustomEvent(TIME_ZONE_EVENT, { detail: id }));
  }
}

/**
 * Set the zone: this device now, and the account behind it.
 *
 * The account write is silent and not awaited — the clock has already moved,
 * and a picker that waits on a round trip to change a number is a picker that
 * feels broken. A guest has no account to write to, so the store's own guard
 * takes care of that.
 */
export function applyTimeZone(id: string) {
  if (!id) return;
  broadcastTimeZone(id);

  const { user, updateUser } = useUserStore.getState() as any;
  if (!user?.id || typeof updateUser !== "function") return;

  const profile = readProfile(user);
  if (profile.timezone === id) return;
  /* The whole profile object, because it is one JSON column: sending only the
     key we own would drop the address and the identity document with it.
  
     Silently: the clock has already changed in front of whoever pressed the
     control, and a "Profile updated successfully" over the chart is a
     notification about a thing the screen has just shown them. */
  void updateUser({ profile: { ...profile, timezone: id } }, { silent: true });
}

/**
 * The zone this account is on, for a device that has not been told one.
 *
 * Returns what should be used now, or null to leave the device as it is. The
 * account wins over a browser guess and loses to nothing else — a device that
 * has already been set is a deliberate choice, and both halves are kept equal
 * by `applyTimeZone` anyway.
 */
export function adoptStoredTimeZone(user: any): string | null {
  if (typeof window === "undefined") return null;
  const stored = readProfile(user).timezone;
  if (!stored) return null;
  let current: string | null = null;
  try {
    current = localStorage.getItem(TIME_ZONE_KEY);
  } catch {
    current = null;
  }
  if (current === stored) return null;
  broadcastTimeZone(stored);
  return stored;
}
