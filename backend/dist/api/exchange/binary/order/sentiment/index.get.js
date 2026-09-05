"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const sequelize_1 = require("sequelize");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Live Positioning For An Instrument",
    operationId: "getBinarySentiment",
    tags: ["Binary", "Orders"],
    description: "Aggregates currently open binary positions on one symbol into a call/put split by count and by staked amount.",
    parameters: [
        {
            name: "symbol",
            in: "query",
            description: "Instrument to aggregate, e.g. 'EUR/USD_OTC'.",
            required: true,
            schema: { type: "string" },
        },
    ],
    responses: {
        200: {
            description: "Open positioning for the instrument",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            symbol: { type: "string" },
                            total: { type: "number" },
                            callCount: { type: "number" },
                            putCount: { type: "number" },
                            callVolume: { type: "number" },
                            putVolume: { type: "number" },
                            callPercent: { type: "number" },
                            putPercent: { type: "number" },
                        },
                    },
                },
            },
        },
        500: query_1.serverErrorResponse,
    },
};
const CALL_SIDES = ["RISE", "HIGHER", "TOUCH", "CALL", "UP"];
const PUT_SIDES = ["FALL", "LOWER", "NO_TOUCH", "PUT", "DOWN"];
exports.default = async (data) => {
    var _a;
    const symbol = String(((_a = data.query) === null || _a === void 0 ? void 0 : _a.symbol) || "").trim();
    if (!symbol)
        throw (0, error_1.createError)(400, "symbol is required");
    try {
        const rows = await db_1.models.binaryOrder.findAll({
            where: {
                symbol,
                status: "PENDING",
                isDemo: false,
            },
            attributes: [
                "side",
                [(0, sequelize_1.fn)("COUNT", (0, sequelize_1.col)("id")), "count"],
                [(0, sequelize_1.fn)("SUM", (0, sequelize_1.col)("amount")), "volume"],
            ],
            group: ["side"],
            raw: true,
        });
        let callCount = 0;
        let putCount = 0;
        let callVolume = 0;
        let putVolume = 0;
        for (const row of rows) {
            const side = String(row.side || "").toUpperCase();
            const count = Number(row.count) || 0;
            const volume = Number(row.volume) || 0;
            if (CALL_SIDES.includes(side)) {
                callCount += count;
                callVolume += volume;
            }
            else if (PUT_SIDES.includes(side)) {
                putCount += count;
                putVolume += volume;
            }
        }
        const total = callCount + putCount;
        const totalVolume = callVolume + putVolume;
        const callPercent = totalVolume > 0 ? (callVolume / totalVolume) * 100 : 0;
        return {
            symbol,
            total,
            callCount,
            putCount,
            callVolume: Math.round(callVolume * 100) / 100,
            putVolume: Math.round(putVolume * 100) / 100,
            callPercent: Math.round(callPercent * 10) / 10,
            putPercent: totalVolume > 0 ? Math.round((100 - callPercent) * 10) / 10 : 0,
        };
    }
    catch (error) {
        if (error === null || error === void 0 ? void 0 : error.statusCode)
            throw error;
        console.error("Error aggregating binary sentiment:", error);
        throw (0, error_1.createError)(500, "Could not read positioning for this instrument");
    }
};
