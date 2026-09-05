/**
 * The watchlist a demo session opens with.
 *
 * A guest used to arrive at one tab — whatever selectBestMarket picked — and a
 * single asset is a poor advertisement for a broker that lists 212 across five
 * categories. Someone with thirty minutes and no account should be able to see
 * what is on offer without going hunting for it.
 *
 * So: twelve, two or three from each category, drawn at random. Random rather
 * than a curated dozen because a fixed list is a second thing to maintain that
 * silently rots when a market is delisted — and because two people comparing
 * demos should not see an identical screen.
 *
 * Guests only. A signed-in trader's tabs are their own choice and persist; the
 * one thing this must never do is overwrite them.
 */

import { classifyMarket } from "@/components/markets/asset-icon";
import type { BinaryMarket } from "@/store/trade/use-binary-store";

export const DEMO_WATCHLIST_SIZE = 12;
export const MIN_PER_CATEGORY = 2;
export const MAX_PER_CATEGORY = 3;

/** The same normalisation the backend uses to match a market to a ticker. */
const normalize = (s: string): string =>
  String(s || "")
    .replace(/\(?\s*OTC\s*\)?/gi, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

const symbolOf = (m: BinaryMarket): string =>
  m.symbol || (m.currency && m.pair ? `${m.currency}/${m.pair}` : "");

/** Fisher–Yates, against an injectable source so the tests are not a coin toss. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface PickOptions {
  size?: number;
  /**
   * A symbol that must survive into the result — the one the chart is already
   * showing. Without this the store's own bootstrap appends its pick afterwards
   * and the rail opens with thirteen tabs.
   */
  include?: string | null;
  random?: () => number;
}

/**
 * Twelve symbols, spread across the categories.
 *
 * Allocation is two per category first, then single extras handed out in random
 * category order up to three, which reaches exactly twelve on five categories
 * (3+3+2+2+2). The cap is a shape, not a rule: a deployment listing fewer
 * categories cannot reach twelve inside it, and twelve assets matters more than
 * an even spread nobody counts, so the remainder is then filled from whatever
 * is left. A deployment with fewer than twelve markets simply gets all of them.
 */
export function pickDemoWatchlist(
  markets: BinaryMarket[],
  { size = DEMO_WATCHLIST_SIZE, include = null, random = Math.random }: PickOptions = {}
): string[] {
  const tradable = (markets || []).filter(
    (m) => m && m.status !== false && symbolOf(m)
  );
  if (!tradable.length) return [];

  const byCategory = new Map<string, BinaryMarket[]>();
  for (const m of tradable) {
    const key = classifyMarket(m);
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(m);
    else byCategory.set(key, [m]);
  }

  /* Category order is shuffled too. Handing the extra slots out in map order
     would mean the same two categories always got three. */
  const pools = shuffle([...byCategory.values()], random).map((group) =>
    shuffle(group, random)
  );

  const taken: BinaryMarket[] = [];
  const takeFrom = (pool: BinaryMarket[], count: number) => {
    for (let i = 0; i < count && pool.length && taken.length < size; i++) {
      taken.push(pool.shift() as BinaryMarket);
    }
  };

  for (const pool of pools) takeFrom(pool, MIN_PER_CATEGORY);
  for (const pool of pools) {
    if (taken.length >= size) break;
    takeFrom(pool, MAX_PER_CATEGORY - MIN_PER_CATEGORY);
  }
  // Still short: the categories cannot supply `size` within the cap.
  for (const pool of pools) {
    if (taken.length >= size) break;
    takeFrom(pool, pool.length);
  }

  const symbols = taken.map(symbolOf);

  if (!include) return symbols;

  /* Keep the open chart. If it is already in the draw, move it to the front so
     the selected tab is the first one; if not, it displaces the last pick. */
  const wanted = normalize(include);
  const at = symbols.findIndex((s) => normalize(s) === wanted);
  if (at >= 0) {
    const [current] = symbols.splice(at, 1);
    return [current, ...symbols];
  }

  const listed = tradable.find((m) => normalize(symbolOf(m)) === wanted);
  if (!listed) return symbols;
  return [symbolOf(listed), ...symbols.slice(0, size - 1)];
}
