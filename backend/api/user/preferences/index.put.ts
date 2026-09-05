// /server/api/user/preferences/index.put.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";

/**
 * Ceiling on the stored blob. The column is LONGTEXT so the database does not
 * care, but preferences are read on every terminal load and an unbounded map
 * would let one account bloat that path. Comfortably above the real footprint:
 * the full set of terminal keys measures a few KB.
 */
const MAX_BYTES = 256 * 1024;

export const metadata: OperationObject = {
  summary: "Save Terminal Preferences",
  operationId: "saveTerminalPreferences",
  tags: ["User", "Preferences"],
  description:
    "Merges the supplied preferences into the authenticated user's account-level terminal settings. Keys are merged, not replaced, so a client that knows about only some settings cannot drop the rest. A null value deletes that key.",
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            preferences: {
              type: "object",
              description:
                "Map of storage key to serialized value. Null deletes a key.",
              additionalProperties: { type: "string", nullable: true },
            },
          },
          required: ["preferences"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Preferences saved",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              message: { type: "string" },
              updatedAt: { type: "number" },
              count: { type: "number" },
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
  if (!user?.id)
    throw createError({ statusCode: 401, message: "Unauthorized" });

  const incoming = body?.preferences;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    throw createError({
      statusCode: 400,
      message: "preferences must be an object",
    });
  }

  const record = await models.user.findByPk(user.id, {
    attributes: ["id", "settings"],
  });
  if (!record) throw createError({ statusCode: 404, message: "User not found" });

  const settings = { ...(record.settings || {}) };
  const merged: Record<string, string> = {
    ...((settings.terminal as Record<string, string>) || {}),
  };

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) {
      delete merged[key];
      continue;
    }
    // Values are already-serialized storage entries; anything else is a client
    // bug and is coerced rather than silently stored as "[object Object]".
    merged[key] = typeof value === "string" ? value : JSON.stringify(value);
  }

  const updatedAt = Date.now();
  merged.__updatedAt = String(updatedAt);

  const size = Buffer.byteLength(JSON.stringify(merged), "utf8");
  if (size > MAX_BYTES) {
    throw createError({
      statusCode: 413,
      message: `Preferences too large (${size} bytes, limit ${MAX_BYTES})`,
    });
  }

  settings.terminal = merged;
  await models.user.update({ settings }, { where: { id: user.id } });

  // __updatedAt is bookkeeping; report the count of real preference keys.
  return {
    message: "Preferences saved",
    updatedAt,
    count: Object.keys(merged).length - 1,
  };
};
