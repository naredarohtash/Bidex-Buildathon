// /server/api/kyc/handoff/[token]/index.get.ts

import { RedisSingleton } from "@b/utils/redis";
import { serverErrorResponse } from "@b/utils/query";
import { handoffKey } from "../../../user/kyc/handoff/index.post";

/**
 * What the phone needs to know, and nothing else.
 *
 * Unauthenticated by necessity — the phone arrives holding a token from a QR
 * code or an email, not a session. So it is told only which photos are wanted
 * and what the document is called. No name, no email, no account id: a token
 * read over someone's shoulder should reveal nothing about whose it is.
 */
export const metadata: OperationObject = {
  summary: "Read a phone handoff",
  operationId: "readKycHandoff",
  tags: ["KYC"],
  description: "Returns which photos the desktop is still waiting for. Requires only the handoff token.",
  parameters: [
    { name: "token", in: "path", required: true, description: "Handoff token", schema: { type: "string" } },
  ],
  responses: {
    200: {
      description: "Handoff state",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              alive: { type: "boolean" },
              needs: { type: "array", items: { type: "string" } },
              done: { type: "array", items: { type: "string" } },
              documentLabel: { type: "string" },
            },
          },
        },
      },
    },
    500: serverErrorResponse,
  },
  requiresAuth: false,
};

export default async (data: Handler) => {
  const { params } = data;
  const redis = RedisSingleton.getInstance();
  const raw = await redis.get(handoffKey(String(params?.token || "")));
  if (!raw) return { alive: false, needs: [], done: [], documentLabel: "" };

  const session = JSON.parse(raw);
  return {
    alive: true,
    needs: session.needs || [],
    done: Object.keys(session.photos || {}),
    documentLabel: session.documentLabel || "your document",
  };
};
