"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Add Item to Watchlist",
    operationId: "addWatchlistItem",
    tags: ["Exchange", "Watchlist"],
    description: "Adds a new item to the watchlist for the authenticated user.",
    requestBody: {
        description: "Data for the watchlist item to add.",
        content: {
            "application/json": {
                schema: {
                    type: "object",
                    properties: {
                        symbol: {
                            type: "string",
                            description: "Symbol of the watchlist item",
                        },
                    },
                    required: ["symbol"],
                },
            },
        },
        required: true,
    },
    responses: (0, query_1.createRecordResponses)("Watchlist"),
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user, body } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const { symbol } = body;
    if (!symbol) {
        throw new Error("Missing required parameters: symbol.");
    }
    const existingWatchlist = await db_1.models.exchangeWatchlist.findOne({
        where: {
            userId: user.id,
            symbol,
        },
    });
    if (existingWatchlist) {
        await db_1.models.exchangeWatchlist.destroy({
            where: {
                id: existingWatchlist.id,
            },
        });
        return { message: "Item removed from watchlist successfully" };
    }
    await db_1.models.exchangeWatchlist.create({
        userId: user.id,
        symbol,
    });
    return { message: "Item added to watchlist successfully" };
};
