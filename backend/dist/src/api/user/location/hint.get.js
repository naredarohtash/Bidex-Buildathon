"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const error_1 = require("@b/utils/error");
const query_1 = require("@b/utils/query");
const utils_1 = require("../security/utils");
exports.metadata = {
    summary: "Country hint for the current request",
    operationId: "getLocationHint",
    tags: ["User"],
    description: "Resolves the country of the requesting IP address, so forms can default a country or dial code. Advisory only; every value it fills stays editable, and a failed lookup returns nulls.",
    responses: {
        200: {
            description: "A guess, or nulls",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            countryCode: { type: "string", nullable: true, description: "ISO-3166 alpha-2" },
                            country: { type: "string", nullable: true },
                            region: { type: "string", nullable: true },
                            city: { type: "string", nullable: true },
                        },
                    },
                },
            },
        },
        401: query_1.unauthorizedResponse,
        500: query_1.serverErrorResponse,
    },
    requiresAuth: true,
};
exports.default = async (data) => {
    const { user } = data;
    if (!(user === null || user === void 0 ? void 0 : user.id))
        throw (0, error_1.createError)({ statusCode: 401, message: "Unauthorized" });
    const place = await (0, utils_1.locateIp)((0, utils_1.clientIp)(data));
    return {
        countryCode: place.countryCode ? String(place.countryCode).toUpperCase() : null,
        country: place.country || null,
        region: place.region || null,
        city: place.city || null,
    };
};
