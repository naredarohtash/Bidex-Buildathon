/**
 * Tell the server which device this is.
 *
 * The sign-in itself cannot record it. `/api/auth/login` is part of the
 * compiled framework and there is no source to change, so the session it
 * writes into Redis carries a user id and some tokens and nothing else — no
 * device, no address, no time. Sign-in activity would otherwise have nothing
 * to list, which is how the previous version of that page ended up listing
 * things nobody had measured.
 *
 * So the browser announces itself instead, once per tab, as soon as a user is
 * known. It sends no data: the server reads the address and the User-Agent off
 * the request, because anything the client could put in a body is something an
 * attacker could put there too.
 *
 * Fire and forget in every sense — a failure here must never be visible on the
 * screen that triggered it, and a second call for the same session only moves
 * "last seen".
 */

import { $fetch } from "@/lib/api";

/* Per tab, not per navigation. Client-side routing calls setUser more than
   once, and a POST per route change would be noise. */
let announced: string | null = null;

export function recordSignIn(userId?: string | null) {
  if (typeof window === "undefined") return;
  if (!userId || announced === userId) return;
  announced = userId;

  void $fetch({
    url: "/api/user/security/activity",
    method: "POST",
    silent: true,
    silentSuccess: true,
  }).catch(() => undefined);
}

/** Signing out ends the tab's claim, so the next account announces itself. */
export function forgetSignInRecord() {
  announced = null;
}
