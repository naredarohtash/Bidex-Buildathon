"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import TradingInterface from "./components/trading-interface";
import TerminalSkeleton from "./components/layout/terminal-skeleton";
import { useChartStore } from "@/lib/stubs/chart-engine-stub";
import PriceAlertWatcher from "./components/alerts/price-alert-watcher";
import { initializeBinaryStore, cleanupBinaryStore, useBinaryStore, isSameSymbol } from "@/store/trade/use-binary-store";
import { useUserStore } from "@/store/user";
import { startPreferenceSync, purgeSyncedKeys } from "@/lib/preference-sync";
import { useSearchParams } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useCurrentPrice } from "@/hooks/use-current-price";
import { useShallow } from "zustand/react/shallow";
import GuestSessionHost from "@/lib/guest/guest-session-host";

// Hook to handle viewport height for tablets/mobile (fixes 100vh issue with browser chrome)
function useViewportHeight() {
  useEffect(() => {
    const updateViewportHeight = () => {
      // Use the actual visible viewport height to account for browser UI (address bar, etc.)
      const height = window.innerHeight;
      // No longer divided by 0.95: that compensated for the page zoom, which is
      // gone. innerHeight is now the height the layout actually gets.
      document.documentElement.style.setProperty('--vh', `${height * 0.01}px`);
    };

    updateViewportHeight();

    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', () => {
      // Delay for orientation change to complete
      setTimeout(updateViewportHeight, 100);
    });

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
    };
  }, []);
}

