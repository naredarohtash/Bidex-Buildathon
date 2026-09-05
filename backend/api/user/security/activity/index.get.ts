// /server/api/user/security/activity/index.get.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { currentSid, liveSessions } from "../utils";

/**
 * Where this account has been signed into.
 *
 * The list is recorded rows joined against live Redis sessions: the row says
 * what the device was and when it first appeared, Redis says whether it is
 * still signed in. A row with no live session is history — it is shown, greyed,
 * because "a sign-in from Lagos last Thursday" is exactly the thing somebody
 * opens this page to find.
 *
 * Rows only exist from the moment a device announces itself, which is on
 * sign-in and on opening this page. That is a real limit and the page says so
 * rather than back-filling anything.
 */
export const metadata: OperationObject = {
  summary: "Sign-in activity",
  operationId: "getSignInActivity",
  tags: ["User", "Security"],
  description:
    "Devices that have signed into this account, most recent first, each marked active or ended.",
  responses: {
    200: {
      description: "Recorded sign-ins",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              devices: { type: "array", items: { type: "object" } },
              activeCount: { type: "number" },
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

const LIMIT = 20;

export default async (data: Handler) => {
  const { user } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const [rows, sessions] = await Promise.all([
    models.loginActivity.findAll({
      where: { userId: user.id },
      order: [["lastSeenAt", "DESC"]],
      limit: LIMIT,
      raw: true,
    }),
    liveSessions(user.id),
  ]);

  const live = new Set(sessions.map((s) => s.sid));
  const thisSid = currentSid(sessions, data);

  const devices = rows.map((row: any) => {
    const active = !!row.sid && live.has(row.sid) && !row.revokedAt;
    return {
      id: row.id,
      current: !!thisSid && row.sid === thisSid,
      active,
      ip: row.ip || null,
      browser: row.browser || null,
      os: row.os || null,
      deviceType: row.deviceType || null,
      deviceName: row.deviceName || null,
      city: row.city || null,
      region: row.region || null,
      country: row.country || null,
      countryCode: row.countryCode || null,
      signedInAt: row.createdAt || null,
      lastSeenAt: row.lastSeenAt || row.updatedAt || null,
      /* Told apart deliberately: a device that was signed out from this page
         is a different story from one whose session simply expired. */
      endedReason: active ? null : row.revokedAt ? "revoked" : row.sid ? "expired" : null,
    };
  });

  /* Current device first, then everything still signed in, then history. The
     order answers the question in the order it is asked. */
  devices.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.active !== b.active) return a.active ? -1 : 1;
    return new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime();
  });

  return {
    devices,
    activeCount: devices.filter((d) => d.active).length,
    /* Sessions Redis holds that were never recorded — devices that signed in
       before this page existed. Counted, not invented into rows. */
    unrecordedSessions: Math.max(
      0,
      sessions.length - devices.filter((d) => d.active).length
    ),
  };
};
