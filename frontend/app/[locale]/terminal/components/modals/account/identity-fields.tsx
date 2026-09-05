"use client";

/**
 * Date of birth and one identity document (Aadhaar or PAN).
 *
 * Both are write-once from the account side: fill them in, save, and they turn
 * read-only. Changing them afterwards is an admin action, because they are what
 * an identity check is later measured against — if the holder can edit them
 * after the fact, verifying them proves nothing.
 *
 * The lock here is only the visible half. The route enforces it too
 * (BIDEX_LOCKED_PROFILE_FIELDS in api/user/profile/index.put.js), because this
 * form posts a whole `profile` object and a disabled input stops nobody who
 * writes the request by hand.
 */

import { memo } from "react";
import { Lock } from "lucide-react";
import { DateOfBirthPicker } from "./date-of-birth-picker";
import { cn } from "@/lib/utils";
import { Labelled } from "@/components/ui/dialog-kit";
import { useKycRules } from "./kyc/use-kyc-rules";

/* The id of a document in the country rules — "aadhaar", "cnic", "passport".
   Older profiles stored "AADHAAR"/"PAN" in upper case and are matched
   case-insensitively wherever this is compared, so nothing has to migrate. */
export type DocumentType = string;

export interface IdentityDocument {
  type: DocumentType;
  number: string;
}

const sameDoc = (a: string, b: string) =>
  a.toLowerCase().replace(/[^a-z]/g, "") === b.toLowerCase().replace(/[^a-z]/g, "");

/**
 * Empty is allowed — it just means "not filled in yet".
 *
 * The pattern comes from the country's own rules rather than the two Indian
 * formats this file used to hard-code. Without a spec — an unknown country, or
 * the rules not loaded yet — it cannot judge, and says so by passing.
 */
export function validateDocument(
  doc: IdentityDocument | null | undefined,
  spec?: { label: string; pattern: string; hint: string } | null
): string | null {
  if (!doc || !doc.number) return null;
  if (!spec) return null;
  const value = doc.number.trim().toUpperCase().replace(/\s/g, "");
  const re = new RegExp(spec.pattern);
  if (re.test(value) || re.test(value.replace(/-/g, ""))) return null;
  return `That does not look like a ${spec.label} — ${spec.hint.toLowerCase()}.`;
}

export function validateDob(dob: string | null | undefined): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "That date is not valid.";
  const today = new Date();
  if (d > today) return "Your date of birth cannot be in the future.";
  const age = (today.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 18) return "You need to be 18 or older.";
  if (age > 120) return "That date looks wrong — please check it.";
  return null;
}

/* The label text with a lock after it, for the kit's `Labelled` to draw — so
   these three fields carry exactly the label the dialog's own fields do, at the
   same size, in the same colour. They were a hand-rolled uppercase span, which
   is how one dialog ended up with two kinds of field label in it.
   What the lock means is said once at the foot of the form — see
   LockedFootnote — rather than under each field that carries one. */
