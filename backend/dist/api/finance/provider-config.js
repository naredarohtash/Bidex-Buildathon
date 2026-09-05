"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProviderConfig = getProviderConfig;
exports.saveProviderConfig = saveProviderConfig;
exports.clearProviderConfig = clearProviderConfig;
exports.maskTail = maskTail;
exports.__resetProviderCache = __resetProviderCache;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("@b/db");
const SETTING_KEY = "bidex_payment_provider";
function encryptionKey() {
    const source = process.env.SETTINGS_ENCRYPTION_KEY || process.env.APP_ACCESS_TOKEN_SECRET;
    if (!source)
        return null;
    return crypto_1.default.createHash("sha256").update(`bidex:provider:${source}`).digest();
}
function encrypt(plain) {
    const key = encryptionKey();
    if (!key)
        return null;
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
function decrypt(payload) {
    const key = encryptionKey();
    if (!key)
        return null;
    try {
        const [iv, tag, data] = payload.split(".");
        if (!iv || !tag || !data)
            return null;
        const decipher = crypto_1.default.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
        decipher.setAuthTag(Buffer.from(tag, "base64"));
        return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
    }
    catch (_a) {
        return null;
    }
}
let cache = null;
const CACHE_MS = 30000;
async function getProviderConfig() {
    if (cache && Date.now() - cache.at < CACHE_MS)
        return cache.value;
    const envKey = (process.env.NOWPAYMENTS_API_KEY || "").trim();
    const envSecret = (process.env.NOWPAYMENTS_IPN_SECRET || "").trim();
    const envUrl = (process.env.NOWPAYMENTS_IPN_URL || "").trim();
    if (envKey && envSecret) {
        const value = {
            apiKey: envKey,
            ipnSecret: envSecret,
            ipnUrl: envUrl || null,
            source: "env",
        };
        cache = { at: Date.now(), value };
        return value;
    }
    let stored = null;
    try {
        const row = await db_1.models.settings.findOne({ where: { key: SETTING_KEY } });
        if (row === null || row === void 0 ? void 0 : row.value) {
            const plain = decrypt(String(row.value));
            if (plain)
                stored = JSON.parse(plain);
        }
    }
    catch (_a) {
        stored = null;
    }
    const value = {
        apiKey: envKey || (stored === null || stored === void 0 ? void 0 : stored.apiKey) || null,
        ipnSecret: envSecret || (stored === null || stored === void 0 ? void 0 : stored.ipnSecret) || null,
        ipnUrl: envUrl || (stored === null || stored === void 0 ? void 0 : stored.ipnUrl) || null,
        source: (stored === null || stored === void 0 ? void 0 : stored.apiKey) ? "database" : envKey ? "env" : "none",
    };
    cache = { at: Date.now(), value };
    return value;
}
async function saveProviderConfig(input) {
    if (!encryptionKey()) {
        return {
            ok: false,
            error: "Cannot store credentials securely: no encryption key is configured on the server.",
        };
    }
    const current = await getProviderConfig();
    const next = {
        apiKey: (input.apiKey || "").trim() || current.apiKey || null,
        ipnSecret: (input.ipnSecret || "").trim() || current.ipnSecret || null,
        ipnUrl: (input.ipnUrl || "").trim() || current.ipnUrl || null,
    };
    const sealed = encrypt(JSON.stringify(next));
    if (!sealed)
        return { ok: false, error: "Could not encrypt the credentials." };
    const existing = await db_1.models.settings.findOne({ where: { key: SETTING_KEY } });
    if (existing)
        await db_1.models.settings.update({ value: sealed }, { where: { key: SETTING_KEY } });
    else
        await db_1.models.settings.create({ key: SETTING_KEY, value: sealed });
    cache = null;
    return { ok: true };
}
async function clearProviderConfig() {
    await db_1.models.settings.destroy({ where: { key: SETTING_KEY } });
    cache = null;
}
function maskTail(value) {
    if (!value)
        return null;
    const s = String(value);
    return s.length <= 4 ? "••••" : `••••${s.slice(-4)}`;
}
function __resetProviderCache() {
    cache = null;
}
