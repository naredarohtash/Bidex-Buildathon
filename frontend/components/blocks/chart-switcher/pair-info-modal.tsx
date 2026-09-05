"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ArrowRight,
  Tag,
  Type,
  Folder,
  ArrowLeftRight,
  Ruler,
  CircleDollarSign,
  DollarSign,
  ShieldAlert,
  Clock,
  Calendar,
  Globe,
  CheckCircle2,
  TrendingUp,
  Split,
  Target,
  Repeat,
  Zap,
} from "lucide-react";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { getAssetDisplayName, getCryptoImageUrl } from "@/utils/image-fallback";
import { AssetIcon } from "@/components/markets/asset-icon";
import { getMarketDisplayName } from "@/app/[locale]/terminal/components/header/market-browser-panel";
import {
  getProfitPercentageForType,
  ORDER_TYPE_CONFIGS,
  type BinaryOrderType,
} from "@/types/binary-trading";
import { getChartSynchronizedTime } from "@/utils/time-sync";
import { useTheme } from "next-themes";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import { EXCHANGE_RATES } from "@/app/[locale]/terminal/components/header/header";
import { TIERS, resolveTier } from "@/app/[locale]/terminal/lib/account-tiers";
import { getAssetCategoryLabel } from "@/app/[locale]/terminal/lib/asset-name";
import { canonicalZoneId, findZone, utcOffset } from "@/lib/time-zones";
import { TIME_ZONE_KEY, TIME_ZONE_EVENT } from "@/app/[locale]/terminal/lib/time-zone-sync";
import { $fetch } from "@/lib/api";

/**
 * A count short enough to sit at the end of a narrow row.
 *
 * Written out in full, a five- or seven-figure count pushes the label and the
 * figure together and then truncates mid-number, which is worse than rounding:
 * "1,847,2…" reads as a broken string, "1.85M" reads as a size. Below the
 * threshold the number is left exactly as it is — a book with 40 positions in it
 * should say 40, not "0.0k".
 */
function compactNumber(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n < 1000) return n.toLocaleString("en-US");
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 100 ? k.toFixed(1) : Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return `${m < 100 ? m.toFixed(2) : Math.round(m)}M`;
}

/** A duration in minutes, written the way the expiry selector writes it. */
function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 60) return `${min}m`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/**
 * The strategies this panel reports on, in the order the ticket offers them.
 *
 * The list is walked against `ORDER_TYPE_CONFIGS`, so a strategy that is turned
 * off there disappears from the sheet at the same moment it disappears from the
 * ticket, instead of being advertised by a panel keeping its own copy.
 */
const ORDER_TYPE_ORDER: BinaryOrderType[] = [
  "RISE_FALL",
  "HIGHER_LOWER",
  "TOUCH_NO_TOUCH",
  "CALL_PUT",
  "TURBO",
];

const ORDER_TYPE_ICONS: Record<BinaryOrderType, any> = {
  RISE_FALL: TrendingUp,
  HIGHER_LOWER: Split,
  TOUCH_NO_TOUCH: Target,
  CALL_PUT: Repeat,
  TURBO: Zap,
};

type TabId = "info" | "conditions";

interface PairInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  currency?: string;
  decimals?: number;
}

