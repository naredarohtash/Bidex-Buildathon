"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const db_1 = require("@b/db");
const query_1 = require("@b/utils/query");
const sequelize_1 = require("sequelize");
exports.metadata = {
    summary: "List Orders",
    operationId: "listOrders",
    tags: ["Exchange", "Orders"],
    description: "Retrieves a list of orders for the authenticated user.",
    parameters: [
        {
            name: "type",
            in: "query",
            description: "Type of order to retrieve.",
            schema: { type: "string" },
        },
        {
            name: "currency",
            in: "query",
            description: "currency of the order to retrieve.",
            schema: { type: "string" },
        },
        {
            name: "pair",
            in: "query",
            description: "pair of the order to retrieve.",
            schema: { type: "string" },
        },
    ],
    responses: {
        200: {
            description: "A list of orders",
            content: {
                "application/json": {
                    schema: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {},
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        404: (0, query_1.notFoundMetadataResponse)("Order"),
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw new Error("Unauthorized");
    const { currency, pair, type } = data.query;
    console.log("Backend query parameters received:", { currency, pair, type, userId: user.id });
    const isStringValid = (val) => val && val !== "undefined" && val !== "null" && val !== "";
    const orders = await db_1.models.binaryOrder.findAll({
        where: {
            userId: user.id,
            status: type === "OPEN" ? "PENDING" : { [sequelize_1.Op.not]: "PENDING" },
            ...(isStringValid(currency) && isStringValid(pair) ? { symbol: `${currency}/${pair}` } : {}),
        },
        order: [["createdAt", "DESC"]],
    });
    return orders;
};
