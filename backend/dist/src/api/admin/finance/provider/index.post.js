"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const provider_config_1 = require("../../../finance/provider-config");
exports.metadata = {
    summary: "Save payment provider credentials",
    operationId: "savePaymentProvider",
    tags: ["Admin", "Finance"],
    description: "Stores encrypted deposit credentials after checking the API key works.",
    requiresAuth: true,
    permission: "edit.deposit",
    requestBody: {
        required: true,
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        apiKey: { type: "string", description: "Blank leaves the stored key unchanged." },
                        ipnSecret: { type: "string", description: "Blank leaves the stored secret unchanged." },
                        ipnUrl: { type: "string" },
                        action: { type: "string", enum: ["save", "test", "clear"] },
                    },
                },
            },
        },
    },
    responses: {
        200: { description: "Saved or tested" },
        400: { description: "Invalid or unusable credentials" },
    },
};
async function keyWorks(apiKey) {
    try {
        const res = await fetch("https://api.nowpayments.io/v1/payment/1", {
            headers: { "x-api-key": apiKey },
            signal: AbortSignal.timeout(15000),
        });
        if (res.status === 401 || res.status === 403) {
            return { ok: false, detail: "The provider rejected that API key. Check it and try again." };
        }
        return { ok: true, detail: "Key accepted by the provider." };
    }
    catch (err) {
        return {
            ok: false,
            detail: `Could not reach the provider to check the key (${(err === null || err === void 0 ? void 0 : err.name) || "network error"}). Your key may be fine — try again shortly.`,
        };
    }
}
exports.default = async (data) => {
    var _a, _b, _c, _d, _e;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const action = String(((_b = data.body) === null || _b === void 0 ? void 0 : _b.action) || "save");
    const apiKey = String(((_c = data.body) === null || _c === void 0 ? void 0 : _c.apiKey) || "").trim();
    const ipnSecret = String(((_d = data.body) === null || _d === void 0 ? void 0 : _d.ipnSecret) || "").trim();
    const ipnUrl = String(((_e = data.body) === null || _e === void 0 ? void 0 : _e.ipnUrl) || "").trim();
    if (action === "clear") {
        await (0, provider_config_1.clearProviderConfig)();
        return { ok: true, message: "Credentials removed. Crypto deposits are now disabled." };
    }
    if (action === "test") {
        const current = await (0, provider_config_1.getProviderConfig)();
        const target = apiKey || current.apiKey;
        if (!target)
            throw (0, error_1.createError)({ statusCode: 400, message: "No API key to test." });
        const result = await keyWorks(target);
        return { ok: result.ok, message: result.detail };
    }
    if (apiKey) {
        const result = await keyWorks(apiKey);
        if (!result.ok)
            throw (0, error_1.createError)({ statusCode: 400, message: result.detail });
    }
    if (ipnUrl && !/^https:\/\/.+/i.test(ipnUrl)) {
        throw (0, error_1.createError)({ statusCode: 400, message: "The callback URL must start with https://" });
    }
    const saved = await (0, provider_config_1.saveProviderConfig)({ apiKey, ipnSecret, ipnUrl });
    if (!saved.ok)
        throw (0, error_1.createError)({ statusCode: 400, message: saved.error });
    const after = await (0, provider_config_1.getProviderConfig)();
    return {
        ok: true,
        ready: Boolean(after.apiKey && after.ipnSecret),
        message: after.apiKey && after.ipnSecret
            ? "Saved. Crypto deposits are enabled."
            : "Saved, but crypto deposits stay off until both the API key and the IPN secret are set.",
    };
};
