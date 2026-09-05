"use client";

/**
 * Analytics Dashboard Component
 *
 * Main component that combines all analytics sub-components.
 */

import { memo, useState, useMemo, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { BarChart2, X, ClipboardList } from "lucide-react";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import {
  useTradingAnalytics,
  EMPTY_FILTERS,
  type AnalyticsFilters,
  type AnalyticsRange,
} from "./use-trading-analytics";
import { EXCHANGE_RATES, CURRENCY_SYMBOLS } from "../header/header";
import { getAssetDisplayName } from "@/utils/image-fallback";

import { AnalyticsOverview } from "./analytics-overview";
import { TradeJournal } from "./trade-journal";
import { useTranslations } from "next-intl";
import { useIsMobile } from "../../hooks/use-trading-mobile";

const MS_DAY = 86_400_000;

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "INR", "BRL",
  "PKR", "BDT", "CNY", "RUB", "SGD", "HKD", "TRY", "ZAR", "MXN", "EGP",
]);

function parseSymbol(symbol: string) {
  const clean = symbol.replace(" (OTC)", "").replace("/OTC", "").replace("_OTC", "").replace("OTC", "").trim();
  let base = clean;
  let quote = "";
  const isOTC = symbol.toUpperCase().includes("OTC");

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
  // else: base stays as the full ticker (e.g. ULTRACEMCO), quote=USD

  return { base, quote, isOTC };
}

// ============================================================================
// CURRENCY SYMBOL FORMATTERS
// ============================================================================

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

function formatMoney(val: number, cur: string): string {
  const symbol = getCurrencySymbol(cur);
  const abs = Math.abs(val);
  if (abs === 0) return `${symbol}0.00`;
  const sign = val >= 0 ? "+" : "-";
  return `${sign}${symbol}${abs.toFixed(2)}`;
}

// ============================================================================
// TYPES
// ============================================================================

interface AnalyticsDashboardProps {
  theme?: "dark" | "light";
  className?: string;
  onClose?: () => void;
  /** Optional header actions slot (refresh, close buttons) */
  headerActions?: React.ReactNode;
  /** Hide the internal header when used inside an overlay that provides its own */
  hideHeader?: boolean;
  defaultTab?: TabId;
  hideTabs?: boolean;
}

