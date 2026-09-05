/**
 * The time zones the platform offers, and the only list of them.
 *
 * A named set rather than the browser's four hundred IANA ids: a trader picking
 * a clock wants "India" and "New York", not `Asia/Calcutta`, and offering the
 * full set means offering four spellings of the same city. Every screen that
 * asks anybody about a time zone reads this list — the chart, the settings
 * panel, the account screen and the admin's user form — so an account can never
 * hold a zone one of them cannot show back.
 *
 * It covers every country this platform verifies. That is not decoration: the
 * 56 in `backend/api/kyc/documents/rules.ts` are the countries somebody can
 * hold an account from, and a Nepali or a Bhutanese trader whose own clock is
 * not on the list has to pick a neighbour's and read every expiry with an
 * offset in their head. Kathmandu is +5:45 and Yangon +6:30 — there is no
 * neighbour that is close enough.
 *
 * `flagCode` is an ISO-3166 alpha-2, or "GLO" for UTC, which is not a country.
 */
export interface TimeZone {
  /** IANA id, and what gets stored. */
  id: string;
  /** The short form a chart axis has room for. */
  label: string;
  /** The city or region a person recognises. */
  name: string;
  flagCode: string;
}

export const TIME_ZONES: TimeZone[] = [
  { id: "UTC", label: "UTC", name: "Universal Time", flagCode: "GLO" },
  
  // Americas
  { id: "America/New_York", label: "EST/EDT", name: "New York", flagCode: "US" },
  { id: "America/Chicago", label: "CST/CDT", name: "Chicago", flagCode: "US" },
  { id: "America/Denver", label: "MST/MDT", name: "Denver", flagCode: "US" },
  { id: "America/Phoenix", label: "MST", name: "Phoenix", flagCode: "US" },
  { id: "America/Los_Angeles", label: "PST/PDT", name: "Los Angeles", flagCode: "US" },
  { id: "America/Anchorage", label: "AKST/AKDT", name: "Alaska", flagCode: "US" },
  { id: "America/Honolulu", label: "HST", name: "Honolulu", flagCode: "US" },
  { id: "America/Toronto", label: "EST/EDT", name: "Toronto", flagCode: "CA" },
  { id: "America/Vancouver", label: "PST/PDT", name: "Vancouver", flagCode: "CA" },
  { id: "America/Mexico_City", label: "CST/CDT", name: "Mexico City", flagCode: "MX" },
  { id: "America/Bogota", label: "COT", name: "Bogota", flagCode: "CO" },
  { id: "America/Lima", label: "PET", name: "Lima", flagCode: "PE" },
  { id: "America/Santiago", label: "CLT/CLST", name: "Santiago", flagCode: "CL" },
  { id: "America/Argentina/Buenos_Aires", label: "ART", name: "Buenos Aires", flagCode: "AR" },
  { id: "America/Sao_Paulo", label: "BRT", name: "Sao Paulo", flagCode: "BR" },
  { id: "America/Caracas", label: "VET", name: "Caracas", flagCode: "VE" },
  
  // Europe
  { id: "Europe/London", label: "GMT/BST", name: "London", flagCode: "GB" },
  { id: "Europe/Dublin", label: "GMT/Ist", name: "Dublin", flagCode: "IE" },
  { id: "Europe/Paris", label: "CET/CEST", name: "Paris", flagCode: "FR" },
  { id: "Europe/Berlin", label: "CET/CEST", name: "Frankfurt", flagCode: "DE" },
  { id: "Europe/Rome", label: "CET/CEST", name: "Rome", flagCode: "IT" },
  { id: "Europe/Madrid", label: "CET/CEST", name: "Madrid", flagCode: "ES" },
  { id: "Europe/Amsterdam", label: "CET/CEST", name: "Amsterdam", flagCode: "NL" },
  { id: "Europe/Brussels", label: "CET/CEST", name: "Brussels", flagCode: "BE" },
  { id: "Europe/Zurich", label: "CET/CEST", name: "Zurich", flagCode: "CH" },
  { id: "Europe/Stockholm", label: "CET/CEST", name: "Stockholm", flagCode: "SE" },
  { id: "Europe/Oslo", label: "CET/CEST", name: "Oslo", flagCode: "NO" },
  { id: "Europe/Copenhagen", label: "CET/CEST", name: "Copenhagen", flagCode: "DK" },
  { id: "Europe/Helsinki", label: "EET/EEST", name: "Helsinki", flagCode: "FI" },
  { id: "Europe/Athens", label: "EET/EEST", name: "Athens", flagCode: "GR" },
  { id: "Europe/Istanbul", label: "TRT", name: "Istanbul", flagCode: "TR" },
  { id: "Europe/Kiev", label: "EET/EEST", name: "Kyiv", flagCode: "UA" },
  { id: "Europe/Moscow", label: "MSK", name: "Moscow", flagCode: "RU" },
  
  // Middle East
  { id: "Asia/Jerusalem", label: "IST/IDT", name: "Jerusalem", flagCode: "IL" },
  { id: "Asia/Beirut", label: "EET/EEST", name: "Beirut", flagCode: "LB" },
  { id: "Asia/Amman", label: "AST", name: "Amman", flagCode: "JO" },
  { id: "Asia/Baghdad", label: "AST", name: "Baghdad", flagCode: "IQ" },
  { id: "Asia/Riyadh", label: "AST", name: "Riyadh", flagCode: "SA" },
  { id: "Asia/Kuwait", label: "AST", name: "Kuwait City", flagCode: "KW" },
  { id: "Asia/Qatar", label: "AST", name: "Doha", flagCode: "QA" },
  { id: "Asia/Bahrain", label: "AST", name: "Bahrain", flagCode: "BH" },
  { id: "Asia/Dubai", label: "GST", name: "Dubai", flagCode: "AE" },
  { id: "Asia/Muscat", label: "GST", name: "Muscat", flagCode: "OM" },
  { id: "Asia/Tehran", label: "IRST", name: "Tehran", flagCode: "IR" },

  // Africa
  { id: "Africa/Cairo", label: "EET/EEST", name: "Cairo", flagCode: "EG" },
  { id: "Africa/Casablanca", label: "WET/WEST", name: "Casablanca", flagCode: "MA" },
  { id: "Africa/Lagos", label: "WAT", name: "Lagos", flagCode: "NG" },
  { id: "Africa/Accra", label: "GMT", name: "Accra", flagCode: "GH" },
  { id: "Africa/Nairobi", label: "EAT", name: "Nairobi", flagCode: "KE" },
  { id: "Africa/Kampala", label: "EAT", name: "Kampala", flagCode: "UG" },
  { id: "Africa/Dar_es_Salaam", label: "EAT", name: "Dar es Salaam", flagCode: "TZ" },
  { id: "Africa/Addis_Ababa", label: "EAT", name: "Addis Ababa", flagCode: "ET" },
  { id: "Africa/Johannesburg", label: "SAST", name: "Johannesburg", flagCode: "ZA" },

  // South & Central Asia
  { id: "Asia/Kabul", label: "AFT", name: "Kabul", flagCode: "AF" },
  { id: "Asia/Karachi", label: "PKT", name: "Karachi", flagCode: "PK" },
  { id: "Asia/Tashkent", label: "UZT", name: "Tashkent", flagCode: "UZ" },
  { id: "Asia/Ashgabat", label: "TMT", name: "Ashgabat", flagCode: "TM" },
  { id: "Asia/Dushanbe", label: "TJT", name: "Dushanbe", flagCode: "TJ" },
  { id: "Asia/Almaty", label: "ALMT", name: "Almaty", flagCode: "KZ" },
  { id: "Asia/Bishkek", label: "KGT", name: "Bishkek", flagCode: "KG" },
  { id: "Indian/Maldives", label: "MVT", name: "Maldives", flagCode: "MV" },
  { id: "Asia/Kolkata", label: "IST", name: "India", flagCode: "IN" },
  { id: "Asia/Colombo", label: "SLST", name: "Colombo", flagCode: "LK" },
  { id: "Asia/Kathmandu", label: "NPT", name: "Kathmandu", flagCode: "NP" },
  { id: "Asia/Dhaka", label: "BST", name: "Dhaka", flagCode: "BD" },
  { id: "Asia/Thimphu", label: "BTT", name: "Thimphu", flagCode: "BT" },

  // South-East & East Asia
  { id: "Asia/Yangon", label: "MMT", name: "Yangon", flagCode: "MM" },
  { id: "Asia/Bangkok", label: "ICT", name: "Bangkok", flagCode: "TH" },
  { id: "Asia/Phnom_Penh", label: "ICT", name: "Phnom Penh", flagCode: "KH" },
  { id: "Asia/Vientiane", label: "ICT", name: "Vientiane", flagCode: "LA" },
  { id: "Asia/Ho_Chi_Minh", label: "ICT", name: "Ho Chi Minh City", flagCode: "VN" },
  { id: "Asia/Jakarta", label: "WIB", name: "Jakarta", flagCode: "ID" },
  { id: "Asia/Singapore", label: "SGT", name: "Singapore", flagCode: "SG" },
  { id: "Asia/Kuala_Lumpur", label: "MYT", name: "Kuala Lumpur", flagCode: "MY" },
  { id: "Asia/Brunei", label: "BNT", name: "Brunei", flagCode: "BN" },
  { id: "Asia/Manila", label: "PST", name: "Manila", flagCode: "PH" },
  { id: "Asia/Hong_Kong", label: "HKT", name: "Hong Kong", flagCode: "HK" },
  { id: "Asia/Macau", label: "CST", name: "Macau", flagCode: "MO" },
  { id: "Asia/Shanghai", label: "CST", name: "Shanghai", flagCode: "CN" },
  { id: "Asia/Taipei", label: "CST", name: "Taipei", flagCode: "TW" },
  { id: "Asia/Ulaanbaatar", label: "ULAT", name: "Ulaanbaatar", flagCode: "MN" },
  { id: "Asia/Seoul", label: "KST", name: "Seoul", flagCode: "KR" },
  { id: "Asia/Tokyo", label: "JST", name: "Tokyo", flagCode: "JP" },
  
  // Oceania
  { id: "Australia/Sydney", label: "AEST/AEDT", name: "Sydney", flagCode: "AU" },
  { id: "Australia/Melbourne", label: "AEST/AEDT", name: "Melbourne", flagCode: "AU" },
  { id: "Australia/Brisbane", label: "AEST", name: "Brisbane", flagCode: "AU" },
  { id: "Australia/Perth", label: "AWST", name: "Perth", flagCode: "AU" },
  { id: "Pacific/Auckland", label: "NZST/NZDT", name: "Auckland", flagCode: "NZ" },
  { id: "Pacific/Fiji", label: "FJT/FJST", name: "Fiji", flagCode: "FJ" }
];

