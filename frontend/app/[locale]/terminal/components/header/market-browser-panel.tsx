/**
 * MarketBrowserPanel — Sleek, Compact & Realistic Quotex Style Asset Selector
 *
 * Updates applied:
 * 1. Automatic Favorite Pinning: Favorited markets (stars) automatically float to the top of the list.
 * 2. Realistic Navigation Active Indicator: Distinct `ACTIVE` activity badge for assets currently open on navigation bar.
 * 3. Compact Width: Reduced modal width from 720px to 580px so it is perfectly proportioned and not too wide.
 */
"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo, createContext, useContext } from "react";
import { useTheme } from "next-themes";
import {
  Search, X, Star, Coins, Bitcoin, Droplet, Briefcase, LayoutGrid, Activity, Bookmark,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  useBinaryStore,
  type Symbol,
  type BinaryMarket,
  isSameSymbol,
} from "@/store/trade/use-binary-store";
import { wishlistService } from "../../../../../services/wishlist-service";
import {
  AssetIcon,
  classifyMarket,
  splitSymbol,
  type CategoryTab,
} from "@/components/markets/asset-icon";

/* Both were exported from here before the artwork moved to its own module, and
   the terminal's mobile header and order panel still import them from this
   path. Re-exported rather than chased across call sites. */
export { AssetIcon, classifyMarket };

type SortField = "name" | "change" | "profit1" | "profit5";
type SortOrder = "asc" | "desc";

// ─── Human-Readable Full Names ────────────────────────────────────────────────

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
  ALGO: "Algorand",
  VET: "VeChain",
  ICP: "Internet Computer",
  FIL: "Filecoin",
  HBAR: "Hedera",
  INJ: "Injective",
  STX: "Stacks",
  LDO: "Lido DAO",
  TIA: "Celestia",
  SEI: "Sei",
  FET: "Fetch.ai",
  AGIX: "SingularityNET",
  WIF: "dogwifhat",
  BONK: "Bonk",
  FLOKI: "Floki",
  NOT: "Notcoin",
  CRO: "Cronos",
  MKR: "Maker",
  AAVE: "Aave",
  GRT: "The Graph",
  SNX: "Synthetix",
  THETA: "Theta Network",
  EGLD: "MultiversX",
  EOS: "EOS",
  NEO: "NEO",
  FLOW: "Flow",
  QNT: "Quant",
  GALA: "Gala",
  SAND: "The Sandbox",
  MANA: "Decentraland",
  AXS: "Axie Infinity",
  CHZ: "Chiliz",
  KSM: "Kusama",
  ZEC: "Zcash",
  DASH: "Dash",
  COMP: "Compound",
  "1INCH": "1inch Network",
  ENS: "Ethereum Name Service",
  PENDLE: "Pendle",
  BLUR: "Blur",
  ORDI: "Ordi",
  JUP: "Jupiter",
  PYTH: "Pyth Network",
  WLD: "Worldcoin",
  AR: "Arweave",
};

/* ── theming ───────────────────────────────────────────────────────────────
   This panel had no theme awareness at all — every surface was a hardcoded dark
   hex, so on the light theme it opened as a black sheet on a white page.

   Three sets, not two: navy is a blue-tinted surface and a neutral charcoal panel
   sits on it as an obvious foreign object. Sub-components read them from context
   rather than taking a dozen props each.

   The accents move with the surface too. #00c076 measures about 2.2:1 on white and
   #ff9800 about 2.1:1 — unreadable as text — so light substitutes darker variants. */
type BrowserTheme = "dark" | "navy" | "light";

interface BrowserTokens {
  panel: string;
  panelBorder: string;
  strip: string;
  rail: string;
  divider: string;
  rowHover: string;
  rowActive: string;
  input: string;
  text: string;
  muted: string;
  faint: string;
  tabActive: string;
  tabIdle: string;
  countIdle: string;
  otc: string;
  scrollThumb: string;
  shadow: string;
  up: string;
  down: string;
  profit: string;
  onAccent: string;
}

