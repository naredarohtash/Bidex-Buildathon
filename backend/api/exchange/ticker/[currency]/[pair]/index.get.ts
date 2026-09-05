import { baseTickerSchema } from "@b/api/exchange/utils";
import ExchangeManager from "@b/utils/exchange";
import Redis from "ioredis";
import { logError } from "@b/utils/logger";

import {
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";

import {
  loadBanStatus,
  handleBanStatus,
  handleExchangeError,
} from "@b/api/exchange/utils";

export const metadata: OperationObject = {
  summary: "Get Market Ticker",
  operationId: "getMarketTicker",
  tags: ["Exchange", "Markets"],
  description: "Retrieves ticker information for a specific market pair.",
  parameters: [
    {
      name: "currency",
      in: "path",
      required: true,
      description: "The base currency of the market pair.",
      schema: { type: "string" },
    },
    {
      name: "pair",
      in: "path",
      required: true,
      description: "The quote currency of the market pair.",
      schema: { type: "string" },
    },
  ],
  responses: {
    200: {
      description: "Ticker information",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: baseTickerSchema,
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("Ticker"),
    500: serverErrorResponse,
  },
};

export default async (data: Handler) => {
  const { currency, pair } = data.params;
  const symbol = `${currency}/${pair}`;

  try {
    const unblockTime = await loadBanStatus();
    if (await handleBanStatus(unblockTime)) {
      return serverErrorResponse;
    }

    const exchange = await ExchangeManager.startExchange();
    if (!exchange) {
      logError("exchange", new Error("Failed to start exchange"), __filename);
      return serverErrorResponse;
    }

    let ticker: any;
    if (symbol.toUpperCase().includes("OTC") || pair === "OTC") {
      const bidexSymbol = symbol.toUpperCase().endsWith("/OTC")
        ? symbol.slice(0, -4) + " (OTC)"
        : symbol.replace("_OTC", " (OTC)");
      const otcRedis = new Redis({
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.OTC_REDIS_PORT || process.env.REDIS_PORT || "6379"),
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
      });
      let price = 0;
      try {
        const priceStr = await otcRedis.get(`otc:${bidexSymbol}:last_price`);
        if (priceStr) {
          price = parseFloat(priceStr);
        }
      } catch (err) {
        console.error("[OTC Price Fetch Error in Ticker]:", err);
      } finally {
        await otcRedis.quit().catch(() => {});
      }
      if (!price) {
        return notFoundMetadataResponse("Ticker");
      }
      ticker = {
        symbol,
        bid: price * 0.999,
        ask: price * 1.001,
        close: price,
        last: price,
        percentage: 0,
        baseVolume: 0,
        quoteVolume: 0,
      };
    } else {
      ticker = await exchange.fetchTicker(symbol);
    }

    if (!ticker) {
      return notFoundMetadataResponse("Ticker");
    }

    return {
      symbol: ticker.symbol,
      bid: ticker.bid,
      ask: ticker.ask,
      close: ticker.close,
      last: ticker.last,
      change: ticker.percentage,
      baseVolume: ticker.baseVolume,
      quoteVolume: ticker.quoteVolume,
    };
  } catch (error) {
    const result = await handleExchangeError(error, ExchangeManager);
    if (typeof result === "number") {
      return serverErrorResponse;
    }
    logError("exchange", error, __filename);
    return serverErrorResponse;
  }
};
