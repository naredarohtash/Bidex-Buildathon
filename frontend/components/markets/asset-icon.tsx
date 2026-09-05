"use client";

/**
 * How an instrument is pictured, in one place.
 *
 * This lived inside the terminal's market-browser panel, which meant anything
 * outside the terminal that wanted to show an asset had to either import a
 * 1000-line panel (and the wishlist service and the binary store with it) or
 * re-derive the artwork itself. The auth pages' quote board took the second
 * road first and shipped the market's raw `icon` field — a flag emoji, and the
 * *country's* flag at that, so five Indian equities were five identical Indian
 * flags where the terminal shows five company logos.
 *
 * The resolution rule is the part that must not drift, so it moved here and the
 * panel imports it. Geometry stays a property of the caller: the browser panel
 * has a 24px row, the quote board a 12.5px one.
 */

import React, { memo, useEffect, useState } from "react";
import type { BinaryMarket } from "@/store/trade/use-binary-store";
import { getCryptoImageUrl } from "@/utils/image-fallback";

export type CategoryTab =
  | "all"
  | "currencies"
  | "crypto"
  | "commodities"
  | "stocks"
  | "indian_stocks";

export const COMMODITY_CURRENCIES = new Set(["XAU","XAG","OIL","WTI","BRENT","USOIL","UKOIL","XPT","XPD","WHEAT","CORN","NGAS"]);
export const FIAT_CURRENCIES = new Set(["USD","EUR","GBP","JPY","CHF","CAD","AUD","NZD","INR","BRL","PKR","BDT","CNY","CNH","RUB","SGD","HKD","TRY","ZAR","MXN","EGP","PLN","SEK","NOK","DKK","CZK","HUF","THB"]);
export const STOCKS = new Set(["AAPL","MSFT","TSLA","AMZN","GOOGL","NVDA","NFLX","META","BABA","AMD","INTC","TSMC","DIS","BA","JPM","V","MA","PFE","JNJ","KO","PEP","WMT","XOM","COIN","PYPL","SQ","UBER"]);

const CCY_FLAG: Record<string, string> = {
  USD:"us", EUR:"eu", GBP:"gb", JPY:"jp", AUD:"au", CAD:"ca", CHF:"ch", NZD:"nz", INR:"in",
  ZAR:"za", PLN:"pl", TRY:"tr", HUF:"hu", NOK:"no", DKK:"dk", SEK:"se", SGD:"sg", THB:"th",
  CZK:"cz", BRL:"br", CNH:"cn", CNY:"cn", HKD:"hk", MXN:"mx", RUB:"ru", EGP:"eg", PKR:"pk", BDT:"bd",
};

export const flagUrl = (ccy: string): string | null => {
  const cc = CCY_FLAG[(ccy || "").toUpperCase()];
  return cc ? `/img/flag/${cc}.webp` : null;
};

/* Exported so the order panel labels an asset with the same category the
   browser assigns it. Two copies of this logic is how BANKBARODA came to be
   filed under NSE Stocks in one place and shown as "Spot Market" in the other. */
export function classifyMarket(market: BinaryMarket): Exclude<CategoryTab, "all"> {
  if (market.category) {
    const cat = market.category.toLowerCase();
    if (cat === "currency" || cat === "currencies") return "currencies";
    if (cat === "commodity" || cat === "commodities") return "commodities";
    if (cat === "stock" || cat === "stocks") return "stocks";
    if (cat === "crypto") return "crypto";
    if (cat === "indian_stocks" || cat === "indian-stocks" || cat === "indian stock market") return "indian_stocks";
  }
  let base = (market.currency || "").toUpperCase();
  if (base.includes("/")) base = base.split("/")[0];
  if (COMMODITY_CURRENCIES.has(base)) return "commodities";
  if (FIAT_CURRENCIES.has(base)) return "currencies";
  if (STOCKS.has(base)) return "stocks";
  return "crypto";
}

