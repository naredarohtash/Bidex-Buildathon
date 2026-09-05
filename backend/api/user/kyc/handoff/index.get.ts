// /server/api/user/kyc/handoff/index.get.ts

import { createError } from "@b/utils/error";
import { RedisSingleton } from "@b/utils/redis";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { handoffKey } from "./index.post";

/**
 * What the phone has sent so far.
 *
 * The desktop polls this while the QR code is on screen. It returns only the
 * photo URLs, and only for the caller's own handoff — the token is checked
 * against the session's userId rather than trusted, so holding somebody else's
 * token does not read their uploads back through an authenticated route.
 */
export const metadata: OperationObject = {
  summary: "Poll a phone handoff",
  operationId: "pollKycHandoff",
  tags: ["KYC"],
  description: "Returns the photos uploaded from the phone for this handoff token.",
  parameters: [
    { name: "token", in: "query", required: true, description: "Handoff token", schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "Photos so far",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              alive: { type: "boolean" },
              photos: { type: "object", additionalProperties: { type: "string" } },
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
  const { user, query } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const token = String(query?.token || "");
  if (!token) return { alive: false, photos: {} };

  const redis = RedisSingleton.getInstance();
  const raw = await redis.get(handoffKey(token));
  if (!raw) return { alive: false, photos: {} };

  const session = JSON.parse(raw);
  if (session.userId !== user.id) return { alive: false, photos: {} };

  return { alive: true, photos: session.photos || {} };
};
