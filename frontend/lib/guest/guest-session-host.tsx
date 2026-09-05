"use client";

/**
 * Runs the demo session: starts it, keeps its clock, and ends it.
 *
 * Mounted once by the terminal. It owns the three moments that need to happen
 * somewhere central — a guest arriving, the clock running out, and a real
 * account signing in — so no individual screen has to know about any of them.
 */

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUserStore } from "@/store/user";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { useGuestSession } from "@/store/trade/use-guest-session";
import { pickDemoWatchlist } from "@/lib/guest/guest-watchlist";

export default function GuestSessionHost() {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || "en";

  const user = useUserStore((s) => s.user);
  const authStatus = useUserStore((s) => s.authStatus);
  const signedIn = !!user?.email;

  const begin = useGuestSession((s) => s.begin);
  const tick = useGuestSession((s) => s.tick);
  const clear = useGuestSession((s) => s.clear);
  const expired = useGuestSession((s) => s.expired);
  const identity = useGuestSession((s) => s.identity);
  const startedAt = useGuestSession((s) => s.startedAt);
  const tabsSeededAt = useGuestSession((s) => s.tabsSeededAt);
  const markTabsSeeded = useGuestSession((s) => s.markTabsSeeded);

  /* A real account ends the demo outright — otherwise the two identities sit
     side by side and the terminal has to keep choosing between them.
  
     And nothing begins until the question has actually been answered. The
     profile is resolved after mount, so on the first render of a signed-in
     session `user` is null — which this used to read as "guest" and act on
     immediately: a demo identity, a demo balance, a thirty-minute countdown,
     handed to somebody who had just created a real account. The correction
     arrived a moment later and cleared it, which is why it showed up as a
     timer that appears and then vanishes rather than as a stuck state. Now it
     waits for `authStatus` to leave "unknown". */
  useEffect(() => {
    if (signedIn) {
      clear();
      return;
    }
    if (authStatus !== "guest") return;
    begin();
  }, [signedIn, authStatus, begin, clear]);

  /* Seed the tradeable balance from the demo one.
     `balance` is what the trade panel spends against, and for a signed-in user
     it is filled in by fetchDemoBalance() — a request a guest cannot make, so
     it stayed at its initial 0 while the header cheerfully showed the demo
     50,000 beside it. Every trade was refused with "Insufficient balance"
     against a balance the trader could see was there. Seeded once at the start
     of the session; placing and settling keep the two in step after that. */
  useEffect(() => {
    if (signedIn || !identity) return;
    const st = useBinaryStore.getState();
    if (st.tradingMode !== "demo") st.setTradingMode("demo");
    if (st.balance !== st.demoBalance) {
      useBinaryStore.setState({ balance: st.demoBalance });
    }
  }, [signedIn, identity]);

  /* The opening watchlist: twelve assets, two or three per category.

     A guest used to arrive at a single tab and had to go and find everything
     else. Drawn once per session and remembered against `startedAt`, because
     the tabs themselves live in the trade store's own persisted state — redraw
     them on every reload and the assets someone was watching change under them.

     It waits for `currentSymbol` as well as the market list. The store's
     bootstrap picks a symbol when the markets land and appends it to
     activeMarkets, so seeding before that runs produces thirteen tabs; seeding
     after it, with that symbol carried into the draw, produces twelve.

     A guest who closes tabs down to three and reloads keeps their three. The
     marker is the whole point: this is an opening hand, not a policy. */
  useEffect(() => {
    if (signedIn || !identity || startedAt === null) return;
    if (tabsSeededAt === startedAt) return;

    let done = false;

    const seed = () => {
      if (done) return true;
      const st = useBinaryStore.getState();
      if (!st.binaryMarkets.length || !st.currentSymbol) return false;

      const picked = pickDemoWatchlist(st.binaryMarkets, {
        include: st.currentSymbol,
      });
      if (!picked.length) return false;

      done = true;
      useBinaryStore.setState({
        activeMarkets: picked.map((symbol) => ({ symbol, price: 0, change: 0 })),
      });
      markTabsSeeded();
      return true;
    };

    if (seed()) return;

    /* Markets arrive asynchronously and may already be in flight. Watching the
       store is cheaper than polling, and rAF keeps the write out of the
       listener that observed it. */
    let frame = 0;
    const unsubscribe = useBinaryStore.subscribe(() => {
      if (done || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (seed()) unsubscribe();
      });
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [signedIn, identity, startedAt, tabsSeededAt, markTabsSeeded]);

  // One timer for the whole session, not one per component that shows the clock.
  useEffect(() => {
    if (signedIn || expired) return;
    const h = setInterval(tick, 1000);
    tick();
    return () => clearInterval(h);
  }, [signedIn, expired, tick]);

  /* The one hard redirect. Everywhere else a guest is stopped, there is still a
     session worth keeping them in; here there is not. */
  useEffect(() => {
    if (signedIn || !expired || !identity) return;
    router.push(`/${locale}/register?from=demo-expired`);
  }, [signedIn, expired, identity, router, locale]);

  /* Renders nothing. The countdown lives in the account panel, on the demo
     balance it applies to; gated areas send people to the signup page rather
     than opening a dialog over the chart. What this owns is the session
     itself: the clock above, and the redirect when it runs out. */
  return null;
}
