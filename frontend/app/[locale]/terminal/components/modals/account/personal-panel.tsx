"use client";

/**
 * The profile: what this account says about you, and how to change it.
 *
 * Two things about the shape of this file.
 *
 * **Editing is a dialog, per card.** It was a whole-page form first, then
 * inline inputs in the card itself. Inline was worse than it sounds: an input
 * is taller than the line of text it replaces and the identity block is taller
 * still, so pressing Edit on Personal details grew that card by half its height
 * and pushed Location past the fold while the cards beside it stayed put — the
 * grid came apart on every edit. A dialog costs the page nothing. The card is
 * still the unit somebody thinks in ("my name", "my address") and still the
 * unit that changes; it just changes over the page rather than inside it.
 *
 * **Every field component is declared at module scope.** Declaring them inside
 * the component gives each one a new identity per render, so React unmounts and
 * remounts the input on every keystroke — the field empties and loses focus
 * after one character. That bug has shipped here before; keeping these out here
 * is what stops it coming back.
 *
 * The time zone list is the platform's own — the same TIME_ZONES the chart
 * header offers, with the same flags and city names — not the browser's 400
 * IANA identifiers. Offering a person Asia/Calcutta here and "India" on the
 * chart is two answers to one question.
 */

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { VerifiedMark } from "@/app/[locale]/(dashboard)/user/profile/components/kit/settings-kit";
/* The same two drawings the Security page's own rows carry — see the note on
   `MethodValue` below. */
import {
  AuthenticatorMark,
  EmailCodeMark,
} from "@/app/[locale]/(dashboard)/user/profile/components/premium/tabs/security/marks";
import { AlertTriangle, Lock } from "lucide-react";
import { useUserStore } from "@/store/user";
import { useToast } from "@/hooks/use-toast";
import { CountrySelect } from "@/components/ui/country-select";
import { StateSelect } from "@/components/ui/state-select";
import { CitySelect } from "@/components/ui/city-select";
import { getCountryNameAsync } from "@/lib/countries";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { TIERS, TierBars, resolveTierByUsdBalance } from "../../../lib/account-tiers";
import { findZone, zoneShortLabel } from "@/lib/time-zones";
import { TimeZoneSelect } from "@/components/ui/time-zone-select";
import { broadcastTimeZone } from "../../../lib/time-zone-sync";
import { postcodeSpec, useKycRules } from "./kyc/use-kyc-rules";
import { demonymFor } from "@/lib/demonyms";
import { Flag } from "@/components/ui/flag";
import { useKycState } from "./kyc/use-kyc-state";
import {
  IdentityFields,
  validateDocument,
  validateDob,
  type IdentityDocument,
} from "./identity-fields";
import { LifeBuoy } from "lucide-react";
import { DialogButton, Notice } from "@/components/ui/dialog-kit";
import { openSupport } from "../../../lib/open-support";
import {
  Chip,
  CopyValue,
  DialogField,
  EditDialog,
  EditableAvatar,
  LockedFootnote,
  ProfileCard,
  Row,
  ScatterGrid,
  editInputClass,
  type Tone,
} from "./profile-kit";
import { useAvatarUpload } from "./use-avatar-upload";
import { KycGate } from "./kyc-gate";
import { resolveKycStage } from "./kyc-state";
import { cn } from "@/lib/utils";

/* ── small helpers ────────────────────────────────────────────────────── */

/* Offered, not inferred. Nothing here derives a gender from a name or a title,
   and "prefer not to say" is a real answer rather than a gap. */
const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "undisclosed", label: "Prefer not to say" },
] as const;

const METHOD_LABEL: Record<string, string> = {
  APP: "Authenticator app",
  EMAIL: "Email code",
  SMS: "Text message",
};

/* The drawing that goes with each one, taken from the Security page rather
   than redrawn: the row here reports a thing that is set up over there, and a
   second picture of the same authenticator is a second thing to recognise.

   Text-message codes have no mark because the Security page does not offer
   them — the type still exists on the server, so an old account can be sitting
   on one, and it gets the words alone. */
const METHOD_MARK: Record<string, React.ComponentType<{ size?: number }>> = {
  APP: AuthenticatorMark,
  EMAIL: EmailCodeMark,
};

/**
 * The second factor, as its own logo and its name.
 *
 * It was a bordered green chip reading "Email code", which is the shape this
 * card uses for a state that needs reading — the same shape "Off" and "Not
 * started" wear one row down. But which method is switched on is not a verdict
 * on the account; it is a thing, and the Security page already draws that
 * thing. Showing the drawing makes the two screens one product, and it is
 * recognised before the words under it are read.
 */
