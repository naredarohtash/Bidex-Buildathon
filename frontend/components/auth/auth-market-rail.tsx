"use client";

/**
 * The live quote board on the auth pages.
 *
 * Every number here comes off the same spot ticker socket the terminal uses,
 * for instruments this deployment actually lists. That is the point: a sign-in
 * page for a trading platform that invents its prices is lying on first
 * contact, and the invented ones are always frozen — the giveaway is that they
 * never move while you read them. Measured on the live feed, 92 of 96 symbols
 * move within twenty seconds, so this board is visibly alive.
 *
 * Until the socket has said something it renders a skeleton. Nothing on screen
 * is ever a number the market did not print.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * A 24h change column. The feed's `change` on these OTC instruments runs to
 * hundredths of a percent, so a column of it is a column of "+0.00%" — a dead
 * number next to a live one, which is worse than no column. The last tick's
 * direction is shown instead: real, and it is the thing that actually moves.
 *
 * A day-range track. This feed carries no high or low, and a range drawn
 * without them would be decoration in the shape of data.
 */

import { useEffect, useRef, useState } from "react";
import { tickersWs } from "@/services/tickers-ws";
import { AssetIcon } from "@/components/markets/asset-icon";
import type { BinaryMarket } from "@/store/trade/use-binary-store";
import { cn } from "@/lib/utils";

const RISE = "#089981";
const FALL = "#f23645";

/** Rows on the board. Five fits the panel without the eye having to scan. */
const ROW_COUNT = 5;

/** Repaint interval. Fast enough to read as live, slow enough to cost nothing. */
const TICK_MS = 1000;

interface MarketMeta {
  label: string;
  pricePrecision?: number;
  isTrending?: boolean;
  isHot?: boolean;
  /* The market itself, kept so the row can draw the same artwork the terminal
     draws — a company logo for a listed equity, paired flags for a currency,
     a coin for crypto. The `icon` field on its own is a country flag emoji,
     which made five different Indian equities five identical Indian flags. */
  market: BinaryMarket;
}

interface Quote {
  key: string;
  name: string;
  market?: BinaryMarket;
  otc: boolean;
  price: number;
  precision: number;
  /** Direction of the last observed move. Holds until the price moves again. */
  direction: 0 | 1 | -1;
  /** Timestamp of that move, so the flash can fade. */
  movedAt: number;
}

/* Both the brand panel and the phone card mount this, and only one of them is
   ever visible — CSS hides the other. One request between them, resolved once
   per page load. */
let marketListRequest: Promise<Map<string, MarketMeta>> | null = null;

function loadMarketList(): Promise<Map<string, MarketMeta>> {
  if (marketListRequest) return marketListRequest;

  marketListRequest = fetch("/api/exchange/binary/market")
    .then((r) => (r.ok ? r.json() : []))
    .then((markets: any[]) => {
      const map = new Map<string, MarketMeta>();
      if (!Array.isArray(markets)) return map;
      for (const m of markets) {
        const symbol = m?.symbol || `${m?.currency}/${m?.pair}`;
        if (!symbol) continue;
        map.set(normalize(symbol), {
          label: m.label || symbol,
          pricePrecision:
            typeof m.pricePrecision === "number" ? m.pricePrecision : undefined,
          isTrending: !!m.isTrending,
          isHot: !!m.isHot,
          market: m as BinaryMarket,
        });
      }
      return map;
    })
    .catch(() => {
      /* No list is survivable — the ticker keys alone still name the row. The
         failure is not cached, so a later mount can try again. */
      marketListRequest = null;
      return new Map<string, MarketMeta>();
    });

  return marketListRequest;
}

/* The backend's own normaliser, so a market and a ticker for the same
   instrument join even though one says "AUD/CAD_OTC" and the other "AUDCAD".
   See backend/api/exchange/binary/market/index.get.ts. */
