// /server/api/user/preferences/index.get.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Get Terminal Preferences",
  operationId: "getTerminalPreferences",
  tags: ["User", "Preferences"],
  description:
    "Returns the authenticated user's account-level terminal preferences: pinned asset tabs, trading settings, chart view options and active indicators. The terminal mirrors these into browser storage on load so a workspace follows the user between devices. Pass `since` (epoch ms) to poll cheaply: when nothing has been written after that instant the preferences map is omitted and `unchanged` is true.",
  parameters: [
    {
      name: "since",
      in: "query",
      required: false,
      description:
        "Epoch ms the caller already holds. When the stored copy is not newer, the response omits the map.",
      schema: { type: "string" },
    },
  ],
  responses: {
    200: {
      description: "Stored preferences as a map of storage key to value",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              preferences: {
                type: "object",
                description: "Map of storage key to serialized value",
                additionalProperties: { type: "string" },
              },
              updatedAt: {
                type: "number",
                description:
                  "Epoch ms of the last write, or 0 if nothing is stored yet",
              },
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
  if (!user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });

  const record = await models.user.findByPk(user.id, {
    attributes: ["id", "settings"],
  });

  const terminal = record?.settings?.terminal;
  if (!terminal || typeof terminal !== "object") {
    return { preferences: {}, updatedAt: 0 };
  }

  // __updatedAt is bookkeeping, not a real preference — keep it out of the map
  // the client mirrors into storage.
  const { __updatedAt, ...preferences } = terminal as Record<string, string>;
  const updatedAt = Number(__updatedAt) || 0;

  /* A poll that already has this copy gets told so, and nothing else.

     Terminals poll this route every few seconds so a drawing made on one device
     shows up on another without a reload. Almost every one of those polls has
     nothing to report, and returning the whole preference map each time — the
     pinned tabs, the indicator set, every instrument's drawings — to say "no
     change" is several KB per device per poll for no information. The caller
     sends the timestamp it holds; if the stored copy is not newer, it gets back
     two numbers.

     `since` is compared numerically and a missing or unparseable value falls
     through to the full response, so an older client that does not send it, or
     sends nonsense, behaves exactly as before. */
  const since = Number((query as any)?.since);
  if (Number.isFinite(since) && since > 0 && updatedAt <= since) {
    return { unchanged: true, updatedAt };
  }

  return {
    preferences,
    updatedAt,
  };
};
