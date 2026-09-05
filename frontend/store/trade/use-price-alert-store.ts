import { create } from "zustand";
import { persist } from "zustand/middleware";

// App-level price alerts. Unlike the chart engine's built-in alerts (which only
// watch the currently-open symbol), these are watched across ALL symbols by a
// background watcher, so an alert set on one asset fires even while you're
// looking at another. Alerts persist across restarts; fired toasts do not.

export type PriceAlertCondition = "above" | "below";

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: PriceAlertCondition;
  createdAt: number;
  triggered?: boolean;
  triggeredAt?: number;
}

export interface FiredAlertToast {
  toastId: string;
  alertId: string;
  symbol: string;
  targetPrice: number;
  currentPrice: number;
  condition: PriceAlertCondition;
  ts: number;
}

interface PriceAlertState {
  alerts: PriceAlert[];
  toasts: FiredAlertToast[];
  addAlert: (symbol: string, targetPrice: number, condition: PriceAlertCondition) => void;
  removeAlert: (id: string) => void;
  clearTriggeredForSymbol: (symbol: string) => void;
  /** Fire an alert: remove it from the chart and enqueue a toast (idempotent). */
  fireAlert: (alert: PriceAlert, currentPrice: number) => void;
  dismissToast: (toastId: string) => void;
}

export const usePriceAlertStore = create<PriceAlertState>()(
  persist(
    (set, get) => ({
      alerts: [],
      toasts: [],
      addAlert: (symbol, targetPrice, condition) =>
        set((s) => ({
          alerts: [
            ...s.alerts,
            {
              id: `pa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              symbol,
              targetPrice,
              condition,
              createdAt: Date.now(),
              triggered: false,
            },
          ],
        })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      clearTriggeredForSymbol: (symbol) =>
        set((s) => ({ alerts: s.alerts.filter((a) => !(a.symbol === symbol && a.triggered)) })),
      fireAlert: (alert, currentPrice) =>
        set((s) => {
          const existing = s.alerts.find((a) => a.id === alert.id);
          if (!existing || existing.triggered) return s; // already fired — dedupe
          return {
            // One-shot: the chip/line disappears as soon as price reaches it.
            alerts: s.alerts.filter((a) => a.id !== alert.id),
            toasts: [
              ...s.toasts,
              {
                toastId: `t_${alert.id}_${Date.now()}`,
                alertId: alert.id,
                symbol: alert.symbol,
                targetPrice: alert.targetPrice,
                currentPrice,
                condition: alert.condition,
                ts: Date.now(),
              },
            ],
          };
        }),
      dismissToast: (toastId) => set((s) => ({ toasts: s.toasts.filter((t) => t.toastId !== toastId) })),
    }),
    {
      name: "bidex-price-alerts",
      // Only alerts survive restarts; transient toasts do not.
      partialize: (s) => ({ alerts: s.alerts }),
      // Legacy fired alerts (kept dimmed before one-shot removal) — drop them.
      onRehydrateStorage: () => (state) => {
        if (state) state.alerts = state.alerts.filter((a) => !a.triggered);
      },
    }
  )
);