export default function BinaryTradingPage() {
  const t = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const initialSymbolParam = searchParams.get("symbol");
  const [initError, setInitError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    document.title = "BideX - Indian Binary Broker";

    /* Uncaught errors are reported. Console output is not.

       This used to replace console.log, console.warn and console.error with
       wrappers that serialised every argument — JSON.stringify on any object —
       and fired a fetch to the server for each one. console.log ran that
       serialisation on every call in order to decide, from the resulting string,
       whether to report it. The chart engine logs while it draws, so on the
       hottest path in the application every frame's logging did string work and
       some of it opened a request.

       That was instrumentation for a specific investigation and it shipped. The
       two listeners below are what is worth keeping: they fire only when
       something has actually gone wrong, which is rare, and they are the only
       way an error on someone else's machine is ever seen. */
    if (typeof window !== "undefined") {
      const report = (type: string, message: string) => {
        fetch(`/api/exchange/chart?debug=${encodeURIComponent(`[CLIENT-${type}] ${message}`)}`).catch(() => {});
      };

      const handleGlobalError = (event: ErrorEvent) => {
        report("ERROR", `${event.message} at ${event.filename}:${event.lineno}`);
      };

      const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        report("REJECTION", String(event.reason?.message || event.reason));
      };

      window.addEventListener("error", handleGlobalError);
      window.addEventListener("unhandledrejection", handleUnhandledRejection);

      return () => {
        window.removeEventListener("error", handleGlobalError);
        window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      };
    }
  }, []);

  // Handle viewport height for tablets (fixes space under content issue)
  useViewportHeight();

  // Prevent webpage scrolling when terminal is active
  useEffect(() => {
    document.documentElement.classList.add("terminal-active");
    document.body.classList.add("terminal-active");
    return () => {
      document.documentElement.classList.remove("terminal-active");
      document.body.classList.remove("terminal-active");
    };
  }, []);

  // Run the hook to update real-time prices for binary trading
  useCurrentPrice();

  // Parse initial symbol from URL parameters
  const parsedSymbol = useMemo(() => {
    if (initialSymbolParam) {
      // Normalize by replacing all dashes with slashes to match store symbol format (e.g., EUR-USD-OTC -> EUR/USD/OTC).
      // Symbols that already carry a slash are canonical (e.g. BAJAJ-AUTO/OTC) and
      // must be left intact — blindly converting would yield BAJAJ/AUTO/OTC, which
      // matches no market.
      return initialSymbolParam.includes("/")
        ? initialSymbolParam
        : initialSymbolParam.replace(/-/g, "/");
    }
    return null;
  }, [initialSymbolParam]);

  // FIX 3.2: Use versioned initialization to handle race conditions
  // When parsedSymbol changes during initialization, we need to cancel the old
  // initialization and start a new one. A simple ref doesn't handle this case.
  const initializationVersionRef = useRef(0);
  const isInitializingRef = useRef(false);

  // Get user authentication status
  const { user } = useUserStore();

  // Get store state and methods using shallow selector to prevent unnecessary re-renders
  const {
    currentSymbol,
    setCurrentSymbol: setStoreSymbol,
    binaryMarkets,
  } = useBinaryStore(
    useShallow((state) => ({
      currentSymbol: state.currentSymbol,
      setCurrentSymbol: state.setCurrentSymbol,
      binaryMarkets: state.binaryMarkets,
    }))
  );

  // Handle symbol change
  const handleSymbolChange = (symbol: string) => {
    if (symbol && symbol !== currentSymbol) {
      setStoreSymbol(symbol);

      // Keep the URL clean
      const url = `/${locale}/terminal`;
      window.history.replaceState({ path: url }, "", url);
    }
  };

  // Single initialization effect with improved error handling
  // FIX 3.2: Use versioned initialization pattern to handle race conditions
  useEffect(() => {
    // Increment version to invalidate any in-progress initialization
    const currentVersion = ++initializationVersionRef.current;
    let isMounted = true;

    const initializeApp = async () => {
      // Skip if already initializing (but allow if version changed)
      if (isInitializingRef.current && currentVersion === initializationVersionRef.current) {
        return;
      }
      isInitializingRef.current = true;

      try {
        setInitError(null);

        // Initialize the binary store (this will fetch only binary markets and durations)
        await initializeBinaryStore();

        // FIX 3.2: Check if this initialization is still valid (version hasn't changed)
        if (!isMounted || currentVersion !== initializationVersionRef.current) {
          return; // Stale initialization, skip setting state
        }

        // After store is initialized, check if we need to set a symbol from URL
        const store = useBinaryStore.getState();
        const { binaryMarkets: markets, currentSymbol: storeSymbol } = store;

        /* The held symbol is checked against the live market list, not trusted.

           currentSymbol is persisted to localStorage, and the old branching only
           validated a symbol that arrived in the URL: with no URL symbol and a
           stored one present, nothing confirmed it still existed. A browser that
           had once been on an instrument the provider has since dropped, or
           renamed, went on asking for it on every visit — the request returned
           {"data":[],"noData":true}, the chart drew nothing, and it read as "No
           chart data available" on that machine and nowhere else, for the same
           account, until localStorage was cleared or another asset was clicked.

           That is why this looked like a browser problem rather than an account
           one: the bad value lives in the browser. */
        const findMarket = (sym: string | null | undefined) => {
          if (!sym) return undefined;
          return markets.find(m =>
            m.symbol === sym ||
            `${m.currency}${m.pair}` === sym ||
            isSameSymbol(m.symbol, sym)
          );
        };

        if (markets.length > 0) {
          // URL first, then whatever was held, then the first thing that exists.
          const chosen = findMarket(parsedSymbol) ?? findMarket(storeSymbol) ?? markets[0];
          const chosenSymbol = chosen.symbol || `${chosen.currency}${chosen.pair}`;

          if (chosenSymbol !== storeSymbol) {
            if (storeSymbol && !findMarket(storeSymbol)) {
              console.warn(
                `[terminal] stored symbol "${storeSymbol}" is not in the current market list — falling back to ${chosenSymbol}`
              );
            }
            setStoreSymbol(chosenSymbol);
          }
        }

        // Clean up URL query parameters immediately to keep URL as /terminal
        if (typeof window !== "undefined") {
          const cleanUrl = `/${locale}/terminal`;
          window.history.replaceState({ path: cleanUrl }, "", cleanUrl);
        }

        /* The interface opens as soon as it knows what to draw.

           Everything below used to be awaited before isInitialized was set, so
           the chart could not begin loading until the market list, the duration
           list, a dynamic import of the user store, every open order and every
           settled order had all resolved, one after another. Settled history is
           the worst of them: this codebase already carries a note about accounts
           with 1,594 of them, and that whole payload stood between a trader and
           their first candle.

           None of it is needed to draw a chart. The symbol is known by this
           point, which is the only thing the chart was ever waiting for, so the
           orders are fetched alongside the first paint rather than in front of
           it. The positions panel fills in a moment later, which is what a
           positions panel doing a network request should look like. */
        if (isMounted && currentVersion === initializationVersionRef.current) {
          setIsInitialized(true);
        }

        // Deliberately not awaited — see above.
        if (isMounted && currentVersion === initializationVersionRef.current) {
          void (async () => {
            try {
              const { user: authUser } = await import("@/store/user").then((m) =>
                m.useUserStore.getState()
              );
              if (!authUser?.id) return;
              if (!isMounted || currentVersion !== initializationVersionRef.current) return;

              // Ensure WebSocket is initialized
              useBinaryStore.getState().initOrderWebSocket();
              // Replaces any stale persisted state once it lands.
              await Promise.all([
                useBinaryStore.getState().fetchActiveOrders(),
                useBinaryStore.getState().fetchCompletedOrders(),
              ]);
            } catch (err) {
              console.warn("[BinaryPage] Order fetch after init failed:", err);
            }
          })();
        }
      } catch (error) {
        console.error("Failed to initialize binary trading app:", error);
        // FIX 3.2: Only set error if this initialization is still valid
        if (isMounted && currentVersion === initializationVersionRef.current) {
          setInitError("Failed to initialize trading interface. Please refresh the page.");
        }
      } finally {
        // FIX 3.2: Only clear initializing flag if this is still the current version
        if (currentVersion === initializationVersionRef.current) {
          isInitializingRef.current = false;
        }
      }
    };

    initializeApp();

    // Cleanup function
    return () => {
      isMounted = false;

      // Always cleanup on unmount
      cleanupBinaryStore();

      // FIX 3.2: Reset initializing flag on cleanup
      isInitializingRef.current = false;
    };
  }, [setStoreSymbol, user?.id]);

  // Synchronize URL symbol parameter changes (e.g. back/forward navigation)
  useEffect(() => {
    if (parsedSymbol && currentSymbol && binaryMarkets.length > 0) {
      if (!isSameSymbol(currentSymbol, parsedSymbol)) {
        const market = binaryMarkets.find(m =>
          m.symbol === parsedSymbol ||
          `${m.currency}${m.pair}` === parsedSymbol ||
          isSameSymbol(m.symbol, parsedSymbol)
        );
        if (market) {
          const selectedSymbol = market.symbol || `${market.currency}${market.pair}`;
          setStoreSymbol(selectedSymbol);
        }
      }
    }
  }, [parsedSymbol, currentSymbol, setStoreSymbol, binaryMarkets]);

  // Track previous user ID to detect actual logout (not initial undefined state)
  const prevUserIdRef = useRef<string | undefined>(undefined);

  // Listen for binary settings updates from admin panel (cross-tab communication)
  useEffect(() => {
    const handleSettingsUpdate = (event: StorageEvent) => {
      if (event.key === 'binary_settings_updated') {
        // Admin saved new settings, refresh durations and settings
        const { forceRefreshDurations, forceRefreshSettings } = useBinaryStore.getState();
        forceRefreshDurations();
        forceRefreshSettings();
      }
    };

    window.addEventListener('storage', handleSettingsUpdate);
    return () => window.removeEventListener('storage', handleSettingsUpdate);
  }, []);

  // Mirror terminal preferences (pinned tabs, trading settings, chart options,
  // indicators, layout) to the account, so the workspace follows the user
  // between devices instead of living only in this browser's storage. Signed-in
  // only: there is nowhere to store them otherwise, and an anonymous session
  // must never overwrite an account's saved copy.
  useEffect(() => {
    if (!user?.id) return;
    return startPreferenceSync(user.id);
  }, [user?.id]);

  // Handle user authentication changes
  useEffect(() => {
    const { fetchCompletedOrders, fetchActiveOrders } = useBinaryStore.getState();

    if (user?.id) {
      /* A different account than the one this tab last held.

         Signing out and back in as someone else does not reload the page, so
         everything cached for the previous account is still sitting there. The
         balance was the visible symptom: fetchWalletData caches its answer in
         sessionStorage under `wallet_USDT` — the currency, with no account in
         the key — and serves it for 30 seconds. Within that window the new
         account either read the previous account's figure or, because logout
         sets realBalance to null and nothing here asked for it again, showed
         nothing at all. A manual refresh fixed it, which is exactly the shape of
         a stale cache.

         So: drop every wallet entry and ask for the balance again, rather than
         waiting for something else to happen to trigger a fetch. */
      const switchedAccount = prevUserIdRef.current !== undefined && prevUserIdRef.current !== user.id;
      if (switchedAccount || prevUserIdRef.current === undefined) {
        try {
          const stale: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith("wallet_")) stale.push(key);
          }
          stale.forEach((key) => sessionStorage.removeItem(key));
        } catch {
          /* storage unavailable */
        }
        // A fetch follows immediately below, so this is a genuine load.
        useBinaryStore.setState({ realBalance: null, walletStatus: "loading" });
      }

      // User logged in - fetch orders globally
      // Initialize WebSocket connection for binary orders
      useBinaryStore.getState().initOrderWebSocket();

      Promise.all([
        fetchCompletedOrders(),
        fetchActiveOrders(),
        // forceRefresh, because the cache above may have been repopulated by an
        // in-flight request from the previous session between the two effects.
        useBinaryStore.getState().fetchWalletData(undefined, true, true),
      ]).catch(error => {
        console.error("Failed to fetch orders after auth:", error);
      });
      prevUserIdRef.current = user.id;
    } else if (prevUserIdRef.current) {
      // User actually logged out (was previously logged in) - clear user-specific data
      // Note: We don't need to reinitialize the store - just clear orders and reset balance
      useBinaryStore.setState({
        orders: [],
        completedOrders: [],
        realBalance: null,
        // Signed out: the balance is not loading, it is unavailable until
        // someone signs in. Saying so beats an animation that never ends.
        walletStatus: "unauthenticated",
        balance: useBinaryStore.getState().demoBalance // Reset to demo balance
      });
      // Clearing store state alone is not enough: binary-trading-store persists
      // orders, completedOrders and demoBalance to browser storage, which
      // outlives the session. Without this, signing into a different account on
      // the same browser rehydrates the previous account's trades — and with
      // preference sync running, would upload them to the new account.
      purgeSyncedKeys();
      // The wallet cache is session-scoped but not account-scoped, so it has to
      // go with the rest. Belt and braces: the login branch clears it too.
      try {
        const stale: string[] = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith("wallet_")) stale.push(key);
        }
        stale.forEach((key) => sessionStorage.removeItem(key));
      } catch {
        /* storage unavailable */
      }
      prevUserIdRef.current = undefined;
    }
    // If user?.id is undefined and prevUserIdRef.current is also undefined,
    // this is initial load - don't do anything, let the main init effect handle it
  }, [user?.id]);

  // The skeleton covers the workspace until the chart itself has candles, so the
  // platform appears in one go instead of handing off to a second "Loading
  // chart…" state. The app still mounts underneath it — that is what makes the
  // chart fetch in the first place — and a hard cap keeps a stalled feed from
  // trapping the user behind the overlay.
  const chartCandleCount = useChartStore((s: any) => s.candles?.length ?? 0);
  const chartLoading = useChartStore((s: any) => s.state?.isLoading ?? false);
  const chartReady = chartCandleCount > 0 && !chartLoading;

  /* The escape hatch for a feed that never delivers, at 800ms rather than 3s.

     A healthy load never reaches this timer — the skeleton lifts the moment
     candles land. It only matters when they do not, and three seconds of
     placeholder is long enough to conclude the platform is broken. Now that the
     workspace mounts before initialisation finishes (below), candles are usually
     already in hand by the time the rest is ready, so this fires less often as
     well as sooner. */
  const [bootWaitElapsed, setBootWaitElapsed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setBootWaitElapsed(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const bootReady = mounted && isInitialized && !initError;

  /* Mounted as soon as we know what to draw, not when every request has landed.

     The comment above this block has always claimed the workspace mounts under
     the skeleton so the chart can start fetching — but the render was gated on
     bootReady, which waits on markets, settings, durations and the demo balance.
     Nothing existed to fetch a candle until all four returned, so the chart's
     request started only after them rather than alongside.

     The symbol is the one thing the chart needs, and for anyone who has been
     here before it is already in localStorage — known before a single request is
     made. So the workspace mounts on that, and the four requests and the first
     candles travel together instead of in a queue. A browser with no stored
     symbol still waits for the market list, because until it arrives there is
     genuinely nothing to draw.

     The skeleton is fixed inset-0 at z-9999, so none of this is visible: what
     mounts underneath is covered until it is ready to be seen. */
  const canMountWorkspace = mounted && !initError && (isInitialized || !!currentSymbol);
  const showSkeleton = !bootReady || (!chartReady && !bootWaitElapsed);

  // Show error state if initialization failed
  if (initError) {
    return (
      <div className="min-h-screen-mobile h-screen-mobile bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 p-8 bg-card rounded-lg max-w-md text-center shadow-xl border border-border">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white">{t("initialization_error")}</h2>
          <p className="text-red-400 text-sm">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            {t("refresh_page")}
          </button>
        </div>
      </div>
    );
  }

  // Render the trading interface directly - it handles its own loading states
  // Use a fallback symbol while loading to prevent flash
  const displaySymbol = currentSymbol || "BTC/USDT";

  return (
    <>
      {canMountWorkspace && (
        <div className="min-h-screen-mobile h-screen-mobile bg-background flex flex-col overflow-hidden">
          <TradingInterface
            currentSymbol={displaySymbol}
            onSymbolChange={handleSymbolChange}
          />
          {/* Global price-alert watcher: watches every alerted symbol across assets
              and fires a notification when a level is hit (toasts render on-chart). */}
          <PriceAlertWatcher />
          {/* Owns the demo session for anyone who has not signed in: its
              identity, its 30-minute clock, and the sign-up prompt. Renders
              nothing at all once a real account is present. */}
          <GuestSessionHost />
        </div>
      )}
      {showSkeleton && <TerminalSkeleton />}
    </>
  );
}
