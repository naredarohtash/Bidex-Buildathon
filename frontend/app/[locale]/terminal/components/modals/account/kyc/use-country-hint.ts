"use client";

/**
 * A guess at which country the person is in, from the address they connected
 * from.
 *
 * Used to open the verification form on the right country and the right dial
 * code, so somebody in Delhi does not scroll a list of fifty-six to reach
 * India and does not have to know that +91 is theirs. It is a default and
 * nothing more: every field it touches stays editable, it is never written to
 * the account on its own, and a failed lookup simply leaves the form as it
 * was.
 *
 * The lookup is `/api/user/location/hint`, which reads the address off the
 * request and resolves it server-side — see that route for why the browser's
 * own signals (`navigator.language`, the timezone) are the wrong ones to use.
 *
 * Cached at module scope: the answer cannot change within a page load, and the
 * form is opened, closed and reopened often enough that re-asking would be a
 * request per visit for a value that is already known.
 */

import { useEffect, useState } from "react";
import { $fetch } from "@/lib/api";

export interface CountryHint {
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

const EMPTY: CountryHint = { countryCode: null, country: null, region: null, city: null };

let cache: CountryHint | null = null;
let inFlight: Promise<CountryHint> | null = null;

async function load(): Promise<CountryHint> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = $fetch({ url: "/api/user/location/hint", silent: true, silentSuccess: true })
      .then(({ data }) => {
        const hint: CountryHint = {
          countryCode: (data as any)?.countryCode || null,
          country: (data as any)?.country || null,
          region: (data as any)?.region || null,
          city: (data as any)?.city || null,
        };
        cache = hint;
        return hint;
      })
      .catch(() => EMPTY)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export function useCountryHint(): CountryHint {
  const [hint, setHint] = useState<CountryHint>(cache || EMPTY);

  useEffect(() => {
    if (cache) return;
    let live = true;
    load().then((h) => live && setHint(h));
    return () => {
      live = false;
    };
  }, []);

  return hint;
}
