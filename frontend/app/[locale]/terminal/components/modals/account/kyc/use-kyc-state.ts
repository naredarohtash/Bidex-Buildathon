"use client";

/**
 * Where the newest identity check stands, for the fields it governs.
 *
 * Two states matter to a form, and they are opposites.
 *
 * Date of birth, the identity document and the country are write-once from the
 * account side — anti-fraud, not punishment. There is one state where that rule
 * is exactly backwards: an application is usually rejected *because* one of
 * those fields does not match the document, so "here is what to change" cannot
 * be followed by a form that will not let anybody change it.
 *
 * And once a check has PASSED, they shut for good — the name and the gender
 * with them. Everything in Personal details has now been read off a document by
 * a person and approved; an account that can rewrite any of it afterwards is an
 * account where the approval means nothing, and the obvious version of that is
 * verifying as one person and trading as another.
 *
 * This is the client half of both. The server decides — see
 * BIDEX_UNLOCK_ON_REJECTION and BIDEX_LOCK_WHEN_VERIFIED in the profile route,
 * which read the same newest application and open and shut the same fields.
 * Locking a field here that the route would accept only hides the way out;
 * unlocking one the route refuses would make a save look like it worked. So
 * both halves read the same status.
 *
 * Not cached at module scope, unlike the country rules: this changes the moment
 * somebody resubmits, and a stale `true` would leave the locks open on a
 * pending application.
 */

import { useEffect, useState } from "react";
import { $fetch } from "@/lib/api";

const CORRECTABLE = ["REJECTED", "ADDITIONAL_INFO_REQUIRED"];

export interface KycState {
  /** The newest application's status, or null while it is still unknown. */
  status: string | null;
  /** Sent back: the write-once fields open, because one of them is the reason. */
  correctable: boolean;
  /** Passed: every identity field shuts, name and gender included. */
  verified: boolean;
}

export function useKycState(): KycState {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await $fetch({
        url: "/api/user/kyc/verification",
        silent: true,
        silentSuccess: true,
      });
      if (!cancelled) setStatus(String((data as any)?.status || "") || null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Both false while it is unknown, which is the state a fresh account is in
     anyway. The route is what actually decides, so a moment of the wrong answer
     costs a rejected save at worst — never a write that should not have
     happened. */
  return {
    status,
    correctable: !!status && CORRECTABLE.includes(status),
    verified: status === "APPROVED",
  };
}
