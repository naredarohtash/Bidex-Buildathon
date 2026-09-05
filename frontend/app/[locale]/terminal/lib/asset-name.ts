import { CATEGORY_LABELS } from "../components/header/market-browser-panel";

/**
 * How an instrument is named, in one place.
 *
 * The rule the terminal already followed everywhere a trader picks an asset —
 * the browser panel, the selector dropdown, the tab rail — but which lived
 * inside header.tsx and so could not be reached by anything else. The result
 * chart toasts had grown their own version by string surgery on the symbol, and
 * it named a stock "Johnson & Johnson/USD": a quote currency stapled onto an
 * instrument that does not have one, because "JNJ/USD" is only a pair in the
 * shape of the string, not in fact.
 *
 * The order matters and is the whole rule:
 *
 *   1. Whatever the market itself is called, if the feed gave it a name. That is
 *      the name shown in the browser panel, and no derived name should override
 *      what the venue calls its own instrument.
 *   2. Otherwise a known friendly name — Gold, Bitcoin, Tesla, Reliance.
 *   3. Otherwise BASE/QUOTE, and ONLY when the base is a fiat currency, which is
 *      what actually makes something a currency pair. AUD/CAD is a pair. JNJ/USD
 *      is a stock priced in dollars, and the "/USD" is noise on the end of it.
 *   4. Otherwise the bare ticker.
 *
 * Anything that shows an instrument's name should call this. Two copies of a
 * naming rule is two naming rules.
 */
export const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL", "PKR", "BDT", "CNY", "CNH", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP", "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "THB"
]);

const COMMODITY_NAMES: Record<string, string> = {
  XAU: "Gold",
  XAG: "Silver",
  USOIL: "US Crude Oil",
  WTI: "WTI Crude Oil",
  UKOIL: "Brent Crude Oil",
  BRENT: "Brent Crude Oil",
  OIL: "Crude Oil",
  NGAS: "Natural Gas",
  NATGAS: "Natural Gas",
  XPT: "Platinum",
  XPD: "Palladium",
  WHEAT: "Wheat",
  CORN: "Corn",
  SOYBEAN: "Soybeans",
  COPPER: "Copper",
  COFFEE: "Coffee",
  SUGAR: "Sugar",
  COTTON: "Cotton",
};

const STOCK_NAMES: Record<string, string> = {
  AAPL: "Apple",
  MSFT: "Microsoft",
  TSLA: "Tesla",
  AMZN: "Amazon",
  GOOGL: "Alphabet",
  GOOG: "Alphabet",
  NVDA: "NVIDIA",
  NFLX: "Netflix",
  META: "Meta",
  BABA: "Alibaba",
  AMD: "AMD",
  INTC: "Intel",
  TSMC: "TSMC",
  DIS: "Walt Disney",
  BA: "Boeing",
  JPM: "JPMorgan",
  V: "Visa",
  MA: "Mastercard",
  PFE: "Pfizer",
  JNJ: "Johnson & Johnson",
  KO: "Coca-Cola",
  PEP: "PepsiCo",
  WMT: "Walmart",
  XOM: "ExxonMobil",
  COIN: "Coinbase",
  PYPL: "PayPal",
  SQ: "Block",
  UBER: "Uber",
};

const INDIAN_STOCK_NAMES: Record<string, string> = {
  RELIANCE: "Reliance",
  TCS: "TCS",
  HDFCBANK: "HDFC Bank",
  INFY: "Infosys",
  ICICIBANK: "ICICI Bank",
  TATAMOTORS: "Tata Motors",
  SBIN: "State Bank of India",
  BHARTIARTL: "Bharti Airtel",
  ITC: "ITC",
  KOTAKBANK: "Kotak Bank",
  LT: "Larsen & Toubro",
  AXISBANK: "Axis Bank",
  ASIANPAINT: "Asian Paints",
  MARUTI: "Maruti Suzuki",
  SUNPHARMA: "Sun Pharma",
  WIPRO: "Wipro",
  ULTRACEMCO: "UltraTech Cement",
  TITAN: "Titan",
  BAJFINANCE: "Bajaj Finance",
  NESTLEIND: "Nestle India",
  HINDUNILVR: "Hindustan Unilever",
  ADANIENT: "Adani Enterprises",
  ADANIPORTS: "Adani Ports",
  TATASTEEL: "Tata Steel",
  HCLTECH: "HCL Tech",
  NTPC: "NTPC",
  POWERGRID: "Power Grid",
  ONGC: "ONGC",
  M_M: "Mahindra & Mahindra",
  MM: "Mahindra & Mahindra",
  HEROMOTOCO: "Hero MotoCorp",
  BAJAJ_AUTO: "Bajaj Auto",
  EICHERMOT: "Eicher Motors",
};

const CRYPTO_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "Ripple",
  ADA: "Cardano",
  DOGE: "Dogecoin",
  SHIB: "Shiba Inu",
  DOT: "Polkadot",
  LTC: "Litecoin",
  MATIC: "Polygon",
  POL: "Polygon",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  UNI: "Uniswap",
  TRX: "TRON",
  TON: "Toncoin",
  PEPE: "Pepe",
  SUI: "Sui",
  NEAR: "NEAR Protocol",
  APT: "Aptos",
  RENDER: "Render",
  RNDR: "Render",
  RUNE: "THORChain",
  FTM: "Fantom",
  ATOM: "Cosmos",
  XLM: "Stellar",
  BCH: "Bitcoin Cash",
  ETC: "Ethereum Classic",
  XMR: "Monero",
};

