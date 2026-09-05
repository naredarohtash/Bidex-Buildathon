/**
 * Utility function to handle image fallbacks consistently across the application.
 * Prevents infinite loops by using data attributes to track fallback attempts.
 */

// Generic crypto icon as base64 SVG data URI
export const GENERIC_CRYPTO_ICON = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNGM0Y0RjYiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIHN0cm9rZT0iIzY5NzA3QiIgc3Ryb2tlLXdpZHRoPSIyIi8+CjxwYXRoIGQ9Im0xNSA5LTYgNiIgc3Ryb2tlPSIjNjk3MDdCIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8cGF0aCBkPSJtOSA5IDYgNiIgc3Ryb2tlPSIjNjk3MDdCIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPgo8L3N2Zz4KPC9zdmc+';

/// Map Indian Stocks to their exact logo URLs
export const indianStockLogoMap: Record<string, string> = {
  reliance: "https://s3-symbol-logo.tradingview.com/reliance--big.svg",
  hdfcbank: "https://s3-symbol-logo.tradingview.com/hdfc-bank--big.svg",
  icicibank: "https://s3-symbol-logo.tradingview.com/icici-bank--big.svg",
  sbin: "https://s3-symbol-logo.tradingview.com/state-bank--big.svg",
  bajfinance: "https://s3-symbol-logo.tradingview.com/bajaj-finance--big.svg",
  axisbank: "https://s3-symbol-logo.tradingview.com/axis-bank--big.svg",
  kotakbank: "https://s3-symbol-logo.tradingview.com/kotak-mahindra-ast--big.svg",
  indusindbk: "https://s3-symbol-logo.tradingview.com/indusind-bank--big.svg",
  cholafin: "https://s3-symbol-logo.tradingview.com/cholamandalam--big.svg",
  muthootfin: "https://s3-symbol-logo.tradingview.com/muthoot-finance--big.svg",
  tcs: "https://s3-symbol-logo.tradingview.com/tata--big.svg",
  infy: "https://s3-symbol-logo.tradingview.com/infosys--big.svg",
  wipro: "https://s3-symbol-logo.tradingview.com/wipro--big.svg",
  hcltech: "https://s3-symbol-logo.tradingview.com/hcl-technologies--big.svg",
  techm: "https://s3-symbol-logo.tradingview.com/mahindra-tech--big.svg",
  ltim: "https://s3-symbol-logo.tradingview.com/larsen-and-toubro--big.svg",
  persistent: "https://s3-symbol-logo.tradingview.com/persistent-systems-ltd--big.svg",
  adanient: "https://s3-symbol-logo.tradingview.com/adani--big.svg",
  ongc: "https://s3-symbol-logo.tradingview.com/oil-and-natural-gas--big.svg",
  tatamotors: "https://s3-symbol-logo.tradingview.com/tata-motors--big.svg",
  mm: "https://s3-symbol-logo.tradingview.com/mahindra--big.svg",
  maruti: "https://s3-symbol-logo.tradingview.com/maruti-suzuki-india--big.svg",
  itc: "https://s3-symbol-logo.tradingview.com/itc--big.svg",
  hindunilvr: "https://s3-symbol-logo.tradingview.com/unilever--big.svg",
  titan: "https://s3-symbol-logo.tradingview.com/titan-company--big.svg",
  trent: "https://s3-symbol-logo.tradingview.com/trent--big.svg",
  nestleind: "https://s3-symbol-logo.tradingview.com/nestle--big.svg",
  britannia: "https://s3-symbol-logo.tradingview.com/britannia--big.svg",
  tataconsum: "https://s3-symbol-logo.tradingview.com/tata--big.svg",
  dmart: "https://s3-symbol-logo.tradingview.com/avenue-supermarts--big.svg",
  tatasteel: "https://s3-symbol-logo.tradingview.com/tata--big.svg",
  jswsteel: "https://s3-symbol-logo.tradingview.com/jsw--big.svg",
  hindalco: "https://s3-symbol-logo.tradingview.com/hindalco--big.svg",
  vedl: "https://s3-symbol-logo.tradingview.com/vedanta--big.svg",
  coalindia: "https://s3-symbol-logo.tradingview.com/coal-india--big.svg",
  sunpharma: "https://s3-symbol-logo.tradingview.com/sun-pharmaceutical--big.svg",
  cipla: "https://s3-symbol-logo.tradingview.com/cipla--big.svg",
  lt: "https://s3-symbol-logo.tradingview.com/larsen-and-toubro--big.svg",
  bhartiartl: "https://s3-symbol-logo.tradingview.com/airtel--big.svg",
  adaniports: "https://s3-symbol-logo.tradingview.com/adani--big.svg",
  ultracemco: "https://s3-symbol-logo.tradingview.com/ultratech-cement--big.svg",
  grasim: "https://s3-symbol-logo.tradingview.com/grasim--big.svg",
  pnb: "https://s3-symbol-logo.tradingview.com/punjab-natl-bank--big.svg",
  bankbaroda: "https://s3-symbol-logo.tradingview.com/bank-of-baroda--big.svg",
  canbk: "https://s3-symbol-logo.tradingview.com/canara-bank--big.svg",
  idfcfirstb: "https://s3-symbol-logo.tradingview.com/idfc-first-bank--big.svg",
  federalbnk: "https://s3-symbol-logo.tradingview.com/fed-bank--big.svg",
  yesbank: "https://s3-symbol-logo.tradingview.com/yes-bank--big.svg",
  zomato: "https://s3-symbol-logo.tradingview.com/zomato--big.svg",
  paytm: "https://s3-symbol-logo.tradingview.com/one-97-communications--big.svg",
  nykaa: "https://s3-symbol-logo.tradingview.com/fsn-e-commerce-ventures--big.svg",
  olaelec: "https://s3-symbol-logo.tradingview.com/ola-electric-mobility-ltd--big.svg",
  policybzr: "https://s3-symbol-logo.tradingview.com/pb-fintech--big.svg",
  delhivery: "https://s3-symbol-logo.tradingview.com/delhivery-limited--big.svg",
  flipkart: "https://www.google.com/s2/favicons?domain=flipkart.com&sz=128",
  phonepe: "https://www.google.com/s2/favicons?domain=phonepe.com&sz=128",
  pw: "https://www.google.com/s2/favicons?domain=physicswallah.live&sz=128",
  swiggy: "https://s3-symbol-logo.tradingview.com/swiggy-ltd--big.svg",
  zepto: "https://www.google.com/s2/favicons?domain=zepto.com&sz=128",
  razorpay: "https://www.google.com/s2/favicons?domain=razorpay.com&sz=128",
  cred: "https://www.google.com/s2/favicons?domain=cred.club&sz=128",
  groww: "https://www.google.com/s2/favicons?domain=groww.in&sz=128",
  lenskart: "https://www.google.com/s2/favicons?domain=lenskart.com&sz=128",
  naukri: "https://s3-symbol-logo.tradingview.com/info-edge--big.svg",
  ntpc: "https://s3-symbol-logo.tradingview.com/ntpc--big.svg",
  tatapower: "https://s3-symbol-logo.tradingview.com/tata--big.svg",
  adanigreen: "https://s3-symbol-logo.tradingview.com/adani--big.svg",
  hal: "https://s3-symbol-logo.tradingview.com/hindustan-aeronautics-limited--big.svg",
  irfc: "https://s3-symbol-logo.tradingview.com/indian-railway-finance-corporation--big.svg",
  bajajauto: "https://s3-symbol-logo.tradingview.com/bajaj-auto--big.svg",
  eichermot: "https://s3-symbol-logo.tradingview.com/eicher-motors--big.svg",
  heromotoco: "https://s3-symbol-logo.tradingview.com/hero-motocorp--big.svg",
  tvsmotor: "https://s3-symbol-logo.tradingview.com/tvs--big.svg",
  jiofin: "https://s3-symbol-logo.tradingview.com/jio-fin-services-ltd--big.svg",
  lici: "https://s3-symbol-logo.tradingview.com/life-insurance-corporation-of-india--big.svg",
  hdfclife: "https://s3-symbol-logo.tradingview.com/hdfc-life--big.svg",
  sbilife: "https://s3-symbol-logo.tradingview.com/sbi-life-insurance--big.svg",
  asianpaint: "https://s3-symbol-logo.tradingview.com/asian-paints--big.svg",
  pidilitind: "https://www.google.com/s2/favicons?domain=pidilite.com&sz=128",
  bergerpaint: "https://s3-symbol-logo.tradingview.com/berger-paints--big.svg",
  srf: "https://s3-symbol-logo.tradingview.com/srf--big.svg",
  vbl: "https://s3-symbol-logo.tradingview.com/varun-beverages-ltd--big.svg",
  mcdowelln: "https://s3-symbol-logo.tradingview.com/united-spirits--big.svg",
  ubl: "https://s3-symbol-logo.tradingview.com/united-breweries--big.svg",
  pageind: "https://s3-symbol-logo.tradingview.com/page-industries--big.svg",
  bataindia: "https://s3-symbol-logo.tradingview.com/bata--big.svg",
  dlf: "https://s3-symbol-logo.tradingview.com/dlf--big.svg",
  godrejprop: "https://s3-symbol-logo.tradingview.com/godrej-properties--big.svg",
  oberoirlty: "https://s3-symbol-logo.tradingview.com/oberoi-realty--big.svg",
  indhotel: "https://s3-symbol-logo.tradingview.com/indian-hotels--big.svg",
  indigo: "https://s3-symbol-logo.tradingview.com/interglobe-aviatio--big.svg",
  irctc: "https://s3-symbol-logo.tradingview.com/indian-rail-tour-corp-ltd--big.svg",
  apollohosp: "https://s3-symbol-logo.tradingview.com/apollo-hospitals--big.svg",
  maxhealth: "https://s3-symbol-logo.tradingview.com/max-healthcare--big.svg",
  fortis: "https://s3-symbol-logo.tradingview.com/fortis-healthcare--big.svg",
  lalpathlab: "https://s3-symbol-logo.tradingview.com/dr-lal-pathlabs--big.svg",
  cholarisk: "https://s3-symbol-logo.tradingview.com/cholamandalam-investment-and-finance-company--big.svg"
};