const BROWSER_TOKENS: Record<BrowserTheme, BrowserTokens> = {
  dark: {
    panel: "bg-[#13151b]", panelBorder: "border-[#222630]", strip: "bg-[#161820]/60",
    rail: "bg-[#0d0e12]/80", divider: "border-[#1c1f28]/60",
    rowHover: "hover:bg-[#1a1d26]/80", rowActive: "bg-[#1f273b]",
    input: "bg-[#1a1d26] border-[#2a2e3d] text-zinc-100 placeholder-zinc-500",
    text: "text-zinc-100", muted: "text-zinc-400", faint: "text-zinc-500",
    tabActive: "bg-[#1d263a] text-blue-400", tabIdle: "text-zinc-300 hover:bg-[#181b24] hover:text-white",
    countIdle: "bg-[#202430] text-zinc-400",
    otc: "text-zinc-400/90 bg-[#1a1d28]",
    scrollThumb: "scrollbar-thumb-[#252936]",
    shadow: "shadow-[0_20px_60px_rgba(0,0,0,0.85)]",
    up: "#00c076", down: "#ff4a4a", profit: "#ff9800", onAccent: "#0d1117",
  },
  navy: {
    panel: "bg-[#111a2b]", panelBorder: "border-[#1e2a42]", strip: "bg-[#16223a]/60",
    rail: "bg-[#0b1424]/80", divider: "border-[#1b2740]/70",
    rowHover: "hover:bg-[#16223a]/80", rowActive: "bg-[#1c2c4a]",
    input: "bg-[#16223a] border-[#26344f] text-slate-100 placeholder-slate-500",
    text: "text-slate-100", muted: "text-slate-400", faint: "text-slate-500",
    tabActive: "bg-[#1c2c4a] text-blue-300", tabIdle: "text-slate-300 hover:bg-[#16223a] hover:text-white",
    countIdle: "bg-[#1c2740] text-slate-400",
    otc: "text-slate-300/90 bg-[#16223a]",
    scrollThumb: "scrollbar-thumb-[#243350]",
    shadow: "shadow-[0_20px_60px_rgba(0,0,0,0.8)]",
    up: "#00c076", down: "#ff4a4a", profit: "#ffa726", onAccent: "#08111f",
  },
  light: {
    panel: "bg-white", panelBorder: "border-zinc-200", strip: "bg-zinc-50",
    rail: "bg-zinc-50/80", divider: "border-zinc-100",
    rowHover: "hover:bg-zinc-100/80", rowActive: "bg-blue-50",
    input: "bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400",
    // Greys and accents picked by measured contrast on white, not by eye:
    // zinc-400 was 2.56:1 and emerald-600 3.77:1, both under the floor for text.
    text: "text-zinc-900", muted: "text-zinc-600", faint: "text-zinc-500",
    tabActive: "bg-blue-50 text-blue-700", tabIdle: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
    countIdle: "bg-zinc-100 text-zinc-500",
    otc: "text-zinc-500 bg-zinc-200/70",
    scrollThumb: "scrollbar-thumb-zinc-300",
    shadow: "shadow-[0_20px_60px_rgba(0,0,0,0.18)]",
    up: "#047857", down: "#dc2626", profit: "#b45309", onAccent: "#ffffff",
  },
};

/* The display name for each category, in one place.

   The tab strip below and the asset header in the order panel both name these,
   and they disagreed: the strip said "NSE Stocks" while the header said "Spot
   Market" for the same instrument. */
export const CATEGORY_LABELS: Record<Exclude<CategoryTab, "all">, string> = {
  currencies: "Currencies",
  crypto: "Crypto",
  commodities: "Commodities",
  stocks: "NYSE Stocks",
  indian_stocks: "NSE Stocks",
};

const BrowserTokenCtx = createContext<BrowserTokens>(BROWSER_TOKENS.dark);
const useBrowserTokens = () => useContext(BrowserTokenCtx);

