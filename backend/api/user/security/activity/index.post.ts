// /server/api/user/security/activity/index.post.ts

import { models } from "@b/db";
import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { alertNewDevice, clientIp, currentSid, liveSessions, locateIp, parseUserAgent } from "../utils";

/**
 * Record the device making this call.
 *
 * The sign-in itself cannot do this — the login route is part of the compiled
 * framework and cannot be changed here — so the browser announces itself
 * instead, once per session, immediately after signing in and again whenever
 * the security page is opened. Everything recorded is still read off the
 * request by the server: the client supplies no address, no device and no
 * place, and nothing it could send would be trusted if it did.
 *
 * Keyed by the Redis session id, so re-announcing the same session updates
 * "last seen" rather than adding a second row for the same device.
 */
export const metadata: OperationObject = {
  summary: "Record this device",
  operationId: "recordSignInActivity",
  tags: ["User", "Security"],
  description:
    "Records the calling device against its current session so it appears in sign-in activity. Idempotent per session.",
  requestBody: { required: false, content: { "application/json": { schema: { type: "object" } } } },
  responses: {
    200: {
      description: "Recorded",
      content: {
        "application/json": {
          schema: { type: "object", properties: { recorded: { type: "boolean" } } },
        },
      },
    },
    401: unauthorizedResponse,
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user, headers } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const sessions = await liveSessions(user.id);
  const sid = currentSid(sessions, data);
  const ip = clientIp(data);
  const userAgent = String(headers?.["user-agent"] || "").slice(0, 512) || null;
  /* `Sec-CH-UA` is the only place a Chromium browser still names itself — see
     the note on the parser. Read, never stored: the row keeps the agent. */
  const uaHint = String(headers?.["sec-ch-ua"] || "").slice(0, 256) || null;
  const device = parseUserAgent(userAgent, uaHint);
  const now = new Date();

  /* Match on the session first. Without one — a shape this server writes that
     carries no matching token — fall back to the same device and address seen
     in the last day, so a browser that reopens the page does not accumulate a
     row per visit. */
  const existing = sid
    ? await models.loginActivity.findOne({ where: { userId: user.id, sid } })
    : await models.loginActivity.findOne({
        where: {
          userId: user.id,
          ip,
          userAgent,
        },
        order: [["lastSeenAt", "DESC"]],
      });

  if (existing) {
    const stale = !existing.lastSeenAt || now.getTime() - new Date(existing.lastSeenAt).getTime() > 60_000;
    if (stale) await existing.update({ lastSeenAt: now, sid: sid || existing.sid });
    return { recorded: true, sid: sid || null };
  }

  /* One lookup, on the one path that creates a row. */
  const place = await locateIp(ip);

  /* Read before writing. Whether this device is new is a question about the
     rows that existed a moment ago, and the row about to be created would
     answer it wrongly. */
  const previous = await models.loginActivity.findAll({
    where: { userId: user.id },
    attributes: ["userAgent", "countryCode"],
    raw: true,
  });

  await models.loginActivity.create({
    userId: user.id,
    sid: sid || null,
    ip,
    userAgent,
    browser: device.browser,
    os: device.os,
    deviceType: device.deviceType,
    deviceName: device.deviceName,
    city: place.city,
    region: place.region,
    country: place.country,
    countryCode: place.countryCode,
    lastSeenAt: now,
    revokedAt: null,
  });

  /* Not awaited into the response. The person who just signed in should not
     wait on an SMTP queue, and an email that fails must not fail the sign-in. */
  void alertNewDevice({
    user,
    previous,
    device,
    place,
    ip,
    userAgent,
    at: now,
  });

  return { recorded: true, sid: sid || null };
};