export function getFullTabDisplayName(market: any, cleanBase: string, quote: string): string {
  if (market?.label && market.label.trim().length > 0 && !market.label.includes("/")) {
    return market.label.replace(/\s*\(OTC\)/gi, "").trim();
  }
  if (market?.name && market.name.trim().length > 0 && market.name !== market.symbol && !market.name.includes("/")) {
    return market.name.replace(/\s*\(OTC\)/gi, "").trim();
  }

  const key = (cleanBase || "").toUpperCase();
  if (COMMODITY_NAMES[key]) return COMMODITY_NAMES[key];
  if (STOCK_NAMES[key]) return STOCK_NAMES[key];
  if (INDIAN_STOCK_NAMES[key]) return INDIAN_STOCK_NAMES[key];
  if (CRYPTO_NAMES[key]) return CRYPTO_NAMES[key];

  if (quote && quote.replace(/_OTC$/i, "") !== "OTC" && FIAT_CURRENCIES.has(key)) {
    return `${cleanBase}/${quote.replace(/_OTC$/i, "")}`;
  }
  return cleanBase;
}

/**
 * A live return for an asset tab: five digits, then an ellipsis.
 *
 * The tab is a fixed width and must stay one, so the number gives way rather
 * than the box. Five digits covers the overwhelming majority of positions
 * outright; past that the figure is cut and marked, which keeps the tab uniform
 * and keeps the leading digits — the ones that carry the size of the move.
 *
 * Worth being explicit, since this is money: a cut figure reads smaller than it
 * is. 250,800 shows as "25,080…", which at a glance is tens of thousands rather
 * than hundreds. The mark is there to say the number is incomplete, and the full
 * value is on the position row and in the summary strip. This is a deliberate
 * trade of precision for a rail that does not change shape as trades open — not
 * an oversight to be tidied away later.
 */
export function formatTabReturn(value: number): string {
  const digits = String(Math.round(Math.abs(value)));
  if (digits.length <= 5) return Number(digits).toLocaleString("en-US");
  return `${Number(digits.slice(0, 5)).toLocaleString("en-US")}…`;
}


/**
 * The category label for an instrument, in the vocabulary the browser uses.
 *
 * Lifted out of order-panel.tsx, where it worked correctly and could not be
 * reached. The instrument panel had grown its own version — a hardcoded list of
 * US tickers with no case for indian_stocks — and so announced an Adani stock as
 * "Crypto OTC" while the selector two clicks away filed it under NSE Stocks.
 * That is the third time a naming rule kept in two places has drifted, so this
 * one now lives beside the other one.
 */
export function getAssetCategoryLabel(symbol: string, markets: any[] = []): string {
  // Compare without punctuation: an exact === miss silently falls through to the
  // heuristic below, which mislabels Indian stocks as "Crypto Market" and derives
  // a /img/crypto/*.webp logo path that 404s.
  const symbolKey = String(symbol ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const market = markets.find(
    m => String(m?.symbol ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === symbolKey
  );
  let categoryStr = "";
  if (market?.category) {
    categoryStr = market.category.toLowerCase();
  } else if (symbol) {
    const clean = symbol.replace(" (OTC)", "").replace("/OTC", "").replace("_OTC", "").replace("OTC", "").trim();
    let base = clean.split("/")[0].toUpperCase();
    
    const COMMODITY_CURRENCIES = new Set(["XAU","XAG","OIL","WTI","BRENT","USOIL","UKOIL","XPT","XPD","WHEAT","CORN","NGAS"]);
    const FIAT_CURRENCIES = new Set(["USD","EUR","GBP","JPY","CHF","CAD","AUD","NZD","INR","BRL","PKR","BDT","CNY","RUB","SGD","HKD","TRY","ZAR","MXN","EGP","PLN","SEK","NOK","DKK","CZK","HUF","THB","CNH"]);
    const STOCKS = new Set(["AAPL","MSFT","TSLA","AMZN","GOOGL","NVDA","NFLX","META","BABA","AMD","INTC","TSMC","DIS","BA","JPM","V","MA","PFE","JNJ","KO","PEP","WMT","XOM","COIN","PYPL","SQ","UBER"]);

    if (COMMODITY_CURRENCIES.has(base)) categoryStr = "commodity";
    else if (FIAT_CURRENCIES.has(base)) categoryStr = "currency";
    else if (STOCKS.has(base)) categoryStr = "stock";
    else categoryStr = "crypto";
  }

  /* One vocabulary, shared with the asset browser.

     The provider files every asset under exactly one of five categories —
     indian_stocks (96), currency (56), crypto (28), stock (25), commodity (7) —
     and indian_stocks had no case here at all. The largest group of instruments
     on the platform therefore fell through to the default and was announced as
     "Spot Market", which is not a thing BANKBARODA is; the browser panel two
     clicks away filed the same instrument under NSE Stocks.

     The labels come from CATEGORY_LABELS rather than being written out again,
     so the header and the browser cannot drift apart a second time. */
  switch (categoryStr) {
    case "currency":
    case "currencies":
      return CATEGORY_LABELS.currencies;
    case "commodity":
    case "commodities":
      return CATEGORY_LABELS.commodities;
    case "stock":
    case "stocks":
      return CATEGORY_LABELS.stocks;
    case "crypto":
      return CATEGORY_LABELS.crypto;
    case "indian_stocks":
    case "indian-stocks":
    case "indian stock market":
      return CATEGORY_LABELS.indian_stocks;
    default:
      return "OTC Market";
  }
}