/**
 * Exported so the analytics page can label an asset with the EXACT string the
 * market browser shows. Re-deriving names from a symbol elsewhere is how
 * "Axis Bank" in the browser became "AXISBANK" on the analytics page.
 */
export function getMarketDisplayName(market: BinaryMarket): string {
  if (market.label && market.label.trim().length > 0 && !market.label.includes("/")) {
    return market.label.replace(/\s*\(OTC\)/gi, "").trim();
  }
  /* A `market.name` branch used to sit here. Binary markets have no such
     column — they carry id, currency, pair, min/max amount, isTrending, isHot
     and status — so the property was always undefined and the branch never
     ran. The lookup tables below are what actually resolves a display name. */

  const { base, quote } = splitSymbol(market);
  const cat = classifyMarket(market);
  const cleanBase = (base || "").toUpperCase();

  if (COMMODITY_NAMES[cleanBase]) return COMMODITY_NAMES[cleanBase];
  if (STOCK_NAMES[cleanBase]) return STOCK_NAMES[cleanBase];
  if (INDIAN_STOCK_NAMES[cleanBase]) return INDIAN_STOCK_NAMES[cleanBase];
  if (cat === "crypto" || CRYPTO_NAMES[cleanBase]) {
    const fullName = CRYPTO_NAMES[cleanBase] || cleanBase;
    if (quote && quote !== "USD" && quote !== "USDT" && quote !== "OTC") {
      return `${fullName} (${quote})`;
    }
    return fullName;
  }

  return cat === "currencies" && quote ? `${base}/${quote}` : base;
}

// ─── 24h Change helper ─────────────────────────────────────────────────────────

function get24hChange(market: BinaryMarket): { value: number; isUp: boolean; formatted: string } {
  const m = market as any;
  const rawChange = m.change24h ?? m.change ?? m.changePercentage ?? m.percentage;
  if (typeof rawChange === "number" && !isNaN(rawChange)) {
    return { value: rawChange, isUp: rawChange >= 0, formatted: `${rawChange >= 0 ? "+" : ""}${rawChange.toFixed(2)}%` };
  }
  if (typeof rawChange === "string" && !isNaN(parseFloat(rawChange))) {
    const val = parseFloat(rawChange);
    return { value: val, isUp: val >= 0, formatted: `${val >= 0 ? "+" : ""}${val.toFixed(2)}%` };
  }
  // Fallback for synthetic/OTC pairs
  const sym = String(market.symbol || `${market.currency}${market.pair}`);
  let hash = 0;
  for (let i = 0; i < sym.length; i++) hash = (hash << 5) - hash + sym.charCodeAt(i);
  const raw = ((Math.abs(hash) % 95) - 30) / 100;
  const val = parseFloat(raw.toFixed(2));
  return { value: val, isUp: val >= 0, formatted: `${val >= 0 ? "" : ""}${val}%` };
}

// ─── Icon rendering ────────────────────────────────────────────────────────────

// ─── Asset Row (Pixel-Perfect Compact Quotex Style) ────────────────────────────

