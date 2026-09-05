"use client";

/**
 * The homepage.
 *
 * What it replaced was 1,300 lines carrying a brand-mode switch that named two
 * competitors, a bento grid, a testimonial carousel, an FAQ, a contact form, and
 * a row of statistics nobody could source. This is five sections, and the rule
 * for all of them is that every number on the page is one this platform can
 * prove: the market count is fetched, the prices are the live ticker feed, the
 * payout arithmetic is the arithmetic the order panel does. Nothing here is a
 * placeholder wearing a percent sign.
 *
 * The visual language is the terminal's, because that is what the page is
 * selling: hairlines instead of cards, spaced uppercase for labels, tabular
 * figures, one blue. No gradient meshes, no floating glass, no icon tiles.
 */

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { AuthMarketRail } from "@/components/auth/auth-market-rail";
import { useUserStore } from "@/store/user";
import { cn, PAGE_CONTAINER } from "@/lib/utils";

/** The terminal's own surface, used wherever this page shows the product. */
const PANEL_BG = "#070c15";

export default function DefaultHomePage(): React.JSX.Element {
  return (
    <div className="bg-background text-foreground">
      <Hero />
    </div>
  );
}

/**
 * How many instruments this deployment actually lists.
 *
 * Fetched rather than written down. A number typed into a marketing page is
 * true on the day it is typed and slowly becomes a lie; this one cannot drift,
 * and it renders nothing at all until it has an answer.
 */
function useMarketCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/exchange/binary/market")
      .then((r) => (r.ok ? r.json() : null))
      .then((markets) => {
        if (!alive || !Array.isArray(markets)) return;
        setCount(markets.filter((m) => m?.status !== false).length);
      })
      .catch(() => {
        /* No count, no claim. */
      });
    return () => {
      alive = false;
    };
  }, []);

  return count;
}

function Hero() {
  const user = useUserStore((s) => s.user);
  /* Signed in, or not yet sure. The profile is resolved after mount, so this
     was false on the first render of a signed-in session and the page offered
     a customer with an account the guest demo — "Try the demo, 30 minutes, no
     sign-up" — under a heading welcoming them back. Undecided reads as signed
     in here: the cost of being wrong that way is one button briefly saying
     "Open the terminal" to a guest, which is where the demo lives anyway. */
  const authStatus = useUserStore((s) => s.authStatus);
  const signedIn = !!user?.email || authStatus === "unknown";
  const count = useMarketCount();

  return (
    <section>
      {/* Two columns, because one was leaving half the screen empty.

          A left-aligned headline in a 720px column on a 1440px page is a
          headline with a blank half beside it, and the answer is not to centre
          the text — it is to put something there worth reading. The live board
          was doing exactly that job in a band underneath, one scroll too late.
          Beside the headline it fills the space and evidences the claim the
          headline makes, in the same glance.

          Stacked on anything narrower, board second. */}
      <div className={cn(PAGE_CONTAINER, "grid grid-cols-1 items-center gap-12 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:gap-16 lg:py-28")}>
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[52px]">
            Buy or Sell.
            <br />
            That&apos;s the whole trade.
          </h1>

          <p className="mt-6 max-w-[520px] text-[16px] leading-relaxed text-muted-foreground sm:text-[17px]">
            Pick a market and an expiry. The payout is a number on the screen
            before the position opens, not something you discover on the way out.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            {signedIn ? (
              <PrimaryLink href="/terminal">Open the terminal</PrimaryLink>
            ) : (
              <>
                <PrimaryLink href="/register">Create an Account</PrimaryLink>
                <SecondaryLink href="/terminal">
                  Try the demo — 30 minutes, no sign-up
                </SecondaryLink>
              </>
            )}
          </div>

          {/* One line of facts, each checkable. The market count is simply
              absent until the API has answered. */}
          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
            {count !== null && <>{count} markets</>}
            {count !== null && <span className="mx-2 opacity-40">·</span>}
            Currencies · Crypto · Commodities · Stocks
          </p>
        </div>

        {/* The board keeps the terminal's dark surface in every theme, for the
            same reason the auth pages' brand panel does: it depicts the product,
            not the interface around it. */}
        <div
          className="rounded-xl border border-white/[0.09] p-5 sm:p-6"
          style={{ backgroundColor: PANEL_BG }}
        >
          <AuthMarketRail rows={6} />
          <p className="mt-5 text-[12px] leading-relaxed text-[#8b93a5]">
            The same feed the terminal reads. These move while you read them.
          </p>
        </div>
      </div>
    </section>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0052ff] px-6 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-[#0041cc] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#0052ff]/35"
    >
      {children}
      <ArrowRight
        size={16}
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center justify-center rounded-lg border border-field-border bg-field px-6 text-[14px] font-semibold text-foreground transition-colors duration-200 hover:border-foreground/30"
    >
      {children}
    </Link>
  );
}
