"use client";

/**
 * The country and document rules, fetched once per page load.
 *
 * The list is the same for everybody and changes only when the backend file
 * changes, so it is cached at module scope: opening verification, backing out
 * and opening it again does not re-fetch 56 countries.
 */

import { useEffect, useState } from "react";

export interface DocumentSpec {
  id: string;
  label: string;
  sides: 1 | 2;
  pattern: string;
  placeholder: string;
  hint: string;
}

/** How a country writes a postcode — see backend/api/kyc/documents/postcodes. */
export interface PostcodeSpec {
  /** False where the country has no postal system at all. */
  required: boolean;
  pattern?: string;
  placeholder?: string;
  label?: string;
  numeric?: boolean;
}

export interface CountrySpec {
  code: string;
  name: string;
  documents: DocumentSpec[];
  postcode?: PostcodeSpec;
}

/** What to ask for when the rules have not loaded, or the country is unknown. */
export const DEFAULT_POSTCODE: PostcodeSpec = {
  required: true,
  pattern: "^[A-Z0-9][A-Z0-9 -]{1,10}$",
  label: "Postcode",
};

let cache: CountrySpec[] | null = null;
let inFlight: Promise<CountrySpec[]> | null = null;

async function load(): Promise<CountrySpec[]> {
  if (cache) return cache;
  if (!inFlight) {
    inFlight = fetch("/api/kyc/documents")
      .then((r) => r.json())
      .then((d) => {
        const list: CountrySpec[] = Array.isArray(d?.countries) ? d.countries : [];
        cache = list;
        return list;
      })
      .catch(() => [])
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}



export function useKycRules() {
  const [countries, setCountries] = useState<CountrySpec[]>(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let live = true;
    load().then((c) => {
      if (!live) return;
      setCountries(c);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  return { countries, loading };
}

/** Same normalisation the server applies before matching a pattern. */
export function normaliseNumber(value: string): string {
  return String(value || "").toUpperCase().replace(/\s/g, "");
}

/** Mirrors the server's rule, so the form never lets through what it will refuse. */
export function checkNumber(doc: DocumentSpec, value: string): string | null {
  const raw = normaliseNumber(value);
  if (!raw) return null; // nothing typed yet is not an error, just incomplete
  const re = new RegExp(doc.pattern);
  if (re.test(raw) || re.test(raw.replace(/-/g, ""))) return null;
  return doc.hint ? `Check this — ${doc.hint.toLowerCase()}` : "Check the number and try again";
}

/* ── postcodes ────────────────────────────────────────────────────────── */

/**
 * The postcode rule for a country, and the check that goes with it.
 *
 * Both mirror `backend/api/kyc/documents/postcodes.ts`, which is where the
 * rules actually live — the spec arrives on each country in the same fetch as
 * its documents, so there is no second list to keep in step. These two
 * functions only apply it.
 *
 * The `required: false` case is the one worth knowing about: six of the
 * fifty-six countries have no postal code at all — the UAE, Qatar, Hong Kong,
 * Macau, Ghana, Uganda — and the form must not ask. It was asking, and
 * requiring an answer, which left a resident of Dubai with no way to finish
 * except by inventing a number.
 */
export function postcodeSpec(
  countries: CountrySpec[],
  countryCode?: string | null
): PostcodeSpec {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return DEFAULT_POSTCODE;
  return countries.find((c) => c.code === code)?.postcode ?? DEFAULT_POSTCODE;
}

/** Null when acceptable, a sentence when not. */
export function checkPostcode(spec: PostcodeSpec, value: string): string | null {
  const raw = String(value || "").trim().toUpperCase();
  const what = midSentence(spec.label || "Postcode");

  if (!raw) return spec.required ? `Enter your ${what}` : null;
  if (!spec.required || !spec.pattern) return null;

  return new RegExp(spec.pattern).test(raw)
    ? null
    : `That does not look like a ${what}${
        spec.placeholder ? ` — they look like ${spec.placeholder}` : ""
      }`;
}

/**
 * A label dropped into the middle of a sentence.
 *
 * Lowercasing the whole thing turns "PIN code" into "pin code" and "CEP" into
 * "cep", which reads as a typo in the two countries whose word for this is an
 * initialism. Only the first letter moves, and only when the second one is not
 * already a capital.
 */
function midSentence(label: string): string {
  if (/^[A-Z][A-Z]/.test(label)) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}
