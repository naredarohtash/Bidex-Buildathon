"use client";

/**
 * A phone number, with the country worked out from the number itself.
 *
 * The field this replaces was a plain text input with `+91 98765 43210` as
 * placeholder text. Everything it knew about a phone number was in that
 * placeholder: no flag, no dial code, no idea whether what had been typed was
 * a number we could ever call. On a form whose whole purpose is proving who
 * somebody is, in a product used from about sixty countries, that is the field
 * most likely to be filled in wrongly and the one where wrong costs the most —
 * a verification held up for a week over a missing country code.
 *
 * Two ways in, and they agree with each other:
 *
 *  - **Type it.** Leading `+` and digits are matched against every dial code
 *    we hold, longest first, and the flag appears the moment the code is
 *    unambiguous. `+9` is nothing yet; `+91` is India and says so.
 *  - **Pick it.** The flag is a button, and the list is searchable by country
 *    name or by code — because somebody who does not know their own dial code
 *    knows the name of the place they live.
 *
 * The value handed back out is one string in E.164 — `+919876543210`, a plus
 * and digits and nothing else — because that is the only thing the `phone`
 * column will accept: it is checked against `^[+0-9]+$`, so the spaced version
 * this used to emit was rejected outright and took the whole save with it.
 * The split into country and national part, and the space between them, live
 * on screen and only on screen.
 *
 * ── Why longest-first, and why a preference map ────────────────────────────
 *
 * Dial codes are a prefix code in name only: +1 is twenty countries, +7 is
 * two, and +44 contains +44 1481 (Guernsey). Matching shortest-first would
 * make every North American number Anguilla, whichever happens to sort first.
 * So: longest match wins, and where a code is genuinely shared, PREFERRED
 * names the one to assume. It is a guess either way — the number alone cannot
 * distinguish Ottawa from Chicago — and the picker is there for when the guess
 * is wrong.
 */

import * as React from "react";
import Image from "next/image";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadCountriesIndex, type Country } from "@/lib/countries";

/** Where a dial code belongs to more than one country, the one to assume. */
/**
 * A number the `phone` column will actually take.
 *
 * It is checked against `^[+0-9]+$` server-side, so punctuation of any kind —
 * the spaces people write numbers with, brackets around an area code — fails
 * the whole save with "Phone number must contain only digits and can start
 * with a plus sign". This component composes E.164 already; the helper is for
 * the forms that take a phone number through a plain text field, and as a last
 * gate on the payload of the ones that do not.
 */
export function toE164(value: string) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  if (!digits) return "";
  return raw.startsWith("+") ? `+${digits}` : digits;
}

