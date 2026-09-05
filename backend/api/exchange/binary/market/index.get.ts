import { models } from "@b/db";
import { getOtcOrigin } from "../../utils";
import {
  unauthorizedResponse,
  notFoundMetadataResponse,
  serverErrorResponse,
} from "@b/utils/query";

export const metadata: OperationObject = {
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
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Binary Market"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { ctx } = data;
  try {
    ctx?.step("Fetching binary markets");

    const bidexUrl = process.env.BINDEX_API_URL || process.env.BIDEX_API_URL || "http://localhost:8001";
    const bidexApiKey = process.env.BIDEX_API_KEY;

    // Normalize any symbol to a comparable key: drop the "(OTC)"/"_OTC" marker
    // and every non-alphanumeric separator, then uppercase.
    //   "EUR/USD (OTC)"  -> "EURUSD"
    //   "AUD/CAD_OTC"    -> "AUDCAD"
    //   "HDFCBANK (OTC)" -> "HDFCBANK"
    const normalizeSymbol = (s: string): string =>
      String(s || "")
        .replace(/\(?\s*OTC\s*\)?/gi, "")
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase();

    // Build a lookup of the OTC terminal assets keyed by normalized symbol so we
    // can attach the exact icon / category / precision the charts use.
    const bidexAssetsMap = new Map<string, any>();
    try {
      const response = await fetch(`${bidexUrl}/api/assets`, {
        headers: {
          ...(bidexApiKey ? { "X-API-Key": bidexApiKey } : {}),
          "Origin": getOtcOrigin()
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
      } else {
        const text = await response.text();
        console.error(`BideX assets API returned status ${response.status}. Response: ${text}`);
      }
    } catch (err) {
      console.error("Error fetching assets list from BideX API:", err);
    }

    // Only treat the OTC list as authoritative when we actually received it.
    // If the OTC terminal is unreachable we fall back to returning every DB
    // market untouched so the terminal never ends up empty.
    const hasOtcList = bidexAssetsMap.size > 0;

    const markets = (
      await models.binaryMarket.findAll({
        where: { status: true },
        order: [
          ["isTrending", "DESC"],
          ["isHot", "DESC"],
          ["currency", "ASC"],
        ],
      })
    )
      .map((e: any) => {
        const marketPlain = e.get({ plain: true });
        const symbol = `${e.currency}/${e.pair}`;
        const assetInfo = bidexAssetsMap.get(normalizeSymbol(symbol));

        return {
          ...marketPlain,
          label: symbol,
          symbol: symbol,
          category: assetInfo?.category,
          icon: assetInfo?.icon,
          pricePrecision: assetInfo?.price_precision,
          pipSize: assetInfo?.pip_size,
          // true when this market exists on the OTC terminal (has a live feed)
          isOtc: !!assetInfo,
        };
      })
      // Keep the terminal aligned to the OTC asset universe: when the OTC list
      // is available, drop DB markets it doesn't serve (e.g. BTC/USDT) so every
      // listed asset has a working chart and the category counts match exactly.
      .filter((m: any) => !hasOtcList || m.isOtc);

    ctx?.success(`Retrieved ${markets.length} binary markets`);
    return markets;
  } catch (error: any) {
    console.error("Error fetching binary markets:", error);
    throw error;
  }
};