function MethodValue({ type, label }: { type?: string | null; label: string }) {
  const Mark = METHOD_MARK[String(type || "").toUpperCase()];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {Mark && (
        <span className="flex shrink-0">
          <Mark size={16} />
        </span>
      )}
      <span
        className="min-w-0 truncate text-[13px] font-medium leading-snug text-foreground"
        title={label}
      >
        {label}
      </span>
    </span>
  );
}

/* Known initialisms keep their capitals; everything else is a word. */
const DOC_INITIALISMS = new Set([
  "id", "pan", "cnic", "nin", "ssn", "tin", "bvn", "nik", "cpf", "rg", "sin", "nric", "mykad",
]);

/**
 * What the document is called, rather than what it is keyed by.
 *
 * The row printed the stored type verbatim, and that is a slug: `passport`,
 * `national_id`, or `AADHAAR` from the profiles that saved it upper case — so
 * the same card said "Indian" in one row and "passport" in the next. The
 * country's own rules carry the proper name and are used when they have
 * loaded, because they know that India's is "Aadhaar" and not "Aadhaar Card".
 * This is the fallback for when they have not, and for a document from a list
 * that has since changed.
 */
function documentName(raw?: string | null) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) =>
      DOC_INITIALISMS.has(w.toLowerCase())
        ? w.toUpperCase()
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

