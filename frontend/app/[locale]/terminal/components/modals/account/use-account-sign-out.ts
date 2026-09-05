"use client";

/**
 * Signing out, shared by the desktop rail and the phone's account list.
 *
 * It lived inline in the rail. The phone no longer renders the rail — it has
 * its own list of destinations — and a second copy of this is exactly how the
 * two would drift, which is the failure this codebase has already had once
 * with a duplicated mobile sidebar.
 */

import { useState } from "react";
import { useUserStore } from "@/store/user";

export function useAccountSignOut(onSignedOut?: () => void) {
  const logout = useUserStore((state) => state.logout);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    /* Not conditional on the result. `logout` clears the local session either
       way, and gating the navigation on the server call meant that when it
       failed the button spun, stopped, and left the user sitting in their own
       account — the one outcome "Sign out" must never produce. */
    await logout();
    onSignedOut?.();
    // A reload puts every store back to a signed-out state rather than leaving
    // stale data on screen.
    window.location.href = "/";
  };

  return { signOut, signingOut };
}
