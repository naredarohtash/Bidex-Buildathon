// /server/api/kyc/documents/postcodes.ts

/**
 * What a postcode looks like in each country we verify in.
 *
 * The address form asked every applicant for a postcode, validated none of
 * them, and required all of them. Both halves of that are wrong.
 *
 * **Six of the fifty-six countries have no postal code at all.** The UAE
 * abolished theirs, Hong Kong and Macau never had one, and Qatar, Uganda and
 * Ghana have no system a resident could quote. A required field with no
 * possible correct answer is a dead end: the only way past it is to invent a
 * number, which then sits on a verification application next to a document
 * that does not have one. Those countries get `required: false` and the field
 * disappears rather than being marked optional — an optional field for
 * something that does not exist is still a question.
 *
 * **The rest vary far more than a single "5 digits" check would allow.** India
 * is six, Bangladesh four, Brazil eight written with a dash, Argentina either
 * four digits or a letter, four digits and three letters, Japan three-four,
 * Brunei two letters and four digits. Validating them all against one pattern
 * meant validating none of them, and a wrong postcode is a rejected
 * verification a week later.
 *
 * The same rule as the document numbers above it applies here: **patterns
 * reject typos, not forgeries.** Where a format genuinely varies, the pattern
 * is deliberately loose rather than wrong, because a rule that rejects a real
 * address is worse than one that accepts a malformed one — a person reads
 * every application either way.
 *
 * `label` exists because the word differs and using the wrong one reads as a
 * form written for somewhere else: an American types a ZIP code, an Indian a
 * PIN code, and most of the rest of the world a postcode.
 */

export interface PostcodeSpec {
  /** False where the country has no postal system: the field is not shown. */
  required: boolean;
  /** Anchored regex, matched against the trimmed, uppercased value. */
  pattern?: string;
  /** A real example from that country, shown as placeholder text. */
  placeholder?: string;
  /** What that country calls it. */
  label?: string;
  /** Digits only, so a phone keypad opens on a phone. */
  numeric?: boolean;
}

const DIGITS = (n: number, example: string, label = "Postcode"): PostcodeSpec => ({
  required: true,
  pattern: `^\\d{${n}}$`,
  placeholder: example,
  label,
  numeric: true,
});

const NONE: PostcodeSpec = { required: false };

