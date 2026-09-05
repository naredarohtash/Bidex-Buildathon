"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const rules_1 = require("./rules");
const query_1 = require("@b/utils/query");
exports.metadata = {
    summary: "Identity documents accepted per country",
    operationId: "getKycDocumentRules",
    tags: ["KYC"],
    description: "Returns every supported country with the identity documents accepted there, how many photos each requires, and the pattern its number must match. Drives the verification form.",
    responses: {
        200: {
            description: "Country and document rules",
            content: {
                "application/json": {
                    schema: {
                        type: "object",
                        properties: {
                            countries: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        code: { type: "string" },
                                        name: { type: "string" },
                                        documents: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    id: { type: "string" },
                                                    label: { type: "string" },
                                                    sides: { type: "number" },
                                                    pattern: { type: "string" },
                                                    placeholder: { type: "string" },
                                                    hint: { type: "string" },
                                                },
                                            },
                                        },
                                        postcode: {
                                            type: "object",
                                            description: "How that country writes a postcode. `required: false` means the country has no postal system and the field should not be shown.",
                                            properties: {
                                                required: { type: "boolean" },
                                                pattern: { type: "string" },
                                                placeholder: { type: "string" },
                                                label: { type: "string" },
                                                numeric: { type: "boolean" },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
        500: query_1.serverErrorResponse,
    },
    requiresAuth: false,
};
exports.default = async () => ({ countries: rules_1.COUNTRIES });
