import { describe, expect, it } from "vitest";
import {
  DEMO_WATCHLIST_SIZE,
  MAX_PER_CATEGORY,
  MIN_PER_CATEGORY,
  pickDemoWatchlist,
} from "./guest-watchlist";

/* A deterministic source, so a failure is a bug rather than a bad draw. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

type Cat = "currency" | "crypto" | "commodity" | "stock" | "indian_stocks";

function market(symbol: string, category: Cat, extra: Record<string, any> = {}) {
  const [currency, pair] = symbol.split("/");
  return { symbol, label: symbol, currency, pair, category, status: true, ...extra } as any;
}

/** The shape of the real deployment: five categories, none of them thin. */
function fullBook() {
  const cats: Cat[] = ["currency", "crypto", "commodity", "stock", "indian_stocks"];
  return cats.flatMap((cat) =>
    Array.from({ length: 8 }, (_, i) => market(`${cat.toUpperCase()}${i}/OTC`, cat))
  );
}

const categoryOf = (symbol: string) => symbol.split(/\d/)[0];

describe("pickDemoWatchlist", () => {
  it("draws exactly twelve", () => {
    const picked = pickDemoWatchlist(fullBook(), { random: seeded(1) });
    expect(picked).toHaveLength(12);
  });

  it("pins the shape it promises", () => {
    /* Asserted as literals below, not as these constants — a test that reads
       its expectation out of the module under test cannot fail when the module
       changes its mind. Widening the cap has to break something. */
    expect(MIN_PER_CATEGORY).toBe(2);
    expect(MAX_PER_CATEGORY).toBe(3);
    expect(DEMO_WATCHLIST_SIZE).toBe(12);
  });

  it("takes two or three from every category", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const picked = pickDemoWatchlist(fullBook(), { random: seeded(seed) });
      const counts = new Map<string, number>();
      for (const s of picked) {
        counts.set(categoryOf(s), (counts.get(categoryOf(s)) || 0) + 1);
      }
      expect(counts.size).toBe(5);
      for (const n of counts.values()) {
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(3);
      }
    }
  });

  it("never repeats a symbol", () => {
    const picked = pickDemoWatchlist(fullBook(), { random: seeded(7) });
    expect(new Set(picked).size).toBe(picked.length);
  });

  it("draws a different set on a different session", () => {
    const a = pickDemoWatchlist(fullBook(), { random: seeded(1) });
    const b = pickDemoWatchlist(fullBook(), { random: seeded(2) });
    expect(a).not.toEqual(b);
  });

  it("keeps the open chart, first, without growing the list", () => {
    /* The store's bootstrap appends its own pick to activeMarkets, so a symbol
       left out here comes back as a thirteenth tab. */
    const book = fullBook();
    const open = "CRYPTO5/OTC";
    for (let seed = 1; seed <= 25; seed++) {
      const picked = pickDemoWatchlist(book, { include: open, random: seeded(seed) });
      expect(picked).toHaveLength(DEMO_WATCHLIST_SIZE);
      expect(picked[0]).toBe(open);
      expect(picked.filter((s) => s === open)).toHaveLength(1);
    }
  });

  it("matches the open chart across OTC spelling", () => {
    const book = [...fullBook(), market("AUD/CAD_OTC", "currency")];
    const picked = pickDemoWatchlist(book, {
      include: "AUD/CAD (OTC)",
      random: seeded(3),
    });
    expect(picked[0]).toBe("AUD/CAD_OTC");
  });

  it("ignores markets that are switched off", () => {
    const book = fullBook().map((m) =>
      m.category === "commodity" ? { ...m, status: false } : m
    );
    const picked = pickDemoWatchlist(book, { random: seeded(4) });
    expect(picked.some((s) => categoryOf(s) === "COMMODITY")).toBe(false);
    expect(picked).toHaveLength(DEMO_WATCHLIST_SIZE);
  });

  it("still reaches twelve when too few categories can supply it", () => {
    /* Two categories cap out at six between them. Twelve assets is the part
       that matters, so the cap gives way rather than the count. */
    const book = [
      ...Array.from({ length: 9 }, (_, i) => market(`CRYPTO${i}/OTC`, "crypto")),
      ...Array.from({ length: 9 }, (_, i) => market(`STOCK${i}/OTC`, "stock")),
    ];
    const picked = pickDemoWatchlist(book, { random: seeded(5) });
    expect(picked).toHaveLength(DEMO_WATCHLIST_SIZE);
    expect(new Set(picked).size).toBe(DEMO_WATCHLIST_SIZE);
  });

  it("takes what exists when the book is smaller than twelve", () => {
    const book = [
      market("CRYPTO0/OTC", "crypto"),
      market("CRYPTO1/OTC", "crypto"),
      market("STOCK0/OTC", "stock"),
    ];
    expect(pickDemoWatchlist(book, { random: seeded(6) })).toHaveLength(3);
  });

  it("returns nothing rather than guessing when no markets loaded", () => {
    expect(pickDemoWatchlist([], { random: seeded(8) })).toEqual([]);
  });
});
