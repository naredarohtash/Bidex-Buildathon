// /server/api/user/location/hint.get.ts

import { createError } from "@b/utils/error";
import { serverErrorResponse, unauthorizedResponse } from "@b/utils/query";
import { clientIp, locateIp } from "../security/utils";

/**
 * Where the person filling in a form appears to be.
 *
 * A guess, offered to the verification form so the phone field opens on the
 * right dial code and the country select opens on the right country. It is
 * only ever a default — every field it touches stays editable, and nothing is
 * written to the account off the back of it.
 *
 * Why the server and not the browser: `navigator.language` is the language the
 * operating system was installed in, not the country somebody lives in — half
 * of Asia and Africa reads `en-US` — and the timezone is closer but still
 * names a zone rather than a country, with `Asia/Kolkata` covering one country
 * and `Europe/Zurich` covering three. The address the request arrived from is
 * the only signal here that is about the person rather than their software,
 * and it is already being resolved for the sign-in activity list, cached in
 * Redis for a week per address.
 *
 * It fails open. A private address, a blocked lookup or a timeout all return
 * nulls, and the form then opens with nothing chosen — which is exactly what
 * it did before this route existed.
 */
export const metadata: OperationObject = {
  summary: "Country hint for the current request",
  operationId: "getLocationHint",
  tags: ["User"],
  description:
    "Resolves the country of the requesting IP address, so forms can default a country or dial code. Advisory only; every value it fills stays editable, and a failed lookup returns nulls.",
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
    401: unauthorizedResponse,
    500: serverErrorResponse,
  },
  requiresAuth: true,
};

export default async (data: Handler) => {
  const { user } = data;
  if (!user?.id) throw createError({ statusCode: 401, message: "Unauthorized" });

  const place = await locateIp(clientIp(data));
  return {
    countryCode: place.countryCode ? String(place.countryCode).toUpperCase() : null,
    country: place.country || null,
    region: place.region || null,
    city: place.city || null,
  };
};