const normalize = (s: string): string =>
  String(s || "")
    .replace(/\(?\s*OTC\s*\)?/gi, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

/** "HDFCBANK/OTC" -> "HDFCBANK", "AUD/CAD_OTC" -> "AUD/CAD". */
function displayName(label: string): string {
  return label.replace(/[_/\s]*\(?OTC\)?$/i, "") || label;
}

function formatPrice(value: number, precision: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

export function AuthMarketRail({
  className,
  rows = ROW_COUNT,
  flush = false,
}: {
  className?: string;
  /** Fewer on a phone, where this sits under the form rather than beside it. */
  rows?: number;
  /** Drop the outer rules when a card already frames the board. */
  flush?: boolean;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [connected, setConnected] = useState(false);

  /* Everything the render does not need lives in refs: the selection has to
     survive every repaint, and re-deriving it from each payload would let the
     board reshuffle itself under the reader. */
  const meta = useRef<Map<string, MarketMeta>>(new Map());
  const chosen = useRef<string[] | null>(null);
  const prices = useRef<Map<string, Quote>>(new Map());
  const pending = useRef<Record<string, any> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    /* The tradable list, so the board only shows instruments this deployment
       actually lists — and so each row can carry the market's own label, flag
       and price precision rather than a guess made from the symbol. */
    loadMarketList().then((map) => {
      if (alive) meta.current = map;
    });

    const flush = () => {
      timer.current = null;
      const data = pending.current;
      pending.current = null;
      if (!data || !alive) return;

      if (!chosen.current) {
        chosen.current = pickSymbols(data, meta.current, rows);
        if (!chosen.current.length) {
          chosen.current = null;
          return;
        }
      }

      const now = Date.now();
      const next: Quote[] = [];

      for (const key of chosen.current) {
        const raw = data[key];
        const price = Number(raw?.last ?? raw?.close);
        if (!Number.isFinite(price) || price <= 0) {
          const held = prices.current.get(key);
          if (held) next.push(held);
          continue;
        }

        const info = meta.current.get(normalize(key));
        const previous = prices.current.get(key);
        const moved = previous ? price - previous.price : 0;

        const quote: Quote = {
          key,
          name: displayName(info?.label || key),
          market: info?.market,
          otc: /otc/i.test(key) || /otc/i.test(info?.label || ""),
          price,
          precision: info?.pricePrecision ?? inferPrecision(price),
          direction: moved > 0 ? 1 : moved < 0 ? -1 : previous?.direction ?? 0,
          movedAt: moved !== 0 ? now : previous?.movedAt ?? 0,
        };

        prices.current.set(key, quote);
        next.push(quote);
      }

      if (next.length) {
        setQuotes(next);
        setConnected(true);
      }
    };

    let unsubscribe: (() => void) | undefined;
    try {
      tickersWs.initialize();
      unsubscribe = tickersWs.subscribeToSpotData((data) => {
        pending.current = data;
        if (timer.current) return;
        /* The socket replays what it already has the moment you subscribe, and
           switching between sign-in and sign-up remounts this. Waiting a full
           tick for that first payload put a second of skeleton on a board that
           had the prices in hand — so the first paint is immediate and only
           the updates after it are throttled. */
        if (!chosen.current) flush();
        else timer.current = setTimeout(flush, TICK_MS);
      });
    } catch {
      /* No feed, no board. The skeleton stays; no placeholder prices appear. */
    }

    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
      unsubscribe?.();
    };
  }, [rows]);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#787b86]">
          Live prices
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              connected ? "bg-[#089981]" : "bg-[#3a4358]"
            )}
            style={connected ? { boxShadow: `0 0 0 3px ${RISE}22` } : undefined}
          />
          <span className="text-[11px] font-medium tracking-wide text-[#787b86]">
            {connected ? "Streaming" : "Connecting"}
          </span>
        </span>
      </div>

      <div
        className={cn(
          "divide-y divide-white/[0.06]",
          !flush && "border-y border-white/[0.06]"
        )}
      >
        {connected
          ? quotes.map((q) => <QuoteRow key={q.key} quote={q} />)
          : Array.from({ length: rows }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
      </div>
    </div>
  );
}

/**
 * Which instruments the board shows, drawn once per visit.
 *
 * Only symbols that are both streaming and listed as tradable qualify — a price
 * for something you cannot trade here is trivia. If the market list never
 * arrived, every streaming symbol qualifies.
 *
 * The draw is random. It used to be feed order, which is fixed, so every
 * visitor to every page load saw the same five names and the board read like a
 * static graphic that happened to have live numbers in it. There are ninety-odd
 * instruments streaming; showing five of them is a choice, and making it the
 * same five is the one choice that undersells the list.
 *
 * Hot and trending still lead, because that is the platform's own ordering of
 * what matters — but the shuffle happens first and Array.sort is stable, so the
 * ordering picks a tier while the draw picks the members.
 */
function pickSymbols(
  data: Record<string, any>,
  markets: Map<string, MarketMeta>,
  count: number
): string[] {
  const keys = Object.keys(data).filter((k) => {
    const price = Number(data[k]?.last ?? data[k]?.close);
    if (!Number.isFinite(price) || price <= 0) return false;
    return markets.size === 0 || markets.has(normalize(k));
  });

  // Fisher-Yates
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  const rank = (k: string) => {
    const m = markets.get(normalize(k));
    if (m?.isHot) return 0;
    if (m?.isTrending) return 1;
    return 2;
  };

  return keys.sort((a, b) => rank(a) - rank(b)).slice(0, count);
}

/** Only used when the market list is unavailable and precision is unknown. */
function inferPrecision(price: number): number {
  const abs = Math.abs(price);
  return abs >= 1000 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 5 : 8;
}

function QuoteRow({ quote }: { quote: Quote }) {
  const tone = quote.direction > 0 ? RISE : quote.direction < 0 ? FALL : "#8b93a5";
  /* Fresh moves tint the figure; it settles back to white so a stalled feed
     cannot leave the board looking permanently active. */
  const fresh = Date.now() - quote.movedAt < TICK_MS * 2;

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5">
        {quote.market && <AssetIcon market={quote.market} size={18} />}
        <span className="truncate text-[12.5px] font-semibold tracking-wide text-[#d4d7de]">
          {quote.name}
        </span>
        {quote.otc && (
          <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-tight text-[#5b6478]">
            OTC
          </span>
        )}
      </span>

      <span className="flex items-center gap-1.5">
        <span
          className="font-numeric text-[13.5px] font-semibold tabular-nums transition-colors duration-500"
          style={{ color: fresh ? tone : "#ffffff" }}
        >
          {formatPrice(quote.price, quote.precision)}
        </span>
        <Caret direction={quote.direction} tone={tone} />
      </span>
    </div>
  );
}

function Caret({ direction, tone }: { direction: number; tone: string }) {
  if (direction === 0) {
    return <span className="inline-block h-1.5 w-2.5" aria-hidden />;
  }
  return (
    <svg
      className="h-1.5 w-2.5 shrink-0"
      viewBox="0 0 10 6"
      aria-hidden
      style={{ transform: direction > 0 ? undefined : "rotate(180deg)" }}
    >
      <path d="M5 0L10 6H0z" fill={tone} />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5" aria-hidden>
      <span className="h-3 w-24 animate-pulse rounded bg-white/[0.07]" />
      <span className="h-3 w-16 animate-pulse rounded bg-white/[0.07]" />
    </div>
  );
}

export default AuthMarketRail;