/**
 * Old names for zones that are still on devices and in stored profiles.
 *
 * `Asia/Calcutta` and `Asia/Kolkata` are the same clock — the IANA database
 * keeps the first as an alias of the second — and offering both put "India ·
 * UTC+5:30" in the picker twice, one of them ticked and one of them not. The
 * list carries the current name only; anything that arrives under an old one is
 * resolved to it, so a device that reports the alias still lands on its own
 * entry instead of appearing as a zone nobody recognises.
 */
export const ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kyiv": "Europe/Kiev",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Asia/Katmandu": "Asia/Kathmandu",
};

/** The id this platform stores, for whatever name arrived. */
export function canonicalZoneId(id?: string | null): string {
  const raw = String(id || "").trim();
  return ZONE_ALIASES[raw] || raw;
}

/** The listed zone for an id, old name or new. Null where it is not one of ours. */
export function findZone(id?: string | null): TimeZone | null {
  const canonical = canonicalZoneId(id);
  if (!canonical) return null;
  return TIME_ZONES.find((z) => z.id === canonical) || null;
}

/**
 * The zone's offset from UTC right now — "UTC+05:30", "UTC-04:00", "UTC+00:00".
 *
 * Read from the browser rather than stored, because half of these zones change
 * it twice a year and a table would be wrong for two months of each.
 *
 * Written in full, every time: two digits for the hour, always the minutes,
 * always the sign — including "UTC+00:00" for London in winter. The short form
 * ("UTC+5:30", "UTC-4", bare "UTC") saved four characters and cost a column:
 * down a list of ninety zones the offsets no longer lined up, +5:30 and +530
 * were a glance apart, and the one zone written as a word rather than a number
 * read as a missing value rather than as zero.
 */