interface AssetRowProps {
  market: BinaryMarket;
  profit1Min: number;
  profit5Min: number;
  isFavorite: boolean;
  isActive: boolean;
  isAttached: boolean;
  onClick: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

const AssetRow = memo(({ market, profit1Min, profit5Min, isFavorite, isActive, isAttached, onClick, onToggleFavorite }: AssetRowProps) => {
  const bt = useBrowserTokens();
  const { base, quote } = splitSymbol(market);
  const cat = classifyMarket(market);
  const isOTC = String(market.symbol || `${market.currency}${market.pair}`).toUpperCase().includes("OTC");
  const displayName = getMarketDisplayName(market);
  const change24h = get24hChange(market);

  return (
    <div
      onClick={onClick}
      role="button"
      className={`group relative flex items-center h-11 cursor-pointer transition-colors duration-100 border-b ${bt.divider} px-2
        ${isActive
          ? bt.rowActive
          : bt.rowHover}`}
    >
      {/* 1. Trading Watchlist Bookmark Icon */}
      <button
        onClick={onToggleFavorite}
        aria-label={isFavorite ? "Remove from watchlist" : "Add to watchlist"}
        className="w-8 flex justify-center shrink-0 transition-colors"
        title={isFavorite ? "In your trading watchlist" : "Add to trading watchlist"}
      >
        <Bookmark
          size={16}
          strokeWidth={1.5}
          className={isFavorite ? "fill-blue-500 text-blue-400" : `${bt.faint} hover:text-blue-400`}
        />
      </button>

      {/* 2. Double Flag / Asset Icon */}
      <div className="pr-2 shrink-0"><AssetIcon market={market} /></div>

      {/* 3. Name, Exact Navigation Bar Style OTC Tag & 📌 Pin Emoji Indicator */}
      <div className="flex-1 min-w-0 flex items-center gap-1 pr-1">
        <span className={`text-[12px] font-bold leading-tight ${bt.text} truncate`}>
          {displayName}
        </span>
        {isOTC && (
          <span className={`inline-block shrink-0 text-[10px] font-extrabold ${bt.otc} px-0.5 py-[1px] rounded-[2px] leading-none select-none uppercase tracking-tighter origin-top-left transform scale-[0.68] mt-[1px] -mr-1`} title="OTC Market">
            OTC
          </span>
        )}
        {isAttached && (
          <span className="text-[12px] leading-none shrink-0 ml-0.5 select-none" title="Pinned to navigation bar">
            📌
          </span>
        )}
      </div>

      {/* 4. 24h Changing Column */}
      <div className="w-[95px] text-right shrink-0 pr-2 flex items-center justify-end">
        {change24h.isUp ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums" style={{ color: bt.up }}>
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: bt.up, color: bt.onAccent }}>↑</span>
            {change24h.formatted}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[12px] font-bold tabular-nums" style={{ color: bt.down }}>
            <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: bt.down, color: bt.onAccent }}>↓</span>
            {change24h.formatted}
          </span>
        )}
      </div>

      {/* 5. Profit Column (#ff9800 Quotex Amber) */}
      <div className="w-[76px] text-right shrink-0 pr-4 text-[13px] font-bold tabular-nums" style={{ color: bt.profit }}>{profit1Min}%</div>
    </div>
  );
});
AssetRow.displayName = "AssetRow";

// ─── Sidebar Tab (left categories: Bigger text & Bigger icons) ──────────────────

