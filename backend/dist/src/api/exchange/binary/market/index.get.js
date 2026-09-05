"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const utils_1 = require("../../utils");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "List Binary Markets",
    operationId: "listBinaryMarkets",
    tags: ["Exchange", "Binary", "Markets"],
    description: "Retrieves a list of all available binary trading markets.",
    logModule: "EXCHANGE",
    logTitle: "Get Binary Markets",
    responses: {
        200: {
            description: "A list of binary markets",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                id: { type: "string", description: "Market ID" },
                                currency: { type: "string", description: "Base currency" },
                                pair: { type: "string", description: "Quote currency" },
                                isTrending: { type: "boolean", description: "Whether the market is trending" },
                                isHot: { type: "boolean", description: "Whether the market is hot" },
                                status: { type: "boolean", description: "Market status" },
                            },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Binary Market"),
        500: query_1.serverErrorResponse,
    },
};
exports.default = async (data) => {
    const { ctx } = data;
    try {
        ctx === null || ctx === void 0 ? void 0 : ctx.step("Fetching binary markets");
        const bidexUrl = process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001";
        const bidexApiKey = process.env.BIDEX_API_KEY;
        const normalizeSymbol = (s) => String(s || "")
            .replace(/\(?\s*OTC\s*\)?/gi, "")
            .replace(/[^A-Za-z0-9]/g, "")
            .toUpperCase();
        const bidexAssetsMap = new Map();
        try {
            const response = await fetch(`${bidexUrl}/api/assets`, {
                headers: {
                    ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
                    "Origin": (0, utils_1.getOtcOrigin)()
                }
            });
            if (response.ok) {
                const result = await response.json();
                const bidexAssets = result.assets || [];
                for (const asset of bidexAssets) {
                    if (asset.symbol) {
                        bidexAssetsMap.set(normalizeSymbol(asset.symbol), asset);
                    }
                }
            }
            else {
                const text = await response.text();
                console.error(`BideX assets API returned status ${response.status}. Response: ${text}`);
            }
        }
        catch (err) {
            console.error("Error fetching assets list from BideX API:", err);
        }
        const hasOtcList = bidexAssetsMap.size > 0;
        const markets = (await db_1.models.binaryMarket.findAll({
            where: { status: true },
            order: [
                ["isTrending", "DESC"],
                ["isHot", "DESC"],
                ["currency", "ASC"],
            ],
        }))
            .map((e) => {
            const marketPlain = e.get({ plain: true });
            const symbol = `${e.currency}/${e.pair}`;
            const assetInfo = bidexAssetsMap.get(normalizeSymbol(symbol));
            return {
                ...marketPlain,
                label: symbol,
                symbol: symbol,
                category: assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.category,
                icon: assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.icon,
                pricePrecision: assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.price_precision,
                pipSize: assetInfo === null || assetInfo === void 0 ? void 0 : assetInfo.pip_size,
                isOtc: !!assetInfo,
            };
        })
            .filter((m) => !hasOtcList || m.isOtc);
        ctx === null || ctx === void 0 ? void 0 : ctx.success(`Retrieved ${markets.length} binary markets`);
        return markets;
    }
    catch (error) {
        console.error("Error fetching binary markets:", error);
        throw error;
    }
};
