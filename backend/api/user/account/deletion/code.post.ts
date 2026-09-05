// /server/api/user/account/deletion/code.post.ts

import { randomInt } from "crypto";
import { createError } from "@b/utils/error";
import { RedisSingleton } from "@b/utils/redis";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";

/**
 * Email a code that authorises deleting the account.
 *
 * Deleting is the one action on this account that cannot be undone, and until
 * now the only thing standing in front of it was the account password. That is
 * a fine proof of "you knew a secret", but it is a poor proof of "you are still
 * the person who owns this address": a password can be shoulder-surfed,
 * reused, or already sitting in a breach dump, and a stolen session needs no
 * password at all. A code sent to the address on the account is proof of
 * something the attacker in both of those stories does not have.
 *
 * The code lives ten minutes and dies on first use. Ten rather than the five
 * the sign-in code gets, because that one is typed the moment it is asked for
 * and this one is typed after reading four paragraphs about what is about to
 * be destroyed — but not longer, because the whole safety of a six-digit
 * secret is that the window is small.
 *
 * Asking again inside sixty seconds returns the same answer without sending a
 * second mail. Two codes in an inbox is how somebody types the dead one.
 */
export const DELETION_CODE_TTL_SECONDS = 10 * 60;
export const DELETION_RESEND_SECONDS = 60;
export const deletionKey = (userId: string) => `account-deletion:${userId}`;

export const metadata: OperationObject = {
  summary: "Send an account-deletion code",
  operationId: "sendAccountDeletionCode",
  tags: ["User", "Account"],
  description:
    "Emails a six-digit code to the address on the account. The code authorises one account deletion, expires in ten minutes, and is destroyed as soon as it is used.",
  logModule: "USER",
  logTitle: "Account deletion code",
  responses: {
    200: {
      description: "Code sent, or an existing one left in place",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              sent: { type: "boolean" },
              email: { type: "string", description: "The masked address it went to" },
              expiresIn: { type: "number" },
              retryIn: { type: "number", description: "Seconds before another can be requested" },
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

  const { models } = require("@b/db");
  const row = await models.user.findByPk(user.id, {
    attributes: ["email", "firstName"],
    raw: true,
  });
  const email = row?.email || (user as any).email;
  if (!email) {
    throw createError({
      statusCode: 400,
      message: "This account has no email address, so a code cannot be sent.",
    });
  }

  const redis = RedisSingleton.getInstance();
  const key = deletionKey(String(user.id));

  /* Already holding a fresh code? Say so and send nothing. Reading the age off
     the record rather than a second key keeps the two from disagreeing. */
  const existingRaw = await redis.get(key);
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw);
      const age = Math.round((Date.now() - Number(existing.sentAt || 0)) / 1000);
      if (age >= 0 && age < DELETION_RESEND_SECONDS) {
        return {
          sent: false,
          email: maskEmail(email),
          expiresIn: Math.max(0, DELETION_CODE_TTL_SECONDS - age),
          retryIn: DELETION_RESEND_SECONDS - age,
        };
      }
    } catch {
      /* Unreadable record — treat it as absent and write a fresh one. */
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await redis.set(
    key,
    JSON.stringify({ code, sentAt: Date.now(), attempts: 0 }),
    "EX",
    DELETION_CODE_TTL_SECONDS
  );

  /* Not best-effort. Every other emailed code on this site is a convenience
     with another way round it; this one is the only way through, so a mail
     that did not go out has to be reported rather than swallowed — otherwise
     the person sits waiting for a code that was never queued. */
  try {
    const { emailQueue } = require("@b/utils/emails");
    await emailQueue.add({
      emailData: {
        TO: email,
        FIRSTNAME: row?.firstName || (user as any).firstName || "there",
        CODE: code,
        MINUTES: String(Math.round(DELETION_CODE_TTL_SECONDS / 60)),
        CREATED_AT: new Date().toLocaleString(),
      },
      emailType: "AccountDeletionCode",
    });
  } catch (error: any) {
    await redis.del(key);
    const { logger } = require("@b/utils/console");
    logger.error("USER", "Account deletion code could not be queued", error);
    throw createError({
      statusCode: 500,
      message: "The code could not be sent. Please try again in a moment.",
    });
  }

  return {
    sent: true,
    email: maskEmail(email),
    expiresIn: DELETION_CODE_TTL_SECONDS,
    retryIn: DELETION_RESEND_SECONDS,
  };
};

/** `ro••••••@gmail.com` — enough to recognise, not enough to harvest. */
function maskEmail(email: string): string {
  const [name, domain] = String(email).split("@");
  if (!domain) return email;
  const head = name.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, name.length - 2))}@${domain}`;
}
