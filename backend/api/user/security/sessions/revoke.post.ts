// /server/api/user/security/sessions/revoke.post.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { currentSid, dropSession, liveSessions } from "../utils";

/**
 * Sign devices out — all the others, or one named device.
 *
 * The point of the big button is the moment somebody sees a session they do not
 * recognise, so it does the strong thing: every session key for this account is
 * deleted from Redis. The one making the request is kept by default, because
 * being logged out of the page you are trying to secure is not a security
 * feature; pass `includeCurrent` to end that one too.
 *
 * `deviceId` narrows it to a single row from the activity list — the ordinary
 * case, which is one phone in a hotel rather than everything at once. It is the
 * `loginActivity` row id, always looked up under this account's own id, so an
 * id belonging to somebody else finds nothing rather than ending their session.
 * The current device is refused here: signing yourself out is the Log out
 * button, and doing it from a row that looks like all the others is a mistake
 * waiting to be made.
 *
 * Deleting the key is what actually ends the session — the tokens the device
 * holds stop resolving on its next call. The rows are then marked revoked so
 * the page can say the device was signed out rather than that it expired.
 */
export const metadata: OperationObject = {
  summary: "Sign out other devices",
  operationId: "revokeOtherSessions",
  tags: ["User", "Security"],
  description:
    "Deletes this account's sessions. Keeps the calling session unless includeCurrent is true.",
  requestBody: {
    required: false,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            includeCurrent: {
              type: "boolean",
              description: "Also end the session making this request",
            },
            deviceId: {
              type: "string",
              description:
                "End only this device's session — a loginActivity row id from the activity list",
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Sessions ended",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              revoked: { type: "number" },
              keptCurrent: { type: "boolean" },
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

  const includeCurrent = !!body?.includeCurrent;
  const sessions = await liveSessions(user.id);
  const keep = includeCurrent ? null : currentSid(sessions, data);

  /* One device, by its row. */
  const deviceId = body?.deviceId ? String(body.deviceId) : null;
  if (deviceId) {
    const row: any = await models.loginActivity.findOne({
      where: { id: deviceId, userId: user.id },
      raw: true,
    });
    /* Not found, and already-ended, get the same answer: nothing was live, so
       nothing was ended. A row from before this list recorded sids has no
       session to delete either. */
    if (!row?.sid || !sessions.some((s) => s.sid === row.sid)) {
      return {
        revoked: 0,
        keptCurrent: !!keep,
        message: "That device is already signed out.",
      };
    }
    if (row.sid === keep) {
      throw createError({
        statusCode: 400,
        message: "That is this device. Use Log out to end this session.",
      });
    }

    await dropSession(row.sid);
    await models.loginActivity.update(
      { revokedAt: new Date() },
      { where: { userId: user.id, sid: row.sid } }
    );
    return { revoked: 1, keptCurrent: !!keep, message: "Device signed out." };
  }

  const doomed = sessions.filter((s) => s.sid !== keep).map((s) => s.sid);
  await Promise.all(doomed.map((sid) => dropSession(sid)));

  if (doomed.length) {
    await models.loginActivity.update(
      { revokedAt: new Date() },
      { where: { userId: user.id, sid: doomed } }
    );
  }

  return {
    revoked: doomed.length,
    keptCurrent: !!keep,
    message: doomed.length
      ? `Signed out of ${doomed.length} ${doomed.length === 1 ? "device" : "devices"}.`
      : "There were no other devices signed in.",
  };
};
