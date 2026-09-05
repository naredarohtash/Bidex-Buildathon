// /server/api/user/kyc/verification/utils.ts

import { createHash } from "crypto";
import { models } from "@b/db";
import { findDocument, normaliseNumber, validateNumber } from "../../../kyc/documents/rules";

/**
 * The single level every application hangs off.
 *
 * Verification is one step for everybody — no tiers, no prerequisites — but
 * `kycApplication.levelId` is required and the admin queue joins through it, so
 * there has to be exactly one level and it has to exist before the first
 * submission. Created on demand rather than seeded, so a fresh database needs
 * no setup step to accept its first application.
 */
export const LEVEL_NAME = "Identity Verification";

export async function ensureVerificationLevel(): Promise<any> {
  const existing = await models.kycLevel.findOne({ where: { name: LEVEL_NAME } });
  if (existing) return existing;

  return models.kycLevel.create({
    name: LEVEL_NAME,
    description: "Government ID and a photo of the applicant, reviewed by hand.",
    level: 1,
    status: "ACTIVE",
    /* The admin's form builder renders from this. The flow itself does not read
       it — it is built from the country rules — but leaving it empty would give
       the reviewer a blank page where the submission should be. */
    /* An array, not a string of one.
    
       `fields` is a JSON column, so passing JSON.stringify put a JSON *string*
       in it where the admin's own builder puts a JSON *array*. Everything read
       it back as a string and `level.fields.filter(...)` threw, which the
       dashboard caught as "Something went wrong. Try Again." on every KYC
       screen. Sequelize serialises the array itself. */
    fields: [
      { id: "countryCode", type: "TEXT", label: "Country of residence", order: 0, required: true },
      { id: "documentLabel", type: "TEXT", label: "Document type", order: 1, required: true },
      { id: "documentNumber", type: "TEXT", label: "Document number", order: 2, required: true },
      { id: "frontUrl", type: "FILE", label: "Document — front", order: 3, required: true },
      { id: "backUrl", type: "FILE", label: "Document — back", order: 4, required: false },
      { id: "selfieUrl", type: "FILE", label: "Photo of the applicant", order: 5, required: true },
    ],
  });
}

/** Stable across submissions, so the same document is recognisable anywhere. */
export function documentHash(countryCode: string, documentId: string, number: string): string {
  return createHash("sha256")
    .update(`${countryCode.toUpperCase()}:${documentId}:${normaliseNumber(number)}`)
    .digest("hex");
}

export interface SubmissionCheck {
  id: string;
  label: string;
  status: "PASS" | "FLAG";
  detail: string;
}

/**
 * The three checks that cost nothing.
 *
 * None of them can approve an application and none of them block one. They
 * decide what a reviewer sees first: a submission with three passes can be
 * approved on sight, and one with a duplicate flag is the only kind worth
 * reading slowly. Flagging rather than blocking matters — a shared family
 * address or a re-typed number is a question for a human, not a rejection.
 */
export async function runChecks(
  user: any,
  countryCode: string,
  documentId: string,
  documentNumber: string
): Promise<SubmissionCheck[]> {
  const checks: SubmissionCheck[] = [];
  const found = findDocument(countryCode, documentId);

  checks.push({
    id: "format",
    label: "Number format",
    status: "PASS",
    detail: found ? `Matches the pattern for ${found.document.label}` : "Checked",
  });

  /* Profile country. The address on file was entered before any of this and is
     what a reviewer would otherwise compare by eye. */
  const profile = readProfile(user);
  const profileCountry = String(
    profile?.location?.countryCode || profile?.location?.country || ""
  ).toUpperCase();

  if (!profileCountry) {
    checks.push({
      id: "country",
      label: "Country matches profile",
      status: "FLAG",
      detail: "No country saved on their profile to compare against",
    });
  } else if (profileCountry === countryCode.toUpperCase()) {
    checks.push({
      id: "country",
      label: "Country matches profile",
      status: "PASS",
      detail: `Profile address is in ${profileCountry}`,
    });
  } else {
    checks.push({
      id: "country",
      label: "Country matches profile",
      status: "FLAG",
      detail: `Applying as ${countryCode.toUpperCase()} but the profile address is in ${profileCountry}`,
    });
  }

  /* Document number against the one already on the Personal tab, when they
     stored one and it is the same kind of document. */
  const stored = profile?.identityDocument;
  const storedNumber = normaliseNumber(stored?.number || "");
  if (storedNumber) {
    const sameKind =
      String(stored?.type || "").toLowerCase().replace(/[^a-z]/g, "") ===
      documentId.toLowerCase().replace(/[^a-z]/g, "");
    if (!sameKind) {
      checks.push({
        id: "number",
        label: "Number matches profile",
        status: "PASS",
        detail: `Profile holds a ${stored.type}; this is a different document`,
      });
    } else if (storedNumber === normaliseNumber(documentNumber)) {
      checks.push({
        id: "number",
        label: "Number matches profile",
        status: "PASS",
        detail: "Same number they saved on their profile",
      });
    } else {
      checks.push({
        id: "number",
        label: "Number matches profile",
        status: "FLAG",
        detail: `Profile holds a different ${stored.type} number`,
      });
    }
  }

  /* The one that catches real fraud: the same document on another account. */
  const hash = documentHash(countryCode, documentId, documentNumber);
  const others = await models.kycApplication.findAll({
    where: { userId: { [require("sequelize").Op.ne]: user.id } },
    attributes: ["id", "userId", "data", "status"],
    limit: 5000,
    raw: true,
  });
  const clashes = others.filter((a: any) => {
    const data = typeof a.data === "string" ? safeParse(a.data) : a.data;
    return data?.documentHash === hash;
  });

  checks.push(
    clashes.length === 0
      ? {
          id: "duplicate",
          label: "Document not used elsewhere",
          status: "PASS",
          detail: "No other account has submitted this document",
        }
      : {
          id: "duplicate",
          label: "Document not used elsewhere",
          status: "FLAG",
          detail: `Already submitted on ${clashes.length} other account${clashes.length === 1 ? "" : "s"}`,
        }
  );

  return checks;
}

export function readProfile(user: any): any {
  const raw = user?.profile;
  if (!raw) return {};
  if (typeof raw === "string") return safeParse(raw);
  return raw;
}

function safeParse(v: string): any {
  try {
    return JSON.parse(v);
  } catch {
    return {};
  }
}

/** Shared by the submit route and the phone handoff. */
export function validateSubmission(body: any): { error?: string; found?: any } {
  const countryCode = String(body?.countryCode || "").toUpperCase();
  const documentId = String(body?.documentId || "");
  const documentNumber = String(body?.documentNumber || "");

  const found = findDocument(countryCode, documentId);
  if (!found) return { error: "Choose a country and a document type" };

  const numberError = validateNumber(found.document, documentNumber);
  if (numberError) return { error: numberError };

  if (!body?.frontUrl) return { error: "Upload the front of your document" };
  if (found.document.sides === 2 && !body?.backUrl) {
    return { error: `Upload the back of your ${found.document.label}` };
  }
  if (!body?.selfieUrl) return { error: "Add a photo of yourself" };

  return { found };
}
