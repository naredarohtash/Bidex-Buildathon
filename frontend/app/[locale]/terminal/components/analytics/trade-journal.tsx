"use client";

/**
 * Trade Journal & PnL Calendar Component (Theme-Aware, Premium Asset Icons & CALL/PUT terminology)
 *
 * Design updates:
 * - Replaced checkmark/cross status icons in trade logs with overlapping circular flag/asset logo stacks
 * - Formatted asset names cleanly as AUD/CAD with small gray OTC badge (matching Vortex style)
 * - Restored Trades count badge at the top-right corner of calendar cells with whitespace-nowrap
 * - Replaced raw PnL text string representations (like USD) with currency symbols via formatMoney helper
 * - Uses CALL/PUT terminology instead of RISE/FALL in logs
 */

import { memo, useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import { useTheme } from "next-themes";
import {
  Edit3,
  Tag,
  Save,
  X,
  Star,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar as CalendarIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart,
  BarChart2,
  CheckCircle2,
  XCircle,
  Zap,
  Download,
  CalendarDays,
} from "lucide-react";
import type { CompletedOrder } from "@/store/trade/use-binary-store";
import type { OrderSide } from "@/types/binary-trading";
import { useTranslations } from "next-intl";
import { useIsMobile } from "../../hooks/use-trading-mobile";
import { useUserStore } from "@/store/user";
import { CONTROL_BRAND, CloseButton, MenuItem, PageHeader, Popover } from "./page-chrome";
import { getCryptoImageUrl, handleImageError, getAssetDisplayName } from "@/utils/image-fallback";

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL",
  "PKR", "BDT", "CNY", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP",
  "PLN", "SEK", "NOK", "DKK", "CZK", "HUF", "THB", "CNH"
]);

// Helper function to determine if an order side is bullish
function isBullishSide(side: OrderSide | string): boolean {
  return side === "RISE" || side === "HIGHER" || side === "TOUCH" || side === "CALL" || side === "UP";
}

// Calculate exact net PnL for a trade considering WIN, LOSS, and DRAW statuses
export function getTradeNetPnL(trade: CompletedOrder): number {
  if (trade.status === "DRAW") return 0;
  if (trade.status === "WIN") return Math.abs(trade.profit || 0);
  // LOSS status: use negative profit or negative bet amount
  if (trade.profit !== undefined && trade.profit !== 0) {
    return -Math.abs(trade.profit);
  }
  return -Math.abs(trade.amount || 0);
}

// Format Date object into local YYYY-MM-DD string
function getTradeDateKey(d: Date | string): string {
  const dateObj = new Date(d);
  const y = dateObj.getFullYear();
  const m = (dateObj.getMonth() + 1).toString().padStart(2, "0");
  const day = dateObj.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Get clean currency symbols map
function getCurrencySymbol(cur: string): string {
  const map: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    CNY: "¥",
    RUB: "₽",
    INR: "₹",
    USDT: "₮",
    BTC: "₿",
  };
  return map[cur] || cur;
}

// Financial Money Formatter (e.g. +$12.8k, -$5.2k, +$950.00, $0.00)
/**
 * Money, short enough to read.
 *
 * `compact` defaults to true now, and reaches billions. It was opt-in and
 * mostly set to `isMobile`, on the reasoning that a desktop card has room to
 * print the exact number — which is true of the width and false of everything
 * else. An account down ₹14,620,857.59 rendered that in full at 17px and the
 * card cut it to "−₹14,620,85…", so the desktop got a truncated figure where
 * the phone got a correct one. Fourteen digits also stop being a quantity and
 * become a string you have to count: −₹14.6M is read, ₹14,620,857.59 is
 * parsed.
 *
 * Exactness belongs where the amount is a fact you might act on — a single
 * trade's stake or payout — and those callers pass `false`.
 */
