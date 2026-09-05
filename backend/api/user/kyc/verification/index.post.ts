// /server/api/user/kyc/verification/index.post.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { normaliseNumber } from "../../../kyc/documents/rules";
import {
  documentHash,
  ensureVerificationLevel,
  runChecks,
  validateSubmission,
} from "./utils";

/**
 * Submit identity verification.
 *
 * One step for everybody: country, document, number, the photos that document
 * requires, and a photo of the applicant. Everything is validated against
 * ../../../kyc/documents/rules, so the server enforces the same "two sides or
 * one" the form drew — a client that skips the back of a CNIC is refused here.
 *
 * Review is by a person. The three checks attached to the submission decide
 * what that person looks at first; none of them approves or rejects anything.
 */
export const metadata: OperationObject = {
  summary: "Submit identity verification",
  operationId: "submitKycVerification",
  tags: ["KYC"],
  description:
    "Creates a KYC application from the one-step verification flow. Validates the document number against the country's pattern, requires the back of two-sided documents, and attaches the format, profile-match and duplicate checks for the reviewer.",
  logModule: "KYC",
  logTitle: "Submit verification",
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            countryCode: { type: "string", description: "ISO 3166-1 alpha-2" },
            documentId: { type: "string", description: "Document id from /api/kyc/documents" },
            documentNumber: { type: "string" },
            frontUrl: { type: "string" },
            backUrl: { type: "string", nullable: true },
            selfieUrl: { type: "string" },
          },
          required: ["countryCode", "documentId", "documentNumber", "frontUrl", "selfieUrl"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Application submitted",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string" },
              status: { type: "string" },
              applicationId: { type: "string" },
            },
          },
        },
      },
    },
    400: { description: "The submission is incomplete or the number is malformed" },
    401: unauthorizedResponse,
    409: { description: "An application is already open" },
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user, body } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const { error, found } = validateSubmission(body);
  if (error) throw createError({ statusCode: 400, message: error });

  const countryCode = String(body.countryCode).toUpperCase();
  const documentId = String(body.documentId);
  const documentNumber = normaliseNumber(body.documentNumber);

  const open = await models.kycApplication.findOne({
    where: { userId: user.id, status: ["PENDING", "APPROVED"] as any },
  });
  if (open) {
    throw createError({
      statusCode: 409,
      message:
        open.status === "APPROVED"
          ? "Your identity is already verified."
          : "You already have a verification under review.",
    });
  }

  const level = await ensureVerificationLevel();

  const record = await models.user.findByPk(user.id, {
    attributes: ["id", "firstName", "lastName", "email", "phone", "profile"],
    raw: true,
  });

  const checks = await runChecks(record, countryCode, documentId, documentNumber);

  const application = await models.kycApplication.create({
    userId: user.id,
    levelId: level.id,
    status: "PENDING",
    data: {
      /* Everything the reviewer needs on one screen, denormalised on purpose:
         a profile edited after submission must not change what was submitted. */
      countryCode,
      countryName: found.country.name,
      documentId,
      documentLabel: found.document.label,
      documentNumber,
      documentSides: found.document.sides,
      documentHash: documentHash(countryCode, documentId, documentNumber),
      frontUrl: body.frontUrl,
      backUrl: found.document.sides === 2 ? body.backUrl : null,
      selfieUrl: body.selfieUrl,
      applicant: {
        firstName: record?.firstName || "",
        lastName: record?.lastName || "",
        email: record?.email || "",
        phone: record?.phone || "",
      },
      checks,
      submittedAt: new Date().toISOString(),
    },
  });

  /* Told, not left wondering. Failure here must not undo a submission that
     succeeded, so it is logged and swallowed. */
  try {
    const { emailQueue } = require("@b/utils/emails");
    await emailQueue.add({
      emailData: {
        TO: record?.email,
        FIRSTNAME: record?.firstName || "there",
        CREATED_AT: new Date().toLocaleString(),
        LEVEL: "Identity Verification",
        STATUS: "Under review",
      },
      emailType: "KycSubmission",
    });
  } catch (e: any) {
    const { logger } = require("@b/utils/console");
    logger.error("KYC", "Submission email could not be queued", e);
  }

  return {
    message: "Your details are with our team for review.",
    status: "PENDING",
    applicationId: application.id,
  };
};
