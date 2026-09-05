"use client";

/**
 * The profile, and the four things verification cannot proceed without.
 *
 * It used to be step one of the flow — a whole screen spent confirming data we
 * already hold. It sits on the screen before the flow now, beside the button
 * that starts it, so somebody whose profile is complete never sees a step for
 * it at all and somebody with gaps fills them without the flow having begun.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pencil, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/store/user";
import { DateOfBirthPicker } from "../date-of-birth-picker";
import { PhoneInput, toE164 } from "@/components/ui/phone-input";
import { CountrySelect } from "@/components/ui/country-select";
import { StateSelect } from "@/components/ui/state-select";
import { CitySelect } from "@/components/ui/city-select";
import { checkPostcode, postcodeSpec, useKycRules } from "./use-kyc-rules";
import { useCountryHint } from "./use-country-hint";
import { inputClass } from "./ui";
import { Ack, Notice } from "@/components/ui/dialog-kit";

/**
 * The size every control on this form is.
 *
 * Six of the nine fields here are not `<input>`s — they are the shared
 * Country, State and City selects and the date picker — and each carried its
 * own defaults: the selects come from `Button`/`Input` at h-10 and h-9 with a
 * *transparent* fill, the date picker was h-9 and `rounded-lg`, `inputClass`
 * is h-11 and `rounded-md`. So one row of the form held a 44px box beside a
 * 36px one, and the transparent ones showed the card through while their
 * neighbours showed `--background` — which is why the boxes looked like four
 * different kinds of field with the widths wandering row to row.
 *
 * Passed to all of them, so there is one answer instead of four. Height and
 * radius are last in each `cn` so they win over the component's own defaults.
 */
const CONTROL = "!h-10 w-full !rounded-md !bg-background";

export interface RequiredDetails {
  firstName?: string;
  phone?: string;
  dob?: string;
  address?: string;
  city?: string;
  state?: string;
  countryCode?: string;
  zip?: string;
}

/**
 * The one rule, expressed over plain fields.
 *
 * Written this way so the same function can judge the stored profile and the
 * half-filled form. It could not before: the gate read the profile, the Save
 * button read nothing at all, and "Save and continue" walked straight past an
 * empty date of birth into step two. A rule enforced in one of the two places
 * a value can come from is not enforced.
 */
export function detailGaps(d: RequiredDetails, zipRequired = true): string[] {
  const gaps: string[] = [];
  const has = (v?: string) => !!String(v || "").trim();

  if (!has(d.firstName)) gaps.push("First name");
  if (!has(d.dob)) gaps.push("Date of birth");
  if (!has(d.phone)) gaps.push("Phone number");
  /* The postcode is part of the address in fifty of the fifty-six countries
     and does not exist in the other six, so whether it counts as a gap is the
     country's answer, not ours. Defaulting to required keeps every caller that
     does not know the country — `missingFields` below, reading a stored
     profile — behaving as it always did. */
  const address = [d.address, d.city, d.state, d.countryCode];
  if (zipRequired) address.push(d.zip);
  if (!address.every(has)) gaps.push("Full address");
  return gaps;
}

export function missingFields(user: any): string[] {
  const p = readProfile(user);
  const l = p?.location || {};
  return detailGaps({
    firstName: user?.firstName,
    phone: user?.phone,
    dob: p?.dob,
    address: l.address,
    city: l.city,
    state: l.state,
    countryCode: l.countryCode || l.country,
    zip: l.zip,
  });
}

