// /server/api/user/profile/password.put.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { hashPassword, validatePassword, verifyPassword } from "@b/utils/passwords";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";

/**
 * Change a password while signed in.
 *
 * Until now the only way to set a password was the emailed reset link, because
 * that is the only flow that proves you own the account. Knowing the current
 * password proves the same thing, and it is what a signed-in person expects to
 * be asked for — so this route asks for it, verifies it against the stored
 * argon2 hash, and refuses everything else.
 *
 * Two cases it deliberately will not serve:
 *
 * - An account with no password at all (registered through a provider). There
 *   is nothing to verify against, so the reset link stays the only way in.
 * - A new password that fails the same rules registration enforces. Rejecting
 *   here rather than at the next sign-in means the account never holds a
 *   password its owner cannot use.
 *
 * The session is left alone. Changing a password is not a reason to sign
 * someone out of the device they are changing it on.
 */
export const metadata: OperationObject = {
  summary: "Change Password",
  operationId: "changeOwnPassword",
  tags: ["User", "Security"],
  description:
    "Changes the authenticated user's password. The current password must be supplied and is verified before the new one is written. Accounts without a password (provider sign-in) are directed to the emailed reset link instead.",
  logModule: "PASSWORD",
  logTitle: "Change password",
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            currentPassword: {
              type: "string",
              description: "The password currently on the account",
            },
            newPassword: {
              type: "string",
              description:
                "The replacement. At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.",
            },
          },
          required: ["currentPassword", "newPassword"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Password changed",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: { message: { type: "string" } },
          },
        },
      },
    },
    400: { description: "Missing, incorrect or unusable password" },
    401: unauthorizedResponse,
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

/* The same rule set `validatePassword` enforces, written out so the client can
   say what is wrong instead of "invalid". */
const RULE =
  "Use at least 8 characters, with an uppercase letter, a lowercase letter, a number and a symbol.";

export default async (data: Handler) => {
  const { user, body } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    throw createError({
      statusCode: 400,
      message: "Both your current password and a new one are required",
    });
  }

  const record = await models.user.findByPk(user.id, {
    attributes: ["id", "password"],
  });
  if (!record) throw createError({ statusCode: 404, message: "User not found" });

  if (!record.password) {
    throw createError({
      statusCode: 400,
      message:
        "This account signs in without a password. Use the emailed reset link to set one.",
    });
  }

  /* Verified before anything else is looked at, so a wrong current password
     cannot be told apart from a wrong new one by how long the call takes to
     come back with its complaint. */
  const ok = await verifyPassword(record.password, currentPassword);
  if (!ok) {
    throw createError({
      statusCode: 400,
      message: "Your current password is not correct",
    });
  }

  if (currentPassword === newPassword) {
    throw createError({
      statusCode: 400,
      message: "The new password is the same as the current one",
    });
  }

  if (!validatePassword(newPassword)) {
    throw createError({ statusCode: 400, message: RULE });
  }

  const hashed = await hashPassword(newPassword);
  await models.user.update({ password: hashed }, { where: { id: user.id } });

  return { message: "Password changed" };
};