export function splitSymbol(market: BinaryMarket): { base: string; quote: string } {
  let s = market.symbol || `${market.currency}/${market.pair}`;
  s = s.replace(/\s*\(OTC\)/gi, "");
  const parts = s.split("/");
  const clean = (v: string) => (v || "").replace(/_?OTC$/i, "").toUpperCase();
  return { base: clean(parts[0] || market.currency), quote: clean(parts[1] || market.pair) };
}

export const EmojiGlyph = memo(({ emoji, size = 15 }: { emoji?: string; size?: number }) => (
  <span className="leading-none select-none" style={{ fontSize: size, fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' }}>
    {emoji || "•"}
  </span>
));
EmojiGlyph.displayName = "EmojiGlyph";

export const ImgOrEmoji = memo(({ src, emoji, alt, emojiSize }: { src: string | null; emoji?: string; alt: string; emojiSize?: number }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (!src || failed) return <EmojiGlyph emoji={emoji} size={emojiSize} />;
  return <img src={src} alt={alt} loading="lazy" draggable={false} onError={() => setFailed(true)} className="w-full h-full object-cover" />;
});
ImgOrEmoji.displayName = "ImgOrEmoji";

/**
 * A currency pair gets both flags, overlapped. Everything else gets one disc,
 * whose artwork getCryptoImageUrl resolves — a TradingView company logo for a
 * listed equity, a flag for a fiat, a coin for crypto.
 *
 * `size` is opt-in. Without it the markup is the browser panel's original class
 * strings, unchanged, so extracting this could not move a pixel there.
 */
export const AssetIcon = memo(({ market, size }: { market: BinaryMarket; size?: number }) => {
  const cat = classifyMarket(market);
  const { base, quote } = splitSymbol(market);
  const emoji = market.icon;

  if (size) {
    const overlap = Math.round(size * 0.7);
    const disc: React.CSSProperties = {
      width: size,
      height: size,
    };
    const emojiSize = Math.round(size * 0.75);

    if (cat === "currencies") {
      return (
        <div className="relative shrink-0" style={{ width: size + overlap, height: size }}>
          <div
            className="absolute top-0 rounded-full overflow-hidden ring-1 ring-[#222632] bg-zinc-800 z-0 flex items-center justify-center"
            style={{ ...disc, left: overlap }}
          >
            <ImgOrEmoji src={flagUrl(quote)} emoji={emoji} alt={quote} emojiSize={emojiSize} />
          </div>
          <div
            className="absolute left-0 top-0 rounded-full overflow-hidden ring-1 ring-[#222632] bg-zinc-800 z-10 flex items-center justify-center"
            style={disc}
          >
            <ImgOrEmoji src={flagUrl(base)} emoji={emoji} alt={base} emojiSize={emojiSize} />
          </div>
        </div>
      );
    }

    return (
      <div
        className="shrink-0 rounded-full overflow-hidden ring-1 ring-[#222632] bg-zinc-800 flex items-center justify-center"
        style={disc}
      >
        <ImgOrEmoji src={getCryptoImageUrl(base)} emoji={emoji} alt={base} emojiSize={emojiSize} />
      </div>
    );
  }

  if (cat === "currencies") {
    return (
      <div className="relative w-9.5 h-6 shrink-0">
        <div className="absolute left-3.5 top-0 w-5 h-5 rounded-full overflow-hidden ring-1 ring-[#222632] bg-zinc-800 z-0 flex items-center justify-center">
          <ImgOrEmoji src={flagUrl(quote)} emoji={emoji} alt={quote} />
        </div>
        <div className="absolute left-0 top-0 w-5 h-5 rounded-full overflow-hidden ring-1 ring-[#222632] bg-zinc-800 z-10 flex items-center justify-center">
          <ImgOrEmoji src={flagUrl(base)} emoji={emoji} alt={base} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-9.5 h-6 shrink-0 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center ring-1 ring-[#222632] bg-zinc-800">
        <ImgOrEmoji src={getCryptoImageUrl(base)} emoji={emoji} alt={base} />
      </div>
    </div>
  );
});
AssetIcon.displayName = "AssetIcon";
