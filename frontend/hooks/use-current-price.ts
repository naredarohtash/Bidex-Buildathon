"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/routing";
import { useBinaryStore } from "@/store/trade/use-binary-store";
import { tickersWs } from "@/services/tickers-ws";
import type { TickerData } from "@/services/market-data-ws";

export function useCurrentPrice(): void {
  const pathname = usePathname();
  const isBinaryPage = pathname.startsWith("/terminal");
  const currentSymbol = useBinaryStore((state) => state.currentSymbol);

  // 1. WebSocket Ticker Subscription Sync
  useEffect(() => {
    if (!isBinaryPage || !currentSymbol) return;

    tickersWs.initialize();

    const unsubscribe = tickersWs.subscribeToSpotData((data) => {
      const state = useBinaryStore.getState();
      const { currentSymbol: activeSymbol, binaryMarkets, setCurrentPrice, updateActiveMarketsFromTicker } = state;

      if (activeSymbol && binaryMarkets) {
        const binaryMarket = binaryMarkets.find(m => 
          m.symbol === activeSymbol || 
          `${m.currency}${m.pair}` === activeSymbol ||
          `${m.currency}/${m.pair}` === activeSymbol
        );

        // Check both window.__chartStore and window.__useChartStore
        const chartStore = typeof window !== "undefined"
          ? ((window as any).__chartStore?.getState?.() || (window as any).__useChartStore?.getState?.())
          : null;

        const liveChartPrice = (chartStore && typeof chartStore.currentPrice === "number" && chartStore.currentPrice > 0)
          ? chartStore.currentPrice
          : (chartStore?.candles?.length > 0 ? chartStore.candles[chartStore.candles.length - 1].close : undefined);

        let marketData: TickerData | undefined = undefined;
        if (binaryMarket) {
          if (binaryMarket.label) marketData = data[binaryMarket.label];
          if (!marketData && binaryMarket.symbol) marketData = data[binaryMarket.symbol];
          if (!marketData) marketData = data[`${binaryMarket.currency}/${binaryMarket.pair}`];
          if (!marketData) marketData = data[`${binaryMarket.currency}${binaryMarket.pair}`];
        }

        const priceToSet = liveChartPrice || marketData?.last;
        if (priceToSet && priceToSet > 0) {
          setCurrentPrice(priceToSet);
        }

        updateActiveMarketsFromTicker(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isBinaryPage, currentSymbol]);

  // 2. High-Frequency Continuous Sync with Chart Engine Store
  useEffect(() => {
    if (!isBinaryPage || typeof window === "undefined") return;

    const syncLivePrice = () => {
      const chartStore = (window as any).__chartStore?.getState?.() || (window as any).__useChartStore?.getState?.();
      if (chartStore) {
        let price = chartStore.currentPrice;
        if ((!price || price <= 0) && Array.isArray(chartStore.candles) && chartStore.candles.length > 0) {
          price = chartStore.candles[chartStore.candles.length - 1].close;
        }
        if (typeof price === "number" && price > 0) {
          const currentStorePrice = useBinaryStore.getState().currentPrice;
          if (currentStorePrice !== price) {
            useBinaryStore.getState().setCurrentPrice(price);
          }
        }
      }
    };

    syncLivePrice();
    const interval = setInterval(syncLivePrice, 50);

    let unsubscribeStore: (() => void) | null = null;
    const chartStoreObj = (window as any).__chartStore || (window as any).__useChartStore;
    if (chartStoreObj && typeof chartStoreObj.subscribe === "function") {
      unsubscribeStore = chartStoreObj.subscribe((state: any) => {
        const p = state?.currentPrice;
        if (typeof p === "number" && p > 0) {
          useBinaryStore.getState().setCurrentPrice(p);
        }
      });
    }

    return () => {
      clearInterval(interval);
      if (unsubscribeStore) unsubscribeStore();
    };
  }, [isBinaryPage, currentSymbol]);
}