const PREFERRED: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "44": "GB",
  "39": "IT",
  "47": "NO",
  "61": "AU",
  "212": "MA",
  "262": "RE",
  "290": "SH",
  "358": "FI",
  "500": "FK",
  "590": "GP",
  "596": "MQ",
  "599": "CW",
  "672": "NF",
};

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Digits allowed after the dial code. Ten covers India, the US, Canada and
      the UK — the places this platform verifies — and stopping there is what
      keeps a mistyped eleventh digit from reaching a form that will only tell
      you it is wrong after the round trip. Raise it for a country whose
      national numbers are longer. */
  maxNational?: number;
  /** ISO-2 of the country chosen elsewhere on the form, used as the opening guess. */
  defaultCountry?: string;
  /**
   * ISO-2 codes to offer. Omitted, every country is offered.
   *
   * The verification form passes the fifty-six we actually verify in. Offering
   * a dial code we cannot serve is a dead end somebody only discovers at the
   * end of the form — the same reason the country select next to it is
   * narrowed — and a number we could never call is worse than no number.
   */
  allow?: string[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  invalid?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  maxNational = 10,
  defaultCountry,
  allow,
  placeholder = "98765 43210",
  disabled,
  id,
  className,
  invalid,
}: PhoneInputProps) {
  const [countries, setCountries] = React.useState<Country[]>([]);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  /* The country the person picked by hand. It outranks detection, so choosing
     Canada and then typing a +1 number does not silently flip back to the US. */
  const [picked, setPicked] = React.useState<string | null>(null);

  React.useEffect(() => {
    loadCountriesIndex().then((all) => {
      if (!allow || allow.length === 0) return setCountries(all);
      const permitted = new Set(allow.map((c) => c.toUpperCase()));
      setCountries(all.filter((c) => permitted.has(String(c.iso2).toUpperCase())));
    });
    // `allow` is a literal array at every call site; comparing by join keeps
    // this from re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(allow || []).join(",")]);

  /* Longest dial code first, so +441481 beats +44 and +44 beats +4. Built once
     per list rather than per keystroke. */
  const byLength = React.useMemo(
    () =>
      [...countries].sort(
        (a, b) => String(b.phonecode).length - String(a.phonecode).length
      ),
    [countries]
  );

  /* Detection runs over `byLength`, which is `countries` — so narrowing the
     offered list narrows what a typed dial code can resolve to. That is the
     behaviour we want: type +33 on the verification form and no flag appears,
     because France is not somewhere this account can be verified, and a flag
     appearing for a country the form will not accept is a promise the next
     step breaks. */
  const detected = React.useMemo(() => {
    const digits = String(value || "").replace(/[^\d+]/g, "");
    if (!digits.startsWith("+")) return null;
    const bare = digits.slice(1);
    for (const country of byLength) {
      const code = String(country.phonecode).replace(/\D/g, "");
      if (!code || !bare.startsWith(code)) continue;
      /* Every country sharing this code, so the preference can be applied
         rather than whichever happened to sort first. */
      const sharing = byLength.filter(
        (c) => String(c.phonecode).replace(/\D/g, "") === code
      );
      if (sharing.length === 1) return sharing[0];
      const preferred = PREFERRED[code];
      return sharing.find((c) => c.iso2 === preferred) || sharing[0];
    }
    return null;
  }, [value, byLength]);

  const fallback = React.useMemo(
    () =>
      countries.find((c) => c.iso2 === (picked || defaultCountry)?.toUpperCase()) || null,
    [countries, picked, defaultCountry]
  );

  /* Detection wins while the field actually carries a `+`, because the number
     on screen is more true than any guess about it. */
  const country = detected || fallback;
  const dial = country ? `+${String(country.phonecode).replace(/\D/g, "")}` : null;

  /* What is left after the dial code — the part somebody is actually typing. */
  const national = React.useMemo(() => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (dial && raw.replace(/[^\d+]/g, "").startsWith(dial)) {
      return raw.replace(/[^\d+]/g, "").slice(dial.length);
    }
    return raw.startsWith("+") ? raw : raw.replace(/[^\d]/g, "");
  }, [value, dial]);

  const compose = (code: string | null, rest: string) => {
    const digits = rest.replace(/\D/g, "").slice(0, maxNational);
    if (!code) return digits;
    return digits ? `${code}${digits}` : code;
  };

  const onType = (typed: string) => {
    /* Typed a `+` themselves: they are writing the whole number, so hand it
       through untouched and let detection do its work on it. */
    if (typed.trim().startsWith("+")) {
      setPicked(null);
      /* Their punctuation, dropped on the way out rather than on the way in:
         they can type "+91 98765 43210" if that is how they write it, and what
         leaves here is still the plus and the digits. Fifteen is E.164's own
         ceiling, dial code included — the per-country cap applies once the
         code is known and the rest is being typed into the national box. */
      const bare = typed.replace(/[^\d+]/g, "");
      onChange(bare.startsWith("+") ? `+${bare.replace(/\D/g, "").slice(0, 15)}` : bare.slice(0, 15));
      return;
    }
    onChange(compose(dial, typed));
  };

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    const bare = q.replace(/[^\d]/g, "");
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso2.toLowerCase() === q ||
        (!!bare && String(c.phonecode).startsWith(bare))
    );
  }, [countries, query]);

  return (
    <div
      className={cn(
        "flex h-11 w-full items-stretch overflow-hidden rounded-md border bg-background",
        "focus-within:border-foreground/40 focus-within:ring-1 focus-within:ring-foreground/15",
        invalid ? "border-destructive/60" : "border-border",
        disabled && "opacity-60",
        className
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={country ? `Country: ${country.name}` : "Choose a country"}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-r border-border px-2.5",
              "text-[14px] text-foreground outline-none hover:bg-muted/60",
              "focus-visible:bg-muted/60 disabled:cursor-not-allowed"
            )}
          >
            {country ? (
              <Image
                src={`/img/flag/${country.iso2.toLowerCase()}.webp`}
                alt={country.name}
                width={20}
                height={15}
                className="rounded-[2px] object-cover"
              />
            ) : (
              <Globe className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-medium tabular-nums">{dial || "+"}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        {/* Above the account panel, which is itself a z-[9999] portal. */}
        <PopoverContent className="z-[10060] w-[280px] p-0" align="start">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Country or code"
              className="h-6 w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                No country matches that.
              </p>
            ) : (
              results.map((c) => (
                <button
                  key={c.iso2}
                  type="button"
                  onClick={() => {
                    setPicked(c.iso2);
                    setOpen(false);
                    setQuery("");
                    onChange(compose(`+${String(c.phonecode).replace(/\D/g, "")}`, national));
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                    "text-foreground hover:bg-muted/70"
                  )}
                >
                  <Image
                    src={`/img/flag/${c.iso2.toLowerCase()}.webp`}
                    alt=""
                    width={20}
                    height={15}
                    className="shrink-0 rounded-[2px] object-cover"
                  />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    +{String(c.phonecode).replace(/\D/g, "")}
                  </span>
                  {country?.iso2 === c.iso2 && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <input
        id={id}
        value={national}
        onChange={(e) => onType(e.target.value)}
        disabled={disabled}
        inputMode="tel"
        autoComplete="tel-national"
        /* The browser stops the eleventh digit, so nothing is silently
           swallowed on the way out: what is refused is refused under the
           cursor, where it can be seen. Only once the dial code is known —
           while they are still typing "+91" the whole number is in this box. */
        maxLength={dial ? maxNational : 16}
        placeholder={placeholder}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-3 text-[14px] text-foreground outline-none",
          "placeholder:text-muted-foreground disabled:cursor-not-allowed"
        )}
      />
    </div>
  );
}

export default PhoneInput;