function lockedLabel(text: React.ReactNode, locked?: boolean) {
  if (!locked) return text;
  return (
    <span className="inline-flex items-center gap-1.5">
      {text}
      <Lock className="h-3 w-3 shrink-0" />
    </span>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground " +
  "placeholder:text-muted-foreground outline-none transition-colors " +
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 " +
  "disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground";

export const IdentityFields = memo(function IdentityFields({
  dob,
  document,
  dobLocked,
  dobCorrectable,
  documentLocked,
  countryCode,
  onDobChange,
  onDocumentChange,
  controlClass,
  hideLocks,
}: {
  dob: string;
  document: IdentityDocument;
  dobLocked: boolean;
  /** The date is open because a check came back, not because it was never set.
      "You can only set this once" is the wrong sentence to hand somebody who
      set it once already and is here to correct it. */
  dobCorrectable?: boolean;
  documentLocked: boolean;
  /** Decides which documents are offered. Comes from the Location section. */
  countryCode: string;
  onDobChange: (dob: string) => void;
  onDocumentChange: (d: IdentityDocument) => void;
  /** The size every control on the form around this one is. Three of the four
      boxes here come from elsewhere — the date picker brings its own height,
      the select and the input another — so the caller says once what a field
      looks like and all of them take it. Same rule as CONTROL in the KYC
      form. */
  controlClass?: string;
  /** The form has said it once, at the top, for every field at once — so the
      lock per label would be the same news a fourth and fifth time. */
  hideLocks?: boolean;
}) {
  const { countries } = useKycRules();
  const country = countries.find((c) => c.code === String(countryCode || "").toUpperCase());
  const options = country?.documents || [];
  const activeSpec = options.find((d) => sameDoc(d.id, document.type)) || options[0] || null;

  const docError = documentLocked ? null : validateDocument(document, activeSpec);
  const dobError = dobLocked ? null : validateDob(dob);

  /* Two columns, and the number takes its own row.
  
     This was `sm:grid-cols-2 xl:grid-cols-3`, written when the block sat on a
     full-width page. It now lives in a 620px dialog — but Tailwind breakpoints
     measure the VIEWPORT, not the container, so on any screen wider than
     1280px it still went three across inside that dialog: three 182px columns,
     the date picker truncating and the document hint wrapping to three lines.
     Fixed columns instead of breakpoints, because the container this renders
     in is a known width. */
  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
      {/* date of birth */}
      <div className="min-w-0">
        <Labelled
          label={lockedLabel("Date of birth", dobLocked && !hideLocks)}
          error={dobLocked ? null : dobError}
          helper={
            dobLocked
              ? undefined
              : dobCorrectable
                ? "Correct this if it is wrong."
                : "You can set this once."
          }
        >
          {/* Not <input type="date">: the browser's own calendar ignores the
              theme and opens on this month, which is the wrong end of the range
              for a birth date. */}
          <DateOfBirthPicker
            value={dob}
            onChange={onDobChange}
            disabled={dobLocked}
            className={controlClass}
          />
        </Labelled>
      </div>

      {/* document type */}
      <div className="min-w-0">
        <Labelled
          label={lockedLabel("Document type", documentLocked && !hideLocks)}
          helper={
            documentLocked || options.length > 0
              ? undefined
              : "Set your country under Location first."
          }
        >
          <select
            className={cn(inputClass, controlClass, "cursor-pointer disabled:cursor-not-allowed")}
            value={activeSpec?.id || ""}
            disabled={documentLocked || options.length === 0}
            onChange={(e) =>
              // Switching type clears the number: a PAN is not a valid Aadhaar
              // and leaving the old digits behind would submit one as the other.
              onDocumentChange({ type: e.target.value, number: "" })
            }
          >
            {options.length === 0 ? (
              <option value="">Choose your country first</option>
            ) : (
              options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))
            )}
          </select>
        </Labelled>
      </div>

      {/* document number — its own row, both columns.
      
          A number wants more room than a date does, and at full width its hint
          ("12 digits, printed under your photo · set once") sits on one line
          instead of stacking into a paragraph under a 182px input, which is
          what made this block read as cramped. */}
      <div className="min-w-0 sm:col-span-2">
        <Labelled
          label={lockedLabel(
            activeSpec ? `${activeSpec.label} number` : "Document number",
            documentLocked && !hideLocks
          )}
          error={documentLocked ? null : docError}
          helper={
            documentLocked
              ? undefined
              : activeSpec
                ? `${activeSpec.hint} · set once.`
                : "Pick a document type first."
          }
        >
          <input
            className={cn(inputClass, controlClass, "uppercase")}
            value={document.number || ""}
            disabled={documentLocked || !activeSpec}
            placeholder={activeSpec?.placeholder || ""}
            onChange={(e) =>
              /* Case and spaces are normalised, everything else is left alone:
                 the 56 formats include dashes, brackets and letters, and
                 stripping them here would break the ones that need them. */
              onDocumentChange({
                ...document,
                type: activeSpec?.id || document.type,
                number: e.target.value.toUpperCase().replace(/\s+/g, ""),
              })
            }
          />
        </Labelled>
      </div>
    </div>
  );
});

export default IdentityFields;
