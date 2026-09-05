// /server/api/kyc/documents/index.get.ts

import { COUNTRIES } from "./rules";
import { serverErrorResponse } from "@b/utils/query";

/**
 * The country and document rules the verification form is built from.
 *
 * Public, and deliberately so. It carries no user data — it is the same list
 * for everybody — and the phone half of the verification flow fetches it while
 * holding a handoff token rather than a session, so requiring auth here would
 * mean a second way to authenticate for a list of country names.
 */
export const metadata: OperationObject = {
  summary: "Identity documents accepted per country",
  operationId: "getKycDocumentRules",
  tags: ["KYC"],
  description:
    "Returns every supported country with the identity documents accepted there, how many photos each requires, and the pattern its number must match. Drives the verification form.",
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
                      description:
                        "How that country writes a postcode. `required: false` means the country has no postal system and the field should not be shown.",
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
    500: serverErrorResponse,
  },
  requiresAuth: false,
};

export default async () => ({ countries: COUNTRIES });
