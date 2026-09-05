// Live positioning on one instrument, from this platform's own order book.
//
// The terminal's instrument panel used to display a "Traders' Sentiment" split
// and a set of trade counts that were computed as `40 + (hash(symbol) % 50)` and
// `12400 + (hash(symbol) % 16750)` — order-flow statistics invented from the
// letters of the instrument's name, shown to a trader as a reason to take one
// side of it.
//
// The figures it claimed to show do exist: every position is a binaryOrder row
// carrying a side, a stake and a symbol. This aggregates the open ones, so the
// panel reports what these traders are actually holding right now.
//
// Deliberately not per-user and not authenticated against a particular account:
// this is market colour about an instrument, the same for everyone looking at
// it. Demo orders are excluded — they are not positions anyone is exposed to,
// and letting practice flow move a sentiment gauge would make it trivial to
// push.

import { models } from "@b/db";
import { Op, fn, col } from "sequelize";
import { createError } from "@b/utils/error";
import { serverErrorResponse } from "@b/utils/query";

export const metadata: OperationObject = {
  summary: "Live Positioning For An Instrument",
  operationId: "getBinarySentiment",
  tags: ["Binary", "Orders"],
  description:
    "Aggregates currently open binary positions on one symbol into a call/put split by count and by staked amount.",
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
    500: serverErrorResponse,
  },
};

// The sides the schema allows, split into the two directions a binary takes.
const CALL_SIDES = ["RISE", "HIGHER", "TOUCH", "CALL", "UP"];
const PUT_SIDES = ["FALL", "LOWER", "NO_TOUCH", "PUT", "DOWN"];

export default async (data: Handler) => {
  const symbol = String(data.query?.symbol || "").trim();
  if (!symbol) throw createError(400, "symbol is required");

  try {
    /* Grouped in the database rather than counted in JS. A busy instrument can
       hold thousands of open positions, and pulling them across to length-check
       an array would make the cost of this endpoint scale with how popular the
       market is — which is exactly when it is asked for most. */
    const rows: any[] = await models.binaryOrder.findAll({
      where: {
        symbol,
        status: "PENDING",
        isDemo: false,
      },
      attributes: [
        "side",
        [fn("COUNT", col("id")), "count"],
        [fn("SUM", col("amount")), "volume"],
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
      } else if (PUT_SIDES.includes(side)) {
        putCount += count;
        putVolume += volume;
      }
      // A side outside both lists is counted in neither. Silently folding an
      // unrecognised direction into one of them would bias the split.
    }

    const total = callCount + putCount;

    /* The split is by staked amount, not by ticket count, and the difference
       matters: one position of 250,000 and fifty of 1,000 are not the same
       weight of opinion, though counting tickets would call the second side
       fifty times stronger. Counts are returned too, since "how many traders"
       is a different question a reader may want. */
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
  } catch (error: any) {
    if (error?.statusCode) throw error;
    console.error("Error aggregating binary sentiment:", error);
    throw createError(500, "Could not read positioning for this instrument");
  }
};
