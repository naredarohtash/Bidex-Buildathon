/**
 * "Is the person at the keyboard a guest?", answerable outside React.
 *
 * The trade store has to know this and cannot call a hook, so it asks here.
 * Both stores are zustand, so reading their state directly is exact rather
 * than a snapshot that can go stale between renders.
 */

import { useUserStore } from "@/store/user";
import { useGuestSession } from "@/store/trade/use-guest-session";

export function isGuestNow(): boolean {
  try {
    /* A hollow user object is not a signed-in user — the profile request 401s
       and leaves one behind. Checking `email` rather than the object is what
       tells a real session from that wreckage. */
    if (useUserStore.getState().user?.email) return false;
    return !!useGuestSession.getState().identity;
  } catch {
    return false;
  }
}

/**
 * A demo session whose clock has run out.
 *
 * The order path has to ask this separately from isGuestNow(). An expired guest
 * is still not signed in, so they still belong behind every account gate — but
 * they must not be able to trade, and for a while they could: the redirect that
 * ends the session is an effect in a React component, and anything that outran
 * it or came back to the page found an identity still attached and an order
 * path that only ever asked whether one existed.
 */
export function isGuestSessionExpired(): boolean {
  try {
    if (useUserStore.getState().user?.email) return false;
    const s = useGuestSession.getState();
    return !!s.identity && s.expired;
  } catch {
    return false;
  }
}
