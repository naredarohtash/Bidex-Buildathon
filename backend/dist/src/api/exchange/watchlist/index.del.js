"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.deleteWatchlist = deleteWatchlist;
const db_1 = require("@b/db");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Remove Item from Watchlist",
    operationId: "removeWatchlistItem",
    tags: ["Exchange", "Watchlist"],
    description: "Removes an item from the watchlist for the authenticated user.",
    parameters: [
        {
            name: "id",
            in: "path",
            required: true,
            description: "ID of the watchlist item to remove.",
            schema: { type: "number" },
        },
    ],
    responses: (0, query_1.deleteRecordResponses)("Watchlist"),
    requiresAuth: true,
};
exports.default = async (data) => {
    return await deleteWatchlist(Number(data.params.id));
};
async function deleteWatchlist(id) {
    await db_1.models.exchangeWatchlist.destroy({
        where: {
            id,
        },
    });
}