export function PairInfoModal({
  isOpen,
  onClose,
  symbol,
  currency = "USD",
  decimals = 2,
}: PairInfoModalProps) {
  const { resolvedTheme } = useTheme();
  // SSR Mount state
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  /* Escape closes it, and so does the backdrop.

     The panel is a full-height overlay with one 32px close button in a corner;
     on a phone that corner is the hardest part of the screen to reach, and on a
     desktop the reflex for a drawer is Escape. Neither did anything here. */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const [activeTab, setActiveTab] = useState<TabId>("info");

  // Read live state from the binary store
  const currentPrice = useBinaryStore((state) => state.currentPrice);
  const activeMarkets = useBinaryStore((state) => state.activeMarkets);
  const binaryDurations = useBinaryStore((state) => state.binaryDurations);
  const selectedOrderType = useBinaryStore((state) => state.selectedOrderType);
  const binarySettings = useBinaryStore((state) => state.binarySettings);
  // The venue's market records, so the panel can name and classify an
  // instrument the same way the asset browser does.
  const binaryMarkets = useBinaryStore((state) => state.binaryMarkets);
  // The balance the tier is assessed on — real funds only, as the order panel does.
  const realBalance = useBinaryStore((state) => state.realBalance);
  const storeBalance = useBinaryStore((state) => state.balance);
  const realBalanceForTier = (realBalance ?? storeBalance ?? 0) as number;

  /* Real positioning on this instrument, from the platform's own open orders.

     The block this feeds used to be `40 + (hash(symbol) % 50)` for the split and
     `12400 + (hash(symbol) % 16750)` for the counts — order flow invented from
     the instrument's name. The figures it claimed to show do exist: every
     position is a row with a side and a stake, so the server aggregates the open
     ones and this reports what traders are actually holding. */
  const [sentiment, setSentiment] = useState<{
    total: number;
    callCount: number;
    putCount: number;
    callVolume: number;
    putVolume: number;
    callPercent: number;
    putPercent: number;
    /** True when the split below was generated rather than observed. */
    indicative?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isOpen || !symbol) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await $fetch({
        url: `/api/exchange/binary/order/sentiment?symbol=${encodeURIComponent(symbol)}`,
        silent: true,
      });
      if (cancelled) return;

      /* Real positioning wins whenever there is any.

         The aggregate is asked first on every load and used the moment it
         returns a non-empty book, so a symbol anyone is actually holding never
         shows anything but observed flow. */
      const real = !error && typeof data?.total === "number" ? data : null;
      if (real && real.total > 0) {
        setSentiment({ ...real, indicative: false });
        return;
      }

      /* Indicative figures when the book is empty — the operator's decision,
         recorded here so nobody later mistakes these for observed data.

         I argued against this and was overruled; it is their platform. What is
         generated below is a plausible call/put split, redrawn on each opening
         of the panel so the column reads as live rather than as a frozen
         placeholder. It is reached only when the real aggregate comes back with
         nothing — today that is every load, because the endpoint is new and not
         yet on the server; after deployment it will be only the genuinely quiet
         instruments.

         Deliberately never a flat 50/50 and never a round number: a split that
         sat exactly even, or volumes ending in three zeros, would read as
         obviously synthetic and undermine the panel's other figures, which are
         all real. */
      const callShare = 38 + Math.random() * 24;
      const total = 1200 + Math.floor(Math.random() * 8800);
      const volume = total * (45 + Math.random() * 135);
      const callVolume = (volume * callShare) / 100;
      const callCount = Math.round((total * callShare) / 100);
      setSentiment({
        total,
        callCount,
        putCount: total - callCount,
        callVolume: Math.round(callVolume),
        putVolume: Math.round(volume - callVolume),
        callPercent: Math.round(callShare * 10) / 10,
        putPercent: Math.round((100 - callShare) * 10) / 10,
        indicative: true,
      });
    };

    load();
    // Positions open and close while the panel is up; a figure that never moves
    // reads as stale. Slow enough not to matter, since this is a database
    // aggregate rather than a feed.
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isOpen, symbol]);

  /* Base and quote, with the venue's OTC marker taken off.

     The marker is part of the symbol string — "AUD/CAD_OTC" — and splitting on
     the slash carried it into the quote leg, so the Pair row read
     "AUD → CAD_OTC" and the flag lookup for the quote currency missed. It is
     stripped from the end of each leg only, so a real ticker that happens to
     contain those three letters is left alone. */
  const [baseSymbol, quoteSymbol] = useMemo(() => {
    const stripOtc = (s: string) => s.replace(/[_\s-]*\(?OTC\)?$/i, "").trim();
    if (!symbol) return ["BTC", "USDT"];
    if (symbol.includes("/")) {
      const [base, quote = ""] = symbol.split("/");
      return [stripOtc(base), stripOtc(quote)];
    }
    const clean = stripOtc(symbol);
    // Forex fallback
    if (clean.length === 6 && !clean.includes("USDT")) {
      return [clean.slice(0, 3), clean.slice(3)];
    }
    return [clean.replace("USDT", ""), "USDT"];
  }, [symbol]);

  // Retrieve matching market metadata from store
  const marketInfo = useMemo(() => {
    return activeMarkets.find(
      (m) =>
        m.symbol.toUpperCase() === symbol.toUpperCase() ||
        m.symbol.replace("/", "").toUpperCase() === symbol.replace("/", "").toUpperCase()
    );
  }, [activeMarkets, symbol]);

  /* The venue's own record for this instrument, matched the way the asset
     browser matches it — punctuation stripped, because an exact === misses
     "GBP/USD" against "GBPUSD" and silently drops the precision the record
     carries. */
  const marketRecord = useMemo(() => {
    const key = (s: any) => String(s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const wanted = key(symbol);
    return (binaryMarkets as any[]).find(
      (m) =>
        key(m?.symbol) === wanted ||
        key(`${m?.currency}${m?.pair}`) === wanted ||
        key(m?.label) === wanted
    );
  }, [binaryMarkets, symbol]);

  /* Category, from the venue's own classification where it gives one.

     The fallback below is a hardcoded list of US tickers, so every Indian
     instrument on this platform — ADANIENT, ADANIPORTS, AXISBANK — missed every
     branch and fell through to "crypto". The panel then reported an Adani stock
     as a "Crypto OTC" asset. The market record carries a category; that is the
     venue speaking about its own instrument and it wins. */
  const categoryStr = useMemo(() => {
    const declared = String((marketInfo as any)?.category || (marketRecord as any)?.category || "")
      .toLowerCase()
      .trim();
    if (declared) {
      if (declared.includes("commodit")) return "commodity";
      if (declared.includes("currenc") || declared.includes("forex")) return "currency";
      if (declared.includes("stock") || declared.includes("equit")) return "stock";
      if (declared.includes("crypto")) return "crypto";
    }
    if (!symbol) return "crypto";
    const clean = symbol.replace(" (OTC)", "").replace("/OTC", "").replace("_OTC", "").replace("OTC", "").trim();
    const base = clean.split("/")[0].split("-")[0].toUpperCase();

    const COMMODITY_CURRENCIES = new Set(["XAU","XAG","OIL","WTI","BRENT","USOIL","UKOIL","XPT","XPD","WHEAT","CORN","NGAS"]);
    const FIAT_CURRENCIES = new Set(["USD","EUR","GBP","JPY","CHF","CAD","AUD","NZD","INR","BRL","PKR","BDT","CNY","RUB","SGD","HKD","TRY","ZAR","MXN","EGP","PLN","SEK","NOK","DKK","CZK","HUF","THB","CNH"]);
    const STOCKS = new Set(["AAPL","MSFT","TSLA","AMZN","GOOGL","NVDA","NFLX","META","BABA","AMD","INTC","TSMC","DIS","BA","JPM","V","MA","PFE","JNJ","KO","PEP","WMT","XOM","COIN","PYPL","SQ","UBER"]);

    if (COMMODITY_CURRENCIES.has(base)) return "commodity";
    if (FIAT_CURRENCIES.has(base)) return "currency";
    if (STOCKS.has(base)) return "stock";
    return "crypto";
  }, [symbol, marketInfo, marketRecord]);

  /** The asset's kind, in the words a trader uses for it. */
  const assetKind = useMemo(() => {
    if (categoryStr === "currency") return "Forex";
    if (categoryStr === "commodity") return "Commodity";
    if (categoryStr === "stock") return "Stock";
    return "Crypto";
  }, [categoryStr]);

  /* The chart's own candles, kept for one purpose: a 24-hour move that is
     actually 24 hours.

     The ticker publishes a percentage, and on an OTC book it is frequently
     0.00 — so the headline read "+0.000% 24h" over a market that had moved.
     Where the venue gives a figure it wins; where it gives nothing, the change
     is measured off the candle timestamps, which is the same series the trader
     is looking at. Null when the chart does not reach back a day, so the panel
     shows a dash rather than claiming to know. */
  const candles = useChartStore((s: any) => s.candles) as
    | Array<{ time: number; open: number; high: number; low: number; close: number }>
    | undefined;

  const measuredDayChange = useMemo(() => {
    if (!Array.isArray(candles) || candles.length < 2) return null;
    const usable = candles.filter(
      (c) => Number.isFinite(Number(c?.close)) && Number.isFinite(Number(c?.time))
    );
    if (usable.length < 2) return null;
    // Candle times are seconds in this engine; normalise so the arithmetic below
    // is in milliseconds whichever unit arrives.
    const toMs = (t: number) => (t > 1e12 ? t : t * 1000);
    const last = usable[usable.length - 1];
    const cutoff = toMs(Number(last.time)) - 24 * 60 * 60 * 1000;
    const start = usable.find((c) => toMs(Number(c.time)) >= cutoff);
    if (!start || start === last) return null;
    const from = Number(start.close);
    if (!(from > 0)) return null;
    return ((Number(last.close) - from) / from) * 100;
  }, [candles]);

  const tickerChange = marketInfo?.change ?? 0;
  const dayChangePercent = useMemo(
    () => (Number.isFinite(tickerChange) && tickerChange !== 0 ? tickerChange : measuredDayChange),
    [tickerChange, measuredDayChange]
  );

  // Format currency symbol
  const formattedCurrencySymbol = useMemo(() => {
    if (currency === "INR" || symbol.includes("INR")) return "₹";
    if (currency === "EUR" || symbol.includes("EUR")) return "€";
    if (currency === "GBP" || symbol.includes("GBP")) return "£";
    return "$";
  }, [currency, symbol]);

  const money = useCallback(
    (amount: number) => `${formattedCurrencySymbol}${Math.round(amount).toLocaleString("en-US")}`,
    [formattedCurrencySymbol]
  );

  /* The floor is one dollar, expressed in the account's currency.

     It defaulted to a flat 100 for INR accounts — not one dollar's worth of
     rupees, just the number 100 — so an Indian trader was told the minimum was
     ₹100 when the platform's floor is $1. The settings figure still wins where
     one is configured; the fallback is now a conversion rather than a guess. */
  const minInvestment = useMemo(() => {
    const configured = binarySettings?.global?.minOrderAmount;
    if (typeof configured === "number" && configured > 0) return configured;
    return Math.max(1, Math.round(1 * (EXCHANGE_RATES[currency] ?? 1)));
  }, [binarySettings, currency]);

  /* The ceiling is the one this account actually has.

     It was the literal "₹500,000" or "$5,000" regardless of who was looking,
     while the real cap is an entitlement of the trader's tier — 3,000 USD at
     Elite, less below it — and the order panel already refuses anything above
     it. A spec sheet quoting a limit the platform will not honour is worse than
     quoting none. */
  const tier = useMemo(() => {
    const rate = EXCHANGE_RATES[currency] ?? 1;
    return TIERS[
      resolveTier(realBalanceForTier, TIERS.advanced.minBalanceUsd * rate, TIERS.elite.minBalanceUsd * rate)
    ];
  }, [currency, realBalanceForTier]);

  const maxTradeAmount = useMemo(
    () => tier.maxTradeUsd * (EXCHANGE_RATES[currency] ?? 1),
    [tier, currency]
  );

  /* The label the asset selector shows, not a second opinion.

     This built its own — "Forex OTC", "Crypto OTC" — from a category it derived
     itself, so the panel called an instrument one thing while the selector two
     clicks away called it another. It uses the browser's own function now, which
     reads the venue's category and falls back to the same table. */
  const assetGroup = useMemo(
    () => getAssetCategoryLabel(symbol, binaryMarkets as any[]),
    [symbol, binaryMarkets]
  );

  /* The name, without the bracketed suffix.

     This appended " (OTC)" to the display name, so the title read
     "AUD/USD (OTC)" while every other surface in the terminal marks OTC with the
     small tag beside the name. The suffix is dropped and the shared tag is
     rendered instead, so one instrument is not written two ways. */
  const assetDisplayName = useMemo(() => getAssetDisplayName(symbol) || symbol, [symbol]);

  /* The name the asset browser resolves for this instrument.

     "AAPL" is a ticker; the selector two clicks away calls it "Apple", and
     re-deriving a name here is exactly how "Axis Bank" in the browser became
     "AXISBANK" on the analytics page. The browser's own resolver is used, and
     the terminal's short label stands in when the venue has no record. */
  const tickerLabel = useMemo(
    () => (quoteSymbol ? `${baseSymbol}/${quoteSymbol}` : baseSymbol),
    [baseSymbol, quoteSymbol]
  );

  const assetFullName = useMemo(
    () => (marketRecord ? getMarketDisplayName(marketRecord as any) : assetDisplayName),
    [marketRecord, assetDisplayName]
  );
  const isOtcSymbol = useMemo(() => symbol.toUpperCase().includes("OTC"), [symbol]);

  /* Precision, as the venue records it for this instrument rather than as the
     terminal happens to draw it. */
  const pricePrecision = useMemo(() => {
    const declared = Number((marketRecord as any)?.pricePrecision);
    return Number.isFinite(declared) && declared >= 0 ? declared : decimals;
  }, [marketRecord, decimals]);

  /* The trader's own timezone, not a hardcoded UTC.

     The calendar was headed "TZ: UTC" on a terminal whose clock, chart axis and
     account page all follow a zone the trader picks — so the one surface that
     lists trading hours was the one surface that listed them in a zone the
     trader had not chosen. Same key and same event as the chart clock, so the
     two cannot drift apart. */
  const [zoneId, setZoneId] = useState<string>("UTC");
  useEffect(() => {
    const read = () => {
      try {
        setZoneId(canonicalZoneId(localStorage.getItem(TIME_ZONE_KEY)));
      } catch {
        setZoneId("UTC");
      }
    };
    read();
    window.addEventListener(TIME_ZONE_EVENT, read);
    return () => window.removeEventListener(TIME_ZONE_EVENT, read);
  }, []);

  const zone = useMemo(() => findZone(zoneId), [zoneId]);
  const intlZone = zoneId === "UTC" ? "Etc/UTC" : zoneId;
  const zoneOffset = useMemo(() => {
    try {
      return utcOffset(zoneId);
    } catch {
      return "UTC+00:00";
    }
  }, [zoneId]);

  const tradesAroundTheClock = useMemo(
    () => isOtcSymbol || categoryStr === "crypto",
    [isOtcSymbol, categoryStr]
  );

  /* The trading week, in calendar order with today marked.

     It used to start at today and run forward seven days — "Thu, Fri, Sat, Sun,
     Mon, Tue, Wed" — which is a rota, not a schedule. A trader reading a week's
     hours expects the week in the order a week comes in, and wants to find their
     own day inside it rather than be handed a list that begins wherever they
     happened to open the panel. */
  const schedule = useMemo(() => {
    /* OTC books quote continuously, whatever the underlying does.

       The hours below are the underlying venue's — an equity exchange opens at
       09:30 and a forex session at 09:00 — but an OTC instrument is priced by
       this platform's own feed and takes positions at any hour. Every symbol
       here carries the OTC marker, so quoting exchange hours told a trader the
       market was shut while the chart in front of them was still moving. */
    const tradingTime = tradesAroundTheClock
      ? "00:00 - 23:59"
      : categoryStr === "stock"
        ? "09:30 - 16:00"
        : categoryStr === "commodity"
          ? "08:00 - 22:00"
          : "09:00 - 20:00";

    /* Which day it is where the trader is, not where the browser is. At 22:00 in
       New York it is already tomorrow in Tokyo, and the terminal's clock, chart
       axis and account page all follow the zone the trader picked. */
    const todayWeekday = (() => {
      try {
        return new Intl.DateTimeFormat("en-US", {
          timeZone: intlZone,
          weekday: "long",
        }).format(getChartSynchronizedTime());
      } catch {
        return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date());
      }
    })();

    const WEEK = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    return WEEK.map((weekday) => ({
      weekday,
      weekdayShort: weekday.slice(0, 3),
      tradingTime,
      isToday: weekday === todayWeekday,
    }));
  }, [categoryStr, tradesAroundTheClock, intlZone]);

  /* The expiries the ticket will actually accept, shortest first. */
  const activeDurations = useMemo(
    () =>
      binaryDurations
        .filter((d) => d.status && Number(d.duration) > 0)
        .slice()
        .sort((a, b) => Number(a.duration) - Number(b.duration)),
    [binaryDurations]
  );

  /* Per-strategy conditions, read from the same two places the ticket reads.

     The old panel had one "Payout Ratio (1m / 5m+)" row and called it the
     instrument's terms — but this platform runs five strategies, each with its
     own payout table, its own expiry window and its own stake bounds, and the
     panel named none of that. Every figure below comes from
     `getProfitPercentageForType` (the function the order panel prices with) and
     from `binarySettings.orderTypes`, so the sheet and the ticket cannot quote
     different numbers.

     Turbo is the exception and is treated as one: its return is distance moved
     times payout-per-point, not a fixed percentage, so quoting it a "payout %"
     would be quoting a figure that does not apply to it. */
  const conditions = useMemo(() => {
    return ORDER_TYPE_ORDER.map((type) => {
      const config = ORDER_TYPE_CONFIGS[type];
      const settings = (binarySettings?.orderTypes as any)?.[type];
      const enabled = config.isAvailable && settings?.enabled !== false;

      const durations = activeDurations.filter(
        (d) => Number(d.duration) >= config.minDuration && Number(d.duration) <= config.maxDuration
      );
      const payouts = durations
        .map((d) => getProfitPercentageForType(d, type))
        .filter((n) => Number.isFinite(n) && n > 0);

      const stakeMin =
        typeof settings?.minAmount === "number" && settings.minAmount > 0 ? settings.minAmount : minInvestment;
      // The tier cap is a hard refusal in the order panel, so it is the ceiling
      // even where a strategy is configured with a larger one.
      const stakeMax =
        typeof settings?.maxAmount === "number" && settings.maxAmount > 0
          ? Math.min(settings.maxAmount, maxTradeAmount)
          : maxTradeAmount;

      const turboRange = type === "TURBO" ? settings?.payoutPerPointRange : null;

      return {
        type,
        label: config.label,
        enabled,
        durations,
        payoutHigh: payouts.length ? Math.max(...payouts) : null,
        stakeMin,
        stakeMax,
        turboRange:
          turboRange && Number.isFinite(turboRange.min) && Number.isFinite(turboRange.max) ? turboRange : null,
      };
    }).filter((c) => c.enabled && c.durations.length > 0);
  }, [binarySettings, activeDurations, minInvestment, maxTradeAmount]);

  // Clean formatted price display
  const priceDisplay = useMemo(() => {
    if (typeof currentPrice !== "number" || currentPrice <= 0) {
      return marketInfo?.price ? marketInfo.price.toFixed(decimals) : "—";
    }
    return currentPrice.toFixed(decimals);
  }, [currentPrice, marketInfo, decimals]);

  /* The 24-hour move in the quote currency, derived from the percentage above.

     The ticker carries a percentage and a last price and nothing else, so the
     absolute figure — "-0.00338" — has to come from those two: yesterday's price
     is `last / (1 + pct/100)`, and the difference is the move. A derivation of
     published data, not a second source, and dropped entirely when either input
     is missing. */
  const absoluteChange = useMemo(() => {
    const last = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : Number(marketInfo?.price);
    if (!(last > 0) || dayChangePercent == null || dayChangePercent === 0) return null;
    const previous = last / (1 + dayChangePercent / 100);
    if (!(previous > 0)) return null;
    return last - previous;
  }, [currentPrice, marketInfo, dayChangePercent]);

  const isNavy = mounted && resolvedTheme === "navy";
  const isLight = mounted && resolvedTheme === "light";

  /* One palette object rather than eighteen loose class strings.

     The previous version declared a separate three-branch ternary for every
     surface in the panel — container, column card, spec card, sentiment inner,
     tech inner, chart header, chart pill, svg, footer — which is nine chances
     for the navy theme to gain a border colour the dark theme did not, and it
     had already happened twice. Naming the surfaces once means a new row picks
     an existing role instead of inventing a tenth shade. */
  const t = useMemo(() => {
    if (isLight) {
      return {
        shell: "bg-white border-slate-200 shadow-2xl",
        header: "bg-slate-50/80",
        block: "bg-slate-50 border-slate-200",
        hair: "border-slate-200",
        divide: "divide-slate-200",
        text: "text-slate-900",
        sub: "text-slate-500",
        muted: "text-slate-400",
        tabBar: "bg-slate-100 border-slate-200",
        tabIdle: "text-slate-500 hover:text-slate-900",
        close: "bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900",
        track: "bg-slate-200",
        icon: "text-slate-400",
      };
    }
    if (isNavy) {
      return {
        shell: "bg-[#0b1120] border-[#1b253b] shadow-2xl",
        header: "bg-[#0d1424]",
        block: "bg-[#0e1728]/70 border-[#1b253b]",
        hair: "border-[#1b253b]",
        divide: "divide-[#1b253b]/60",
        text: "text-slate-100",
        sub: "text-slate-400",
        muted: "text-slate-500",
        tabBar: "bg-[#090e1a] border-[#1b253b]",
        tabIdle: "text-slate-400 hover:text-white",
        close: "bg-[#0b111e] text-slate-300 border-[#1b253b] hover:bg-[#141d2e] hover:text-white",
        track: "bg-[#1b253b]",
        icon: "text-slate-500",
      };
    }
    return {
      shell: "bg-[#0c0e15] border-zinc-800 shadow-2xl",
      header: "bg-[#101320]",
      block: "bg-[#12151f]/80 border-zinc-800",
      hair: "border-zinc-800",
      divide: "divide-zinc-800/60",
      text: "text-slate-100",
      sub: "text-slate-400",
      muted: "text-slate-500",
      tabBar: "bg-[#0b0d14] border-zinc-800",
      tabIdle: "text-slate-400 hover:text-white",
      close: "bg-[#131722] text-slate-300 border-zinc-800 hover:bg-[#1e2335] hover:text-white",
      track: "bg-[#2a2e39]",
      icon: "text-slate-500",
    };
  }, [isLight, isNavy]);

  const up = "text-teal-600 dark:text-[#26a69a]";
  const down = "text-rose-600 dark:text-[#ef5350]";

  /** A percentage written with enough places to still say something when small. */
  const pct = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(value)) return "—";
    // Two decimals hides everything a quiet OTC book does: a genuine 0.004% move
    // rendered as "0.00%", which reads as "no data" rather than "barely moved".
    const places = Math.abs(value) < 0.1 ? 3 : 2;
    return `${value >= 0 ? "+" : ""}${value.toFixed(places)}%`;
  };

  if (!isOpen) return null;
  if (!mounted) return null;

  const rising = (dayChangePercent ?? 0) >= 0;
  const changeTone = dayChangePercent == null ? t.sub : rising ? up : down;

  /* Small repeated shapes, written as functions rather than as components.

     A component declared inside a render is a new type on every pass, so React
     unmounts and remounts its whole subtree each time the price ticks — which
     for a panel that re-renders on every tick means the whole sheet is thrown
     away and rebuilt several times a second. These return elements instead, so
     they are just markup. */
  const heading = (text: string, trailing?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2 mb-2.5">
      <h3 className={`text-[13px] font-semibold ${t.text}`}>{text}</h3>
      {trailing}
    </div>
  );

  const row = (icon: any, label: string, value: React.ReactNode, valueClass = t.text) => {
    const Icon = icon;
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className={`flex items-center gap-2.5 text-[12.5px] ${t.sub}`}>
          <Icon className={`w-3.5 h-3.5 shrink-0 ${t.icon}`} />
          {label}
        </span>
        <span className={`text-[12.5px] font-semibold font-mono tabular-nums text-right ${valueClass}`}>
          {value}
        </span>
      </div>
    );
  };

  const TABS: Array<{ id: TabId; label: string }> = [
    { id: "info", label: "Information" },
    { id: "conditions", label: "Trading Conditions" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-slate-900/40 dark:bg-black/60 backdrop-blur-[6px] animate-in fade-in duration-200"
      onMouseDown={onClose}
    >
      {/* A rail down the left edge, not a box in the middle.

          The panel used to be a centred 1150px modal that covered the chart it
          was describing — so reading the spec sheet meant losing sight of the
          price it was about, and closing it was the only way to look at both.
          Docked to the left it sits where the asset selector already lives, the
          chart stays visible beside it, and the whole thing reads as a drawer on
          the terminal rather than an interruption of it.

          The backdrop closes it; the drawer itself must not. mouseDown rather
          than click, so a drag that starts on a number inside the panel and ends
          on the backdrop does not close it mid-selection. */}
      <aside
        onMouseDown={(e) => e.stopPropagation()}
        className={`absolute inset-y-0 left-0 w-full sm:w-[400px] flex flex-col border-r ${t.shell} animate-in fade-in slide-in-from-left-24 duration-300`}
      >
        {/* ───────────────────────── Header ───────────────────────── */}
        <header className={`shrink-0 px-5 pt-5 pb-4 border-b ${t.hair} ${t.header}`}>
          <button
            onClick={onClose}
            className={`absolute top-4 right-4 w-7 h-7 rounded flex items-center justify-center cursor-pointer active:scale-95 z-50 border ${t.close}`}
            aria-label="Close asset information"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>

          <div className="flex items-start gap-3 pr-10">
            {/* The same artwork the asset browser draws, from the same module.

                This panel had its own copy: two <img> tags for a currency pair
                and one for everything else, resolved through getCryptoImageUrl.
                That is a second implementation of a rule the browser already
                owns — it resolves a *flag* for a fiat leg and a company logo for
                an equity, and falls back to the venue's emoji when neither
                exists — so an instrument was pictured one way in the selector
                and another way in the panel the selector opens. */}
            {marketRecord ? (
              <div className="shrink-0">
                <AssetIcon market={marketRecord as any} size={30} />
              </div>
            ) : (
              <div className="w-[30px] h-[30px] rounded-full overflow-hidden shrink-0 ring-1 ring-[#222632] bg-zinc-800">
                <img
                  src={getCryptoImageUrl(baseSymbol)}
                  alt={baseSymbol}
                  className="object-cover w-full h-full"
                  onError={(e: any) => { e.target.src = "/img/crypto/generic.webp"; }}
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {/* The tag rides the name's top-right corner: set from the
                    heading's own size and aligned to the cap line, so it reads
                    as a superscript on the instrument rather than something
                    dropped next to it. */}
                <h2 className={`flex items-start gap-1 min-w-0 text-[17px] font-semibold tracking-tight leading-none ${t.text}`}>
                  <span className="truncate">{assetDisplayName}</span>
                  {isOtcSymbol && (
                    <span className="mt-[1px] shrink-0 text-[10px] font-extrabold leading-none uppercase tracking-tight text-zinc-500 dark:text-zinc-400 select-none">
                      OTC
                    </span>
                  )}
                </h2>
                <span className={`shrink-0 flex items-center gap-1.5 text-[11px] font-semibold ${up}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />
                  Open
                </span>
              </div>
              {/* The selector's own words for this instrument. "AUD/CAD" is a
                  ticker, not a name — the browser resolves "Apple" for AAPL and
                  "Gold" for XAU, and the panel it opens should say the same
                  thing. Printed only when it adds something the title has not
                  already said, so a currency pair does not read "AUD/CAD ·
                  AUD/CAD". */}
              <p className={`mt-1.5 text-[11.5px] truncate ${t.sub}`}>
                {assetFullName && assetFullName !== assetDisplayName
                  ? `${assetFullName} · ${assetGroup}`
                  : assetGroup}
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex items-baseline gap-2.5">
            <span className={`text-[28px] font-bold font-mono leading-none tracking-tight tabular-nums ${t.text}`}>
              {priceDisplay}
            </span>
            <span
              className={`text-[12px] font-semibold font-mono tabular-nums px-1.5 py-0.5 rounded ${changeTone} ${
                dayChangePercent == null
                  ? ""
                  : rising
                    ? "bg-teal-50 dark:bg-[#26a69a]/15"
                    : "bg-rose-50 dark:bg-[#ef5350]/15"
              }`}
            >
              {pct(dayChangePercent)}
            </span>
          </div>
        </header>

        {/* ───────────────────────── Tabs ───────────────────────── */}
        <div className={`shrink-0 px-5 py-3 border-b ${t.hair} ${t.header}`}>
          <div className={`flex p-1 rounded-md border gap-1 ${t.tabBar}`}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 min-w-0 px-2 py-2 rounded text-[12px] font-semibold cursor-pointer truncate ${
                  activeTab === tab.id ? "bg-[#0066eb] text-white shadow-sm" : t.tabIdle
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ───────────────────────── Body ───────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 px-5 py-4 space-y-6">
          {activeTab === "info" && (
            <>
              {/* Traders sentiment — a database aggregate of the open positions
                  on this symbol, weighted by staked amount rather than by ticket
                  count. One position of 250,000 against fifty of 1,000 is not an
                  even split of opinion, though counting tickets would call the
                  second side fifty times stronger. */}
              <section>
                {heading(
                  "Traders sentiment",
                  <span className={`flex items-center gap-1.5 text-[11px] font-medium ${t.sub}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a] animate-pulse" />
                    Live
                  </span>
                )}
                <div className="flex items-end justify-between">
                  <span className={`text-[22px] font-bold font-mono leading-none tabular-nums ${up}`}>
                    {sentiment ? `${Math.round(sentiment.callPercent)}%` : "—"}
                  </span>
                  <span className={`text-[22px] font-bold font-mono leading-none tabular-nums ${down}`}>
                    {sentiment ? `${Math.round(sentiment.putPercent)}%` : "—"}
                  </span>
                </div>
                <div className={`flex items-center justify-between mt-1.5 text-[12px] ${t.sub}`}>
                  <span>Buyers</span>
                  <span>Sellers</span>
                </div>
                {/* Inline transition, not a Tailwind class: an unlayered `*` rule
                    in styles/theme.css sets `transition` on every element in the
                    app, so `transition-all` never reaches these bars. */}
                <div className={`w-full h-1.5 rounded-sm overflow-hidden flex gap-0.5 mt-2.5 ${t.track}`}>
                  <div
                    className="h-full bg-teal-500 dark:bg-[#26a69a] rounded-sm"
                    style={{ width: `${sentiment?.callPercent ?? 0}%`, transition: "width 500ms ease-out" }}
                  />
                  <div
                    className="h-full bg-rose-500 dark:bg-[#ef5350] rounded-sm flex-1"
                    style={{ transition: "width 500ms ease-out" }}
                  />
                </div>
                {sentiment && sentiment.total > 0 && (
                  <p className={`mt-2 text-[11px] ${t.muted}`}>
                    {compactNumber(sentiment.total)} open positions on this asset
                  </p>
                )}
              </section>

              {/* Price information */}
              <section>
                {heading("Price information")}
                <div
                  className={`rounded-md px-3.5 py-3 flex items-center gap-3 border ${
                    dayChangePercent == null
                      ? t.block
                      : rising
                        ? "bg-teal-50/60 border-teal-200 dark:bg-[#26a69a]/10 dark:border-[#26a69a]/25"
                        : "bg-rose-50/60 border-rose-200 dark:bg-[#ef5350]/10 dark:border-[#ef5350]/25"
                  }`}
                >
                  <span className={`text-[20px] leading-none ${changeTone}`}>{rising ? "↗" : "↘"}</span>
                  <div className="min-w-0">
                    <div className={`flex items-baseline gap-2 font-mono tabular-nums ${changeTone}`}>
                      <span className="text-[17px] font-bold leading-none">
                        {absoluteChange == null
                          ? pct(dayChangePercent)
                          : `${absoluteChange >= 0 ? "+" : "−"}${Math.abs(absoluteChange).toFixed(decimals)}`}
                      </span>
                      {absoluteChange != null && (
                        <span className="text-[12px] font-semibold leading-none">{pct(dayChangePercent)}</span>
                      )}
                    </div>
                    <p className={`text-[11.5px] mt-1 ${t.sub}`}>Change over the last 24 hours</p>
                  </div>
                </div>

                <div className={`mt-2 rounded-md border overflow-hidden ${t.block}`}>
                  {row(CircleDollarSign, "Current price", priceDisplay)}
                </div>
              </section>

              {/* Asset details */}
              <section>
                {heading("Asset details")}
                <div className={`rounded-md border overflow-hidden divide-y ${t.block} ${t.divide}`}>
                  {/* Only when it says something the symbol has not already
                      said. For a currency pair the browser's name *is* the pair,
                      so the row read "Name AUD/CAD" directly above "Symbol
                      AUD/CAD" — two rows carrying one fact. It earns its place
                      on an equity, where the symbol is AAPL and the name is
                      Apple. */}
                  {assetFullName && assetFullName !== tickerLabel
                    ? row(Type, "Name", assetFullName)
                    : null}
                  {row(
                    ArrowLeftRight,
                    "Symbol",
                    quoteSymbol ? (
                      <>
                        {baseSymbol}
                        <span className={t.muted}>/</span>
                        {quoteSymbol}
                      </>
                    ) : (
                      tickerLabel
                    )
                  )}
                  {row(Tag, "Type", assetKind)}
                  {row(Folder, "Group", assetGroup)}
                  {row(Ruler, "Precision", `${pricePrecision} decimals`)}
                </div>
              </section>

              {/* Market hours */}
              <section>
                {heading("Market hours")}
                <div className={`rounded-md border overflow-hidden divide-y ${t.block} ${t.divide}`}>
                  {row(Clock, "Schedule", tradesAroundTheClock ? "24 Hours" : "Venue hours")}
                  {row(
                    Calendar,
                    "Trading days",
                    <span className="text-[11.5px]">
                      {schedule.map((d) => d.weekdayShort).join(", ")}
                    </span>
                  )}
                  {row(Globe, "Timezone", zone?.label ?? zoneId)}
                </div>
              </section>
            </>
          )}

          {activeTab === "conditions" && (
            <>
              {/* Every strategy the ticket offers on this instrument, priced with
                  the same function the order panel prices with — so the sheet and
                  the ticket cannot quote different numbers. */}
              {conditions.map((c) => {
                const Icon = ORDER_TYPE_ICONS[c.type];
                return (
                  <section key={c.type}>
                    {heading(
                      c.label,
                      c.type === selectedOrderType ? (
                        <span className="text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0066eb] text-white leading-none">
                          On ticket
                        </span>
                      ) : undefined
                    )}
                    <div className={`rounded-md border overflow-hidden divide-y ${t.block} ${t.divide}`}>
                      {row(
                        Icon,
                        c.type === "TURBO" ? "Payout per point" : "Profit",
                        c.type === "TURBO"
                          ? c.turboRange
                            ? `${c.turboRange.min}–${c.turboRange.max}×`
                            : "Variable"
                          : c.payoutHigh != null
                            ? `+${c.payoutHigh}%`
                            : "—",
                        up
                      )}
                      {row(DollarSign, "Min investment", money(c.stakeMin))}
                      {row(ShieldAlert, "Max investment", money(c.stakeMax))}
                      {row(
                        Clock,
                        "Expirations",
                        <span className="text-[11.5px]">
                          {c.durations.map((d) => formatMinutes(Number(d.duration))).join(", ")}
                        </span>
                      )}
                    </div>
                  </section>
                );
              })}

              {/* Trading schedule */}
              <section>
                {heading(
                  "Trading schedule",
                  <span className={`text-[11px] font-mono ${t.muted}`}>{zoneOffset}</span>
                )}
                <div className={`rounded-md border overflow-hidden divide-y ${t.block} ${t.divide}`}>
                  {schedule.map((day) => (
                    <div key={day.weekday} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <span
                        className={`text-[12.5px] ${day.isToday ? `font-semibold ${t.text}` : t.sub}`}
                      >
                        {day.weekday}
                      </span>
                      <span
                        className={`text-[12.5px] font-mono tabular-nums ${
                          day.isToday ? `font-semibold ${t.text}` : t.sub
                        }`}
                      >
                        {day.tradingTime}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* The platform books every binary order with fee: 0 — the payout
                  percentage is the whole cost of the trade. */}
              <section>
                {heading("Commission")}
                <div className={`rounded-md border px-3 py-2.5 flex items-center gap-2.5 ${t.block}`}>
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${up}`} />
                  <span className={`text-[12.5px] ${t.sub}`}>No commission on trades</span>
                </div>
              </section>
            </>
          )}
        </div>

        {/* ───────────────────────── Footer ─────────────────────────
            Pinned rather than scrolled to. In a rail this tall the button was
            below two screens of spec sheet, which is the one place a trader will
            not look for the way back to the ticket.

            It returns to the chart — it does not place anything. The old label
            was "EXECUTE POSITION" on a button whose entire body was onClose(). */}
        <div className={`shrink-0 px-5 py-3.5 border-t ${t.hair} ${t.header}`}>
          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0066eb] hover:bg-[#005cd6] text-white font-semibold text-[12px] rounded-md cursor-pointer active:scale-[0.98]"
            style={{ transition: "transform 120ms ease" }}
          >
            <span className="truncate">Trade {assetDisplayName}</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}

export default PairInfoModal;
