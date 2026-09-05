"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePriceAlertStore } from "@/store/trade/use-price-alert-store";
import { marketDataWs } from "@/services/market-data-ws";
import { SoundManager } from "@/components/binary/notifications/core/sound-manager";

/**
 * Headless watcher: for every symbol that has an active (untriggered) price
 * alert, subscribe to its live 1m feed and fire the alert when price crosses the
 * target — regardless of which chart is currently open. Mount once, at a stable
 * parent (not the chart, which remounts on symbol change).
 */
export default function PriceAlertWatcher() {
  const alerts = usePriceAlertStore((s) => s.alerts);
  const fireAlert = usePriceAlertStore((s) => s.fireAlert);

  // Keep a live ref so the WS callbacks always see the latest alerts without
  // needing to re-subscribe on every alert edit.
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  // Last seen price per symbol — needed to detect a *crossing* (not just level).
  const lastPriceRef = useRef<Record<string, number>>({});
  // First-touch candidates: an alert only fires when the crossing is confirmed
  // by a SECOND consecutive tick — a single stray tick must never fire it.
  const pendingRef = useRef<Record<string, true>>({});

  // Only (re)subscribe when the SET of symbols-with-active-alerts changes.
  const symbolsKey = useMemo(() => {
    const set = new Set(alerts.filter((a) => !a.triggered).map((a) => a.symbol));
    return Array.from(set).sort().join("|");
  }, [alerts]);

  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split("|").filter(Boolean);

    const unsubs = symbols.map((symbol) =>
      marketDataWs.subscribe<{ data?: number[][] }>(
        { symbol, type: "ohlcv", marketType: "spot", interval: "1m" },
        (msg) => {
          const arr = msg?.data;
          if (!Array.isArray(arr) || arr.length === 0) return;
          const last = arr[arr.length - 1];
          const price = Number(last?.[4]); // close
          if (!Number.isFinite(price) || price <= 0) return;

          const prev = lastPriceRef.current[symbol];
          lastPriceRef.current[symbol] = price;
          if (prev === undefined) return; // need a baseline before we can detect a cross

          for (const a of alertsRef.current) {
            if (a.triggered || a.symbol !== symbol) continue;
            const crossedUp = a.condition === "above" && prev < a.targetPrice && price >= a.targetPrice;
            const crossedDown = a.condition === "below" && prev > a.targetPrice && price <= a.targetPrice;
            const stillBeyond =
              (a.condition === "above" && price >= a.targetPrice) ||
              (a.condition === "below" && price <= a.targetPrice);

            if (crossedUp || crossedDown) {
              // First touch — arm and wait for a confirming tick.
              pendingRef.current[a.id] = true;
              continue;
            }
            if (pendingRef.current[a.id] && stillBeyond) {
              delete pendingRef.current[a.id];
              fireAlert(a, price);
              SoundManager.play("alert_triggered").catch(() => {});
            } else if (!stillBeyond) {
              // Stray tick — price snapped back, disarm.
              delete pendingRef.current[a.id];
            }
          }
        }
      )
    );

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
    };
  }, [symbolsKey, fireAlert]);

  return null;
}
