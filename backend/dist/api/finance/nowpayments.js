"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowPaymentsConfigured = nowPaymentsConfigured;
exports.isUp = isUp;
exports.createPayment = createPayment;
exports.getPayment = getPayment;
exports.minimumFor = minimumFor;
exports.verifyCallback = verifyCallback;
exports.classify = classify;
const crypto_1 = __importDefault(require("crypto"));
const provider_config_1 = require("./provider-config");
const API = "https://api.nowpayments.io/v1";
const TIMEOUT_MS = 20000;
async function nowPaymentsConfigured() {
    const config = await (0, provider_config_1.getProviderConfig)();
    return Boolean(config.apiKey && config.ipnSecret);
}
async function call(path, init = {}) {
    const key = (await (0, provider_config_1.getProviderConfig)()).apiKey;
    if (!key)
        return null;
    try {
        const res = await fetch(`${API}${path}`, {
            method: init.method || "GET",
            headers: {
                "x-api-key": key,
                ...(init.body ? { "Content-Type": "application/json" } : {}),
            },
            ...(init.body ? { body: JSON.stringify(init.body) } : {}),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            console.error(`[NOWPAY] ${path} -> HTTP ${res.status} ${(body === null || body === void 0 ? void 0 : body.message) || ""}`);
            return null;
        }
        return body;
    }
    catch (err) {
        console.error(`[NOWPAY] ${path} failed: ${(err === null || err === void 0 ? void 0 : err.name) || err}`);
        return null;
    }
}
async function isUp() {
    const body = await call("/status");
    return (body === null || body === void 0 ? void 0 : body.message) === "OK";
}
async function createPayment(args) {
    const callbackUrl = (await (0, provider_config_1.getProviderConfig)()).ipnUrl || "";
    const body = await call("/payment", {
        method: "POST",
        body: {
            price_amount: args.priceAmount,
            price_currency: "usd",
            pay_currency: args.payCurrency.toLowerCase(),
            order_id: args.orderId,
            order_description: args.description || "Bidex deposit",
            is_fee_paid_by_user: true,
            ...(callbackUrl ? { ipn_callback_url: callbackUrl } : {}),
        },
    });
    if (!(body === null || body === void 0 ? void 0 : body.pay_address) || !(body === null || body === void 0 ? void 0 : body.payment_id))
        return null;
    return {
        paymentId: String(body.payment_id),
        payAddress: String(body.pay_address),
        payinExtraId: body.payin_extra_id ? String(body.payin_extra_id) : null,
        payAmount: Number(body.pay_amount) || 0,
        payCurrency: String(body.pay_currency || args.payCurrency).toUpperCase(),
        priceAmount: Number(body.price_amount) || args.priceAmount,
        priceCurrency: String(body.price_currency || "USD").toUpperCase(),
        validUntil: body.valid_until ? String(body.valid_until) : null,
    };
}
async function getPayment(paymentId) {
    return await call(`/payment/${encodeURIComponent(paymentId)}`);
}
async function minimumFor(payCurrency) {
    const body = await call(`/min-amount?currency_from=${encodeURIComponent(payCurrency.toLowerCase())}&currency_to=usdttrc20`);
    const min = Number(body === null || body === void 0 ? void 0 : body.min_amount);
    return Number.isFinite(min) && min > 0 ? min : null;
}
function sortDeep(value) {
    if (Array.isArray(value))
        return value.map(sortDeep);
    if (value && typeof value === "object") {
        return Object.keys(value)
            .sort()
            .reduce((out, key) => {
            out[key] = sortDeep(value[key]);
            return out;
        }, {});
    }
    return value;
}
async function verifyCallback(body, signature) {
    const secret = (await (0, provider_config_1.getProviderConfig)()).ipnSecret;
    if (!secret) {
        console.error("[NOWPAY] callback rejected: NOWPAYMENTS_IPN_SECRET is not set");
        return false;
    }
    if (!signature || typeof signature !== "string")
        return false;
    try {
        const expected = crypto_1.default
            .createHmac("sha512", secret)
            .update(JSON.stringify(sortDeep(body)))
            .digest("hex");
        const a = Buffer.from(expected, "utf8");
        const b = Buffer.from(signature.trim(), "utf8");
        if (a.length !== b.length)
            return false;
        return crypto_1.default.timingSafeEqual(a, b);
    }
    catch (err) {
        console.error(`[NOWPAY] signature check failed: ${err === null || err === void 0 ? void 0 : err.message}`);
        return false;
    }
}
function classify(status) {
    switch (String(status || "").toLowerCase()) {
        case "finished":
        case "confirmed":
        case "partially_paid":
            return "CREDIT";
        case "failed":
        case "refunded":
        case "expired":
            return "FAILED";
        default:
            return "PENDING";
    }
}
