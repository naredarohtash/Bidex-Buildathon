// /server/api/user/account/deletion/confirm.post.ts

import { createError } from "@b/utils/error";
import { RedisSingleton } from "@b/utils/redis";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { DELETION_CODE_TTL_SECONDS, deletionKey } from "./code.post";

/**
 * Delete the account, once two independent gates have been cleared.
 *
 * `/api/user/account/delete` already existed and takes a password. This route
 * exists beside it rather than replacing it because the two prove different
 * things and this pair is the stronger one for an irreversible action:
 *
 *  - **The typed word.** Not security — it stops the mis-click, and it is the
 *    only gate that makes somebody re-read the sentence above the box.
 *  - **The emailed code.** This is the security. It proves the person pressing
 *    the button still controls the address on the account, which a password
 *    alone does not and a hijacked session does not at all.
 *
 * Five wrong codes burn the code. Six digits with unlimited guesses is not a
 * secret, and the failure here deletes an account.
 *
 * The row is soft-deleted, exactly as the older route does it — support can in
 * principle still find it — but nobody signing this off is told "probably
 * recoverable", because from the account holder's side it is gone.
 */
const CONFIRM_WORD = "DELETE";
const MAX_ATTEMPTS = 5;

export const metadata: OperationObject = {
  summary: "Delete own account with an emailed code",
  operationId: "confirmAccountDeletion",
  tags: ["User", "Account"],
  description:
    "Soft-deletes the authenticated user's account. Requires the literal word DELETE and the six-digit code emailed by /api/user/account/deletion/code.",
  logModule: "USER",
  logTitle: "Delete account",
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            confirm: { type: "string", description: 'Must be the word "DELETE"' },
            code: { type: "string", description: "The six-digit code from the email" },
          },
          required: ["confirm", "code"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Account deleted",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    400: { description: "Wrong word, or a wrong, expired or exhausted code" },
    401: unauthorizedResponse,
    403: { description: "This account may not delete itself" },
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { body, user, ctx } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const word = String(body?.confirm || "").trim().toUpperCase();
  if (word !== CONFIRM_WORD) {
    throw createError({
      statusCode: 400,
      message: `Type ${CONFIRM_WORD} exactly to confirm.`,
    });
  }

  const code = String(body?.code || "").replace(/\D/g, "");
  if (code.length !== 6) {
    throw createError({ statusCode: 400, message: "Enter the six-digit code from your email." });
  }

  const redis = RedisSingleton.getInstance();
  const key = deletionKey(String(user.id));
  const raw = await redis.get(key);
  if (!raw) {
    throw createError({
      statusCode: 400,
      message: "That code has expired. Ask for a new one.",
    });
  }

  let record: { code?: string; sentAt?: number; attempts?: number };
  try {
    record = JSON.parse(raw);
  } catch {
    await redis.del(key);
    throw createError({ statusCode: 400, message: "That code has expired. Ask for a new one." });
  }

  if (record.code !== code) {
    const attempts = Number(record.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await redis.del(key);
      throw createError({
        statusCode: 400,
        message: "Too many wrong codes. Ask for a new one.",
      });
    }
    /* Keep whatever life the code had left rather than restarting the clock —
       an attacker who could refresh the TTL by guessing would have an
       unlimited window. */
    const age = Math.round((Date.now() - Number(record.sentAt || 0)) / 1000);
    const remaining = Math.max(1, DELETION_CODE_TTL_SECONDS - age);
    await redis.set(key, JSON.stringify({ ...record, attempts }), "EX", remaining);
    throw createError({
      statusCode: 400,
      message: `That code is not right. ${MAX_ATTEMPTS - attempts} ${
        MAX_ATTEMPTS - attempts === 1 ? "try" : "tries"
      } left.`,
    });
  }

  const { models } = require("@b/db");
  ctx?.step("Retrieving user account");
  const row = await models.user.findOne({
    where: { id: user.id },
    include: [{ model: models.role, as: "role", attributes: ["name"] }],
  });
  if (!row) {
    ctx?.fail("User not found");
    throw createError({ statusCode: 404, message: "User not found" });
  }

  /* Same refusal the older route makes. Losing the only Super Admin locks
     everybody out of the back office, and there is no undo for that either. */
  if (row.role && row.role.name === "Super Admin") {
    ctx?.fail("Super Admin accounts cannot be self-deleted");
    throw createError({
      statusCode: 403,
      message: "Super Admin accounts cannot be self-deleted",
    });
  }

  /* Spent before the deletion, not after: if `destroy` throws, the code is
     still gone, and a code that outlived its one use is a second chance for
     whoever stole it. */
  await redis.del(key);

  ctx?.step("Deleting user account");
  await row.destroy();
  ctx?.success("Account deleted successfully");

  return { message: "Your account has been deleted." };
};
