// /server/api/user/kyc/handoff/index.post.ts

import { randomBytes } from "crypto";
import { createError } from "@b/utils/error";
import { RedisSingleton } from "@b/utils/redis";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";

/**
 * Hand the camera steps to a phone.
 *
 * A laptop with no webcam, a blocked permission, or simply a better camera in
 * a pocket — all three end the same way without this, which is a person stuck
 * on the one step they cannot complete.
 *
 * The token is the whole security model, so it is deliberately small: fifteen
 * minutes, one user, and it authorises exactly two things — reading which
 * photos are still wanted, and adding one. It cannot read the account, cannot
 * submit the application, and carries no session. Worst case if it leaks is a
 * stranger putting a photograph into a verification that a human then rejects.
 */
export const HANDOFF_TTL_SECONDS = 15 * 60;
export const handoffKey = (token: string) => `kyc-handoff:${token}`;

export const metadata: OperationObject = {
  summary: "Start a phone handoff",
  operationId: "startKycHandoff",
  tags: ["KYC"],
  description:
    "Issues a short-lived token so the camera steps of verification can be finished on a phone. Returns the link to encode as a QR code, and emails the same link on request.",
  requestBody: {
    required: false,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            email: { type: "boolean", description: "Also email the link to the account holder" },
            needs: {
              type: "array",
              items: { type: "string" },
              description: "Which photos are still wanted: front, back, selfie",
            },
            documentLabel: { type: "string" },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Handoff started",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              token: { type: "string" },
              url: { type: "string" },
              expiresIn: { type: "number" },
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
  const { user, body } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const token = randomBytes(24).toString("base64url");
  const needs = Array.isArray(body?.needs)
    ? body.needs.filter((n: string) => ["front", "back", "selfie"].includes(n))
    : ["front", "back", "selfie"];

  const session = {
    userId: user.id,
    needs,
    documentLabel: String(body?.documentLabel || "your document"),
    photos: {} as Record<string, string>,
    createdAt: Date.now(),
  };

  const redis = RedisSingleton.getInstance();
  await redis.set(handoffKey(token), JSON.stringify(session), "EX", HANDOFF_TTL_SECONDS);

  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  const url = `${base}/kyc/phone/${token}`;

  if (body?.email) {
    /* Best effort. The QR code is already on their screen, so a mail that does
       not go out costs them nothing. */
    try {
      const { emailQueue } = require("@b/utils/emails");
      await emailQueue.add({
        emailData: {
          TO: (user as any).email,
          FIRSTNAME: (user as any).firstName || "there",
          URL: url,
          CREATED_AT: new Date().toLocaleString(),
          LEVEL: "Identity Verification",
          STATUS: "Continue on your phone",
        },
        emailType: "KycPhoneHandoff",
      });
    } catch (e: any) {
      const { logger } = require("@b/utils/console");
      logger.error("KYC", "Handoff email could not be queued", e);
    }
  }

  return { token, url, expiresIn: HANDOFF_TTL_SECONDS };
};