type TabId = "overview" | "journal";

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const AnalyticsDashboard = memo(function AnalyticsDashboard({
  theme = "dark",
  className = "",
  onClose,
  headerActions,
  hideHeader = false,
  defaultTab = "overview",
  hideTabs = false,
}: AnalyticsDashboardProps) {
  const t = useTranslations("binary_components");
  const tCommon = useTranslations("common");
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [calcBalance, setCalcBalance] = useState<string>("10000");
  const [calcRisk, setCalcRisk] = useState<number>(2);

  /* The greeting card is gone.
  
     It sat absolutely centred in this bar — a sun or moon, a rotating slogan
     ("RISK FIRST ALWAYS"), "Good morning, <name>" and an avatar with a pulsing
     online dot — and none of it was about the trades underneath. It was three
     pieces of chrome competing with the page's own title for the middle of the
     header, on a screen whose entire job is four figures and a chart. The
     name now sits where it belongs: beside the page heading, once. */

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);


  const { loadCompletedHistory, completedOrders, tradingMode } = useBinaryStore();

  /* Every figure on this overlay is about history, and the terminal only loads
     fifty trades — enough for a positions list, nowhere near enough for a
     six-month calendar or a two-month comparison. Pulled once per mode, since
     demo and real are two different books. */
  const [historyReady, setHistoryReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setHistoryReady(false);
    (async () => {
      await loadCompletedHistory();
      if (!cancelled) setHistoryReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [tradingMode, loadCompletedHistory]);
  /* One range and one filter set for the whole page rather than a control per
     card, so every figure on screen describes the same trades and they cannot
     contradict each other. Both live here rather than inside the overview so
     that switching to the journal and back does not reset them. */
  /* All time, on landing.
  
     It used to open on this week with a one-shot widen: if the week was empty
     but the account had history, it fell back to all time once. That was a
     rule to stop the page opening blank, and it was still the wrong first
     screen for everybody else — somebody who trades twice a month opened on a
     week that was technically not empty and read four figures off three
     trades. The whole account is the honest default; every narrower window is
     one click away, widest first. */
  const [range, setRange] = useState<AnalyticsRange>("all");
  const [filters, setFilters] = useState<AnalyticsFilters>(EMPTY_FILTERS);
  const analytics = useTradingAnalytics(range, filters);

  // Filter completed orders by current trading mode
  const filteredCompletedOrders = useMemo(() => {
    return completedOrders.filter(order => order.isDemo === (tradingMode === "demo"));
  }, [completedOrders, tradingMode]);

  /* Open on the month, once there is a month worth opening on.
  
     All time is the right landing for an account with a short history: it is
     the only window guaranteed to contain something, and somebody who trades
     twice a month reading four figures off three trades is worse served by a
     narrower one. But it is the wrong landing for an account with a year
     behind it, where "all time" averages this week's discipline together with
     whatever was happening last March, and the page stops being about how
     trading is going and becomes a biography.
  
     Two conditions, both necessary. The history has to reach back two months —
     otherwise the month window is the whole account under a different name,
     and switching to it changes the label without changing a single figure.
     And something has to have settled inside the last thirty days, or the page
     opens on an empty month, which reads as broken rather than as quiet.
  
     It reads the deep history rather than the terminal's first page — see
     `loadCompletedHistory`. Off fifty trades this condition could not be met
     by any account that trades daily, which is why it never fired on the live
     site: the oldest of the last fifty is rarely sixty days back.
  
     Once, on the first load that has trades. After that the period is the
     reader's, and a page that re-decides it under them is a page arguing. */
  const rangeChosen = useRef(false);
  useEffect(() => {
    if (rangeChosen.current) return;
    /* After the deep load, not before. Deciding off the terminal's fifty was
       the whole reason this never fired: the oldest of fifty trades is rarely
       sixty days old, however long the account has been open. */
    if (!historyReady) return;
    if (filteredCompletedOrders.length === 0) return;
    rangeChosen.current = true;

    const now = Date.now();
    let oldest = Infinity;
    let recent = false;
    for (const order of filteredCompletedOrders) {
      const at = new Date(order.expiryTime).getTime();
      if (!Number.isFinite(at)) continue;
      if (at < oldest) oldest = at;
      if (now - at <= 30 * MS_DAY) recent = true;
    }
    if (Number.isFinite(oldest) && now - oldest >= 60 * MS_DAY && recent) {
      setRange("month");
    }
  }, [filteredCompletedOrders, historyReady]);

  // Theme classes - matching overlay-theme.ts for consistency
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark" || resolvedTheme === "navy";
  const bgClass = isDark ? "bg-transparent" : "bg-white";
  const headerBgClass = isDark ? "bg-transparent" : "bg-white";
  const borderClass = isDark ? "border-zinc-800" : "border-gray-200/50";
  const textClass = isDark ? "text-white" : "text-gray-900";
  const subtitleClass = isDark ? "text-zinc-400" : "text-gray-500";
  const cardBgClass = isDark ? "bg-[#13151f]/40" : "bg-zinc-100";

  // Tab configuration
  const tabs = [
    { id: "overview" as TabId, label: "Overview", icon: BarChart2 },
    { id: "journal" as TabId, label: "My Journal", icon: ClipboardList },
  ];

  // Track preferred display currency from localStorage
  const [preferredCurrency, setPreferredCurrency] = useState<string>("USDT");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setPreferredCurrency(localStorage.getItem("preferred_currency") || "USDT");
      const handleCurrencyChange = () => {
        setPreferredCurrency(localStorage.getItem("preferred_currency") || "USDT");
      };
      window.addEventListener("currency-changed", handleCurrencyChange);
      window.addEventListener("storage", handleCurrencyChange);
      return () => {
        window.removeEventListener("currency-changed", handleCurrencyChange);
        window.removeEventListener("storage", handleCurrencyChange);
      };
    }
  }, []);

  const preferredCurrencyRate = EXCHANGE_RATES[preferredCurrency] || 1.0;

  // Create converted analytics metrics
  const convertedStats = useMemo(() => {
    const s = analytics.stats;
    return {
      ...s,
      avgWinAmount: s.avgWinAmount * preferredCurrencyRate,
      avgLossAmount: s.avgLossAmount * preferredCurrencyRate,
      totalPnL: s.totalPnL * preferredCurrencyRate,
      bestTrade: s.bestTrade * preferredCurrencyRate,
      worstTrade: s.worstTrade * preferredCurrencyRate,
    };
  }, [analytics.stats, preferredCurrencyRate]);

  const convertedAdvancedMetrics = useMemo(() => {
    const m = analytics.advancedMetrics;
    return {
      ...m,
      maxDrawdown: m.maxDrawdown * preferredCurrencyRate,
      expectancy: m.expectancy * preferredCurrencyRate,
    };
  }, [analytics.advancedMetrics, preferredCurrencyRate]);

  const convertedEquityCurve = useMemo(() => {
    return analytics.equityCurve.map(point => ({
      ...point,
      balance: point.balance * preferredCurrencyRate,
    }));
  }, [analytics.equityCurve, preferredCurrencyRate]);

  const convertedStatsBySymbol = useMemo(() => {
    return analytics.statsBySymbol.map(stat => ({
      ...stat,
      totalPnL: stat.totalPnL * preferredCurrencyRate,
      avgWinAmount: stat.avgWinAmount * preferredCurrencyRate,
      avgLossAmount: stat.avgLossAmount * preferredCurrencyRate,
      bestTrade: stat.bestTrade * preferredCurrencyRate,
      worstTrade: stat.worstTrade * preferredCurrencyRate,
    }));
  }, [analytics.statsBySymbol, preferredCurrencyRate]);

  const convertedRecentTrades = useMemo(() => {
    return analytics.recentTrades.map(trade => ({
      ...trade,
      amount: trade.amount * preferredCurrencyRate,
      profit: trade.profit !== undefined ? trade.profit * preferredCurrencyRate : trade.profit,
    }));
  }, [analytics.recentTrades, preferredCurrencyRate]);

  const convertedCompletedOrders = useMemo(() => {
    return filteredCompletedOrders.map(trade => ({
      ...trade,
      amount: trade.amount * preferredCurrencyRate,
      profit: trade.profit !== undefined ? trade.profit * preferredCurrencyRate : trade.profit,
    }));
  }, [filteredCompletedOrders, preferredCurrencyRate]);

  const convertedCurrentBalance = analytics.currentBalance * preferredCurrencyRate;
  const convertedStartingBalance = analytics.startingBalance * preferredCurrencyRate;

  useEffect(() => {
    if (convertedCurrentBalance && convertedCurrentBalance > 0) {
      setCalcBalance(Math.round(convertedCurrentBalance).toString());
    }
  }, [convertedCurrentBalance]);

  // Render tabs navigation
  const renderTabs = () => (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
              transition-colors
              ${
                isActive
                  ? "bg-[#0052ff] text-white"
                  : `${subtitleClass} ${
                      isDark
                        ? "hover:bg-zinc-800/50 hover:text-zinc-200"
                        : "hover:bg-zinc-200/50 hover:text-zinc-800"
                    }`
              }
            `}
          >
            <Icon size={16} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={`${bgClass} ${className} flex flex-col h-full sf-pro-selectors`}>
      {/* Header - only show if not hidden (when overlay provides its own) */}
      {!hideHeader && (
        <div
          className={`${headerBgClass} border-b ${borderClass} px-6 py-4 shrink-0 relative`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart2 size={24} className={textClass} />
              <div>
                <h2 className={`text-lg font-semibold ${textClass}`}>
                  {tCommon("trading_analytics")}
                </h2>
                <p className={`text-xs ${subtitleClass}`}>
                  {analytics.stats.totalTrades} {t("trades_analyzed")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Header actions slot or default buttons */}
              {headerActions || (
                <>
                  {/* Close button */}
                  {onClose && (
                    <button
                      onClick={onClose}
                      className={`p-2 rounded-lg ${
                        theme === "dark"
                          ? "hover:bg-zinc-800"
                          : "hover:bg-zinc-100"
                      } transition-colors`}
                    >
                      <X size={18} className={subtitleClass} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4">
            {renderTabs()}
          </div>
        </div>
      )}

      {/* The overview does not get a chrome bar.
      
         With the title gone (the page says Performance itself) and the greeting
         gone, this bar held an icon at one end and a close button at the other,
         and 56px of empty black between them — a header that had stopped being
         about anything. The close moves down into the page's own control row,
         beside the period and the export button, where the rest of this
         screen's controls already are — and the journal now wears the same
         header, so neither tab has a bar. What is left of this branch is the
         tabbed mode, where the bar carries the switcher between them. */}
      {hideHeader && !hideTabs && (
        <div className={`${headerBgClass} border-b ${borderClass} ${isMobile ? "px-3 py-2.5" : "px-6 py-3.5"} shrink-0 flex items-center justify-between gap-2 relative`}>
          {/* Only the switcher. The titled variant of this bar — an icon and
              the page's name — is gone with the bar itself: both pages carry
              their own header now, and this branch only runs when the panel is
              showing tabs. */}
          {renderTabs()}

          <div className="flex items-center gap-2">
            {/* The period control used to sit here, as a segmented Today/Week/
                Month/All track. It has moved into the dashboard's own header,
                beside the filters and the export button it belongs with — this
                bar is the overlay's chrome (what am I looking at, and how do I
                close it), not the page's controls. */}
            {/* No refresh button. The dashboard and the journal read the same
                trade history the terminal is already streaming, so there is
                nothing here a reload fetches that arriving does not — the
                control only ever offered to redo work that had just been done,
                and a spinner beside a figure invites doubt about whether the
                figure is current. */}
            {/* Close button */}
            {onClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                className={`p-2 rounded-lg shrink-0 ${
                  isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                } transition-colors`}
              >
                <X size={18} className={subtitleClass} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content. A phone cannot spare 12px a side to a gutter — that is 24 of
          the 390 it has, and the cards inside are already the tight ones. */}
      <div className={`flex-1 overflow-hidden ${isMobile ? "p-2" : "p-3"} flex flex-col`}>
        {/* No page-level empty state here any more. The overview owns its own,
            because with filters in its header an empty result is a state you
            must be able to get *out* of — and swapping the whole panel for a
            message takes the controls that caused it off the screen. */}
        {!analytics.hasData && activeTab === "journal" ? (
          <div className="flex flex-col items-center justify-center h-full">
            <BarChart2 size={48} className={`${subtitleClass} opacity-50 mb-4`} />
            <h3 className={`text-lg font-semibold ${textClass} mb-2`}>
              {t("no_trading_data_yet")}
            </h3>
            <p className={`text-sm ${subtitleClass} text-center max-w-md`}>
              {t("complete_trades_to_see_analytics") + ' ' + t("trading_history_will_appear_here")}
            </p>
          </div>
        ) : (
          /* Tab content */
          <>
            {/* Scrolls at every width. xl:overflow-hidden was what forced the
                deck to fit the window exactly, and fitting is what flattened
                it — see the row floor in analytics-overview. */}
            {activeTab === "overview" && (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
                {/* Raw analytics in, one rate out — the component performs every
                    currency conversion so a value cannot be converted twice. */}
                <AnalyticsOverview
                  stats={analytics.stats}
                  previousStats={analytics.previousStats}
                  orders={analytics.orders}
                  previousOrders={analytics.previousOrders}
                  avgPayoutPercent={analytics.avgPayoutPercent}
                  turnover={analytics.turnover}
                  range={range}
                  onRangeChange={setRange}
                  filters={filters}
                  onFiltersChange={setFilters}
                  onClose={hideHeader && hideTabs ? onClose : undefined}
                  tradedSymbols={analytics.tradedSymbols}
                  hasAnyHistory={analytics.hasAnyHistory}
                  currencySymbol={CURRENCY_SYMBOLS[preferredCurrency] || "$"}
                  currencyCode={preferredCurrency}
                  rate={preferredCurrencyRate}
                />
              </div>
            )}



            {activeTab === "journal" && (
              <TradeJournal
                trades={convertedCompletedOrders}
                currency={preferredCurrency}
                onClose={hideHeader && hideTabs ? onClose : undefined}
                theme={
                  resolvedTheme === "light" ? "light" : resolvedTheme === "navy" ? "navy" : "dark"
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default AnalyticsDashboard;
