"use client";

/**
 * One answer to "is this person a guest, and what happens when they reach for
 * something a guest cannot have".
 *
 * Everything that gates on an account asks here rather than checking `user`
 * itself, so the rule stays in one place.
 *
 * Reaching for a gated area sends them to the signup page. There was a modal
 * here first, on the reasoning that a redirect throws away the demo session
 * they are in the middle of — but a dialog in the way of a trading screen is
 * one more thing to get out of, and it has to be designed, and a half-designed
 * one is worse than none. The page it was advertising says the same thing with
 * more room and no invented chrome.
 */

import { useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUserStore } from "@/store/user";
import { useGuestSession } from "@/store/trade/use-guest-session";

export function useGuestGate() {
  const user = useUserStore((s) => s.user);
  const identity = useGuestSession((s) => s.identity);
  const expired = useGuestSession((s) => s.expired);
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "en";

  /* A hollow user object is not a signed-in user. The profile request 401s and
     leaves one behind, which is what used to render "undefined undefined" in
     the account panel — the same trap would make a guest look signed in. */
  const signedIn = !!user?.email;
  const isGuest = !signedIn && !!identity;

  /** Send them to signup, noting what they were reaching for. */
  const requireAccount = useCallback(
    (feature: string) => {
      router.push(`/${locale}/register?from=${encodeURIComponent(feature)}`);
    },
    [router, locale]
  );

  /**
   * Call at the point of the attempt. Returns true when the caller should
   * carry on, false when the person has been sent to sign up instead.
   */
  const allow = useCallback(
    (feature: string): boolean => {
      if (!isGuest) return true;
      requireAccount(feature);
      return false;
    },
    [isGuest, requireAccount]
  );

  return { isGuest, signedIn, expired, allow, requireAccount };
}
