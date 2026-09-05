import { baseNumberSchema, baseStringSchema } from "@b/utils/schema";
import { RedisSingleton } from "@b/utils/redis";


const redis = RedisSingleton.getInstance();

export const BAN_STATUS_KEY = "exchange:ban_status";

/**
 * Origin header sent to the upstream OTC feed (otcterminal.live).
 *
 * That API scopes every key to a domain and checks it against this header,
 * answering 403 `{"detail":"API Key restricted to domain: ..."}` on a mismatch.
 * A development key is issued for http://localhost while a deployment's key is
 * issued for its own site, so this cannot be hardcoded — and it must be the
 * same everywhere, since chart candles, live market prices, order placement and
 * the market list all authenticate against the same key.
 *
 * Defaults to http://localhost, leaving local development unchanged when
 * BIDEX_API_ORIGIN is not set.
 */
export function getOtcOrigin(): string {
  return process.env.BIDEX_API_ORIGIN || "http://localhost";
}

export async function saveBanStatus(unblockTime) {
  await redis.set(BAN_STATUS_KEY, unblockTime);
}

export async function loadBanStatus() {
  const unblockTime = await redis.get(BAN_STATUS_KEY);
  return unblockTime ? parseInt(unblockTime) : 0;
}

export function formatWaitTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes} minutes and ${seconds} seconds`;
}

export async function handleBanStatus(unblockTime) {
  if (Date.now() < unblockTime) {
    const waitTime = unblockTime - Date.now();
    console.log(`Waiting for ${formatWaitTime(waitTime)} until unblock time`);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(waitTime, 60000))
    );
    return true;
  }
  return false;
}

export function extractBanTime(errorMessage) {
  if (errorMessage.includes("IP banned until")) {
    const match = errorMessage.match(/until (\d+)/);
    if (match) {
      return parseInt(match[1]);
    }
  }
  return null;
}

export async function handleExchangeError(error, ExchangeManager) {
  const banTime = extractBanTime(error.message);
  if (banTime) {
    await saveBanStatus(banTime);
    return banTime;
  }
  await ExchangeManager.stopExchange();
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return await ExchangeManager.startExchange();
}

export function sanitizeErrorMessage(errorMessage) {
  // Handle undefined or null inputs explicitly
  if (errorMessage == null) {
    // Customize this message as needed
    return "An unknown error occurred";
  }

  // Convert Error objects to their message string
  if (errorMessage instanceof Error) {
    errorMessage = errorMessage.message;
  }

  // Proceed with sanitization only if errorMessage is a string
  if (typeof errorMessage === "string") {
    const keywordsToHide = ["kucoin", "binance", "okx"];
    let sanitizedMessage = errorMessage;

    keywordsToHide.forEach((keyword) => {
      const regex = new RegExp(keyword, "gi"); // 'gi' for global and case-insensitive match
      sanitizedMessage = sanitizedMessage.replace(regex, "***");
    });

    return sanitizedMessage;
  }

  // Return the input unchanged if it's not a string, as we only sanitize strings
  return errorMessage;
}

export const baseOrderBookEntrySchema = {
  type: "array",
  items: {
    type: "number",
    description: "Order book entry consisting of price and volume",
  },
};

export const baseOrderBookSchema = {
  asks: {
    type: "array",
    items: baseOrderBookEntrySchema,
    description: "Asks are sell orders in the order book",
  },
  bids: {
    type: "array",
    items: baseOrderBookEntrySchema,
    description: "Bids are buy orders in the order book",
  },
};

export const baseTickerSchema = {
  symbol: baseStringSchema("Trading symbol for the market pair"),
  bid: baseNumberSchema("Current highest bid price"),
  ask: baseNumberSchema("Current lowest ask price"),
  close: baseNumberSchema("Last close price"),
  last: baseNumberSchema("Most recent transaction price"),
  change: baseNumberSchema("Price change percentage"),
  baseVolume: baseNumberSchema("Volume of base currency traded"),
  quoteVolume: baseNumberSchema("Volume of quote currency traded"),
};

export const baseWatchlistItemSchema = {
  id: baseStringSchema(
    "Unique identifier for the watchlist item",
    undefined,
    undefined,
    false,
    undefined,
    "uuid"
  ),
  userId: baseStringSchema(
    "User ID associated with the watchlist item",
    undefined,
    undefined,
    false,
    undefined,
    "uuid"
  ),
  symbol: baseStringSchema("Symbol of the watchlist item"),
};

export function vortexToBidexSymbol(symbol: string): string {
  if (!symbol) return "";
  let clean = symbol.replace(/\s*\(OTC\)/gi, "").replace(/_OTC$/i, "").replace(/\/OTC$/i, "").trim();

  // One fiat set for both sides: any fiat/fiat pair is a valid BideX forex asset.
  // Splitting these into narrower base/quote sets silently dropped the quote for
  // pairs like EUR/SEK or SGD/JPY, which then requested asset="EUR (OTC)" and got
  // back an empty candle array.
  const forexCurrencies = new Set([
    "EUR", "GBP", "USD", "JPY", "CHF", "CAD", "AUD", "NZD",
    "SEK", "NOK", "DKK", "PLN", "HUF", "CZK", "TRY", "ZAR",
    "SGD", "HKD", "CNH", "THB", "MXN", "INR", "BRL",
  ]);
  const forexBases = forexCurrencies;
  const forexQuotes = forexCurrencies;

  let base = "";
  let quote = "";
  if (clean.includes("/")) {
    const parts = clean.split("/");
    base = parts[0];
    quote = parts[1];
  } else if (
    clean.includes("-") &&
    forexCurrencies.has((clean.split("-")[1] || "").toUpperCase())
  ) {
    // Only treat "-" as a pair separator when the right side is actually a
    // currency (e.g. BTC-USD). Hyphenated tickers such as BAJAJ-AUTO and
    // MCDOWELL-N must stay whole, or they resolve to "BAJAJ (OTC)" and return
    // no candles.
    const parts = clean.split("-");
    base = parts[0];
    quote = parts[1];
  } else {
    base = clean;
    quote = "";
  }

  base = base.toUpperCase();
  quote = quote.toUpperCase();

  if (quote === "OTC" || quote === "USD_OTC") {
    quote = "";
  }

  // Forex pairs
  if (base && quote && forexBases.has(base) && forexQuotes.has(quote)) {
    return `${base}/${quote} (OTC)`;
  }

  // Assets mapped with /USD (OTC) in BideX
  const usdPairBases = new Set([
    "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "DOT", "AVAX", "MATIC",
    "LINK", "UNI", "ATOM", "LTC", "FIL", "NEAR", "APT", "OP", "ARB", "SHIB",
    "TRX", "ETC", "XLM", "ALGO", "VET", "ICP", "PEPE", "SUI",
    "XAU", "XAG", "BRENT", "WTI", "NGAS", "XPT", "XPD",
    "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "GOOGL", "META", "NFLX", "AMD", "INTC",
    "TSMC", "DIS", "BA", "JPM", "V", "MA", "PFE", "JNJ", "KO", "PEP", "WMT", "XOM", "COIN", "PYPL", "SQ", "UBER"
  ]);

  if (usdPairBases.has(base)) {
    return `${base}/USD (OTC)`;
  }

  // Indian stocks and all other single-ticker OTC assets
  return `${base} (OTC)`;
}

export function getCleanOtcSymbol(symbol: string): string {
  if (!symbol) return "";
  const upper = symbol.toUpperCase().replace(/\//g, "").replace(/_/g, "");
  if (upper.endsWith("OTC")) {
    return upper.slice(0, -3) + "_OTC";
  }
  return upper;
}

export function isSymbolMatch(cleanVortexSymbol: string, bidexAsset: string): boolean {
  const normVortex = cleanVortexSymbol.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const normBidex = bidexAsset.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (normVortex === normBidex) return true;
  const normVortexNoUSD = normVortex.replace("USDOTC", "OTC");
  return normVortexNoUSD === normBidex;
}