/**
 * Handle image error with fallback
 * @param event - The error event from img onError
 * @param fallbackUrl - Optional custom fallback URL
 */
export const handleImageError = (event: any, fallbackUrl?: string) => {
  const img = event.target;
  
  // Prevent infinite loops by checking if we already tried the final fallback
  if (img.dataset.fallbackAttempted === '2') {
    return;
  }
  
  if (!img.dataset.fallbackAttempted) {
    img.dataset.fallbackAttempted = '1';
    
    // Extract base currency symbol from src
    const src = img.src || '';
    if (src.includes('davidepalazzo/ticker-logos')) {
      // It's a stock logo that failed! Let's try Clearbit.
      const parts = src.split('/');
      const filename = parts[parts.length - 1]; // e.g. "META.png"
      const symbol = filename.replace('.png', '').toUpperCase();
      
      const stockDomainMap: Record<string, string> = {
        AAPL: "apple.com", TSLA: "tesla.com", NVDA: "nvidia.com",
        MSFT: "microsoft.com", AMZN: "amazon.com", GOOGL: "google.com",
        META: "meta.com", NFLX: "netflix.com", AMD: "amd.com",
        INTC: "intel.com", DIS: "disney.com", BA: "boeing.com",
        JPM: "jpmorgan.com", V: "visa.com", MA: "mastercard.com",
        PFE: "pfizer.com", JNJ: "jnj.com", KO: "coca-cola.com",
        PEP: "pepsi.com", WMT: "walmart.com", XOM: "exxon.com",
        COIN: "coinbase.com", PYPL: "paypal.com", SQ: "block.xyz",
        UBER: "uber.com", BABA: "alibaba.com", TSMC: "tsmc.com"
      };
      
      const domain = stockDomainMap[symbol] || `${symbol.toLowerCase()}.com`;
      img.src = `https://logo.clearbit.com/${domain}`;
      return;
    }
  }
  
  // If we already tried attempt 1 (Clearbit) or it's not a stock logo, do the final fallback
  img.dataset.fallbackAttempted = '2';
  
  const altText = (img.alt || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const isIndian = altText in indianStockLogoMap || (img.src && img.src.includes('in.webp'));
  const finalFallback = isIndian ? '/img/flag/in.webp' : (fallbackUrl || GENERIC_CRYPTO_ICON);

  img.src = finalFallback;
};

/**
 * Get the crypto image URL with proper fallback handling
 * @param currency - The currency code
 * @param size - Optional size for responsive images
 */
export const getCryptoImageUrl = (currency: string, size: 'sm' | 'md' | 'lg' = 'md') => {
  // Clean and validate currency input
  if (!currency || typeof currency !== 'string') {
    return '/img/crypto/generic.webp';
  }
  
  // Strip OTC suffix before constructing image path (e.g. INR_OTC -> INR, JPY_OTC -> JPY)
  const normalizedCurrency = currency.replace(/_OTC$/i, '').replace(/OTC$/i, '').trim();

  // Extract base currency if it contains a slash or delimiter
  let baseSymbol = normalizedCurrency;
  if (baseSymbol.includes("/")) {
    baseSymbol = baseSymbol.split("/")[0];
  }
  if (baseSymbol.includes("-")) {
    baseSymbol = baseSymbol.split("-")[0];
  }

  // Remove any slashes and clean the currency name
  const cleanCurrency = baseSymbol.toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric characters
    .trim();
    
  // Ensure we don't have empty string
  if (!cleanCurrency) {
    return '/img/crypto/generic.webp';
  }

  if (cleanCurrency in indianStockLogoMap) {
    return indianStockLogoMap[cleanCurrency];
  }

  // Country flags mapping for forex currencies. Must stay in sync with the
  // asset-browser panel's CCY_FLAG so the same pair shows identical flags in the
  // tabs, positions and browser — otherwise unmapped currencies (SEK, DKK, NOK,
  // TRY, ...) fall through to the generic crypto coin.
  const forexFlagMap: Record<string, string> = {
    usd: 'us', eur: 'eu', gbp: 'gb', jpy: 'jp', aud: 'au', cad: 'ca', chf: 'ch',
    nzd: 'nz', inr: 'in', zar: 'za', pln: 'pl', try: 'tr', huf: 'hu', nok: 'no',
    dkk: 'dk', sek: 'se', sgd: 'sg', thb: 'th', czk: 'cz', brl: 'br', cnh: 'cn',
    cny: 'cn', hkd: 'hk', mxn: 'mx', rub: 'ru', egp: 'eg', pkr: 'pk', bdt: 'bd',
  };

  if (cleanCurrency in forexFlagMap) {
    return `/img/flag/${forexFlagMap[cleanCurrency]}.webp`;
  }

  // Commodities have custom PNG images
  const commodityPngs = new Set(['xau', 'xag', 'brent', 'wti', 'ngas', 'xpt', 'xpd']);
  if (commodityPngs.has(cleanCurrency)) {
    return `/img/crypto/${cleanCurrency}.png`;
  }

  // Stocks have ticker logos from CDN
  const stockSymbols = new Set([
    "aapl", "tsla", "nvda", "msft", "amzn", "googl", "meta", "nflx", "amd", "intc",
    "dis", "ba", "jpm", "v", "ma", "pfe", "jnj", "ko", "pep", "wmt", "xom", "coin",
    "pypl", "sq", "uber", "baba", "tsmc"
  ]);
  if (stockSymbols.has(cleanCurrency)) {
    return `https://cdn.jsdelivr.net/gh/davidepalazzo/ticker-logos/ticker_icons/${cleanCurrency.toUpperCase()}.png`;
  }
  
  // Construct path without double slashes
  return `/img/crypto/${cleanCurrency}.webp`;
};

/**
 * Create a crypto image component with automatic fallback
 * @param currency - Currency code
 * @param alt - Alt text
 * @param className - CSS classes
 * @param size - Image size
 */
export const createCryptoImage = (
  currency: string, 
  alt?: string, 
  className?: string, 
  size: 'sm' | 'md' | 'lg' = 'md'
) => {
  const imageUrl = getCryptoImageUrl(currency, size);
  const altText = alt || currency || 'Cryptocurrency';
  
  return {
    src: imageUrl,
    alt: altText,
    className,
    onError: (e: any) => handleImageError(e, '/img/crypto/generic.webp')
  };
}; 

export const FRIENDLY_NAMES: Record<string, string> = {
  // Stocks
  AAPL: "Apple", TSLA: "Tesla", NVDA: "NVIDIA", MSFT: "Microsoft",
  AMZN: "Amazon", GOOGL: "Google", META: "Meta", NFLX: "Netflix",
  AMD: "AMD", INTC: "Intel", DIS: "Disney", BA: "Boeing",
  JPM: "JPMorgan", V: "Visa", MA: "Mastercard", PFE: "Pfizer",
  JNJ: "Johnson & Johnson", KO: "Coca-Cola", PEP: "Pepsi",
  WMT: "Walmart", XOM: "ExxonMobil", COIN: "Coinbase",
  PYPL: "PayPal", SQ: "Block", UBER: "Uber",
  
  // Cryptos
  BTC: "Bitcoin", ETH: "Ethereum", BNB: "Binance Coin", SOL: "Solana",
  XRP: "Ripple", ADA: "Cardano", DOGE: "Dogecoin", DOT: "Polkadot",
  AVAX: "Avalanche", MATIC: "Polygon", LINK: "Chainlink", UNI: "Uniswap",
  ATOM: "Cosmos", LTC: "Litecoin", FIL: "Filecoin", NEAR: "Near Protocol",
  APT: "Aptos", OP: "Optimism", ARB: "Arbitrum", SHIB: "Shiba Inu",
  TRX: "TRON", ETC: "Ethereum Classic", XLM: "Stellar", ALGO: "Algorand",
  VET: "VeChain", ICP: "Internet Computer", PEPE: "Pepe", SUI: "Sui",

  // Commodities
  XAU: "Gold", XAG: "Silver", BRENT: "Brent Crude", WTI: "WTI Crude",
  NGAS: "Natural Gas", XPT: "Platinum", XPD: "Palladium",
};

export function getAssetDisplayName(symbol: string): string {
  if (!symbol) return "";
  const clean = symbol.replace(" (OTC)", "").replace("/OTC", "").replace("_OTC", "").replace("OTC", "").trim().toUpperCase();
  const base = clean.split("/")[0];
  return FRIENDLY_NAMES[base] || clean;
}

export function isWhiteLogoAsset(symbol: string): boolean {
  if (!symbol) return false;
  const clean = symbol.replace(" (OTC)", "").replace("/OTC", "").replace("_OTC", "").replace("OTC", "").trim().toUpperCase();
  const base = clean.split("/")[0];
  const whiteLogos = new Set(["AAPL", "MSFT", "AMZN", "GOOGL", "NFLX", "META", "USDT"]);
  return whiteLogos.has(base);
}