export const POSTCODES: Record<string, PostcodeSpec> = {
  /* South Asia */
  IN: DIGITS(6, "110065", "PIN code"),
  PK: DIGITS(5, "44000"),
  BD: DIGITS(4, "1000"),
  NP: DIGITS(5, "44600"),
  LK: DIGITS(5, "00100"),
  AF: DIGITS(4, "1001"),
  BT: DIGITS(5, "11001"),
  MV: DIGITS(5, "20026"),

  /* South-east Asia */
  ID: DIGITS(5, "10110"),
  MY: DIGITS(5, "50450"),
  PH: DIGITS(4, "1000"),
  TH: DIGITS(5, "10200"),
  VN: DIGITS(6, "100000"),
  KH: { required: true, pattern: "^\\d{5,6}$", placeholder: "120101", label: "Postcode", numeric: true },
  MM: DIGITS(5, "11181"),
  LA: DIGITS(5, "01000"),
  SG: DIGITS(6, "238859"),
  /* Two letters then four digits — KA1131, BE3119. */
  BN: { required: true, pattern: "^[A-Z]{2}\\d{4}$", placeholder: "KA1131", label: "Postcode" },

  /* East Asia */
  CN: DIGITS(6, "100000"),
  /* Written 100-0001 and stored either way. */
  JP: { required: true, pattern: "^\\d{3}-?\\d{4}$", placeholder: "100-0001", label: "Postal code" },
  KR: DIGITS(5, "03187"),
  /* Three digits, extended to five or six in the newer scheme. */
  TW: { required: true, pattern: "^\\d{3}(\\d{2,3})?$", placeholder: "100", label: "Postal code", numeric: true },
  HK: NONE,
  MO: NONE,
  MN: DIGITS(5, "14200"),

  /* Central Asia */
  KZ: DIGITS(6, "050000"),
  UZ: DIGITS(6, "100000"),
  KG: DIGITS(6, "720001"),
  TJ: DIGITS(6, "734001"),
  TM: DIGITS(6, "744000"),

  /* Middle East */
  AE: NONE,
  /* Five digits, optionally a four-digit extension. */
  SA: { required: true, pattern: "^\\d{5}(-\\d{4})?$", placeholder: "11564", label: "Postal code" },
  QA: NONE,
  KW: DIGITS(5, "13001"),
  BH: { required: true, pattern: "^\\d{3,4}$", placeholder: "317", label: "Block number", numeric: true },
  OM: DIGITS(3, "112"),
  JO: DIGITS(5, "11118"),
  TR: DIGITS(5, "34000"),
  /* Five digits before 2013, seven since; both are still in circulation. */
  IL: { required: true, pattern: "^\\d{5}(\\d{2})?$", placeholder: "9103401", label: "Postal code", numeric: true },
  /* Four digits, or four and four written with a space. */
  LB: { required: true, pattern: "^\\d{4}( ?\\d{4})?$", placeholder: "1107 2020", label: "Postal code" },
  IQ: DIGITS(5, "10001"),

  /* Africa */
  NG: DIGITS(6, "100001"),
  ZA: DIGITS(4, "8001"),
  KE: DIGITS(5, "00100"),
  GH: NONE,
  EG: DIGITS(5, "11511"),
  MA: DIGITS(5, "10000"),
  TZ: DIGITS(5, "11101"),
  UG: NONE,
  ET: DIGITS(4, "1000"),

  /* Latin America */
  MX: DIGITS(5, "06000"),
  /* CEP: eight digits, written 01310-100. */
  BR: { required: true, pattern: "^\\d{5}-?\\d{3}$", placeholder: "01310-100", label: "CEP" },
  /* CPA since 1998 — letter, four digits, three letters — with the old
     four-digit form still widely quoted. */
  AR: {
    required: true,
    pattern: "^([A-Z]\\d{4}[A-Z]{3}|\\d{4})$",
    placeholder: "C1002AAP",
    label: "Postal code",
  },
  CO: DIGITS(6, "110111"),
  CL: DIGITS(7, "8320000"),
  PE: DIGITS(5, "15001"),
};

/** The fallback for anything not listed: asked for, and not second-guessed. */
export const DEFAULT_POSTCODE: PostcodeSpec = {
  required: true,
  pattern: "^[A-Z0-9][A-Z0-9 -]{1,10}$",
  placeholder: "",
  label: "Postcode",
};

export function postcodeFor(countryCode?: string | null): PostcodeSpec {
  const code = String(countryCode || "").toUpperCase();
  return POSTCODES[code] ?? DEFAULT_POSTCODE;
}

/**
 * Null when it is acceptable, a sentence when it is not.
 *
 * Case and surrounding space are forgiven because people paste addresses; the
 * internal shape is not, because that is the whole point of the check.
 */
export function validatePostcode(countryCode: string | null, value: string): string | null {
  const spec = postcodeFor(countryCode);
  const raw = String(value || "").trim().toUpperCase();
  const what = midSentence(spec.label || "Postcode");

  if (!raw) return spec.required ? `Enter your ${what}` : null;
  if (!spec.required) return null;
  if (!spec.pattern) return null;

  return new RegExp(spec.pattern).test(raw)
    ? null
    : `That does not look like a ${what}${
        spec.placeholder ? ` — they look like ${spec.placeholder}` : ""
      }`;
}

/**
 * A label dropped into the middle of a sentence.
 *
 * `toLowerCase()` on the whole thing turns "PIN code" into "pin code" and
 * "CEP" into "cep", which reads as a typo in the two countries whose word for
 * this is an initialism. Only the first letter moves, and only when the second
 * one is not already a capital.
 */
function midSentence(label: string): string {
  if (/^[A-Z][A-Z]/.test(label)) return label;
  return label.charAt(0).toLowerCase() + label.slice(1);
}
