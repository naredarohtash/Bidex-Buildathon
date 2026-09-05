"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.getCurrencies = getCurrencies;
const db_1 = require("@b/db");
const redis_1 = require("@b/utils/redis");
const redis = redis_1.RedisSingleton.getInstance();
const query_1 = require("@b/utils/query");
const utils_1 = require("./utils");
exports.metadata = {
    summary: "List Currencies",
    operationId: "getCurrencies",
    tags: ["Currencies"],
    description: "Retrieves a list of all currencies.",
    responses: {
        200: {
            description: "A list of currencies",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: utils_1.baseCurrencySchema,
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Currency"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async () => {
    try {
        const cachedCurrencies = await redis.get("exchangeCurrencies");
        if (cachedCurrencies)
            return JSON.parse(cachedCurrencies);
    }
    catch (err) {
        console.error("Redis error:", err);
    }
    return await getCurrencies();
};
async function getCurrencies() {
    const response = (await db_1.models.exchangeCurrency.findAll({
        where: {
            status: true,
        },
    })).map((c) => c.get({ plain: true }));
    return response;
}
