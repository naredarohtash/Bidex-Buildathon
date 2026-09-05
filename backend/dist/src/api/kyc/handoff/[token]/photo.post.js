"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const redis_1 = require("@b/utils/redis");
const query_1 = require("@b/utils/query");
const index_post_1 = require("../../../user/kyc/handoff/index.post");
const MAX_BYTES = 12 * 1024 * 1024;
const SLOTS = ["front", "back", "selfie"];
const MIME_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};
exports.metadata = {
    summary: "Upload a handoff photo",
    operationId: "uploadKycHandoffPhoto",
    tags: ["KYC"],
    description: "Accepts one photo from the phone half of verification, identified only by the handoff token. Images only, one of three known slots.",
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
        500: query_1.serverErrorResponse,
    },
    requiresAuth: false,
};
exports.default = async (data) => {
    var _a;
    const { params, body } = data;
    const token = String((params === null || params === void 0 ? void 0 : params.token) || "");
    const slot = String((body === null || body === void 0 ? void 0 : body.slot) || "");
    const file = String((body === null || body === void 0 ? void 0 : body.file) || "");
    if (!SLOTS.includes(slot))
        throw (0, error_1.createError)({ statusCode: 400, message: "Unknown photo" });
    if (!file.startsWith("data:"))
        throw (0, error_1.createError)({ statusCode: 400, message: "Invalid image" });
    const mime = ((_a = file.match(/^data:(.*?);base64,/)) === null || _a === void 0 ? void 0 : _a[1]) || "";
    const ext = MIME_EXT[mime];
    if (!ext)
        throw (0, error_1.createError)({ statusCode: 400, message: "Photos must be JPEG, PNG or WebP" });
    const base64 = file.split(",")[1] || "";
    if ((base64.length * 3) / 4 > MAX_BYTES) {
        throw (0, error_1.createError)({ statusCode: 400, message: "That photo is too large" });
    }
    const redis = redis_1.RedisSingleton.getInstance();
    const raw = await redis.get((0, index_post_1.handoffKey)(token));
    if (!raw)
        throw (0, error_1.createError)({ statusCode: 404, message: "This link has expired. Start again on your computer." });
    const session = JSON.parse(raw);
    const path = require("path");
    const fs = require("fs/promises");
    const { randomBytes } = require("crypto");
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
    const ttl = await redis.ttl((0, index_post_1.handoffKey)(token));
    await redis.set((0, index_post_1.handoffKey)(token), JSON.stringify(session), "EX", ttl > 0 ? ttl : 60);
    return { url, done: Object.keys(session.photos) };
};
