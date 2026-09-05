"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.getCurrency = getCurrency;
const db_1 = require("@b/db");
const redis_1 = require("@b/utils/redis");
const redis = redis_1.RedisSingleton.getInstance();
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
exports.metadata = {
    summary: "Show Currency",
    operationId: "getCurrency",
    tags: ["Currencies"],
    description: "Retrieves details of a specific currency by ID.",
    parameters: [
        {
            name: "id",
            in: "path",
            description: "ID of the currency to retrieve.",
            required: true,
            schema: { type: "string" },
        },
    ],
    responses: {
        200: {
            description: "Currency details",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: utils_1.baseCurrencySchema,
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Currency"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { id } = data.params;
    try {
        const cachedCurrencies = await redis.get("exchangeCurrencies");
        if (cachedCurrencies) {
            const currencies = JSON.parse(cachedCurrencies);
            const currency = currencies.find((c) => c.id === Number(id));
            if (currency)
                return currency;
        }
    }
    catch (err) {
        console.error("Redis error:", err);
    }
    return await getCurrency(Number(id));
};
async function getCurrency(id) {
    const response = await db_1.models.exchangeCurrency.findOne({
        where: {
            id: id,
            status: true,
        },
    });
    if (!response) {
        throw new Error("Currency not found");
    }
    return response.get({ plain: true });
}