const SidebarTab = memo(({ label, icon, isActive, count, onClick }: {
  label: string; icon: React.ReactNode; isActive: boolean; count: number; onClick: () => void;
}) => {
  const bt = useBrowserTokens();
  return (
  <button
    onClick={onClick}
    className={`relative flex items-center gap-2.5 w-full h-[36px] pl-3 pr-2 rounded-xl text-[12px] font-semibold transition-all duration-100 cursor-pointer
      ${isActive
        ? `${bt.tabActive} font-bold`
        : bt.tabIdle}`}
  >
    {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4.5 w-1 rounded-r bg-blue-500" />}
    <span className={`shrink-0 ${isActive ? "text-blue-400" : bt.muted}`}>{icon}</span>
    <span className="flex-1 text-left truncate">{label}</span>
    <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md shrink-0 ${isActive ? "bg-blue-500/20 text-blue-600 dark:text-blue-300" : bt.countIdle}`}>{count}</span>
  </button>
  );
});
SidebarTab.displayName = "SidebarTab";

// ─── Main Panel ─────────────────────────────────────────────────────────────────

export interface MarketBrowserPanelProps {
  open: boolean;
  onClose: () => void;
  handleMarketSelect?: (symbol: string) => void;
  anchorRef?: React.RefObject<HTMLElement>;
  /**
   * Phone shape: full screen, sliding up from the bottom edge, with the
   * category rail laid across the top instead of down the left.
   *
   * Everything else is the desktop panel unchanged — the same rows, the same
   * bookmark and pin, the same sortable Name / 24h changing / Profit columns,
   * the same six categories and watchlist. The rail is the only thing that
   * cannot survive the width: at 157px it is 40% of a 390px screen, spent on
   * six labels, and it leaves the asset list — the reason the panel is open —
   * sharing what is left with two numeric columns.
   */
  isMobile?: boolean;
}

export default function MarketBrowserPanel({ open, onClose, handleMarketSelect, isMobile = false }: MarketBrowserPanelProps) {
  const { resolvedTheme } = useTheme();
  const bt =
    BROWSER_TOKENS[
      (resolvedTheme === "light" ? "light" : resolvedTheme === "navy" ? "navy" : "dark") as BrowserTheme
    ];
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { binaryMarkets, currentSymbol, setCurrentSymbol, addMarket, activeMarkets, isLoadingMarkets, fetchBinaryMarkets, binaryDurations, selectedOrderType } = useBinaryStore();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<CategoryTab>("currencies");
  const [isFilterFavorites, setIsFilterFavorites] = useState(false);
  const [favoriteMarkets, setFavoriteMarkets] = useState<Symbol[]>([]);
  const [sortField, setSortField] = useState<SortField>("profit1");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (binaryMarkets.length === 0 && !isLoadingMarkets) fetchBinaryMarkets(); }, [binaryMarkets.length, isLoadingMarkets, fetchBinaryMarkets]);
  useEffect(() => { const u = wishlistService.subscribe(wl => setFavoriteMarkets(wl.map(i => i.symbol))); return u; }, []);
  /* The search box takes focus on open so a desktop trader can type a symbol
     straight away. On a phone that same focus raises the keyboard over the
     list they just opened — and browsing the categories, not searching, is
     the usual reason for opening it there. Focus is desktop-only; the field
     is still one tap away on mobile. */
  useEffect(() => { if (open) { if (!isMobile) setTimeout(() => searchRef.current?.focus(), 120); setSearch(""); setIsFilterFavorites(false); } }, [open, isMobile]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [open, onClose]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const getProfitForDuration = useCallback((market: BinaryMarket, mins: number): number => {
    const d = binaryDurations.find(x => x.duration === mins);
    let base = 85;
    if (d) {
      if (selectedOrderType === "RISE_FALL") base = d.profitPercentageRiseFall || 85;
      else if (selectedOrderType === "HIGHER_LOWER") base = d.profitPercentageHigherLower || 80;
      else if (selectedOrderType === "TOUCH_NO_TOUCH") base = d.profitPercentageTouchNoTouch || 82;
      else if (selectedOrderType === "CALL_PUT") base = d.profitPercentageCallPut || 85;
      else if (selectedOrderType === "TURBO") base = d.profitPercentageTurbo || 80;
    }
    const sym = market.symbol || `${market.currency}${market.pair}`;
    if (sym.toUpperCase().includes("OTC")) return base;
    const hash = sym.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return Math.min(95, Math.max(72, base - (hash % 7)));
  }, [binaryDurations, selectedOrderType]);

  const attachedSet = useMemo(() => {
    const s = new Set<string>();
    activeMarkets.forEach(m => s.add(String(m.symbol).replace(/[^A-Za-z0-9]/g, "").toUpperCase()));
    return s;
  }, [activeMarkets]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: binaryMarkets.length, currencies: 0, crypto: 0, commodities: 0, stocks: 0, indian_stocks: 0 };
    binaryMarkets.forEach(m => { counts[classifyMarket(m)]++; });
    return counts;
  }, [binaryMarkets]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredMarkets = useMemo(() => {
    let markets = binaryMarkets;
    const q = search.trim().toLowerCase();
    if (isFilterFavorites) {
      markets = markets.filter(m => favoriteMarkets.includes((m.symbol || `${m.currency}${m.pair}`) as Symbol));
    } else if (q) {
      markets = markets.filter(m => {
        const full = getMarketDisplayName(m).toLowerCase();
        const sym = `${m.currency}${m.pair}${m.symbol || ""}`.toLowerCase();
        return full.includes(q) || sym.includes(q);
      });
    } else if (activeTab !== "all") {
      markets = markets.filter(m => classifyMarket(m) === activeTab);
    }

    // Sort markets: Favorites (starred) ALWAYS float automatically to the top of the list!
    return [...markets].sort((a, b) => {
      const isFavA = favoriteMarkets.includes((a.symbol || `${a.currency}${a.pair}`) as Symbol);
      const isFavB = favoriteMarkets.includes((b.symbol || `${b.currency}${b.pair}`) as Symbol);

      if (isFavA && !isFavB) return -1;
      if (!isFavA && isFavB) return 1;

      // Secondary sorting
      let valA = 0;
      let valB = 0;
      if (sortField === "name") {
        const nameA = a.symbol || `${a.currency}${a.pair}`;
        const nameB = b.symbol || `${b.currency}${b.pair}`;
        return sortOrder === "asc" ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      if (sortField === "change") {
        valA = get24hChange(a).value;
        valB = get24hChange(b).value;
      } else if (sortField === "profit1") {
        valA = getProfitForDuration(a, 1);
        valB = getProfitForDuration(b, 1);
      } else if (sortField === "profit5") {
        valA = getProfitForDuration(a, 5);
        valB = getProfitForDuration(b, 5);
      }
      return sortOrder === "asc" ? valA - valB : valB - valA;
    });
  }, [binaryMarkets, activeTab, isFilterFavorites, search, favoriteMarkets, sortField, sortOrder, getProfitForDuration]);

  const handleSelect = useCallback((symbol: Symbol) => {
    if (!activeMarkets.some(m => isSameSymbol(m.symbol, symbol))) addMarket(symbol);
    if (handleMarketSelect) handleMarketSelect(String(symbol)); else setCurrentSymbol(symbol);
    onClose();
  }, [activeMarkets, addMarket, handleMarketSelect, setCurrentSymbol, onClose]);

  const toggleFavorite = useCallback((e: React.MouseEvent, symbol: Symbol) => {
    e.stopPropagation(); wishlistService.toggleWishlist(symbol);
  }, []);

  const categoryChips = useMemo(() => [
    { id: "all" as CategoryTab, label: "All", icon: <LayoutGrid size={17} /> },
    { id: "currencies" as CategoryTab, label: "Currencies", icon: <Coins size={17} /> },
    { id: "crypto" as CategoryTab, label: "Crypto", icon: <Bitcoin size={17} /> },
    { id: "commodities" as CategoryTab, label: "Commodities", icon: <Droplet size={17} /> },
    { id: "stocks" as CategoryTab, label: "NYSE Stocks", icon: <Briefcase size={17} /> },
    { id: "indian_stocks" as CategoryTab, label: "NSE Stocks", icon: <img src="/img/flag/in.webp" alt="India" className="w-4.5 h-3 object-cover rounded-[1px]" /> },
  ], []);

  if (!mounted) return null;

  return (
    <BrowserTokenCtx.Provider value={bt}>
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={isMobile ? { y: "100%" } : { opacity: 0, y: -8, scale: 0.985 }}
          animate={isMobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
          exit={isMobile ? { y: "100%" } : { opacity: 0, y: -8, scale: 0.985 }}
          transition={
            isMobile
              ? { type: "spring", damping: 32, stiffness: 320 }
              : { duration: 0.15, ease: "easeOut" }
          }
          className={`flex flex-col border overflow-hidden font-sans ${
            isMobile
              ? "fixed inset-0 z-[100] rounded-none"
              : "absolute top-full left-32 mt-1.5 w-[556px] rounded-2xl z-50"
          } ${bt.panel} ${bt.panelBorder} ${bt.shadow}`}
          style={
            isMobile
              ? undefined
              : { height: "calc(100vh - 75px)", maxHeight: "calc(100vh - 75px)" }
          }
        >
          {/* Header */}
          <div className={`flex items-center gap-3 px-4 pt-3 pb-2.5 border-b ${bt.panelBorder} shrink-0`}>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="relative shrink-0">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
              </div>
              <div className="min-w-0">
                <p className={`text-[13px] font-bold ${bt.text} leading-none`}>Select Trade Pair</p>
                <p className={`text-[11px] ${bt.muted} mt-1 leading-none`}>{binaryMarkets.length} markets available</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className={`${isMobile ? "p-2.5 -m-1" : "p-1.5"} rounded-lg transition-colors ${bt.rowHover} ${bt.muted} shrink-0`}>
              <X size={isMobile ? 22 : 16} />
            </button>
          </div>

          {/* Search */}
          <div className={`px-4 py-2 border-b ${bt.panelBorder} shrink-0`}>
            <div className="relative">
              <Search size={14} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${bt.muted}`} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search all markets…"
                /* The theme classes were written into a plain double-quoted
                   string, so `${bt.input}` reached the DOM as those nine
                   literal characters and the field has been unstyled — no
                   background, no border colour — in every theme since. It is a
                   template literal now, which is what it always meant to be. */
                className={`w-full ${isMobile ? "h-11 text-[15px]" : "h-9 text-[12px]"} pl-9 pr-8 rounded-xl outline-none border transition-all ${bt.input} focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/15`}
              />
              {search && (
                <button onClick={() => { setSearch(""); searchRef.current?.focus(); }} className={`absolute right-2.5 top-1/2 -translate-y-1/2 ${bt.muted}`}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Categories, across the top — phone only. Same six plus the
              watchlist; the counts come with them, because "Crypto 28" is why
              you tap Crypto. */}
          {isMobile && (
            <div
              className={`flex gap-1.5 px-3 py-2 overflow-x-auto shrink-0 border-b ${bt.panelBorder} ${bt.rail}`}
              style={{ scrollbarWidth: "none" }}
            >
              {categoryChips.map(c => {
                const isActive = !isFilterFavorites && !search && activeTab === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => { setIsFilterFavorites(false); setSearch(""); setActiveTab(c.id); }}
                    className={`shrink-0 h-9 pl-2.5 pr-2 rounded-xl text-[13px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                      isActive ? bt.tabActive : bt.tabIdle
                    }`}
                  >
                    <span className={`shrink-0 ${isActive ? "text-blue-400" : bt.muted}`}>{c.icon}</span>
                    <span>{c.label}</span>
                    <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${
                      isActive ? "bg-blue-500/20 text-blue-600 dark:text-blue-300" : bt.countIdle
                    }`}>
                      {categoryCounts[c.id] || 0}
                    </span>
                  </button>
                );
              })}
              <button
                onClick={() => { setSearch(""); setIsFilterFavorites(true); }}
                className={`shrink-0 h-9 pl-2.5 pr-2 rounded-xl text-[13px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isFilterFavorites ? bt.tabActive : bt.tabIdle
                }`}
              >
                <Bookmark size={16} className={isFilterFavorites ? "fill-blue-500 text-blue-400" : bt.muted} />
                <span>Watchlist</span>
                <span className={`text-[11px] font-bold tabular-nums px-1.5 py-0.5 rounded-md ${
                  isFilterFavorites ? "bg-blue-500/20 text-blue-600 dark:text-blue-300" : bt.countIdle
                }`}>
                  {favoriteMarkets.length}
                </span>
              </button>
            </div>
          )}

          {/* Body: left category sidebar + asset list */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Sidebar (Categories with enlarged text & icons) — desktop only. */}
            {!isMobile && (
            <div className={`w-[157px] shrink-0 flex flex-col gap-0.5 p-2 border-r ${bt.panelBorder} ${bt.rail} overflow-y-auto scrollbar-none`}>
              <p className={`text-[11px] font-bold uppercase tracking-wider ${bt.muted} px-2.5 pt-1 pb-1`}>Markets</p>
              {categoryChips.map(c => (
                <SidebarTab
                  key={c.id}
                  label={c.label}
                  icon={c.icon}
                  isActive={!isFilterFavorites && !search && activeTab === c.id}
                  count={categoryCounts[c.id] || 0}
                  onClick={() => { setIsFilterFavorites(false); setSearch(""); setActiveTab(c.id); }}
                />
              ))}
              <div className={`my-1.5 mx-2.5 h-px border-t ${bt.panelBorder}`} />
              <p className={`text-[11px] font-bold uppercase tracking-wider ${bt.muted} px-2.5 pb-1`}>Watchlist</p>
              <SidebarTab
                label="Watchlist"
                icon={<Bookmark size={16} className={isFilterFavorites ? "fill-blue-500 text-blue-400" : ""} />}
                isActive={isFilterFavorites}
                count={favoriteMarkets.length}
                onClick={() => { setSearch(""); setIsFilterFavorites(true); }}
              />
            </div>
            )}

            {/* List column (Exact Quotex Reference Layout) */}
            <div className={`flex-1 min-w-0 flex flex-col ${bt.panel}`}>
              {/* Column header */}
              <div className={`flex items-center h-8 border-b ${bt.panelBorder} ${bt.strip} shrink-0 text-[11px] font-medium ${bt.muted} px-2 select-none`}>
                <div className="w-8" />
                <div className="flex-1 pl-1 cursor-pointer hover:opacity-80 flex items-center gap-1" onClick={() => toggleSort("name")}>
                  <span>Name</span>
                  {sortField === "name" && <span className="text-[10px]">{sortOrder === "asc" ? "▲" : "▼"}</span>}
                </div>
                <div className="w-[95px] text-right pr-2 cursor-pointer hover:opacity-80 flex items-center justify-end gap-1" onClick={() => toggleSort("change")}>
                  <span>24h changing</span>
                  {sortField === "change" && <span className="text-[10px]">{sortOrder === "asc" ? "▲" : "▼"}</span>}
                </div>
                <div className="w-[76px] text-right pr-4 cursor-pointer hover:opacity-80 flex items-center justify-end gap-0.5" onClick={() => toggleSort("profit1")}>
                  <span>Profit</span>
                  <span className="text-[10px] ml-0.5">{sortField === "profit1" ? (sortOrder === "asc" ? "▲" : "▼") : "▲"}</span>
                </div>
              </div>

              {/* List */}
              <div className={`flex-1 overflow-y-auto scrollbar-thin ${bt.scrollThumb} scrollbar-track-transparent`}>
                {isLoadingMarkets && binaryMarkets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="w-7 h-7 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                    <span className={`text-xs ${bt.muted}`}>Loading markets…</span>
                  </div>
                ) : filteredMarkets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <Search size={28} className={bt.faint} />
                    <p className={`text-[12px] font-semibold ${bt.muted}`}>No assets found</p>
                    <p className={`text-[11px] ${bt.faint}`}>Try a different keyword</p>
                  </div>
                ) : (
                  filteredMarkets.map(market => {
                    const sym = (market.symbol || `${market.currency}${market.pair}`) as Symbol;
                    const nkey = String(sym).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
                    return (
                      <AssetRow
                        key={market.id || sym}
                        market={market}
                        profit1Min={getProfitForDuration(market, 1)}
                        profit5Min={getProfitForDuration(market, 5)}
                        isFavorite={favoriteMarkets.includes(sym)}
                        isActive={isSameSymbol(currentSymbol, sym)}
                        isAttached={attachedSet.has(nkey)}
                        onClick={() => handleSelect(sym)}
                        onToggleFavorite={e => toggleFavorite(e, sym)}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`flex items-center justify-between px-4 py-2 border-t ${bt.panelBorder} ${bt.rail}`}>
            <span className={`text-[11px] ${bt.muted}`}>
              <span className="font-bold text-zinc-200">{filteredMarkets.length}</span> of <span className="font-bold text-zinc-200">{binaryMarkets.length}</span> markets
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className={`text-[11px] ${bt.muted}`}>Live payouts</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </BrowserTokenCtx.Provider>
  );
}
