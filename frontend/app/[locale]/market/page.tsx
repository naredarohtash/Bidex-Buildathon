"use client";

/**
 * Markets.
 *
 * This page read /api/exchange/market — the spot exchange — on a platform that
 * does not run one. That endpoint returns an empty array and always will, so
 * the page was permanently blank while 212 tradeable instruments sat in the
 * binary market table the terminal actually uses.
 *
 * It reads those now, grouped by the category they already carry: Indian
 * stocks, currencies, crypto, global stocks and commodities. Every row goes
 * straight to the terminal with that instrument selected, because a market list
 * whose entries cannot be traded from is a brochure.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, TrendingUp, Flame, Loader2, ArrowRight } from "lucide-react";
import { $fetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import SiteHeader from "@/components/partials/header/site-header";
import Footer from "@/components/partials/footer";

interface BinaryMarket {
  id: string;
  currency: string;
  pair: string;
  symbol: string;
  label: string;
  category: string;
  icon: string | null;
  isTrending: boolean;
  isHot: boolean;
  status: boolean;
  isOtc: boolean;
}

/* The categories as the data spells them, with names people use. Anything with
   a category not listed here still appears — under its own raw name rather than
   being dropped, so a new category added later shows up instead of vanishing. */
const CATEGORY_LABEL: Record<string, string> = {
  indian_stocks: "Indian stocks",
  currency: "Currencies",
  crypto: "Crypto",
  stock: "Global stocks",
  commodity: "Commodities",
};

const prettyCategory = (key: string) =>
  CATEGORY_LABEL[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function MarketsPage() {
  const [markets, setMarkets] = useState<BinaryMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await $fetch<BinaryMarket[]>({
      url: "/api/exchange/binary/market",
      silent: true,
      silentSuccess: true,
    });
    setMarkets(error || !Array.isArray(data) ? [] : data.filter((m) => m.status));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Tabs are built from the data, not hard-coded, so the page cannot end up
     offering a category that no longer has instruments in it. */
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of markets) counts.set(m.category, (counts.get(m.category) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [markets]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return markets.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (!q) return true;
      return (
        m.currency.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        prettyCategory(m.category).toLowerCase().includes(q)
      );
    });
  }, [markets, category, query]);

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <div className="container mx-auto px-4 pb-16 pt-24">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Markets</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {loading
              ? "Loading instruments…"
              : `${markets.length} instruments you can trade right now.`}
          </p>
        </header>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:max-w-xs sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search instruments"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                category === "all"
                  ? "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              All <span className="tabular-nums opacity-60">{markets.length}</span>
            </button>
            {categories.map(([key, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  category === key
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {prettyCategory(key)} <span className="tabular-nums opacity-60">{count}</span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[280px] place-items-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-border py-16 text-center">
            <p className="text-[13px] font-medium text-foreground">
              {markets.length === 0 ? "No instruments available" : "Nothing matches that search"}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {markets.length === 0
                ? "Markets are configured in the admin panel."
                : "Try a different name or category."}
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((m) => (
              /* Straight into the terminal with this instrument selected. A list
                 you can only look at is a brochure. */
              <Link
                key={m.id}
                href={`/terminal?symbol=${encodeURIComponent(m.symbol)}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-muted text-base">
                  {m.icon || m.currency.slice(0, 1)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-foreground">
                      {m.currency}
                    </span>
                    {m.isHot && <Flame className="h-3 w-3 shrink-0 text-orange-500" />}
                    {m.isTrending && <TrendingUp className="h-3 w-3 shrink-0 text-emerald-500" />}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                    {prettyCategory(m.category)}
                    {m.isOtc && " · OTC"}
                  </span>
                </span>

                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