function formatMoney(val: number, cur: string, compact = true): string {
  const symbol = getCurrencySymbol(cur);
  const abs = Math.abs(val);
  if (abs === 0) return `${symbol}0.00`;
  const sign = val >= 0 ? "+" : "-";

  if (compact && abs >= 1000) {
    const [div, suffix] =
      abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "K"];
    /* One decimal below 100 of a unit, none above: 4.9M and 118K both read at
       a glance, where 118.4K is a digit nobody asked for. */
    const scaled = abs / div;
    const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, "");
    return `${sign}${symbol}${text}${suffix}`;
  }

  return `${sign}${symbol}${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Parse symbol into base, quote and OTC status
function parseSymbol(symbol: string) {
  const clean = symbol.replace(" (OTC)", "").replace("/OTC", "").replace("_OTC", "").replace("OTC", "").trim();
  let base = clean;
  let quote = "";
  let isOTC = symbol.toUpperCase().includes("OTC");

  if (clean.includes("/")) {
    const parts = clean.split("/");
    base = parts[0];
    quote = parts[1];
  } else if (clean.includes("USDT")) {
    base = clean.replace("USDT", "");
    quote = "USDT";
  } else if (clean.endsWith("USD") && clean.length > 3) {
    base = clean.replace(/USD$/, "");
    quote = "USD";
  } else if (clean.endsWith("EUR") && clean.length > 3) {
    base = clean.replace(/EUR$/, "");
    quote = "EUR";
  } else if (clean.endsWith("GBP") && clean.length > 3) {
    base = clean.replace(/GBP$/, "");
    quote = "GBP";
  } else if (clean.endsWith("JPY") && clean.length > 3) {
    base = clean.replace(/JPY$/, "");
    quote = "JPY";
  } else if (clean.endsWith("CHF") && clean.length > 3) {
    base = clean.replace(/CHF$/, "");
    quote = "CHF";
  } else if (clean.length === 6 && FIAT_CURRENCIES.has(clean.substring(0, 3)) && FIAT_CURRENCIES.has(clean.substring(3, 6))) {
    base = clean.substring(0, 3);
    quote = clean.substring(3, 6);
  }

  return { base, quote, isOTC };
}

// Format Date object into local MM/DD/YYYY string
function formatCSVDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Format Time object into local HH:MM:SS string
function formatCSVTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Generate CSV string content from completed orders
function generateCSV(trades: CompletedOrder[]): string {
  const headers = [
    "ID",
    "Date",
    "Time",
    "Symbol",
    "Side",
    "Entry Price",
    "Exit Price",
    "Amount",
    "Profit/Loss",
    "Status",
    "Duration (s)",
  ];

  const rows = trades.map((trade) => {
    const entryDate = new Date(trade.entryTime);
    const expiryDate = new Date(trade.expiryTime);
    const duration = Math.round(
      (expiryDate.getTime() - entryDate.getTime()) / 1000
    );
    const pnl = getTradeNetPnL(trade);

    return [
      trade.id,
      formatCSVDate(expiryDate),
      formatCSVTime(expiryDate),
      trade.symbol,
      trade.side,
      trade.entryPrice.toFixed(4),
      trade.closePrice.toFixed(4),
      trade.amount.toFixed(2),
      pnl.toFixed(2),
      trade.status,
      duration.toString(),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

// Helper to trigger file download in browser
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// THEME TOKENS & CONTEXT (Matching Performance Dashboard)
// ============================================================================

export type JournalTheme = "dark" | "navy" | "light";

interface Tokens {
  up: string;
  down: string;
  flat: string;
  upRgb: string;
  downRgb: string;
  card: string;
  panel: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  hoverBg: string;
  accent: string;
  accentHover: string;
  track: string;
}

const TOKENS: Record<JournalTheme, Tokens> = {
  dark: {
    up: "#089981",
    down: "#f23645",
    flat: "#6b7280",
    upRgb: "8,153,129",
    downRgb: "242,54,69",
    card: "bg-[#16181f] border border-[#23262f]",
    panel: "bg-[#0d0f14]/40 border border-[#23262f]/60",
    border: "border-[#23262f]/80",
    textPrimary: "text-zinc-150",
    textSecondary: "text-zinc-400",
    hoverBg: "hover:bg-white/[0.05]",
    accent: "bg-[#0052ff] hover:bg-[#0041cc] text-white border-transparent",
    accentHover: "hover:bg-[#0041cc]",
    track: "#2a2d3a",
  },
  navy: {
    up: "#089981",
    down: "#f23645",
    flat: "#64748b",
    upRgb: "8,153,129",
    downRgb: "242,54,69",
    card: "bg-[#111a2b] border border-[#1e2a42]",
    panel: "bg-[#0a1120]/45 border border-[#1e2a42]/60",
    border: "border-[#1e2a42]/80",
    textPrimary: "text-slate-150",
    textSecondary: "text-slate-400",
    hoverBg: "hover:bg-white/[0.06]",
    accent: "bg-[#0052ff] hover:bg-[#0041cc] text-white border-transparent",
    accentHover: "hover:bg-[#0041cc]",
    track: "#24304a",
  },
  light: {
    up: "#089981",
    down: "#f23645",
    flat: "#71717a",
    upRgb: "8,153,129",
    downRgb: "242,54,69",
    card: "bg-white border border-zinc-200",
    panel: "bg-zinc-55/65 border border-zinc-200/60",
    border: "border-zinc-200/80",
    textPrimary: "text-zinc-900",
    textSecondary: "text-zinc-500",
    hoverBg: "hover:bg-zinc-100",
    accent: "bg-[#0052ff] hover:bg-[#0041cc] text-white border-transparent",
    accentHover: "hover:bg-[#0041cc]",
    track: "#e4e4e7",
  },
};

const TokenCtx = createContext<Tokens>(TOKENS.dark);
const useTokens = () => useContext(TokenCtx);

// ============================================================================
// COIN STACK FLAG COMPONENT
// ============================================================================

const TICKER_COLORS = ["#2962ff", "#e91e63", "#9c27b0", "#00bcd4", "#ff9800", "#4caf50", "#795548", "#607d8b"];
function getTickerColor(ticker: string) {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
  return TICKER_COLORS[Math.abs(hash) % TICKER_COLORS.length];
}

const LetterAvatar = memo(({ ticker, size = 20 }: { ticker: string; size?: number }) => (
  <div
    className="flex items-center justify-center rounded-full text-white font-extrabold shrink-0"
    style={{ width: size, height: size, backgroundColor: getTickerColor(ticker), fontSize: size * 0.45 }}
  >
    {ticker.charAt(0)}
  </div>
));
LetterAvatar.displayName = "LetterAvatar";

const SafeCoinIcon = memo(({ ticker, className, bgCol }: { ticker: string; className?: string; bgCol: string }) => {
  const [error, setError] = useState(false);
  
  if (error) {
    return <LetterAvatar ticker={ticker} />;
  }
  
  return (
    <div className={`w-5 h-5 rounded-full overflow-hidden ${className || ""} ${bgCol} shadow-sm flex items-center justify-center`}>
      <img
        src={getCryptoImageUrl(ticker)}
        alt={ticker}
        className="object-cover w-full h-full"
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  );
});
SafeCoinIcon.displayName = "SafeCoinIcon";

const CoinStack = memo(({ base, quote, isOTC }: { base: string; quote: string; isOTC: boolean }) => {
  const t = useTokens();
  const borderCol = t.card.includes("bg-[#16181f]")
    ? "border-[#16181f]"
    : t.card.includes("bg-[#111a2b]")
    ? "border-[#111a2b]"
    : "border-white";
  const bgCol = t.card.includes("bg-[#16181f]")
    ? "bg-[#16181f]"
    : t.card.includes("bg-[#111a2b]")
    ? "bg-[#111a2b]"
    : "bg-white";
  
  const isSingle = !quote || (isOTC && !FIAT_CURRENCIES.has(base.toUpperCase()));

  if (isSingle) {
    return (
      <div className="relative w-8 h-5 shrink-0 flex items-center justify-center">
        <SafeCoinIcon ticker={base} className={`border ${borderCol}`} bgCol={bgCol} />
      </div>
    );
  }

  return (
    <div className="relative w-8 h-5 shrink-0">
      <div className="absolute left-2.5 top-0 z-0">
        <SafeCoinIcon ticker={quote} className="border border-zinc-950/20" bgCol={bgCol} />
      </div>
      <div className="absolute left-0 top-0 z-10">
        <SafeCoinIcon ticker={base} className="border border-zinc-950/20" bgCol={bgCol} />
      </div>
    </div>
  );
});
CoinStack.displayName = "CoinStack";

// ============================================================================
// TYPES
// ============================================================================

export interface TradeNote {
  orderId: string;
  note: string;
  tags: string[];
  rating: number; // 1-5
  createdAt: Date;
  updatedAt: Date;
}

export type TimeframeFilter = "overall" | "month" | "week" | "day" | "custom";

/**
 * The windows this page offers, widest first.
 *
 * The same order the dashboard's period menu uses, for the same reason: the
 * top of a list is where the eye starts, and the top of that list should not
 * be the window least likely to have anything in it. "Custom" is last because
 * it is not a window, it is a way of describing one.
 */
export const JOURNAL_PERIODS: { id: TimeframeFilter; label: string; note: string }[] = [
  { id: "overall", label: "All time", note: "Every settled trade" },
  { id: "month", label: "Month", note: "Last 30 days" },
  { id: "week", label: "Week", note: "Last 7 days" },
  { id: "day", label: "Today", note: "Since midnight" },
  { id: "custom", label: "Custom", note: "Pick the dates below" },
];

interface TradeJournalProps {
  trades: CompletedOrder[];
  currency?: string;
  theme?: JournalTheme;
  onSaveNote?: (orderId: string, note: string, tags: string[], rating: number) => void;
  /** Renders the close button at the end of the header's control row, when
      this page is the whole of an overlay and has no chrome bar above it. */
  onClose?: () => void;
}

interface TradeNoteEditorProps {
  trade: CompletedOrder;
  existingNote?: TradeNote;
  onSave: (note: string, tags: string[], rating: number) => void;
  onCancel: () => void;
  theme?: JournalTheme;
}

interface GroupedTrades {
  dateStr: string;
  formattedDate: string;
  dateObj: Date;
  trades: CompletedOrder[];
  totalPnL: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  /** Trades on this date before the render cap. The header always reports this,
      so a truncated group still says "666 trades", not however many are mounted. */
  fullCount?: number;
}

/**
 * Rows mounted per page in the log.
 *
 * The log used to render every group and every trade inside it in one synchronous
 * pass. At 1,615 trades — each one parsing its symbol, looking up a note and
 * drawing an icon — that single render was long enough to be felt as a delay when
 * switching to the tab, which is why the journal opened slower than analytics.
 * A page is mounted up front and extended as the list is scrolled.
 */
const LOG_PAGE_SIZE = 40;

/**
 * A calendar cell is sized against its own width, not against a fixed pixel.
 *
 * The height was capped at a flat 100px. That reads correctly at laptop widths,
 * where a seventh of the panel is about 130px and the cell comes out near
 * square — and it falls apart the wider the screen gets, because only one side
 * of the cell was growing. On a 2560px monitor a seventh of the panel is over
 * 300px against a height still pinned at 100, and the month stops being a grid
 * of days and becomes seven columns of horizontal bands. That is the flattening,
 * and it gets worse with a better monitor, which is the opposite of what a
 * bigger screen should do.
 *
 * Height follows width now, so the cell holds its shape at every size. The
 * bounds are what the content needs and what it can use: below MIN a day number,
 * a figure and a bar stop being legible, and past MAX the cell is mostly void —
 * a day does not become more informative by getting taller.
 */
const CELL_ASPECT = 0.68;
const MIN_CELL_PX = 76;
const MAX_CELL_PX = 132;
/* A day is never taller than this multiple of its own width, whatever the
   pixel floor says. See the measurement effect for why the floor alone is
   not enough on a phone. */
const MAX_CELL_HEIGHT_RATIO = 1.25;
/** The shortest a cell can be and still show its date, figure and bar. */
const SHORT_CELL_PX = 58;
/** The legend line under the grid, which the rows must not eat into. */
const CALENDAR_FOOTER_PX = 26;

/**
 * Ceiling on the journal, past which it centres.
 *
 * This was on PnLCalendar, which is a seven-column child of a twelve-column
 * layout — so on a 4K screen the column it sits in was already narrower than the
 * cap and the cap never applied to anything. The page it was meant to restrain
 * spread the full 3840px regardless: a calendar and a trade log stretched across
 * an entire desk, with the eye travelling the whole width to get from Sunday to
 * Saturday.
 *
 * It belongs on the journal itself, which is the thing being sized. Sizing the
 * cell against its width (see CELL_ASPECT) keeps the proportions right; this
 * keeps the measure readable, so a 4K monitor shows the same journal a laptop
 * does rather than a differently-shaped one.
 */
const MAX_CONTENT_PX = 1800;

/**
 * Everything in the calendar card that is not the day grid: padding, the month
 * header, the weekday row, the legend and the gaps between them. Used to cap the
 * card so surplus height reaches the panel below instead of pooling inside it.
 */
const CALENDAR_CHROME_PX = 128;

/**
 * The phone calendar is a different calendar, not a smaller one.
 *
 * A month grid is seven columns wide by construction. On a desktop that is a
 * comfortable shape; on a 360px phone each column is about 46px, which is too
 * narrow to print a date, a count, a figure and a bar — so every cell
 * ellipsised, and shrinking the type only moved the point at which it did.
 * The constraint is structural: seven columns is simply too many for the width.
 *
 * So the phone gets the shape GitHub's contribution graph uses, which solves
 * exactly this problem: turn the grid ninety degrees. Weekdays become the seven
 * *rows* — a fixed count, and the axis with room to spare on a tall screen —
 * and weeks run along the horizontal, where the phone has the least room and a
 * week costs only one column. Nothing is printed inside a cell; colour carries
 * magnitude and direction, and the figures move to a detail card under the grid
 * where there is full width to print them. That trade is what buys the extra
 * months: a quarter of trading fits in the width a single month needed before.
 */
/**
 * How many weeks the heatmap covers, by default.
 *
 * 13 is one quarter — the widest window whose squares stay tappable on a phone.
 * The desktop passes its own: the columns are `flex-1`, so the same 13 weeks in
 * a 1000px column would be a wall of 78px blocks, which is a grid of buttons
 * rather than a shape you can read at a glance. Half a year lands the squares
 * near 36px there, big enough to hit and small enough that the whole run reads
 * as one picture.
 */
const HEATMAP_WEEKS = 13;
const HEATMAP_WEEKS_DESKTOP = 26;
const HEATMAP_GAP_PX = 3;
const HEATMAP_LABEL_PX = 22;
/**
 * Five steps: nothing, then four quartiles of magnitude.
 *
 * The ramp used to start at 0.22, borrowed from GitHub's contribution graph —
 * where the lightest step means "one commit" and being nearly invisible is the
 * point. It is the wrong bottom end for money. P&L is set by its outliers: one
 * heavy day fixes the maximum and drops most of the month into the lowest
 * band, so almost every square on the calendar was drawn at a fifth strength
 * and the grid read as grey with a few coloured days in it. A day that lost
 * money should look like a day that lost money at any size.
 *
 * Starting at 0.45 keeps four steps that are still told apart — the gap
 * between them matters more than the floor — while the palest is a colour
 * rather than a tint of the card underneath.
 */
const HEAT_ALPHAS = [0.45, 0.65, 0.82, 1];

// ============================================================================
// LOCAL STORAGE HELPERS
// ============================================================================

const STORAGE_KEY = "binary-trade-journal";

function loadNotes(): Record<string, TradeNote> {
  if (typeof window === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    Object.keys(parsed).forEach((key) => {
      parsed[key].createdAt = new Date(parsed[key].createdAt);
      parsed[key].updatedAt = new Date(parsed[key].updatedAt);
    });
    return parsed;
  } catch {
    return {};
  }
}

function saveNotes(notes: Record<string, TradeNote>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

// ============================================================================
// PREDEFINED TAGS
// ============================================================================

const PREDEFINED_TAGS = [
  "Trend Following",
  "Reversal",
  "Breakout",
  "Support/Resistance",
  "News Event",
  "Emotional Trade",
  "Well Planned",
  "FOMO",
  "Revenge Trade",
  "Technical Analysis",
  "Pattern Trade",
  "Scalp",
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// ============================================================================
// NOTE EDITOR COMPONENT
// ============================================================================

const TradeNoteEditor = memo(function TradeNoteEditor({
  trade,
  existingNote,
  onSave,
  onCancel,
  theme = "dark" as JournalTheme,
}: TradeNoteEditorProps) {
  const t = useTranslations("binary_components");
  const tCommon = useTranslations("common");
  const [note, setNote] = useState(existingNote?.note || "");
  const [tags, setTags] = useState<string[]>(existingNote?.tags || []);
  const [rating, setRating] = useState(existingNote?.rating || 0);
  const [customTag, setCustomTag] = useState("");

  const tTokens = useTokens();
  const isDark = !tTokens.card.includes("bg-white");
  const bgPanel = tTokens.panel;
  const bgInput = tTokens.card.includes("bg-[#16181f]")
    ? "bg-[#0d0f14]/85"
    : tTokens.card.includes("bg-[#111a2b]")
    ? "bg-[#0a1120]/85"
    : "bg-white";
  const borderCard = tTokens.border;
  const textPrimary = tTokens.textPrimary;
  const textSecondary = tTokens.textSecondary;

  const handleAddTag = (tag: string) => {
    if (!tags.includes(tag)) setTags([...tags, tag]);
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleAddCustomTag = () => {
    if (customTag.trim() && !tags.includes(customTag.trim())) {
      setTags([...tags, customTag.trim()]);
      setCustomTag("");
    }
  };

  return (
    <div className={`${bgPanel} border ${borderCard} rounded-md p-3.5 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`font-bold text-xs font-mono ${textPrimary}`}>
            {getAssetDisplayName(trade.symbol)}
          </span>
          {trade.symbol.toUpperCase().includes("OTC") && (
            <span className="inline-block shrink-0 text-[10px] font-extrabold text-zinc-500 bg-zinc-200/70 dark:text-zinc-400/90 dark:bg-[#1a1d28] px-0.5 py-[1px] rounded-[2px] leading-none select-none uppercase tracking-tighter origin-top-left transform scale-[0.68] mt-[1px] -mr-1">
              OTC
            </span>
          )}
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-semibold border`}
            style={{
              backgroundColor: trade.status === "WIN" ? `${tTokens.up}1c` : trade.status === "LOSS" ? `${tTokens.down}1c` : `${tTokens.flat}1c`,
              color: trade.status === "WIN" ? tTokens.up : trade.status === "LOSS" ? tTokens.down : tTokens.flat,
              borderColor: trade.status === "WIN" ? `${tTokens.up}35` : trade.status === "LOSS" ? `${tTokens.down}35` : `${tTokens.flat}35`,
            }}
          >
            {trade.status}
          </span>
        </div>
        <span className={`text-[11px] ${textSecondary}`}>
          {new Date(trade.expiryTime).toLocaleDateString()} {new Date(trade.expiryTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Enter notes, comments, or strategy details for this trade..."
          className={`w-full h-16 ${bgInput} ${textPrimary} border ${borderCard} rounded-md p-2 text-xs resize-none focus:outline-none focus:border-[#0052ff] placeholder-[#787b86] font-medium`}
        />
      </div>

      {/* Tag Selector */}
      <div className="space-y-2">
        {/* Active Tags display */}
        {tags.length > 0 && (
          <div className="space-y-1">
            <span className={`text-[10px] uppercase font-bold tracking-wider ${textSecondary}`}>
              Active Tags
            </span>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border"
                  style={{
                    backgroundColor: "#0052ff1a",
                    color: isDark ? "#60a5fa" : "#0052ff",
                    borderColor: "#0052ff33",
                  }}
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-400 transition-colors shrink-0 ml-0.5"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <span className={`text-[10px] uppercase font-bold tracking-wider ${textSecondary} block pt-1`}>
          Select Predefined Tags
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PREDEFINED_TAGS.map((tag) => {
            const isSelected = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => isSelected ? handleRemoveTag(tag) : handleAddTag(tag)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all`}
                style={
                  isSelected
                    ? {
                        backgroundColor: "#0052ff1a",
                        color: isDark ? "#60a5fa" : "#0052ff",
                        borderColor: "#0052ff40",
                      }
                    : {
                        backgroundColor: isDark ? "rgba(0,0,0,0.15)" : "transparent",
                        borderColor: isDark ? "rgba(255,255,255,0.06)" : "#e2e8f0",
                        color: isDark ? "#9ca3af" : "#4b5563",
                      }
                }
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Custom Tag Input */}
        <div className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            placeholder="Add custom tag..."
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustomTag();
              }
            }}
            className={`flex-1 px-2.5 py-1 rounded text-xs ${bgInput} ${textPrimary} border ${borderCard} focus:outline-none focus:border-[#0052ff] placeholder-[#787b86] font-medium`}
          />
          <button
            type="button"
            onClick={handleAddCustomTag}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${tTokens.accent} transition-colors`}
          >
            Add
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => setRating(star)}
              className={`p-0.5 transition-colors ${
                star <= rating ? "text-[#f5c518]" : "text-[#b2b5be]"
              }`}
            >
              <Star size={14} fill={star <= rating ? "currentColor" : "none"} />
            </button>
          ))}
          <span className={`text-[11px] ${textSecondary} ml-2 font-medium`}>
            {rating === 0 ? "Unrated" : `${rating} Stars`}
          </span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className={`px-3 py-1 rounded-md text-xs ${textSecondary} hover:text-opacity-80 transition-colors`}
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(note, tags, rating)}
          className={`px-3 py-1 rounded-md text-xs font-semibold ${tTokens.accent} transition-colors flex items-center gap-1`}
        >
          <Save size={12} />
          Save Note
        </button>
      </div>
    </div>
  );
});

// ============================================================================
// P&L CALENDAR HEATMAP (THEME AWARE)
// ============================================================================

// The stat cards' donut lived here. It paired every figure with a ring that
// either restated the figure or, for average trade, drew a single value as a
// full circle — a chart that could only ever be full. The strip that replaced
// those cards prints the numbers instead, so nothing renders it any more.

interface PnLCalendarProps {
  trades: CompletedOrder[];
  currency: string;
  selectedDateKey: string;
  onSelectDate: (dateKey: string) => void;
  theme?: JournalTheme;
}

// ============================================================================
// MOBILE CALENDAR — contribution heatmap
// ============================================================================

type HeatDay = {
  key: string;
  date: Date;
  pnl: number;
  count: number;
  wins: number;
  losses: number;
  draws: number;
  future: boolean;
};

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
/** GitHub labels alternate rows; all seven at 13px would collide. */
const LABELLED_ROWS = new Set([1, 3, 5]);

const HeatmapCalendar = memo(function HeatmapCalendar({
  trades,
  currency,
  selectedDateKey,
  onSelectDate,
  weeks = HEATMAP_WEEKS,
  showFocusCard = true,
  labelEveryRow = false,
}: Omit<PnLCalendarProps, "theme"> & {
  weeks?: number;
  showFocusCard?: boolean;
  labelEveryRow?: boolean;
}) {
  const t = useTokens();
  const isDark = !t.card.includes("bg-white");

  /* The window's last day, snapped to the Saturday that ends its week. Weeks
     are the columns, so the anchor has to be week-aligned or every shift would
     re-cut the columns and the whole grid would appear to jitter sideways. */
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (6 - d.getDay()));
    return d;
  });

  const thisWeekEnd = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (6 - d.getDay()));
    return d;
  }, []);

  const shiftWeeks = (n: number) =>
    setAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + n * 7);
      return d > thisWeekEnd ? thisWeekEnd : d;
    });

  const atPresent = anchor.getTime() >= thisWeekEnd.getTime();

  const { columns, maxAbs, greenDays, redDays, netPnL, tradedDays, rangeLabel } = useMemo(() => {
    const byDay = new Map<string, { pnl: number; count: number; wins: number; losses: number; draws: number }>();
    trades.forEach((trade) => {
      const key = getTradeDateKey(trade.expiryTime);
      const curr = byDay.get(key) || { pnl: 0, count: 0, wins: 0, losses: 0, draws: 0 };
      curr.pnl += getTradeNetPnL(trade);
      curr.count += 1;
      if (trade.status === "WIN") curr.wins += 1;
      else if (trade.status === "LOSS") curr.losses += 1;
      else curr.draws += 1;
      byDay.set(key, curr);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(anchor);
    start.setDate(start.getDate() - (weeks * 7 - 1));

    const cols: HeatDay[][] = [];
    let peak = 0;
    let green = 0;
    let red = 0;
    let net = 0;
    let traded = 0;

    for (let w = 0; w < weeks; w++) {
      const col: HeatDay[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = getTradeDateKey(date);
        const hit = byDay.get(key);
        const day: HeatDay = {
          key,
          date,
          pnl: hit?.pnl ?? 0,
          count: hit?.count ?? 0,
          wins: hit?.wins ?? 0,
          losses: hit?.losses ?? 0,
          draws: hit?.draws ?? 0,
          future: date > today,
        };
        if (hit) {
          peak = Math.max(peak, Math.abs(hit.pnl));
          net += hit.pnl;
          traded += 1;
          if (hit.pnl > 0) green += 1;
          else if (hit.pnl < 0) red += 1;
        }
        col.push(day);
      }
      cols.push(col);
    }

    const first = cols[0][0].date;
    const last = cols[cols.length - 1][6].date;
    const label =
      first.getFullYear() === last.getFullYear()
        ? `${MONTH_NAMES[first.getMonth()].slice(0, 3)} – ${MONTH_NAMES[last.getMonth()].slice(0, 3)} ${last.getFullYear()}`
        : `${MONTH_NAMES[first.getMonth()].slice(0, 3)} ${first.getFullYear()} – ${MONTH_NAMES[
            last.getMonth()
          ].slice(0, 3)} ${last.getFullYear()}`;

    return {
      columns: cols,
      maxAbs: peak,
      greenDays: green,
      redDays: red,
      netPnL: net,
      tradedDays: traded,
      rangeLabel: label,
    };
  }, [trades, anchor]);

  /* The day the detail card describes: the journal's selection when it falls in
     the window, otherwise the most recent day that actually traded — so the card
     is never an empty box while there is something in the grid worth reading. */
  const focusDay = useMemo(() => {
    const flat = columns.flat();
    const picked = flat.find((d) => d.key === selectedDateKey && d.count > 0);
    if (picked) return picked;
    for (let i = flat.length - 1; i >= 0; i--) {
      if (flat[i].count > 0) return flat[i];
    }
    return null;
  }, [columns, selectedDateKey]);

  const heatOf = (day: HeatDay) => {
    if (day.count === 0 || maxAbs <= 0) return null;
    const share = Math.min(1, Math.abs(day.pnl) / maxAbs);
    // Quartile, not a linear ramp: a continuous scale on real P&L puts almost
    // every day in the palest band, because one outlier sets the maximum.
    const step = share > 0.66 ? 3 : share > 0.33 ? 2 : share > 0.1 ? 1 : 0;
    const rgb = day.pnl > 0 ? t.upRgb : day.pnl < 0 ? t.downRgb : "113,113,122";
    return `rgba(${rgb},${HEAT_ALPHAS[step]})`;
  };

  const emptyCell = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";

  return (
    <div className="flex flex-col gap-2.5 min-h-0 w-full">
      <div className={`${t.card} border ${t.border} rounded-md p-3 flex flex-col gap-2.5`}>
        {/* Range nav */}
        <div className={`flex items-center justify-between gap-2 pb-2 border-b ${t.border}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              onClick={() => shiftWeeks(-4)}
              aria-label="Earlier weeks"
              className={`p-1 rounded ${t.panel} border ${t.border} ${t.textPrimary} shrink-0`}
            >
              <ChevronLeft size={14} />
            </button>
            <span className={`text-[12px] font-bold ${t.textPrimary} truncate`}>{rangeLabel}</span>
            <button
              onClick={() => shiftWeeks(4)}
              disabled={atPresent}
              aria-label="Later weeks"
              className={`p-1 rounded ${t.panel} border ${t.border} ${t.textPrimary} shrink-0 disabled:opacity-30`}
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <span
            className="text-[11px] font-mono font-bold px-2 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: netPnL >= 0 ? `${t.up}1a` : `${t.down}1a`,
              color: netPnL >= 0 ? t.up : t.down,
            }}
          >
            {formatMoney(netPnL, currency, true)}
          </span>
        </div>

        {/* Month ticks. Absolutely positioned so a three-letter label cannot
            widen the column it sits above and shear the grid out of alignment. */}
        <div className="flex" style={{ gap: HEATMAP_GAP_PX }}>
          <div className="shrink-0" style={{ width: HEATMAP_LABEL_PX }} />
          {columns.map((col, i) => {
            const month = col[0].date.getMonth();
            const prev = i > 0 ? columns[i - 1][0].date.getMonth() : -1;
            return (
              <div key={i} className="flex-1 min-w-0 relative h-3">
                {month !== prev && (
                  <span
                    className={`absolute left-0 top-0 text-[10px] font-bold whitespace-nowrap ${t.textPrimary}`}
                  >
                    {MONTH_NAMES[month].slice(0, 3)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* The grid: seven weekday rows, one column per week. */}
        <div className="flex items-stretch" style={{ gap: HEATMAP_GAP_PX }}>
          <div
            className="shrink-0 flex flex-col justify-between"
            style={{ width: HEATMAP_LABEL_PX, gap: HEATMAP_GAP_PX }}
          >
            {/* Alternating labels are a 13px-square compromise. Once a square is
                big enough to name every row, naming three of seven leaves the
                reader counting rows to place the other four. */}
            {WEEKDAY_INITIALS.map((initial, row) => (
              <span
                key={row}
                className={`flex-1 flex items-center text-[9px] font-semibold ${t.textSecondary}`}
              >
                {labelEveryRow || LABELLED_ROWS.has(row) ? initial : ""}
              </span>
            ))}
          </div>

          {columns.map((col, i) => (
            /* Alternate months get a band behind their columns.
            
               The month ticks above name the boundaries, but a run of identical
               squares gives the eye nothing to break on, so placing a square
               meant tracking up to a label and back down. A background tint is
               the one way to draw that boundary for free: it paints behind the
               squares and through the gaps between them, and unlike a margin or
               a border it cannot change a single column's width — which is
               exactly how the last attempt at this pushed the grid out of its
               own card and over the panel below. */
            <div
              key={i}
              className="flex-1 min-w-0 flex flex-col"
              style={{
                gap: HEATMAP_GAP_PX,
                background:
                  col[0].date.getMonth() % 2 === 1
                    ? isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.065)"
                    : undefined,
              }}
            >
              {col.map((day) => {
                const heat = heatOf(day);
                const isSelected = day.key === selectedDateKey;
                const isFocus = focusDay?.key === day.key;
                return (
                  <button
                    key={day.key}
                    type="button"
                    disabled={day.count === 0}
                    onClick={() => onSelectDate(day.key)}
                    aria-label={`${day.date.toDateString()}${
                      day.count ? `, ${day.count} trades, net ${formatMoney(day.pnl, currency, true)}` : ", no trades"
                    }`}
                    title={
                      day.future
                        ? undefined
                        : `${day.date.toLocaleDateString(undefined, {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })}\n${
                            day.count
                              ? `${day.count} trade${day.count === 1 ? "" : "s"} · ${day.wins}W / ${day.losses}L · ${formatMoney(day.pnl, currency)}`
                              : "No trades"
                          }`
                    }
                    className={`w-full aspect-square rounded-[3px] transition-colors ${
                      day.count > 0 ? "cursor-pointer" : "cursor-default"
                    } ${isSelected || isFocus ? "ring-1 ring-offset-0" : ""}`}
                    style={{
                      background: day.future ? "transparent" : heat ?? emptyCell,
                      boxShadow: isSelected
                        ? `0 0 0 1.5px ${isDark ? "#fff" : "#000"}`
                        : isFocus
                        ? `0 0 0 1.5px ${isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)"}`
                        : undefined,
                    }}
                  >
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend, in GitHub's words rather than a sentence that truncates. */}
        <div className={`flex items-center justify-between text-[9.5px] ${t.textSecondary}`}>
          <span className="tabular-nums">
            {tradedDays} active {tradedDays === 1 ? "day" : "days"} · {greenDays}W / {redDays}L
          </span>
          <span className="flex items-center gap-[3px] shrink-0">
            <span>Loss</span>
            {[...HEAT_ALPHAS].reverse().map((a) => (
              <span
                key={`d${a}`}
                className="w-2.5 h-2.5 rounded-[2px]"
                style={{ background: `rgba(${t.downRgb},${a})` }}
              />
            ))}
            <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: emptyCell }} />
            {HEAT_ALPHAS.map((a) => (
              <span
                key={`u${a}`}
                className="w-2.5 h-2.5 rounded-[2px]"
                style={{ background: `rgba(${t.upRgb},${a})` }}
              />
            ))}
            <span>Win</span>
          </span>
        </div>
      </div>

      {/* Detail card. This is where the figures the squares cannot hold are
          printed — at full panel width, so nothing ellipsises. The desktop
          turns it off: the pane beside the calendar already names the selected
          day and lists its trades, and saying it twice on one screen is the
          redundancy the four stat donuts were removed for. */}
      {showFocusCard && (
      <div className={`${t.card} border ${t.border} rounded-md px-3 py-2.5`}>
        {focusDay ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-[12px] font-bold ${t.textPrimary} truncate`}>
                {focusDay.date.toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span
                className="text-[15px] font-mono font-extrabold tabular-nums shrink-0"
                style={{ color: focusDay.pnl >= 0 ? t.up : t.down }}
              >
                {formatMoney(focusDay.pnl, currency)}
              </span>
            </div>
            <div className={`flex items-center gap-3 text-[11px] ${t.textSecondary}`}>
              <span className="tabular-nums">
                {focusDay.count} {focusDay.count === 1 ? "trade" : "trades"}
              </span>
              <span className="tabular-nums" style={{ color: t.up }}>
                {focusDay.wins}W
              </span>
              <span className="tabular-nums" style={{ color: t.down }}>
                {focusDay.losses}L
              </span>
              {focusDay.draws > 0 && <span className="tabular-nums">{focusDay.draws}D</span>}
            </div>
            <div
              className={`h-[5px] w-full rounded-full overflow-hidden flex ${
                isDark ? "bg-white/[0.13]" : "bg-black/[0.13]"
              }`}
            >
              {(() => {
                const decided = focusDay.wins + focusDay.losses;
                const share = decided > 0 ? (focusDay.wins / decided) * 100 : 0;
                return (
                  <>
                    {share > 0 && <span style={{ width: `${share}%`, background: t.up }} />}
                    {share < 100 && <span style={{ width: `${100 - share}%`, background: t.down }} />}
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <p className={`text-[11px] ${t.textSecondary} text-center py-1`}>
            No trades in this range — tap ‹ to look further back.
          </p>
        )}
      </div>
      )}
    </div>
  );
});


/**
 * This week against last week, day by day.
 *
 * It was the week split at noon — seven days, an AM bar and a PM bar each,
 * over every trade on record. That answered "which half of which day costs me"
 * and it answered it about a year of trading at once, which is a fact about a
 * habit rather than about how the week went. A journal is read on a Friday to
 * find out whether this week was better than the last one, and the chart on it
 * could not say.
 *
 * So the pair of bars is the same week, twice. Solid is the seven days ending
 * today; faded is the seven before it, on the same weekday, so Tuesday is
 * compared with Tuesday rather than with a number seven bars away.
 *
 * Height is the *size* of the result and colour is its direction. A column
 * chart rising from a floor cannot show a negative below it without becoming a
 * different chart, and magnitude-plus-colour loses nothing: the figure inside
 * each bar carries the sign, and the eye reads "how much" from the height
 * either way.
 *
 * It ignores the page's period on purpose. Every other figure on this page
 * obeys the period control; this one is a fixed two-week window, because a
 * comparison you can set to "Today" is a comparison with nothing in it.
 */
/* The bar row's height in pixels, not a fraction of whatever is left. A figure
   printed inside a bar can only be shown when the bar is tall enough to hold
   it, and "tall enough" is a pixel question — percentages of an unknown box
   cannot answer it. */
const BARS_PX = 200;
/* Below this a rotated figure is taller than the bar it is in. */
const LABEL_FITS_PX = 46;
/* What the three label rows under the bars come to: this/last, the weekday,
   the change. Subtracted from a measured row to leave the bars their share. */
const LABELS_PX = 74;
/* The card's own furniture around the bar row: its title line, the rule under
   it, and the padding. */
const CARD_CHROME_PX = 62;

/**
 * How tall the two-column row below the controls is allowed to get.
 *
 * The ceiling sits on the row, not on the panels inside it, and that is the
 * whole point. Capping each panel separately made them the same height and
 * misaligned their bottoms — the chart has a calendar above it and the entries
 * have a stat strip, so two boxes of equal height starting at different
 * heights end at different heights, and the pair reads as broken. Stretched to
 * a bounded row, they start where they start, end on the same line, and each
 * takes whatever its column has left.
 *
 * Bounded because `flex-1` alone means "as tall as the window happens to be",
 * which on a tall monitor made the bars 344px and the entries a 900px wall of
 * cards with a scrollbar inside a page that also scrolls. Neither gets clearer
 * at that size — the bars just push the figures inside them far enough apart
 * that comparing two of them takes eye travel.
 */
const ROW_MAX_PX = 720;
/* A backstop, not the working limit: the row's ceiling is what normally
   decides the bars' height. This only bites in a layout where the calendar
   above them collapses. */
const BARS_MAX_PX = 300;
/* Below this the chart stops saying anything, however short the window. */
const BARS_MIN_PX = 120;
const MS_DAY = 86_400_000;

const WeekCompare = memo(function WeekCompare({
  trades,
  currency,
  highlightDay = null,
  fill = false,
}: {
  trades: CompletedOrder[];
  currency: string;
  /** 0–6 for the weekday of the selected day, or null for none. */
  highlightDay?: number | null;
  /** Grow the bars into whatever height the column has left, rather than
      standing at a fixed 200px with empty panel underneath. */
  fill?: boolean;
}) {
  const t = useTokens();
  const isDark = !t.card.includes("bg-white");
  const names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const { columns, span } = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    /* Dates are stepped by constructing them rather than by subtracting
       milliseconds, so a fortnight crossing a daylight-saving change is still
       fourteen midnights wide. The key is the local calendar day, which is
       also what the rest of this file groups trades by. */
    const cols = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
      const before = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 7);
      return {
        weekday: day.getDay(),
        name: names[day.getDay()],
        curKey: getTradeDateKey(day),
        prevKey: getTradeDateKey(before),
        cur: { pnl: 0, trades: 0 },
        prev: { pnl: 0, trades: 0 },
      };
    });

    const byKey = new Map<string, { col: number; which: "cur" | "prev" }>();
    cols.forEach((c, i) => {
      byKey.set(c.curKey, { col: i, which: "cur" });
      byKey.set(c.prevKey, { col: i, which: "prev" });
    });

    for (const trade of trades) {
      const hit = byKey.get(getTradeDateKey(trade.expiryTime));
      if (!hit) continue;
      const bucket = cols[hit.col][hit.which];
      bucket.pnl += getTradeNetPnL(trade);
      bucket.trades += 1;
    }

    const day = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const first = new Date(today.getTime() - 6 * MS_DAY);
    return { columns: cols, span: `${day(first)} – ${day(today)} vs the 7 days before` };
  }, [trades]);

  const peak = Math.max(
    1e-9,
    ...columns.flatMap((c) => [Math.abs(c.cur.pnl), Math.abs(c.prev.pnl)])
  );

  /* Grown one bar at a time on arrival. Inline, because `styles/theme.css`
     carries an unlayered `* { transition: background-color, border-color,
     color }` that beats every Tailwind transition utility and resets
     transition-property to those three — so a class on `height` does nothing
     in this app. Dropped under prefers-reduced-motion. */
  const [grown, setGrown] = useState(false);
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (reduceMotion) return setGrown(true);
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  const [hover, setHover] = useState<{ col: number; which: 0 | 1 } | null>(null);

  /* Measured, not assumed. The bars are drawn in pixels — a figure can only be
     printed inside a bar tall enough to hold it, and "tall enough" is a pixel
     question that a percentage of an unknown box cannot answer. So when this
     card is stretched to fill a column, the row reports its own height and the
     bars are computed against that. */
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [rowPx, setRowPx] = useState(BARS_PX + LABELS_PX);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !fill) return;
    const ro = new ResizeObserver(() => setRowPx(el.clientHeight));
    ro.observe(el);
    setRowPx(el.clientHeight);
    return () => ro.disconnect();
  }, [fill]);
  /* Clamped, not merely grown.
  
     Filling the column made the bars 344px on a laptop, which is a chart that
     has stopped being read and started being stared at: seven days of P&L do
     not become clearer at half the height of the screen, they just push the
     figures inside the bars far enough apart that the eye has to travel to
     compare two of them. The floor keeps it legible on a short window; the
     ceiling keeps it a chart. */
  const barsPx = fill
    ? Math.min(BARS_MAX_PX, Math.max(BARS_MIN_PX, rowPx - LABELS_PX))
    : BARS_PX;

  return (
    <div
      className={`${t.card} border ${t.border} rounded-md px-3 py-2.5 flex flex-col gap-2 ${
        fill ? "min-h-0 flex-1" : "shrink-0"
      }`}
    >
      <div className={`flex items-center justify-between gap-2 text-xs border-b ${t.border} pb-2`}>
        <span className={`font-bold ${t.textPrimary} text-[11px]`}>This week vs last week</span>
        <span className={`text-[10px] ${t.textSecondary} truncate`}>{span}</span>
      </div>

      <div
        ref={rowRef}
        className={`relative flex items-end gap-1.5 pt-2 pb-1 ${fill ? "min-h-0 flex-1" : ""}`}
        style={fill ? undefined : { height: BARS_PX + LABELS_PX }}
      >
        {columns.map((col, i) => {
          const dimmed = highlightDay !== null && highlightDay !== col.weekday;
          const halves = [col.cur, col.prev] as const;
          return (
            <div
              key={i}
              className="relative z-10 flex-1 min-w-0 flex flex-col items-center gap-1 h-full"
              style={{
                opacity: dimmed ? 0.3 : 1,
                transition: reduceMotion ? undefined : "opacity 260ms ease",
              }}
            >
              <div className="w-full flex items-end justify-center gap-2 shrink-0" style={{ height: barsPx }}>
                {halves.map((half, which) => {
                  const idle = half.trades === 0;
                  const up = half.pnl >= 0;
                  const colour = up ? t.up : t.down;
                  const share = Math.abs(half.pnl) / peak;
                  const barPx = idle ? 0 : Math.max(6, share * barsPx * 0.94);
                  const height = grown && !idle ? `${barPx}px` : "0px";
                  const isHovered = hover?.col === i && hover?.which === which;
                  /* Last week is the same bar, faded — the same relationship
                     the dashboard's trend chart draws with a dashed line. Two
                     full-strength bars per day would be two readings with
                     equal claim on the eye, and only one of them is now. */
                  const strength = which === 0 ? (isHovered ? 1 : 0.92) : isHovered ? 0.62 : 0.4;
                  return (
                    <div
                      key={which}
                      className="flex-1 min-w-0 max-w-[30px] h-full flex flex-col items-center justify-end"
                      onMouseEnter={() => setHover({ col: i, which: which as 0 | 1 })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <span
                        /* `rounded-t` and not `rounded-full`. A pill is a
                           shape from another product — nothing else in the
                           terminal is one — and rounding the foot of a bar
                           lifts it off the baseline it is measured from. */
                        className="w-full rounded-t-md flex items-center justify-center overflow-hidden"
                        style={{
                          height,
                          background: colour,
                          opacity: strength,
                          boxShadow: isHovered
                            ? `0 0 0 1.5px ${isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.4)"}`
                            : undefined,
                          transition: reduceMotion
                            ? undefined
                            : `height 620ms cubic-bezier(0.22, 1, 0.36, 1) ${(i * 2 + which) * 55}ms, box-shadow 180ms ease, opacity 180ms ease`,
                        }}
                      >
                        {/* The figure, standing up inside its own bar. Above
                            it, two labels centred on bars 20px apart collide
                            on any real number; inside, it is bounded by the
                            thing it describes. A bar too short to hold it does
                            not print it — an ellipsised figure is worse than
                            none, and hovering covers those. */}
                        {!idle && barPx >= LABEL_FITS_PX && (
                          <span
                            className="text-[9.5px] font-bold tabular-nums whitespace-nowrap"
                            style={{
                              writingMode: "vertical-rl",
                              transform: "rotate(180deg)",
                              color: "rgba(255,255,255,0.96)",
                              textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                              opacity: grown ? 1 : 0,
                              transition: reduceMotion
                                ? undefined
                                : `opacity 380ms ease ${(i * 2 + which) * 55 + 420}ms`,
                            }}
                          >
                            {formatMoney(half.pnl, currency)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex w-full justify-center gap-2 shrink-0">
                {(["THIS", "LAST"] as const).map((label, which) => (
                  <span
                    key={label}
                    className={`flex-1 min-w-0 max-w-[26px] text-center text-[8.5px] font-semibold tracking-wide ${
                      hover?.col === i && hover?.which === which ? t.textPrimary : t.textSecondary
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <span
                className={`text-[10px] font-bold tracking-wide shrink-0 ${
                  highlightDay === col.weekday ? t.textPrimary : t.textSecondary
                }`}
              >
                {col.name}
              </span>
              {/* The change, where a whole column's width is available for it.
                  A day's net on its own is already printed inside its bar; the
                  number this chart exists to produce is the difference. */}
              {(() => {
                const any = col.cur.trades + col.prev.trades > 0;
                const delta = col.cur.pnl - col.prev.pnl;
                return (
                  <span
                    className="text-[9.5px] font-bold tabular-nums shrink-0 leading-none"
                    style={{
                      color: any ? (delta >= 0 ? t.up : t.down) : undefined,
                      opacity: grown ? 1 : 0,
                      transition: reduceMotion ? undefined : `opacity 420ms ease ${i * 55 + 300}ms`,
                    }}
                  >
                    <span className={any ? "" : t.textSecondary}>
                      {any ? formatMoney(delta, currency) : "—"}
                    </span>
                  </span>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const TradeJournal = memo(function TradeJournal({
  trades,
  currency = "USDT",
  theme = "dark",
  onSaveNote,
  onClose,
}: TradeJournalProps) {
  const t = useTranslations("binary_components");
  const tCommon = useTranslations("common");
  const isMobile = useIsMobile();
  const [notes, setNotes] = useState<Record<string, TradeNote>>(() => loadNotes());
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const firstName = useUserStore((st) => st.user?.firstName) || "";
  const [timeframe, setTimeframe] = useState<TimeframeFilter>("overall");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getTradeDateKey(d);
  });
  const [endDate, setEndDate] = useState<string>(() => getTradeDateKey(new Date()));

  const resolvedJournalTheme: JournalTheme = (theme === "light" || theme === "navy" || theme === "dark") ? theme : "dark";
  const tTokens = TOKENS[resolvedJournalTheme];
  const isDark = resolvedJournalTheme !== "light";

  const bgCard = tTokens.card;
  const bgPanel = tTokens.panel;
  const borderCard = tTokens.border;
  const textPrimary = tTokens.textPrimary;
  const textSecondary = tTokens.textSecondary;

  const handleSaveNote = useCallback(
    (orderId: string, note: string, tags: string[], rating: number) => {
      const now = new Date();
      const existingNote = notes[orderId];

      const updatedNote: TradeNote = {
        orderId,
        note,
        tags,
        rating,
        createdAt: existingNote?.createdAt || now,
        updatedAt: now,
      };

      const updatedNotes = { ...notes, [orderId]: updatedNote };
      setNotes(updatedNotes);
      saveNotes(updatedNotes);
      setEditingTradeId(null);

      if (onSaveNote) onSaveNote(orderId, note, tags, rating);
    },
    [notes, onSaveNote]
  );

  const timeframeFilteredTrades = useMemo(() => {
    const now = new Date();
    const todayKey = getTradeDateKey(now);

    return trades.filter((trade) => {
      const tradeKey = getTradeDateKey(trade.expiryTime);
      const tDate = new Date(trade.expiryTime);

      if (timeframe === "day") return tradeKey === todayKey;
      if (timeframe === "week") {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return tDate >= oneWeekAgo;
      }
      if (timeframe === "month") {
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return tDate >= oneMonthAgo;
      }
      if (timeframe === "custom") {
        const start = new Date(startDate + "T00:00:00");
        const end = new Date(endDate + "T23:59:59");
        return tDate >= start && tDate <= end;
      }
      return true; // overall
    });
  }, [trades, timeframe, startDate, endDate]);

  const handleExportCSV = useCallback(() => {
    if (timeframeFilteredTrades.length === 0) return;
    const timestamp = new Date().toISOString().split("T")[0];
    const csv = generateCSV(timeframeFilteredTrades);
    downloadFile(csv, `trade-journal-${timeframe}-${timestamp}.csv`, "text/csv;charset=utf-8;");
  }, [timeframeFilteredTrades, timeframe]);

  const searchFilteredTrades = useMemo(() => {
    return timeframeFilteredTrades.filter((trade) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const note = notes[trade.id];
        const matchesSymbol = trade.symbol.toLowerCase().includes(query);
        const matchesNote = note?.note.toLowerCase().includes(query);
        const matchesTags = note?.tags.some((tag) => tag.toLowerCase().includes(query));
        if (!matchesSymbol && !matchesNote && !matchesTags) return false;
      }
      if (filterTag) {
        const note = notes[trade.id];
        if (!note?.tags.includes(filterTag)) return false;
      }
      return true;
    });
  }, [timeframeFilteredTrades, searchQuery, filterTag, notes]);

  const journalMetrics = useMemo(() => {
    let totalPnL = 0;
    let winCount = 0;
    let lossCount = 0;
    let drawCount = 0;
    // Gross halves, so the P&L cards can show what the net is the difference of.
    let grossWon = 0;
    let grossLost = 0;

    timeframeFilteredTrades.forEach((t) => {
      const pnl = getTradeNetPnL(t);
      totalPnL += pnl;
      if (pnl > 0) grossWon += pnl;
      else grossLost += Math.abs(pnl);
      if (t.status === "WIN") winCount++;
      else if (t.status === "LOSS") lossCount++;
      else drawCount++;
    });

    const totalTrades = timeframeFilteredTrades.length;
    const validTrades = winCount + lossCount;
    const winRate = validTrades > 0 ? (winCount / validTrades) * 100 : 0;
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    return { totalPnL, winCount, lossCount, drawCount, totalTrades, winRate, avgPnL, grossWon, grossLost };
  }, [timeframeFilteredTrades]);

  const dateGroups = useMemo(() => {
    const map = new Map<string, CompletedOrder[]>();
    searchFilteredTrades.forEach((trade) => {
      const key = getTradeDateKey(trade.expiryTime);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(trade);
    });

    const groups: GroupedTrades[] = [];
    map.forEach((list, key) => {
      let groupPnL = 0;
      let wins = 0;
      let losses = 0;
      let draws = 0;
      list.forEach((t) => {
        const pnl = getTradeNetPnL(t);
        groupPnL += pnl;
        if (t.status === "WIN") wins++;
        else if (t.status === "LOSS") losses++;
        else draws++;
      });
      const dObj = new Date(list[0].expiryTime);
      const formattedDate = dObj.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const validCount = wins + losses;
      groups.push({
        dateStr: key,
        formattedDate,
        dateObj: dObj,
        trades: list.sort((a, b) => new Date(b.expiryTime).getTime() - new Date(a.expiryTime).getTime()),
        totalPnL: groupPnL,
        winCount: wins,
        lossCount: losses,
        winRate: validCount > 0 ? (wins / validCount) * 100 : 0,
      });
    });

    return groups.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
  }, [searchFilteredTrades]);

  const allTags = useMemo(
    () => Array.from(new Set(Object.values(notes).flatMap((n) => n.tags))),
    [notes]
  );

  const [visibleRows, setVisibleRows] = useState(LOG_PAGE_SIZE);
  const logSentinelRef = useRef<HTMLDivElement | null>(null);

  const totalLogRows = useMemo(
    () => dateGroups.reduce((n, g) => n + g.trades.length, 0),
    [dateGroups]
  );

  /* Walks the groups accumulating trades until the budget runs out, so a single
     666-trade day is truncated rather than mounted whole. Group headers keep the
     real counts via fullCount. */
  const visibleGroups = useMemo(() => {
    const out: GroupedTrades[] = [];
    let left = visibleRows;
    for (const g of dateGroups) {
      if (left <= 0) break;
      if (g.trades.length <= left) {
        out.push({ ...g, fullCount: g.trades.length });
      } else {
        out.push({ ...g, trades: g.trades.slice(0, left), fullCount: g.trades.length });
      }
      left -= g.trades.length;
    }
    return out;
  }, [dateGroups, visibleRows]);

  // Any change of filter, range or search restarts the list.
  useEffect(() => {
    setVisibleRows(LOG_PAGE_SIZE);
  }, [timeframe, startDate, endDate, searchQuery, filterTag]);

  useEffect(() => {
    if (visibleRows >= totalLogRows) return;
    const el = logSentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleRows((v) => Math.min(v + LOG_PAGE_SIZE, totalLogRows));
        }
      },
      { rootMargin: "260px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visibleRows, totalLogRows]);

  /* The dates follow the chips.
  
     They were independent state, so picking "Last 7 days" left two fields
     showing whatever range they happened to hold — the same contradiction as
     before, now pointing the other way: the chip says one thing, the dates
     beside it say another, and only one of them is filtering the page. A period
     *is* a range, so choosing one writes it into the fields, and the pair
     always describe the same thing.
     
     Custom is exempt, and so is a day picked off the calendar (which selects
     Custom), because those are the cases where the reader owns the dates. */
  useEffect(() => {
    if (timeframe === "custom") return;

    const now = new Date();
    const end = getTradeDateKey(now);
    let start = end;

    if (timeframe === "week" || timeframe === "month") {
      const from = new Date(now);
      from.setDate(from.getDate() - (timeframe === "week" ? 7 : 30));
      start = getTradeDateKey(from);
    } else if (timeframe === "overall") {
      const times = trades
        .map((t) => new Date(t.expiryTime).getTime())
        .filter((n) => Number.isFinite(n));
      start = times.length ? getTradeDateKey(new Date(Math.min(...times))) : end;
    }

    setStartDate(start);
    setEndDate(end);
  }, [timeframe, trades]);

  /* The right column ends where the left one does.
  
     The grid stretched both to the row's height, and the row was the viewport.
     On a tall window the left column runs out of content at its natural height
     while the log keeps going to the bottom of the screen, so the page reads as
     one short column beside an endless list. There is no CSS for "be as tall as
     that sibling" when the sibling is sized by its own content, so the left is
     measured and the right is given its height; the log already scrolls inside
     itself, so nothing is lost. */
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const [leftColHeight, setLeftColHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = leftColRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setLeftColHeight(el.getBoundingClientRect().height || null);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSelectCalendarDate = useCallback((dateKey: string) => {
    setStartDate(dateKey);
    setEndDate(dateKey);
    setTimeframe("custom");
  }, []);

  /* Clicking a day already narrowed the range to that one date, so the log
     beside the calendar was showing the right trades — it just never said so.
     Its header read "My Journal Logs (2026-08-04 to 2026-08-04)", which is a
     filter expression, not the name of a day, and there was no way back to the
     whole account except finding the period chips again. */
  const selectedDayKey = timeframe === "custom" && startDate === endDate ? startDate : null;

  const selectedDayLabel = useMemo(() => {
    if (!selectedDayKey) return null;
    const d = new Date(selectedDayKey + "T00:00:00");
    if (Number.isNaN(d.getTime())) return selectedDayKey;
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [selectedDayKey]);

  return (
    <TokenCtx.Provider value={tTokens}>
      <div
        className="flex-1 flex flex-col h-full min-h-0 w-full mx-auto space-y-2.5 overflow-y-auto lg:overflow-hidden sf-pro-selectors"
        style={{ maxWidth: MAX_CONTENT_PX }}
      >
      {/* The same header the dashboard wears — see ./page-chrome. Two tabs of
          one panel had two different hats: this page's name sat in the
          overlay's chrome bar while its period and export controls were buried
          in the filter bar halfway down. Both are up here now, in the pills the
          dashboard uses, and the chrome bar is gone. */}
      <PageHeader title="Journal" name={firstName}>
        <Popover
          ariaLabel="Change the period"
          icon={<CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />}
          label={JOURNAL_PERIODS.find((p) => p.id === timeframe)?.label ?? "All time"}
          panelWidth={216}
        >
          {(close) => (
            <div className="py-1">
              {JOURNAL_PERIODS.map((p) => (
                <MenuItem
                  key={p.id}
                  selected={timeframe === p.id}
                  onClick={() => {
                    setTimeframe(p.id);
                    close();
                  }}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-[11px] text-muted-foreground">{p.note}</span>
                  </span>
                </MenuItem>
              ))}
            </div>
          )}
        </Popover>

        {/* A button, not a menu: the journal exports one format. The dashboard's
            Export is a dropdown because it offers CSV and Excel; wearing the
            same pill with a chevron that opens a menu of one would be the
            control lying about what it does. */}
        <button
          type="button"
          onClick={handleExportCSV}
          disabled={timeframeFilteredTrades.length === 0}
          className={`${CONTROL_BRAND} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <Download className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Export CSV</span>
          <span className="sm:hidden">CSV</span>
        </button>

        {onClose && <CloseButton onClose={onClose} />}
      </PageHeader>

      {/* One row of three controls, in the header's own pills.
      
          It was nine controls in a bordered box: five period chips, a search
          box, a tag `<select>`, and a From/To pair on a second line that was
          always shown whatever period was chosen — so a page reading "All
          time" sat under two dates saying 30 Jul to 29 Aug, and nothing said
          which one it was obeying. The period and the export are in the header
          now. What is left is the three things that narrow the list you are
          looking at, and they are drawn the way the header's controls are
          rather than in a second, smaller visual language.
      
          The dates went into a menu of their own for the same reason the
          period did: a date pair is a control you use rarely and read never,
          and it was taking a whole row of the page to say nothing most of the
          time. The pill states the range when one is set, which is the only
          time it has anything to say. Typing in either field still selects
          Custom on its own — the period pill is a label for what the dates are
          already saying, not a mode you have to enter first. */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        {/* The window on the left, the narrowing on the right. They are two
            different kinds of control: one decides which trades exist on this
            page at all, the other decides which of those you are looking at,
            and putting them at opposite ends says so without a label. */}
        {/* Both dates, on the page, always.
        
            They spent one round inside a dropdown, which was wrong twice. A
            date range is two values and a menu shows one label, so the pill
            had to summarise what the fields already say — and this control
            sits at the left edge of the page, where a panel anchored to its
            button's right edge opens leftwards, off the screen and under the
            terminal's rail. A field you have to open a menu to reach, which
            then opens where you cannot see it, is not a control.
        
            Typing in either one selects Custom on its own, so the period pill
            in the header stays a label for what these are already saying
            rather than a mode you have to enter first. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            From
          </span>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setTimeframe("custom");
            }}
            className="h-9 rounded-md border border-field-border bg-field px-2 text-[12.5px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            To
          </span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setTimeframe("custom");
            }}
            className="h-9 rounded-md border border-field-border bg-field px-2 text-[12.5px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {timeframe === "custom" && (
            <button
              type="button"
              onClick={() => setTimeframe("overall")}
              className="ml-0.5 text-[12px] font-semibold text-brand hover:underline"
            >
              All time
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[300px]">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes, tags or markets"
            className="h-9 w-full rounded-md border border-field-border bg-field pl-8 pr-8 text-[12px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 sm:text-[13px]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <Popover
            ariaLabel="Filter by tag"
            icon={<Tag className="h-4 w-4 shrink-0 text-muted-foreground" />}
            label={filterTag ?? "All tags"}
            badge={filterTag ? 1 : undefined}
            panelWidth={200}
          >
            {(close) => (
              <div className="max-h-[320px] overflow-y-auto py-1">
                <MenuItem
                  selected={!filterTag}
                  onClick={() => {
                    setFilterTag(null);
                    close();
                  }}
                >
                  All tags
                </MenuItem>
                {allTags.map((tag) => (
                  <MenuItem
                    key={tag}
                    selected={filterTag === tag}
                    onClick={() => {
                      setFilterTag(tag);
                      close();
                    }}
                  >
                    {tag}
                  </MenuItem>
                ))}
              </div>
            )}
          </Popover>
        )}
        {(searchQuery || filterTag) && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setFilterTag(null);
            }}
            className="text-[12px] font-semibold text-brand hover:underline"
          >
            Clear
          </button>
        )}
        </div>
      </div>

      {/* Dual Column Grid */}
      {/* `items-stretch`, not `items-start`.
      
          The two columns were aligned to the top of the row and sized to their
          own content, so whichever was shorter left a band of empty panel
          under it — usually the left one, whose calendar and chart are both
          fixed shapes. Stretched, each column is the height of the row and the
          growing thing inside it takes the slack: the entries list on the
          right, the week chart's bars on the left. */}
      <div
        className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:items-stretch lg:flex-1 lg:min-h-0 lg:overflow-hidden"
        style={{ maxHeight: ROW_MAX_PX }}
      >

        {/* Left Column: Calendar + Insights (7 COLS - BALANCED EXPANSION) */}
        <div ref={leftColRef} className="lg:col-span-7 flex flex-col min-h-0 lg:overflow-hidden">
          {/* One calendar, at two spans.
          
              The desktop had its own: a month grid of 110px cells, six rows
              deep. Every empty day cost as much room as a heavy one, so a month
              with nine active days spent most of its height drawing boxes with
              a number in the corner — and at 42 cells the eye has to *search*
              for the ones that matter rather than being shown them.
              
              The heatmap the phone already used answers the question the page
              is asking: where did the damage happen. Colour is the whole
              signal, so heavy days find you. It also covers half a year in less
              height than one month took, which is the difference between
              checking a month and seeing a habit. */}
          <HeatmapCalendar
            trades={trades}
            currency={currency}
            selectedDateKey={timeframe === "custom" ? startDate : ""}
            onSelectDate={handleSelectCalendarDate}
            weeks={isMobile ? HEATMAP_WEEKS : HEATMAP_WEEKS_DESKTOP}
            showFocusCard={isMobile}
            labelEveryRow={!isMobile}
          />

          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            {/* Not `timeframeFilteredTrades`: picking a day narrows that to one
                date, which is the one input this panel cannot say anything
                from. It reads the range and draws the selection instead. */}
            {/* The whole book, not the filtered set. This chart's window is
                fixed at two weeks, so feeding it a period-filtered list would
                empty it the moment somebody chose Today. */}
            <WeekCompare
              fill
              trades={trades}
              currency={currency}
              highlightDay={
                selectedDayKey ? new Date(selectedDayKey + "T00:00:00").getDay() : null
              }
            />
          </div>
        </div>

        {/* Right Column: Stat Cards + Trade Journal Logs (5 COLS - SPACIOUS LOGS) */}
        <div
          className="lg:col-span-5 flex flex-col gap-2.5 min-h-0 lg:overflow-hidden"
          style={!isMobile && leftColHeight ? { height: leftColHeight } : undefined}
        >
          
          {/* The account, in one line.
          
              It was four cards, each pairing a figure with a donut. Three of the
              donuts encoded something the figure beside them already said, and
              the fourth — average trade — had a single value, so it drew a full
              ring that could only ever be full: a chart of nothing, in the
              colour of loss. Four rings also cost about 180px of the column's
              height, which is height the day you selected needs.
              
              A row of figures says the same in one band. Colour is on the two
              numbers where up and down mean something, and nowhere else. */}
          <div
            className={`${bgCard} rounded-lg border ${borderCard} shrink-0 grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 ${
              isDark ? "divide-white/[0.07]" : "divide-zinc-200"
            }`}
          >
            {[
              {
                label: "Net P/L",
                value: formatMoney(journalMetrics.totalPnL, currency),
                colour: journalMetrics.totalPnL >= 0 ? tTokens.up : tTokens.down,
                sub: `${journalMetrics.winCount}W · ${journalMetrics.lossCount}L`,
              },
              {
                label: "Win rate",
                value: `${journalMetrics.winRate.toFixed(1)}%`,
                sub: `of ${journalMetrics.winCount + journalMetrics.lossCount} settled`,
              },
              {
                label: "Trades",
                value: journalMetrics.totalTrades.toLocaleString(),
                sub: `${dateGroups.length} active ${dateGroups.length === 1 ? "day" : "days"}`,
              },
              {
                label: "Avg / trade",
                value: formatMoney(journalMetrics.avgPnL, currency),
                colour: journalMetrics.avgPnL >= 0 ? tTokens.up : tTokens.down,
                sub: "per settled trade",
              },
            ].map((stat) => (
              <div key={stat.label} className="min-w-0 px-3 py-2.5">
                <div className={`text-[10px] font-semibold uppercase tracking-wider ${textSecondary} truncate`}>
                  {stat.label}
                </div>
                <div
                  className={`mt-1 text-[17px] font-bold font-mono tabular-nums truncate ${stat.colour ? "" : textPrimary}`}
                  style={stat.colour ? { color: stat.colour } : undefined}
                >
                  {stat.value}
                </div>
                <div className={`mt-0.5 text-[10.5px] ${textSecondary} truncate`}>{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Trade Journal Logs */}
          {/* Fills what its column has left and scrolls past it. The bound is
              on the row — see ROW_MAX_PX — so this ends level with the chart
              opposite rather than at a height of its own. */}
          <div
            className={`${bgCard} rounded-md overflow-hidden flex-1 flex flex-col min-h-0`}
          >
            <div className={`px-3 py-2 border-b ${borderCard} ${bgPanel} flex items-center justify-between gap-2 shrink-0`}>
              <div className="flex items-center gap-2 min-w-0">
                <CalendarIcon size={14} className="text-[#0052ff] shrink-0" />
                <span className={`text-xs font-bold ${textPrimary} truncate`}>
                  {selectedDayLabel ?? (isMobile ? "Journal Logs" : "All journal entries")}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* The day's figures, in the header that already names the day.
                
                    A selected day printed its name here and then again on the
                    group banner directly beneath — two headers eight pixels
                    apart for one day, the second adding W/L and a net that had
                    nowhere else to be. They are one row now, and the banner
                    below is dropped for a single day. */}
                {selectedDayKey && dateGroups.length === 1 ? (
                  <span className="flex items-center gap-2 font-mono text-[11px]">
                    <span style={{ color: tTokens.up }}>{dateGroups[0].winCount}W</span>
                    <span style={{ color: tTokens.down }}>{dateGroups[0].lossCount}L</span>
                    <span className={textSecondary}>{dateGroups[0].winRate.toFixed(0)}% WR</span>
                    <span
                      className="font-bold"
                      style={{ color: dateGroups[0].totalPnL >= 0 ? tTokens.up : tTokens.down }}
                    >
                      {formatMoney(dateGroups[0].totalPnL, currency)}
                    </span>
                  </span>
                ) : (
                  <span className={`text-[11px] ${textSecondary} font-mono`}>
                    {(() => {
                      const n = dateGroups.reduce((acc, g) => acc + g.trades.length, 0);
                      return `${n.toLocaleString()} ${n === 1 ? "trade" : "trades"}`;
                    })()}
                  </span>
                )}
                {/* The way back. A day you can select and not deselect is a trap;
                    the period chips at the top are the only other exit and they
                    are a scroll away once the log is open. */}
                {selectedDayKey && (
                  <button
                    onClick={() => setTimeframe("overall")}
                    className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${textSecondary} hover:${textPrimary} border ${borderCard}`}
                  >
                    Show all
                  </button>
                )}
              </div>
            </div>

            <div className="p-2 space-y-2 flex-1 overflow-y-auto min-h-0">
              {dateGroups.length === 0 ? (
                <div className={`text-center py-8 ${textSecondary}`}>
                  <MessageSquare size={24} className="mx-auto mb-1 opacity-40" />
                  <p className={`text-xs font-semibold ${textPrimary}`}>No journal entries found</p>
                  <p className="text-[10px] mt-0.5">
                    {timeframe === "custom"
                      ? `No trades recorded between ${startDate} and ${endDate}`
                      : "Complete trades to view entries"}
                  </p>
                </div>
              ) : (
                visibleGroups.map((group) => (
                  <div
                    key={group.dateStr}
                    className={`border ${borderCard} rounded ${bgPanel} overflow-hidden`}
                  >
                    {/* Daily Header Banner — only when there is more than one
                        day in view to tell apart. */}
                    {!(selectedDayKey && dateGroups.length === 1) && (
                    <div className={`px-3 py-1.5 border-b ${borderCard} ${bgCard} flex items-center justify-between gap-2 text-xs`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-bold ${textPrimary} font-mono truncate`}>
                          {selectedDayKey ? `${group.winCount + group.lossCount} settled` : group.formattedDate}
                        </span>
                        <span className={`text-[10px] ${textSecondary} font-mono shrink-0`}>
                          {(() => {
                            const n = group.fullCount ?? group.trades.length;
                            return `${n} ${n === 1 ? "trade" : "trades"}`;
                          })()}
                        </span>
                      </div>

                      <div className={`flex items-center font-mono text-[11px] shrink-0 ${isMobile ? "gap-1.5" : "gap-2"}`}>
                        <span style={{ color: tTokens.up }}>{group.winCount} W</span>
                        <span style={{ color: tTokens.down }}>{group.lossCount} L</span>
                        {/* The win-rate reads off the W/L pair either side of it;
                            on a phone it is the one term the row can spare. */}
                        {!isMobile && <span className={textSecondary}>{group.winRate.toFixed(0)}% WR</span>}
                        <span
                          className="font-bold"
                          style={{
                            color: group.totalPnL >= 0 ? tTokens.up : tTokens.down
                          }}
                        >
                          {formatMoney(group.totalPnL, currency)}
                        </span>
                      </div>
                    </div>
                    )}

                    {/* Trade List */}
                    <div className={`divide-y ${isDark ? "divide-[#2a2e39]/60" : "divide-[#e0e3eb]/60"}`}>
                      {group.trades.map((trade) => {
                        const note = notes[trade.id];
                        const isEditing = editingTradeId === trade.id;
                        const isExpanded = expandedTradeId === trade.id;
                        const pnl = getTradeNetPnL(trade);

                        const { base, quote, isOTC: symIsOTC } = parseSymbol(trade.symbol);

                        return (
                          <div key={trade.id} className={`hover:${isDark ? "bg-[#131722]/50" : "bg-gray-150/55"} transition-colors`}>
                            <div
                              className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer"
                              onClick={() => setExpandedTradeId(isExpanded ? null : trade.id)}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {/* Overlapping flag icons */}
                                <div className="shrink-0 flex items-center justify-center">
                                  <CoinStack base={base} quote={quote} isOTC={symIsOTC} />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`text-xs font-bold ${textPrimary} font-mono truncate`}>
                                      {getAssetDisplayName(trade.symbol)}
                                    </span>
                                    {symIsOTC && (
                                      <span className="inline-block shrink-0 text-[10px] font-extrabold text-zinc-500 bg-zinc-200/70 dark:text-zinc-400/90 dark:bg-[#1a1d28] px-0.5 py-[1px] rounded-[2px] leading-none select-none uppercase tracking-tighter origin-top-left transform scale-[0.68] mt-[1px] -mr-1">
                                        OTC
                                      </span>
                                    )}
                                    {/* A word, not a lozenge.
                                    
                                        The row carried three filled badges in
                                        three colours — OTC, CALL/PUT, and up to
                                        two tags — around one figure that is
                                        also coloured. Twenty-five rows of that
                                        is a page of chips with a result hidden
                                        among them. The direction is still red
                                        or green, because that is the one thing
                                        the word adds; it just stops being a
                                        button-shaped object. */}
                                    <span
                                      className="text-[10px] font-semibold tracking-wide shrink-0"
                                      style={{
                                        color: isBullishSide(trade.side) ? tTokens.up : tTokens.down,
                                      }}
                                    >
                                      {isBullishSide(trade.side) ? "CALL" : "PUT"}
                                    </span>

                                    {note && note.rating > 0 && (
                                      <div className="flex items-center gap-0.5">
                                        {Array.from({ length: note.rating }).map((_, i) => (
                                          <Star
                                            key={i}
                                            size={9}
                                            className="text-[#f5c518]"
                                            fill="currentColor"
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className={`text-[10px] ${textSecondary} font-mono`}>
                                    {new Date(trade.expiryTime).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                {note && note.tags.length > 0 && (
                                  <div className="hidden sm:flex items-center gap-1">
                                    {note.tags.slice(0, 2).map((tagVal) => (
                                      <span
                                        key={tagVal}
                                        className={`text-[10px] ${textSecondary} shrink-0`}
                                      >
                                        #{tagVal}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {note && note.note && (
                                  <MessageSquare size={11} className={textSecondary} />
                                )}

                                <span
                                  className="text-xs font-bold font-mono"
                                  style={{
                                    color: pnl > 0 ? tTokens.up : pnl < 0 ? tTokens.down : undefined
                                  }}
                                >
                                  {formatMoney(pnl, currency, false)}
                                </span>

                                {isExpanded ? (
                                  <ChevronUp size={13} className={textSecondary} />
                                ) : (
                                  <ChevronDown size={13} className={textSecondary} />
                                )}
                              </div>
                            </div>

                            {/* Expanded Note View */}
                            {isExpanded && (
                              <div className="px-3 pb-2.5">
                                {isEditing ? (
                                  <TradeNoteEditor
                                    trade={trade}
                                    existingNote={note}
                                    onSave={(noteText, tags, rating) =>
                                      handleSaveNote(trade.id, noteText, tags, rating)
                                    }
                                    onCancel={() => setEditingTradeId(null)}
                                    theme={theme}
                                  />
                                ) : (
                                  <div className={`border ${borderCard} ${bgCard} rounded p-2.5`}>
                                    {note ? (
                                      <>
                                        {note.note && (
                                          <p className={`text-xs ${textPrimary} mb-2 font-normal`}>
                                            {note.note}
                                          </p>
                                        )}

                                        {note.tags.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mb-2">
                                            {note.tags.map((tag) => (
                                              <span
                                                key={tag}
                                                className="px-2 py-0.5 rounded text-[10px] font-semibold border"
                                                style={{
                                                  backgroundColor: "#0052ff15",
                                                  color: isDark ? "#60a5fa" : "#0052ff",
                                                  borderColor: "#0052ff2a",
                                                }}
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingTradeId(trade.id);
                                          }}
                                          className={`text-[10px] ${textSecondary} hover:text-[#0052ff] font-semibold flex items-center gap-1 transition-colors`}
                                        >
                                          <Edit3 size={11} />
                                          Edit Note
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingTradeId(trade.id);
                                        }}
                                        className={`w-full py-2 text-center ${textSecondary} hover:text-[#0052ff] transition-colors flex flex-col items-center gap-1 cursor-pointer`}
                                      >
                                        <Edit3 size={14} />
                                        <span className="text-xs font-medium">Add notes or strategy comments for this trade</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              {visibleRows < totalLogRows && (
                <div
                  ref={logSentinelRef}
                  className={`py-3 text-center text-[10px] ${textSecondary}`}
                >
                  Loading more — {visibleGroups.reduce((n, g) => n + g.trades.length, 0)} of{" "}
                  {totalLogRows.toLocaleString()}
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  </TokenCtx.Provider>
);
});

export default TradeJournal;
