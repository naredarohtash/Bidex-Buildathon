/**
 * What to call somebody from a country.
 *
 * "Nationality: India" is a country, not a nationality — the row asks what
 * somebody *is*, and the answer to that is "Indian". There is no algorithm for
 * this: India takes -n, China -ese, France -ch, the Netherlands is Dutch, and
 * Switzerland is Swiss. So it is a table.
 *
 * It covers every country this platform verifies — the 56 in
 * `backend/api/kyc/documents/rules.ts`, which are the only ones an account can
 * hold as its identity country — plus the rest of the G20 and Europe, which is
 * where the addresses that are not identity countries mostly are. Anything
 * missing falls back to the country's own name, which is wrong in the way the
 * old row was wrong rather than wrong in a new way.
 *
 * Adjective form, not the plural noun: "Indian", never "Indians". The row shows
 * one person's nationality.
 */

const DEMONYMS: Record<string, string> = {
  /* South Asia */
  IN: "Indian", PK: "Pakistani", BD: "Bangladeshi", NP: "Nepali", LK: "Sri Lankan",
  AF: "Afghan", BT: "Bhutanese", MV: "Maldivian",
  /* South-East Asia */
  ID: "Indonesian", MY: "Malaysian", PH: "Filipino", TH: "Thai", VN: "Vietnamese",
  KH: "Cambodian", MM: "Burmese", LA: "Lao", SG: "Singaporean", BN: "Bruneian",
  /* East & Central Asia */
  CN: "Chinese", JP: "Japanese", KR: "South Korean", TW: "Taiwanese",
  HK: "Hong Konger", MO: "Macanese", MN: "Mongolian", KZ: "Kazakh",
  UZ: "Uzbek", KG: "Kyrgyz", TJ: "Tajik", TM: "Turkmen",
  /* Middle East */
  AE: "Emirati", SA: "Saudi", QA: "Qatari", KW: "Kuwaiti", BH: "Bahraini",
  OM: "Omani", JO: "Jordanian", TR: "Turkish", IL: "Israeli", LB: "Lebanese",
  IQ: "Iraqi", IR: "Iranian", SY: "Syrian", YE: "Yemeni",
  /* Africa */
  NG: "Nigerian", ZA: "South African", KE: "Kenyan", GH: "Ghanaian",
  EG: "Egyptian", MA: "Moroccan", TZ: "Tanzanian", UG: "Ugandan",
  ET: "Ethiopian", DZ: "Algerian", TN: "Tunisian", SN: "Senegalese",
  CI: "Ivorian", CM: "Cameroonian", ZW: "Zimbabwean", ZM: "Zambian",
  /* Americas */
  US: "American", CA: "Canadian", MX: "Mexican", BR: "Brazilian",
  AR: "Argentine", CO: "Colombian", CL: "Chilean", PE: "Peruvian",
  VE: "Venezuelan", EC: "Ecuadorian", BO: "Bolivian", PY: "Paraguayan",
  UY: "Uruguayan", CR: "Costa Rican", PA: "Panamanian", DO: "Dominican",
  GT: "Guatemalan", JM: "Jamaican", TT: "Trinidadian",
  /* Europe */
  GB: "British", IE: "Irish", FR: "French", DE: "German", ES: "Spanish",
  PT: "Portuguese", IT: "Italian", NL: "Dutch", BE: "Belgian",
  LU: "Luxembourgish", CH: "Swiss", AT: "Austrian", SE: "Swedish",
  NO: "Norwegian", DK: "Danish", FI: "Finnish", IS: "Icelandic",
  PL: "Polish", CZ: "Czech", SK: "Slovak", HU: "Hungarian", RO: "Romanian",
  BG: "Bulgarian", GR: "Greek", HR: "Croatian", SI: "Slovenian",
  RS: "Serbian", BA: "Bosnian", MK: "Macedonian", AL: "Albanian",
  ME: "Montenegrin", UA: "Ukrainian", BY: "Belarusian", RU: "Russian",
  MD: "Moldovan", LT: "Lithuanian", LV: "Latvian", EE: "Estonian",
  CY: "Cypriot", MT: "Maltese", GE: "Georgian", AM: "Armenian", AZ: "Azerbaijani",
  /* Oceania */
  AU: "Australian", NZ: "New Zealander", FJ: "Fijian", PG: "Papua New Guinean",
};

/**
 * The nationality for a country code — "IN" → "Indian".
 *
 * `fallback` is the country's own name, used where the table has no entry, so
 * the row still says something true rather than an ISO code.
 */
export function demonymFor(countryCode?: string | null, fallback?: string | null): string {
  const code = String(countryCode || "").toUpperCase();
  if (!code) return "";
  return DEMONYMS[code] || fallback || code;
}
