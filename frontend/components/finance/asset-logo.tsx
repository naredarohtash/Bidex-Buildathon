"use client";

/**
 * Real asset marks.
 *
 * These were coloured gradient circles with the first four letters of the
 * ticker printed on them. The platform ships 9,800 actual coin logos in
 * /img/crypto and the screen this replaced was already using them — inventing a
 * substitute made the whole panel look like a placeholder someone forgot to
 * finish.
 *
 * Bank transfer and UPI have no logo to use, and a made-up one would look worse
 * than none. They get a plain monochrome glyph in the same container instead,
 * which reads as deliberate rather than missing.
 */

import { memo, useState } from "react";
import { Smartphone, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

/* Ticker -> file. The asset directory is keyed by lowercase symbol, so this is
   only needed where a method id is not simply the ticker. */
const LOGO: Record<string, string> = {
  USDT: "/img/crypto/usdt.webp",
  BTC: "/img/crypto/btc.webp",
  ETH: "/img/crypto/eth.webp",
  TRX: "/img/crypto/trx.webp",
  LTC: "/img/crypto/ltc.webp",
};

/* Chain badges — the small marker showing WHICH network, overlaid on the coin.
   Only Tron was mapped, so USDT on Tron and USDT on Ethereum drew the identical
   mark: two rows a trader has to tell apart to avoid destroying their funds,
   rendered indistinguishably. Every network a method can use is here now. */
const CHAIN: Record<string, string> = {
  TRX: "/img/crypto/trx.webp",
  ETH: "/img/crypto/eth.webp",
  BTC: "/img/crypto/btc.webp",
  LTC: "/img/crypto/ltc.webp",
};

export const AssetLogo = memo(function AssetLogo({
  asset,
  network,
  size = 36,
  showChain = false,
  className,
}: {
  asset: string;
  network?: string;
  size?: number;
  /** Overlay the network badge — only useful where one coin spans two chains. */
  showChain?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const symbol = (asset || "").toUpperCase();
  const src = LOGO[symbol] || `/img/crypto/${symbol.toLowerCase()}.webp`;
  const chainSrc = network ? CHAIN[network.toUpperCase()] : undefined;

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {failed ? (
        /* Last resort. Neutral, not a coloured blob pretending to be a brand. */
        <span
          className="grid h-full w-full place-items-center rounded-full border border-border bg-muted text-[10px] font-semibold text-muted-foreground"
          aria-label={symbol}
        >
          {symbol.slice(0, 3)}
        </span>
      ) : (
        <img
          src={src}
          alt={symbol}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full object-contain"
        />
      )}

      {showChain && chainSrc && !failed && (
        <img
          src={chainSrc}
          alt={network}
          width={size * 0.42}
          height={size * 0.42}
          loading="lazy"
          className="absolute -bottom-0.5 -right-0.5 rounded-full border border-background bg-background object-contain"
          style={{ width: size * 0.42, height: size * 0.42 }}
        />
      )}
    </span>
  );
});

/**
 * The mark for a withdrawal method.
 *
 * Crypto uses the real coin logo; bank and UPI use a glyph, since there is no
 * honest logo for "any Indian bank".
 */
export const MethodLogo = memo(function MethodLogo({
  kind,
  asset,
  size = 36,
}: {
  kind: "CRYPTO" | "BANK" | "UPI";
  asset?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (kind === "CRYPTO" && asset) {
    return <AssetLogo asset={asset} size={size} />;
  }

  // UPI ships a real mark in the asset set; using a generic phone glyph for a
  // brand every Indian user recognises made the row look unfinished.
  if (kind === "UPI" && !failed) {
    return (
      <img
        src="/img/crypto/upi.webp"
        alt="UPI"
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full bg-white object-contain p-0.5"
        style={{ width: size, height: size }}
      />
    );
  }

  /* Bank transfer has no logo it could honestly wear — it is every bank, not
     one — so it gets a drawn mark rather than a borrowed one. */
  const Glyph = kind === "UPI" ? Smartphone : Landmark;
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full border border-border bg-muted"
      style={{ width: size, height: size }}
    >
      <Glyph className="text-foreground/70" style={{ width: size * 0.46, height: size * 0.46 }} />
    </span>
  );
});

export default AssetLogo;