function longDate(v?: string | Date | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The same date, with the hour a trader reads it in — "22 July 2026 · 1345HRS".
 *
 * Four digits and no colon, which is how a time is written everywhere else this
 * product shows one: an expiry, a position's open, the clock in the header. A
 * "1:45 pm" in the middle of an account record is a different clock from the
 * one the rest of the screen keeps.
 */
function longDateTime(v?: string | Date | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const hhmm = `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
  return `${longDate(d)} · ${hhmm}HRS`;
}

/* Enough to recognise your own document, not enough to be worth reading over
   a shoulder. */
/* `XXXXX1234`, not `••••••••1234`.

   A run of bullets is the browser's password dot, and at 13px in a row of
   plain facts it read as a rendering fault — a line of specks somebody has to
   decide is deliberate. X is what a redacted number looks like on paper, and
   it survives being read aloud to support.

   Five of them, whatever the length. Repeating the real length would publish
   how many digits the document has, which is one of the few things worth
   knowing about a number you cannot see. */
function maskDocument(number?: string) {
  if (!number) return "";
  const s = String(number).trim();
  return s.length <= 4 ? s : `XXXXX${s.slice(-4)}`;
}

function safeParse(v: string) {
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

/* ── module-scope form controls ───────────────────────────────────────

   Declared out here, not inside the component. Declaring them inside gives
   each one a new identity per render, so React unmounts and remounts the input
   on every keystroke — the field empties and loses focus after one character.
   That bug has shipped here before. */

/**
 * One name in, two columns out.
 *
 * Split at the last space, so "Rahul Kumar Saini" files Saini as the surname
 * and keeps the rest as the given name — which is the way a document reads,
 * and the way every list that sorts by surname needs it. A single word is a
 * first name with no surname rather than a surname with no first name: the
 * required column is the one that gets filled.
 */
function splitName(full: string): [string, string] {
  const name = full.trim().replace(/\s+/g, " ");
  const cut = name.lastIndexOf(" ");
  return cut === -1 ? [name, ""] : [name.slice(0, cut), name.slice(cut + 1)];
}

/* Country, State and City are shared components built on `Button`, so each
   arrives at its own height with a transparent fill — h-10 beside a 44px input,
   showing the dialog through while its neighbours show `--background`. One
   answer for all three, last in `cn` so it wins. Same rule as CONTROL in the
   KYC form. */
const SELECT_CONTROL = cn(editInputClass, "justify-between font-normal");

const TextField = memo(function TextField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  autoComplete,
  hint,
  className,
  locked,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  hint?: string;
  className?: string;
  locked?: boolean;
}) {
  return (
    <DialogField label={label} hint={hint} className={className} locked={locked}>
      <input
        className={editInputClass}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </DialogField>
  );
});

const SelectField = memo(function SelectField({
  label,
  value,
  onChange,
  hint,
  className,
  children,
  disabled,
  locked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  locked?: boolean;
}) {
  return (
    <DialogField label={label} hint={hint} className={className} locked={locked}>
      <select
        className={cn(editInputClass, "disabled:cursor-not-allowed")}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </DialogField>
  );
});

/* ── the portrait ─────────────────────────────────────────────────────── */

/**
 * Photo, name, tick, tier, email — across the full width of the panel.
 *
 * Not a card, and not a banner either. The reference puts this on the page
 * itself, edge to edge; boxing it in a bordered rectangle turned it into a
 * fifth card sitting above four others, a container competing with its own
 * contents. There is no rule under it now and the grid is masked to dissolve
 * into the page at the sides and the bottom — a hard edge anywhere would put
 * the box back.
 *
 * The tick is earned twice over — the email is confirmed AND identity is
 * verified. A blue check on a half-verified account is worth nothing to the
 * person reading it, so a partial account gets none and the Security card says
 * which half is missing.
 *
 * The tier badge sits on the name's line rather than a row of its own. As a
 * third line it read as a third fact of equal weight to the name; beside the
 * name it reads as what it is, a qualifier on the person.
 */
const ProfileHero = memo(function ProfileHero({
  user,
  emailVerified,
  tier,
  uploading,
  onPickPhoto,
  onChooseAvatar,
}: {
  user: any;
  emailVerified: boolean;
  tier: (typeof TIERS)[keyof typeof TIERS];
  uploading: boolean;
  onPickPhoto: (file: File) => void;
  onChooseAvatar: (url: string) => void | Promise<unknown>;
}) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Your account";
  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <section className="relative overflow-hidden">
      <ScatterGrid id="profile-hero-grid" />

      <div className="relative flex flex-col items-center px-5 py-9">
        <EditableAvatar
          src={user?.avatar}
          initials={initials}
          uploading={uploading}
          onPick={onPickPhoto}
          onChooseAvatar={onChooseAvatar}
          size={92}
        />

        <div className="mt-3.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <h1 className="text-[23px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {name}
          </h1>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              "text-[10px] font-bold uppercase tracking-[0.09em]",
              tier.accent.badge
            )}
            title={`${tier.name} tier — up to ${tier.maxTradeUsd.toLocaleString()} per trade`}
          >
            <TierBars level={tier.level} size={8} filledClass={tier.accent.fill} />
            {tier.name}
          </span>
        </div>

        {/* A tick on the address, not a word after it. "Verified" spelled out in
            a green chip was the loudest thing under the name and said something
            the tick says in a glyph everybody already reads. Unverified still
            gets words, because that one needs to be read. */}
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {user?.email}
          {emailVerified ? (
            <VerifiedMark label={null} />
          ) : (
            <span
              className="inline-flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
              title="Email address not confirmed yet"
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              Unverified
            </span>
          )}
        </p>

      </div>
    </section>
  );
});

/* ── the panel ────────────────────────────────────────────────────────── */

type CardId = "personal" | "account" | "location";

const PersonalPanelBody = memo(function PersonalPanelBody() {
  const { user, updateUser } = useUserStore();
  const { toast } = useToast();
  const { countries } = useKycRules();
  /* Where the newest identity check stands. `correctable` opens the write-once
     fields — the one state they open in; `verified` shuts everything in
     Personal details, including the two that were never write-once. */
  const { correctable, verified } = useKycState();
  const realBalanceUsd = useBinaryStore((state) => state.realBalance ?? 0);
  /* The same hook the rail uses, so there is one definition of what changing
     your photo does rather than two that can drift. */
  const { pickPhoto, chooseAvatar, uploading } = useAvatarUpload();

  /* One card at a time. Two open at once means two drafts of the same stored
     profile object, and whichever saved second would overwrite the first. */
  const [editing, setEditing] = useState<CardId | null>(null);
  const [saving, setSaving] = useState(false);
  const [countryName, setCountryName] = useState("");

  const readProfile = useCallback(() => {
    const src: any =
      typeof user?.profile === "string" ? safeParse(user.profile) : user?.profile || {};
    return {
      ...src,
      location: {
        address: src.location?.address || "",
        city: src.location?.city || "",
        state: src.location?.state || "",
        country: src.location?.country || "",
        countryCode:
          src.location?.countryCode ||
          // Older profiles stored the iso2 in `country`; two letters there is a
          // code, not a country name.
          (String(src.location?.country || "").length === 2 ? src.location.country : ""),
        zip: src.location?.zip || "",
      },
    };
  }, [user?.profile]);

  const buildForm = useCallback(() => {
    const p = readProfile();
    const doc = p.identityDocument || {};
    return {
      /* One field, split on the way out — see `splitName`. */
      fullName: [user?.firstName, user?.lastName].filter(Boolean).join(" "),
      phone: user?.phone || "",
      nickname: p.nickname ?? p.displayName ?? "",
      gender: p.gender || "",
      timezone: p.timezone || "",
      location: p.location,
      dob: p.dob || "",
      document: {
        type: doc.type || "",
        number: doc.number || "",
      } as IdentityDocument,
    };
  }, [readProfile, user?.firstName, user?.lastName, user?.phone]);

  const [form, setForm] = useState(buildForm);

  /* Locked from what the SERVER holds, not from what is in the form. Reading
     the form would unlock the field the moment it was typed into. */
  const stored = readProfile();
  /* Once a check has passed, everything in this card is shut — the name and the
     gender too, which were never write-once. A person has read these off a
     document and approved them; an account that can rewrite any of it
     afterwards is an account where that approval means nothing. The route
     enforces the same thing, which is what actually decides: see
     BIDEX_LOCK_WHEN_VERIFIED. */
  const verifiedLock = verified;
  /* Except while a rejected application is waiting to be corrected. The
     rejection screen has said these details do not match the document, and the
     field it is usually talking about is this one — a date typed a month out.
     Somebody who comes here to fix it rather than through the KYC panel used to
     find the same "Ask support to change it" note and no way forward. The route
     opens the field in this state too: see BIDEX_UNLOCK_ON_REJECTION. */
  const dobLocked = verifiedLock || (!!stored.dob && !correctable);
  /* Write-once, and enforced by the route as well as here. Which documents
     exist at all depends on it, so changing it after a document is on file
     would leave an Aadhaar number filed under Pakistan — and after a review has
     passed it would move a verified account to a jurisdiction nobody checked
     it against. The rest of the address stays editable: people move house far
     more often than they change country. */
  const countryLocked = verifiedLock || !!stored.location?.countryCode;
  const documentLocked = verifiedLock || !!stored.identityDocument?.number;
  const phoneLocked = verifiedLock || !!user?.phone;

  const storedCountry = stored.location?.countryCode || "";
  /* What this country calls the field, for the row and for the input. Two
     lookups because the card shows what is stored while the dialog shows what
     is being typed, and the country can be changing in between. */
  const postcodeLabel = postcodeSpec(countries, storedCountry).label || "Postcode";
  const editPostcode = postcodeSpec(countries, form.location.countryCode);
  useEffect(() => {
    let cancelled = false;
    if (!storedCountry) {
      setCountryName("");
      return;
    }
    getCountryNameAsync(storedCountry).then((name) => {
      if (!cancelled) setCountryName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [storedCountry]);

  const openCard = useCallback(
    (card: CardId) => {
      // Always from the server's copy, so an abandoned draft never leaks into
      // the next edit of a different card.
      setForm(buildForm());
      setEditing(card);
    },
    [buildForm]
  );

  const cancel = useCallback(() => {
    setForm(buildForm());
    setEditing(null);
  }, [buildForm]);

  /**
   * Save one card.
   *
   * `profile` is a single JSON column, so every write has to carry the whole
   * object. Sending only the keys this card owns would replace it and take the
   * other cards' values with it — which is exactly how an address disappears
   * when somebody edits their display name.
   */
  const save = useCallback(
    async (card: CardId) => {
      const current = readProfile();
      const nextProfile: any = { ...current };
      const patch: any = {};

      if (card === "personal") {
        const spec = countries
          .find((c) => c.code === String(form.location.countryCode || "").toUpperCase())
          ?.documents.find(
            (d) =>
              d.id.toLowerCase().replace(/[^a-z]/g, "") ===
              String(form.document.type || "").toLowerCase().replace(/[^a-z]/g, "")
          );
        const docError = documentLocked ? null : validateDocument(form.document, spec);
        const dobError = dobLocked ? null : validateDob(form.dob);
        /* The name is the one field here that is not write-once and not
           optional: it is what every document is checked against. */
        const nameError = verifiedLock || form.fullName.trim() ? null : "Enter the name on your ID.";
        if (docError || dobError || nameError) {
          toast({
            title: "Check your details",
            description: nameError || docError || dobError || "",
            variant: "destructive",
          });
          return;
        }

        /* Not sent at all once a check has passed — the route would only
           overwrite them with what it holds, and a save that quietly discards
           half of what it sent is worse than one that never offered. */
        if (!verifiedLock) {
          const [firstName, lastName] = splitName(form.fullName);
          patch.firstName = firstName;
          patch.lastName = lastName;
          nextProfile.gender = form.gender;
        }
        // Omit it once set — the server keeps its own copy regardless, and
        // leaving it out makes the intent plain.
        if (!phoneLocked) patch.phone = form.phone;
        if (!dobLocked && form.dob) nextProfile.dob = form.dob;
        if (!documentLocked && form.document.number) {
          nextProfile.identityDocument = {
            type: form.document.type,
            number: form.document.number.trim().toUpperCase(),
          };
        }
      }

      if (card === "account") {
        /* Trimmed to nothing rather than saved as a space, so "Not set" stays
           truthful when somebody clears it. */
        /* Written under the new key, and the old one is cleared so the two
           cannot drift into disagreeing about what somebody is called. */
        nextProfile.nickname = form.nickname.trim();
        delete nextProfile.displayName;
        nextProfile.timezone = form.timezone;
      }

      if (card === "location") {
        /* The stored country wins once it is set. The route enforces this too,
           but sending a value it will only overwrite makes the save look like
           it did something it did not. */
        nextProfile.location = countryLocked
          ? {
              ...form.location,
              country: current.location?.country || form.location.country,
              countryCode: current.location?.countryCode || form.location.countryCode,
            }
          : form.location;
      }

      setSaving(true);
      const ok = await updateUser({ ...patch, profile: nextProfile });
      setSaving(false);
      if (ok) setEditing(null);
      /* The zone is half a setting: the account holds it, and the chart, the
         header clock and the settings panel read it off this device. Saving it
         here moves the clock now rather than at the next sign-in — see
         lib/time-zone-sync. The account half has just been written by the save
         above, so only the device half is left. */
      if (ok && card === "account" && form.timezone) broadcastTimeZone(form.timezone);
      toast(
        ok
          ? { title: "Saved", description: "Your details have been updated." }
          : {
              title: "Save failed",
              description: "Could not update your profile.",
              variant: "destructive",
            }
      );
    },
    [
      countries,
      countryLocked,
      dobLocked,
      documentLocked,
      form,
      phoneLocked,
      readProfile,
      toast,
      updateUser,
    ]
  );

  const setLoc = (patch: Partial<typeof form.location>) =>
    setForm((p) => ({ ...p, location: { ...p.location, ...patch } }));

  const tier = TIERS[resolveTierByUsdBalance(realBalanceUsd)];

  /* The stored zone, matched against the platform's own list. A value that is
     not in it — set before this list existed, or trimmed out of it since — is
     shown as itself rather than silently reported as "Not set". */
  /* Resolved through the alias table, so a profile holding an old IANA name —
     `Asia/Calcutta`, which is `Asia/Kolkata` — still shows as India rather than
     as a zone we do not recognise. */
  const storedZone = useMemo(() => findZone(stored.timezone), [stored.timezone]);

  if (!user) return null;

  /* `status`, `lastLogin`, `kycLevel` and `accountId` are on the record the
     server returns but not on the store's declared shape. */
  const u = user as any;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  const storedDoc = stored.identityDocument || {};
  /* The country's own word for it while the rules are loaded, and a tidied
     version of the stored id otherwise — see `documentName`. */
  const documentSpec = countries
    .find((c) => c.code === String(storedCountry || "").toUpperCase())
    ?.documents.find(
      (d) =>
        d.id.toLowerCase().replace(/[^a-z]/g, "") ===
        String(storedDoc.type || "").toLowerCase().replace(/[^a-z]/g, "")
    );
  const documentLine = storedDoc.number
    ? `${documentSpec?.label || documentName(storedDoc.type) || "Document"} · ${maskDocument(storedDoc.number)}`
    : "";
  /* The flag is not part of the string any more: it is the flat asset, drawn by
     the row — see `Flag`. The emoji is a different picture on every platform,
     and a waving one on Apple's. */
  const countryLine = storedCountry ? countryName || storedCountry : "";
  /* "Nationality: India" answers a different question from the one the row
     asks. What somebody *is* is Indian — see lib/demonyms. */
  const nationalityLine = storedCountry ? demonymFor(storedCountry, countryName) : "";
  /* Verified is the mark, not a chip.

     A bordered green word is a *status* — the same shape "Off" and "Not
     started" wear one row below — and it made three different-looking things
     out of one fact that also appears beside the name, in the rail and on the
     security card. Where the answer is yes it is the shared mark; where it is
     anything else it stays a chip, because those still need reading. */
  const verifiedOr = (ok: boolean, otherwise: { text: string; tone: Tone }) =>
    ok ? { control: <VerifiedMark /> } : { chip: otherwise };

  const kycVerified = (u.kycLevel || 0) > 0;
  const twoFactorOn = !!user.twoFactor?.enabled;
  const twoFactorMethod = METHOD_LABEL[user.twoFactor?.type as string] || "";
  const fullyVerified = !!user.emailVerified && kycVerified;
  const genderLabel = GENDERS.find((g) => g.value === stored.gender)?.label || "";
  /* The shared spelling, rather than a fourth version of it built here — and
     the short one: a saved zone is a clock, not a country. See zoneShortLabel. */
  const zoneLine = storedZone ? zoneShortLabel(storedZone) : stored.timezone || "";

  const editingPersonal = editing === "personal";
  const editingAccount = editing === "account";
  const editingLocation = editing === "location";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Full bleed: outside the padded column, so the grid reaches the panel's
          edges instead of stopping at a card border. */}
      <ProfileHero
        user={user}
        emailVerified={!!user.emailVerified}
        tier={tier}
        uploading={uploading}
        onPickPhoto={pickPhoto}
        onChooseAvatar={chooseAvatar}
      />

      <div className="px-5 py-6 md:px-8">
        {/* Stretched, not `items-start`. Each row's cards now share a height, so
            the four read as one grid rather than four rectangles that happen to
            be near each other — and Location no longer starts higher than
            Security just because Personal has one row fewer than Account. */}
        <div className="mx-auto grid w-full max-w-[1040px] gap-4 lg:grid-cols-2">
          {/* Shut once a check has passed. Opening an editor where every field
              is disabled is a worse answer than not offering one. */}
          <ProfileCard
            title="Personal details"
            locked={verifiedLock}
            onEdit={() => openCard("personal")}
          >
            <Row label="Full name" value={fullName} />
            <Row label="Date of birth" value={longDate(stored.dob)} />
            <Row label="Gender" value={genderLabel} />
            {/* Derived, never asked for. It is the country under Location — the
                one the identity document is issued against and the one that is
                locked once set — so a separate nationality field could only
                ever disagree with it. */}
            <Row label="Nationality" flag={storedCountry} value={nationalityLine} />
            <Row label="Phone number" value={user.phone} />
            <Row
              label="Email"
              control={
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium text-foreground" title={user.email}>
                    {user.email}
                  </span>
                  {user.emailVerified && <VerifiedMark label={null} />}
                </span>
              }
            />
          </ProfileCard>

          <ProfileCard title="Account details" onEdit={() => openCard("account")}>
            <Row
              label="Account ID"
              control={
                u.accountId ? (
                  <CopyValue value={String(u.accountId)} label="Copy account ID" />
                ) : (
                  <span className="text-[13px] text-muted-foreground">Not set</span>
                )
              }
            />
            <Row label="Nickname" value={stored.nickname || stored.displayName} />
            {/* Text, and only text. The clock face that was here drew the
                zone's own time on a 20px dial, which was a nice thing that
                nobody needed twice: the header already carries a running clock
                on the zone this row names, and a second one — ticking, on a
                card of account facts that are otherwise fixed — made the row
                the only moving thing on the page. */}
            <Row label="Time zone" value={zoneLine} />
            <Row label="Account created" value={longDateTime(u.createdAt)} />
            {/* The same resolver the rail badges and the order panel caps
                against, off the real balance — one answer, three places.
            
                The meter, not a word in a blue chip. "Basic" in `info` blue
                said the level in a colour that means nothing about it, and it
                did not match the badge sitting beside the person's name eight
                rows above — same fact, two shapes, one of them a rank and one
                of them a label. One filled bar for Basic, two for Advanced,
                three for Elite, in that tier's own colour, exactly as the
                portrait draws it. */}
            <Row
              label="Trader status"
              control={
                <span className="flex items-center gap-1.5">
                  <TierBars
                    level={tier.level}
                    size={11}
                    filledClass={tier.accent.fill}
                    emptyClass="bg-foreground/15"
                  />
                  {/* Capitals, like every other rank on this product — the
                      badge beside the name, the header's status block. A tier
                      is a rank rather than a word, and "Elite" in sentence case
                      beside a meter reads as an adjective about the meter. */}
                  <span
                    className={cn(
                      "text-[12.5px] font-semibold uppercase leading-snug tracking-[0.06em]",
                      tier.accent.text
                    )}
                  >
                    {tier.name}
                  </span>
                </span>
              }
            />
            <Row
              label="Account verification"
              {...verifiedOr(fullyVerified, {
                text: kycVerified || user.emailVerified ? "Partly verified" : "Unverified",
                tone: "warn",
              })}
            />
          </ProfileCard>

          <ProfileCard title="Location" onEdit={() => openCard("location")}>
            <Row label="Country" flag={storedCountry} value={countryLine} />
            <Row label="State or region" value={stored.location?.state} />
            <Row label="City" value={stored.location?.city} />
            <Row label={postcodeLabel} value={stored.location?.zip} />
            <Row label="Address" value={stored.location?.address} />
          </ProfileCard>

          {/* No Edit control. Everything in here is changed from the Security
              tab, which owns the flows — a second entry point to the same
              password form is how the two drift apart. */}
          <ProfileCard title="Security">
            <Row
              label="Two-factor"
              {...(twoFactorOn
                ? {
                    control: (
                      <MethodValue type={user.twoFactor?.type} label={twoFactorMethod || "On"} />
                    ),
                  }
                : { chip: { text: "Off", tone: "warn" as Tone } })}
            />
            <Row
              label="Email address"
              {...verifiedOr(!!user.emailVerified, { text: "Unverified", tone: "warn" })}
            />
            <Row
              label="Identity check"
              {...verifiedOr(kycVerified, { text: "Not started", tone: "warn" })}
            />
            <Row label="Identity document" value={documentLine} />
          </ProfileCard>
        </div>
      </div>

      {/* ── the editors ──────────────────────────────────────────────── */}

      {/* Verified: one sentence at the top, and the way out of it in the
          footer.
      
          Every field carried its own lock and the form still ended in "Save
          changes" — a button whose entire job would have been to save nothing.
          A dialog with nothing to save ends in the thing you actually came to
          do, which is talk to somebody. The locks stay on the labels while only
          *some* fields are shut, because then the question is which ones. */}
      <EditDialog
        open={editing === "personal"}
        title="Personal details"
        description="Your name, contact and the ID they are checked against."
        onClose={cancel}
        onSave={() => save("personal")}
        saving={saving}
        wide
        notice={
          verifiedLock ? (
            <Notice tone="ok">
              These details are verified against your KYC document. Contact support to
              update them.
            </Notice>
          ) : undefined
        }
        action={
          verifiedLock ? (
            <DialogButton icon={<LifeBuoy className="h-4 w-4" />} onClick={openSupport}>
              Contact support
            </DialogButton>
          ) : undefined
        }
      >
        {/* Four fields, two rows, nothing spanning and nothing left over.
        
            It was First name and Last name side by side, then Gender and Phone,
            then Email alone in a column with an empty one beside it. Two boxes
            for the thing printed as one line on the document they are checked
            against, and a hole in the middle of the form where the fourth field
            should have been — which is most of why this read as a mess. The
            name is one field now, split on the way to the server; the four that
            remain fill the grid exactly. */}
        <TextField
          label="Full name"
          value={form.fullName}
          onChange={(v) => setForm((p) => ({ ...p, fullName: v }))}
          placeholder="As printed on your ID"
          autoComplete="name"
          disabled={verifiedLock}
        />
        <SelectField
          label="Gender"
          value={form.gender}
          onChange={(v) => setForm((p) => ({ ...p, gender: v }))}
          disabled={verifiedLock}
        >
          <option value="">Not set</option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Phone number"
          value={form.phone}
          onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
          disabled={phoneLocked}
          locked={phoneLocked && !verifiedLock}
          autoComplete="tel"
          hint={phoneLocked ? undefined : "You can set this once."}
        />
        <TextField label="Email" value={user.email || ""} disabled locked={!verifiedLock} />
        {/* Date of birth and the document together, across both columns: both
            are write-once and the document's format depends on the country, so
            they are validated as one thing.
        
            Under a named rule rather than a bare hairline. The line on its own
            said "something else starts here" without saying what, which on a
            form whose second half is the part people are most careful about is
            the one place worth a word. Same shape the KYC form's sections use. */}
        <div className="sm:col-span-2 space-y-4 pt-1">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              Identity
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <IdentityFields
            countryCode={form.location.countryCode}
            dob={form.dob}
            document={form.document}
            dobLocked={dobLocked}
            dobCorrectable={correctable}
            documentLocked={documentLocked}
            controlClass={editInputClass}
            hideLocks={verifiedLock}
            onDobChange={(dob) => setForm((p) => ({ ...p, dob }))}
            onDocumentChange={(document) => setForm((p) => ({ ...p, document }))}
          />
          {!verifiedLock && <LockedFootnote />}
        </div>
      </EditDialog>

      <EditDialog
        open={editing === "account"}
        title="Account details"
        description="What other traders see you as, and the clock your dates are shown in."
        onClose={cancel}
        onSave={() => save("account")}
        saving={saving}
      >
        <TextField
          label="Nickname"
          value={form.nickname}
          onChange={(v) => setForm((p) => ({ ...p, nickname: v }))}
          placeholder="What other traders see"
          hint="Shown on the leaderboard. Leave it empty and your full name is used instead."
        />
        {/* The platform's list, not the browser's 400 IANA names — the same
            zones, flags and city names the chart header offers, so the two can
            never disagree.
        
            A picker rather than a native `<select>`: an option can hold text
            and nothing else, so this was the one place a country appeared
            without its flag, in a sixty-row menu with no way to search it. */}
        <DialogField label="Time zone" hint="The same zones the chart offers.">
          <TimeZoneSelect
            className={SELECT_CONTROL}
            value={form.timezone}
            onValueChange={(id) => setForm((p) => ({ ...p, timezone: id }))}
          />
        </DialogField>
      </EditDialog>

      <EditDialog
        open={editing === "location"}
        title="Location"
        description="Where you live. Shown on your withdrawal records."
        onClose={cancel}
        onSave={() => save("location")}
        saving={saving}
        wide
      >
        {/* First field, and the one everything else waits on: the state and
            city lists are filtered by it, and so is the document type over in
            Personal details. Set it once and it locks. */}
        <DialogField
          label="Country"
          className="sm:col-span-2"
          hint={
            countryLocked
              ? "Saved. Your identity document is issued against this country, so ask support if it needs to change."
              : "Choose this first — your state, city and which identity documents you can use all follow from it. You can only set it once."
          }
        >
          {countryLocked ? (
            <div className={cn(editInputClass, "flex cursor-not-allowed items-center gap-2 bg-muted/50")}>
              <Flag code={form.location.countryCode} title={countryName} />
              <span className="truncate text-muted-foreground">
                {countryName || form.location.countryCode}
              </span>
              <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
            </div>
          ) : (
            <CountrySelect
              className={SELECT_CONTROL}
              /* Only where verification is possible — the document list in
                 Personal reads from the same set. */
              allow={countries.map((c) => c.code)}
              value={form.location.countryCode}
              onValueChange={(iso2) =>
                // Changing the country invalidates the state and city beneath
                // it, so both are cleared rather than left pointing somewhere
                // no longer inside it.
                setLoc({ country: iso2, countryCode: iso2, state: "", city: "" })
              }
            />
          )}
        </DialogField>
        <DialogField label="State or region">
          <StateSelect
            className={SELECT_CONTROL}
            countryCode={form.location.countryCode}
            value={form.location.state}
            onValueChange={(state) => setLoc({ state, city: "" })}
            disabled={!form.location.countryCode}
          />
        </DialogField>
        <DialogField label="City">
          <CitySelect
            className={SELECT_CONTROL}
            countryCode={form.location.countryCode}
            stateName={form.location.state}
            value={form.location.city}
            onValueChange={(city) => setLoc({ city })}
            disabled={!form.location.state}
          />
        </DialogField>
        {/* PIN code in India, ZIP code in the States, CEP in Brazil, Block
            number in Bahrain — the same field, and asking for a "postcode" in a
            country that does not use the word is how somebody types the wrong
            thing into it. The country's own rules say which word, and the same
            spec says the shape it has to be — see backend/api/kyc/documents. */}
        <TextField
          label={editPostcode.label || "Postcode"}
          value={form.location.zip}
          onChange={(v) => setLoc({ zip: v })}
          placeholder={editPostcode.placeholder}
          autoComplete="postal-code"
        />
        <TextField
          label="Address"
          className="sm:col-span-2"
          value={form.location.address}
          onChange={(v) => setLoc({ address: v })}
          placeholder="Street, apartment, suite"
          autoComplete="street-address"
        />
      </EditDialog>
    </div>
  );
});

/**
 * The page, behind its lock.
 *
 * Everything above is the profile as it has always been; this wrapper decides
 * whether it can be used yet. It is a wrapper rather than a branch inside the
 * body for one reason worth stating: the body must keep rendering while it is
 * locked, because the lock is a blur over this page and not a replacement for
 * it — and a component that returns early cannot be blurred.
 *
 * Almost every field here is a field verification either fills in or freezes —
 * name, date of birth, nationality, document, country — so letting somebody
 * type into them first is inviting them to enter, twice, the details their
 * passport is about to settle, and then to find them locked against what the
 * document said. The gate is that ordering made visible.
 *
 * No user at all — a guest looking around the terminal — is not a locked
 * account; it is no account. The body says nothing in that case and the gate
 * would be a demand made of somebody who has not been asked to sign up yet.
 */
export const PersonalPanel = memo(function PersonalPanel({
  onGoToKyc,
}: {
  /** Sends the panel to the KYC tab. Owned by the host, which is the thing
      that knows what "another tab" means on a phone and on a laptop. */
  onGoToKyc: () => void;
}) {
  const { user } = useUserStore();

  if (!user) return <PersonalPanelBody />;

  return (
    <KycGate stage={resolveKycStage(user)} onGoToKyc={onGoToKyc}>
      <PersonalPanelBody />
    </KycGate>
  );
});

export default PersonalPanel;
