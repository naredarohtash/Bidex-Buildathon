"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.getMarket = getMarket;
const redis_1 = require("@b/utils/redis");
const db_1 = require("@b/db");
const redis = redis_1.RedisSingleton.getInstance();
const query_1 = require("@b/utils/query");
const utils_1 = require("../utils");
exports.metadata = {
    summary: "Show Market Details",
    operationId: "showMarket",
    tags: ["Exchange", "Markets"],
    description: "Retrieves details of a specific market by ID.",
    parameters: [
        {
            name: "id",
            in: "path",
            required: true,
            description: "The ID of the market to retrieve.",
            schema: { type: "string" },
        },
    ],
    responses: {
        200: {
            description: "Market details",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: utils_1.baseMarketSchema,
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Market"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { id } = data.params;
    try {
        const cachedMarkets = await redis.get("exchangeMarkets");
        if (cachedMarkets) {
            const markets = JSON.parse(cachedMarkets);
            const market = markets.find((m) => m.id === id);
            if (market)
                return market;
        }
    }
    catch (err) {
        console.error("Redis error:", err);
    }
    return await getMarket(id);
};
async function getMarket(id) {
    const response = await db_1.models.exchangeMarket.findOne({
        where: {
            id: id,
        },
    });
    if (!response) {
        throw new Error("Market not found");
    }
    return response.get({ plain: true });
}