export function ProfileDetails({
  confirmed,
  onConfirm,
  onEditingChange,
  onSaved,
  correctable,
}: {
  confirmed: boolean;
  onConfirm: () => void;
  onEditingChange: (editing: boolean) => void;
  onSaved: () => void;
  /* True while the newest application has been sent back. The write-once
     fields open with it — see the note on `dobLocked`. */
  correctable?: boolean;
}) {
  const { user, updateUser } = useUserStore();
  const { countries } = useKycRules();
  const hint = useCountryHint();
  const profile = useMemo(() => readProfile(user), [user]);
  const gaps = useMemo(() => missingFields(user), [user]);
  /* The same 56 the document rules cover. A country we cannot verify is a
     country nobody should be able to pick on the way to verifying. */
  const allowed = useMemo(() => countries.map((c) => c.code), [countries]);

  const [editing, setEditingRaw] = useState(gaps.length > 0);
  const setEditing = useCallback(
    (next: boolean) => {
      setEditingRaw(next);
      onEditingChange(next);
    },
    [onEditingChange]
  );
  useEffect(() => {
    onEditingChange(gaps.length > 0);
    // Reported once, on mount: after that the setter above keeps it in step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [saving, setSaving] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [form, setForm] = useState(() => ({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phone: user?.phone || "",
    dob: profile?.dob || "",
    address: profile?.location?.address || "",
    city: profile?.location?.city || "",
    state: profile?.location?.state || "",
    countryCode: profile?.location?.countryCode || profile?.location?.country || "",
    zip: profile?.location?.zip || "",
  }));

  /* Write-once, *except* after a rejection.
  
     A date of birth is set once and then only an admin may change it, which is
     right while nobody has disputed it — and exactly wrong on the one screen
     where the platform has just told this person their details do not match
     their document. A rejection is usually a rejection *of* one of these
     fields, so "here is what to change" has to be followed by a form that lets
     them change it. The same rule is enforced on the server, which is what
     actually decides: see BIDEX_UNLOCK_ON_REJECTION. */
  const dobLocked = !!profile?.dob && !correctable;

  /* The country's own postcode rule — its shape, its name, and whether it has
     one at all. Recomputed as the country changes, so switching from India to
     the UAE takes the field away rather than leaving six digits behind. */
  const postcode = useMemo(
    () => postcodeSpec(countries, form.countryCode),
    [countries, form.countryCode]
  );

  /* Shown while typing rather than on submit. A postcode is the field people
     are least sure about, and "that does not look like a PIN code — they look
     like 110065" while the cursor is still in the box is worth more than the
     same sentence after a round trip. Only once something has been typed:
     an empty field is incomplete, not wrong. */
  const zipError = form.zip.trim() ? checkPostcode(postcode, form.zip) : null;

  /* Where the request came from, offered as the opening country when the
     profile has none. Only until the person touches the field — after that
     their answer stands, including if they clear it. */
  const openingCountry = hint.countryCode;
  const touchedCountry = useRef(false);
  useEffect(() => {
    if (touchedCountry.current) return;
    if (form.countryCode || !openingCountry) return;
    /* Only if it is somewhere we actually verify — a hint pointing at a country
       the form would refuse is worse than no hint. */
    if (!allowed.includes(openingCountry)) return;
    setForm((f) => (f.countryCode ? f : { ...f, countryCode: openingCountry }));
  }, [openingCountry, allowed, form.countryCode]);

  const save = async () => {
    /* Checked here, not only on the parent's Continue button — while this form
       is open that button is hidden, so this is the only gate on the path. */
    const gapsNow = detailGaps(form, postcode.required);
    if (gapsNow.length > 0) {
      setBlocked(gapsNow);
      return;
    }
    /* A postcode of the wrong shape is not a gap — the field is filled — but it
       is the single most common reason an address fails to match a document,
       so it stops the save the same way. */
    if (zipError) {
      setBlocked([]);
      return;
    }
    setBlocked([]);
    setSaving(true);
    const next = {
      ...(profile || {}),
      ...(dobLocked ? {} : form.dob ? { dob: form.dob } : {}),
      location: {
        ...(profile?.location || {}),
        address: form.address,
        city: form.city,
        state: form.state,
        countryCode: form.countryCode,
        country: form.countryCode,
        zip: form.zip,
      },
    };
    const ok = await updateUser({
      firstName: form.firstName,
      lastName: form.lastName,
      /* Last gate before the wire. The input composes E.164 on its own, but
         this is the save that fails as a whole when a single space reaches the
         `phone` column — and it fails on the identity check, which is the one
         form a person cannot simply skip. */
      phone: toE164(form.phone),
      profile: next,
    });
    setSaving(false);
    if (!ok) return;
    setEditing(false);
    /* Saved details are confirmed details — they were just read and corrected
       on this screen, so asking the same person to tick a box saying so is a
       step that carries no information. */
    onSaved();
  };

  if (editing) {
    return (
      <div className="space-y-3">
        {/* Said before the first field, not after the rejection.
        
            Every value below is compared against the document by a person, and
            a mismatch is the most common reason an application comes back — so
            it belongs where it changes what somebody types, which is above the
            name field rather than in a paragraph they reach after filling the
            form in. One sentence: a paragraph here would be read as the form's
            introduction and skipped. */}
        <p className="border-l-2 border-attention py-1 pl-3 text-[12px] leading-[17px] text-muted-foreground">
          Enter your details exactly as they appear on your ID.
        </p>

        <SectionLabel>About you</SectionLabel>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="First name" missing={blocked.includes("First name")}>
            <input
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Last name" optional>
            <input
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className={inputClass}
            />
          </Field>
        </div>

        {/* One row. These were stacked full-width, which put two short values
            on two long lines and pushed the address — the part that actually
            needs the width — below the fold of a 520px card. They belong
            together for a second reason: they are the two fields a reviewer
            checks against the document itself, so they are read as a pair. */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Phone number" missing={blocked.includes("Phone number")}>
            {/* The country is worked out from the number, and the flag says
                which one it landed on — see components/ui/phone-input. The
                country already chosen for the address is the opening guess,
                because almost nobody's phone is registered somewhere else. */}
            <PhoneInput
              value={form.phone}
              onChange={(phone) => setForm((f) => ({ ...f, phone }))}
              /* In order: the country already chosen for the address, then
                 wherever the request came from. Almost nobody's phone is
                 registered somewhere other than where they live, and where we
                 do not know yet, the connection is a better opening guess than
                 an empty box. */
              defaultCountry={form.countryCode || openingCountry || undefined}
              allow={allowed}
              invalid={blocked.includes("Phone number")}
              className={CONTROL}
            />
          </Field>

          <Field label="Date of birth" missing={blocked.includes("Date of birth")}>
            <DateOfBirthPicker
              value={form.dob}
              disabled={dobLocked}
              onChange={(iso) => setForm((f) => ({ ...f, dob: iso }))}
              className={CONTROL}
            />
          </Field>
        </div>

        <SectionLabel>Where you live</SectionLabel>

        <Field label="Your address" missing={blocked.includes("Full address") && !form.address}>
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="House or flat, street"
            className={inputClass}
          />
        </Field>

        {/* Two rows of two, not four full-width fields.
        
            Country and postcode each had a whole line to themselves — a select
            holding "India" and a box holding six digits, both stretched across
            560px, which put the address block four scrolls deep and made two
            short answers look like the longest questions on the form. Paired
            the way they are read: country then state narrows the place, city
            then postcode pins it. */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="Country">
            <CountrySelect
              allow={allowed}
              value={form.countryCode}
              onValueChange={(iso2: string) => {
                touchedCountry.current = true;
                setForm((f) => ({ ...f, countryCode: iso2, state: "", city: "" }));
              }}
              className={CONTROL}
            />
          </Field>
          <Field label="State">
            <StateSelect
              countryCode={form.countryCode}
              value={form.state}
              onValueChange={(v: string) => setForm((f) => ({ ...f, state: v, city: "" }))}
              disabled={!form.countryCode}
              className={CONTROL}
            />
          </Field>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label="City">
            <CitySelect
              countryCode={form.countryCode}
              stateName={form.state}
              value={form.city}
              onValueChange={(v: string) => setForm((f) => ({ ...f, city: v }))}
              disabled={!form.state}
              className={CONTROL}
            />
          </Field>

          {/* Only where the country has one. Six of the fifty-six do not — the
              UAE, Qatar, Hong Kong, Macau, Ghana, Uganda — and this field was
              required for all of them, so the only way past it was to invent a
              number and put it on a verification application. The label is
              theirs too: a PIN code in India, a CEP in Brazil, a postcode most
              other places. */}
          {postcode.required && (
            <Field
              label={postcode.label || "Postcode"}
              missing={blocked.includes("Full address") && !form.zip}
              error={zipError}
            >
              <input
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                placeholder={postcode.placeholder}
                inputMode={postcode.numeric ? "numeric" : undefined}
                className={cn(inputClass, zipError && "border-danger/60")}
              />
            </Field>
          )}
        </div>

        {/* No summary line here. `blocked` still marks the fields themselves —
            the label turns red and gains "· required" — and a banner repeating
            those same names is the same news twice, one of them away from the
            box you have to go back to anyway. */}

        <button
          type="button"
          onClick={save}
          disabled={saving || !!zipError}
          className="mt-0.5 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-[14px] font-semibold text-white hover:bg-blue-500 active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save and continue
        </button>
      </div>
    );
  }

  const lines = [
    profile?.location?.address,
    [profile?.location?.city, profile?.location?.state].filter(Boolean).join(", "),
    [profile?.location?.zip, profile?.location?.countryCode].filter(Boolean).join(" "),
  ].filter(Boolean) as string[];

  return (
    <>
      <dl className="divide-y divide-border">
        <Row label="Full name" value={[user?.firstName, user?.lastName].filter(Boolean).join(" ")} />
        <Row label="Date of birth" value={longDate(profile?.dob)} />
        <Row label="Phone number" value={user?.phone} />
        <div className={ROW}>
          <dt className="text-[13px] leading-snug text-muted-foreground">Address</dt>
          <dd className="min-w-0 text-right">
            {lines.map((l) => (
              <span key={l} className="block text-[13px] font-medium leading-[18px] text-foreground">
                {l}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      {/* A button, not an underlined word. Editing these is the second thing
          anybody does on this screen — half of them arrive to find a typo in
          their own street — and a text link under a list of facts reads as a
          footnote about the list rather than as the way to change it. */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-muted px-3",
          "text-[12.5px] font-semibold text-foreground hover:opacity-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
        )}
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit these details
      </button>

      {/* The same instruction the edit form opens with, said once more at the
          point it is being confirmed rather than typed — and in the panel this
          product gives a consequence, rather than as a rule down the margin.
          Shorter here: the reader has these details in front of them and is
          checking, not filling in. */}
      <div className="mt-4">
        <Notice tone="warn">
          Please make sure these match your ID. If they do not, we may not be able to approve you.
        </Notice>
      </div>

      {/* The acknowledgement, in the shape every acknowledgement in this
          product has: a 22px box that goes green when it is true. It was a
          bordered full-width row with a 16px square in it, which is a *choice
          row* — the shape used for picking between things — carrying a
          statement there is only one of. */}
      <div className="mt-4">
        <Ack checked={confirmed} onChange={onConfirm}>
          These details match my ID, and the ID is mine.
        </Ack>
      </div>
    </>
  );
}



/**
 * A labelled field.
 *
 * Sentence case at 12px, not caps at 10.5. Two reasons, and neither is taste.
 * A capitalised 10.5px label is a word with its shape removed — you decode it
 * letter by letter — and on the form where somebody is being asked for their
 * date of birth and their street, decoding is exactly the cost you do not want
 * to add. And 10.5px is half a pixel: a 2x screen resolves it onto real device
 * pixels, a 1x Windows panel draws each stem across two of them at half
 * strength, which is the whole of the "faded and not sharp" report.
 */
function Field({
  label,
  children,
  missing,
  optional,
  error,
}: {
  label: string;
  children: React.ReactNode;
  missing?: boolean;
  optional?: boolean;
  /** Said under the field while it is being typed, not after a round trip. */
  error?: string | null;
}) {
  return (
    <div>
      <label
        className={cn(
          "mb-1 block text-[12px] font-medium leading-[16px]",
          missing || error ? "text-danger" : "text-foreground"
        )}
      >
        {label}
        {optional && <span className="font-normal text-muted-foreground"> · optional</span>}
        {missing && <span className="font-normal"> · required</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-[11px] leading-[15px] text-danger">{error}</p>}
    </div>
  );
}

/** A quiet rule between the two halves of the form. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {children}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function smallBtn(kind: "primary" | "ghost") {
  return cn(
    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium active:scale-[0.97]",
    "disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
    kind === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-500"
      : "border border-border bg-background text-foreground hover:bg-muted"
  );
}


export function readProfile(user: any): any {
  const raw = user?.profile;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

export function longDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Label left, value flushed right — both columns end on one edge.
 *
 * The label column is `auto` rather than a fixed 104px, so it is exactly as
 * wide as the longest label instead of stranding a hand's width of nothing in
 * the middle of the short rows. Aligning the values right gives the column of
 * facts a straight edge on the side the reader is already scanning, and the
 * address's three lines share that edge, so the block reads as one value
 * rather than three lines that happen to be under each other.
 */
const ROW = "grid grid-cols-[auto_1fr] items-baseline gap-6 py-2.5";

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={ROW}>
      <dt className="text-[13px] leading-snug text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right text-[13px]", value ? "font-medium text-foreground" : "text-muted-foreground")}>
        {value || "Not set"}
      </dd>
    </div>
  );
}
