"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const provider_config_1 = require("../../../finance/provider-config");
exports.metadata = {
    summary: "Payment provider status",
    operationId: "getPaymentProvider",
    tags: ["Admin", "Finance"],
    description: "Whether deposit credentials are configured. Never returns the credentials.",
    requiresAuth: true,
    permission: "edit.deposit",
    responses: {
        200: { description: "Provider status" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
    },
};
exports.default = async (data) => {
    var _a;
    if (!((_a = data === null || data === void 0 ? void 0 : data.user) === null || _a === void 0 ? void 0 : _a.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const config = await (0, provider_config_1.getProviderConfig)();
    const ready = Boolean(config.apiKey && config.ipnSecret);
    return {
        provider: "NOWPayments",
        ready,
        apiKeySet: Boolean(config.apiKey),
        ipnSecretSet: Boolean(config.ipnSecret),
        apiKeyHint: (0, provider_config_1.maskTail)(config.apiKey),
        ipnSecretHint: (0, provider_config_1.maskTail)(config.ipnSecret),
        ipnUrl: config.ipnUrl,
        source: config.source,
        envManaged: config.source === "env",
        suggestedIpnUrl: config.ipnUrl ||
            (process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_PUBLIC_URL || "").replace(/\/$/, "") +
                "/api/finance/deposit/ipn",
    };
};
