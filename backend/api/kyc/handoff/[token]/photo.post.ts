// /server/api/kyc/handoff/[token]/photo.post.ts

import { createError } from "@b/utils/error";
import { RedisSingleton } from "@b/utils/redis";
import { serverErrorResponse } from "@b/utils/query";
import { handoffKey } from "../../../user/kyc/handoff/index.post";

/**
 * A photo, taken on the phone.
 *
 * The upload endpoint the desktop uses requires a session, and the phone does
 * not have one. Rather than weaken that endpoint, this writes the file itself
 * under the same rules and stores the resulting path against the handoff, where
 * the desktop picks it up on its next poll.
 *
 * What the token permits stays deliberately narrow: three slot names, images
 * only, a size ceiling, and a store that expires in fifteen minutes. It cannot
 * name its own path — the filename is generated — so there is no route from
 * here to writing anywhere else on disk.
 */
const MAX_BYTES = 12 * 1024 * 1024;
const SLOTS = ["front", "back", "selfie"];
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export const metadata: OperationObject = {
  summary: "Upload a handoff photo",
  operationId: "uploadKycHandoffPhoto",
  tags: ["KYC"],
  description:
    "Accepts one photo from the phone half of verification, identified only by the handoff token. Images only, one of three known slots.",
  parameters: [
    { name: "token", in: "path", required: true, description: "Handoff token", schema: { type: "string" } },
  ],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            slot: { type: "string", description: "front, back or selfie" },
            file: { type: "string", description: "data: URL of the image" },
          },
          required: ["slot", "file"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Stored",
      content: {
        "application/json": {
          schema: { type: "object", properties: { url: { type: "string" }, done: { type: "array", items: { type: "string" } } } },
        },
      },
    },
    400: { description: "Bad slot, format or size" },
    404: { description: "The link has expired" },
    500: serverErrorResponse,
  },
  requiresAuth: false,
};

export default async (data: Handler) => {
  const { params, body } = data;
  const token = String(params?.token || "");
  const slot = String(body?.slot || "");
  const file = String(body?.file || "");

  if (!SLOTS.includes(slot)) throw createError({ statusCode: 400, message: "Unknown photo" });
  if (!file.startsWith("data:")) throw createError({ statusCode: 400, message: "Invalid image" });

  const mime = file.match(/^data:(.*?);base64,/)?.[1] || "";
  const ext = MIME_EXT[mime];
  if (!ext) throw createError({ statusCode: 400, message: "Photos must be JPEG, PNG or WebP" });

  const base64 = file.split(",")[1] || "";
  if ((base64.length * 3) / 4 > MAX_BYTES) {
    throw createError({ statusCode: 400, message: "That photo is too large" });
  }

  const redis = RedisSingleton.getInstance();
  const raw = await redis.get(handoffKey(token));
  if (!raw) throw createError({ statusCode: 404, message: "This link has expired. Start again on your computer." });

  const session = JSON.parse(raw);

  const path = require("path");
  const fs = require("fs/promises");
  const { randomBytes } = require("crypto");

  /* The same place the session-authenticated uploader writes to, resolved the
     same way: the backend runs from its own directory in development and from
     the repository root under pm2. Writing anywhere else would store photos the
     frontend cannot serve. */
  const isProduction = process.env.NODE_ENV === "production";
  const base = isProduction
    ? path.join(process.cwd(), "frontend", "public", "uploads")
    : path.join(process.cwd(), "..", "frontend", "public", "uploads");
  const dir = path.join(base, "kyc-documents");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  await fs.writeFile(path.join(dir, filename), Buffer.from(base64, "base64"));

  const url = `/uploads/kyc-documents/${filename}`;
  session.photos = { ...(session.photos || {}), [slot]: url };

  /* The remaining time is kept, not reset — a handoff should not live forever
     because somebody keeps adding photos to it. */
  const ttl = await redis.ttl(handoffKey(token));
  await redis.set(handoffKey(token), JSON.stringify(session), "EX", ttl > 0 ? ttl : 60);

  return { url, done: Object.keys(session.photos) };
};