export function utcOffset(id: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: id,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value || "";
    /* `longOffset` gives "GMT+05:30", and "GMT" alone at zero. */
    const m = raw.match(/([+-])(\d{2}):(\d{2})/);
    if (!m) return "UTC+00:00";
    const [, sign, hours, minutes] = m;
    return `UTC${sign}${hours}:${minutes}`;
  } catch {
    return "UTC+00:00";
  }
}

/**
 * What the clock actually says in a zone, right now.
 *
 * `Intl` rather than arithmetic on the offset above: that offset is a formatted
 * string, and re-parsing it to add onto a Date is one daylight-saving boundary
 * away from being an hour wrong twice a year — in the two weeks where the
 * northern and southern hemispheres disagree, in both directions at once.
 */
export function zoneTime(id: string, at: Date = new Date()): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: id,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
    const hour = read("hour");
    const minute = read("minute");
    if (Number.isNaN(hour) || Number.isNaN(minute)) return { hour: 0, minute: 0 };
    /* `hour12: false` reports midnight as 24 in some engines. */
    return { hour: hour % 24, minute };
  } catch {
    return { hour: 0, minute: 0 };
  }
}

/**
 * "India · UTC+05:30" — one spelling of a zone, wherever it is offered.
 *
 * No flag in the string. It used to open with the emoji one, which is a waving
 * rectangle on Apple's platforms and two letters in a box on much of Windows;
 * callers that can draw JSX put the flat `Flag` asset beside this instead.
 *
 * The abbreviation used to be the second half: "India · IST". Half of them are
 * ambiguous (CST is Chicago, Shanghai and Havana), a few were mis-cased into
 * words ("Ist"), and none of them answer the question somebody reading a clock
 * setting actually has, which is how far it is from everybody else's. The
 * offset does, and it cannot be mis-cased. `label` stays on the type for the
 * chart axis, which has room for four characters and not for eleven.
 */
export function zoneLabel(zone: TimeZone): string {
  return `${zone.name} \u00B7 ${utcOffset(zone.id)}`;
}

/**
 * The zone as a saved fact: "IST · UTC+05:30".
 *
 * `zoneLabel` names the *place* — "India · UTC+05:30" — which is what a person
 * choosing from a list of sixty needs, and it is what the pickers use. Once the
 * zone is chosen and sitting in a card of account details, the place is no
 * longer the question: the row is telling a trader which clock their account
 * runs on, and the answer to that is the abbreviation an axis and a session
 * table are labelled with.
 *
 * A zone the browser reported that we do not list carries its IANA id in
 * `label`, which is not an abbreviation — those keep the place name.
 */
export function zoneShortLabel(zone: TimeZone): string {
  const abbrev = /^[A-Z0-9+\-/]{2,9}$/.test(zone.label) ? zone.label : zone.name;
  return `${abbrev} \u00B7 ${utcOffset(zone.id)}`;
}
