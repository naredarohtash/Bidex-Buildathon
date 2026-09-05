// /server/api/user/kyc/verification/index.get.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";

/**
 * Where this person stands.
 *
 * One call for the whole status screen: whether they are verified, waiting, or
 * have been asked for something else, plus what they submitted so the screen
 * can show it back to them. The reviewer's checks are deliberately not
 * returned — they are internal, and telling an applicant which of them tripped
 * is telling a fraudster which one to work around.
 */
export const metadata: OperationObject = {
  summary: "Identity verification status",
  operationId: "getKycVerificationStatus",
  tags: ["KYC"],
  description:
    "Returns the caller's current verification application: status, what they submitted, and the reviewer's note when there is one.",
  responses: {
    200: {
      description: "Current status",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              status: { type: "string", nullable: true },
              submittedAt: { type: "string", nullable: true },
              reviewedAt: { type: "string", nullable: true },
              adminNotes: { type: "string", nullable: true },
              submission: { type: "object", nullable: true },
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const application = await models.kycApplication.findOne({
    where: { userId: user.id },
    order: [["createdAt", "DESC"]],
    raw: true,
  });

  if (!application) {
    return { status: null, submittedAt: null, reviewedAt: null, adminNotes: null, submission: null };
  }

  const raw: any = application.data;
  let parsed: any = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }

  return {
    status: application.status,
    submittedAt: parsed?.submittedAt || application.createdAt,
    reviewedAt: application.reviewedAt || null,
    adminNotes: application.adminNotes || null,
    submission: parsed
      ? {
          countryCode: parsed.countryCode,
          countryName: parsed.countryName,
          documentLabel: parsed.documentLabel,
          /* Enough to recognise which document they sent, not enough to be
             worth reading off a shoulder. */
          documentNumberMasked: maskNumber(parsed.documentNumber),
        }
      : null,
  };
};

function maskNumber(value?: string): string {
  const s = String(value || "");
  if (s.length <= 4) return s;
  return `${"•".repeat(Math.min(8, s.length - 4))}${s.slice(-4)}`;
}
