import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MartingaleState } from "@/app/[locale]/terminal/components/settings/martingale-settings";

interface MartingaleRuntimeState {
  currentLevel: number;
  consecutiveLosses: number;
  baseAmount: number;
  totalRecovered: number;
  totalLost: number;
}

interface MartingaleStore {
  state: MartingaleRuntimeState;
  setState: (stateUpdate: MartingaleRuntimeState | ((prev: MartingaleRuntimeState) => MartingaleRuntimeState)) => void;
}

export const useMartingaleStore = create<MartingaleStore>()(
  persist(
    (set) => ({
      state: {
        currentLevel: 0,
        consecutiveLosses: 0,
        baseAmount: 1000,
        totalRecovered: 0,
        totalLost: 0,
      },
      setState: (stateUpdate) =>
        set((prev) => {
          const newState = typeof stateUpdate === "function" ? stateUpdate(prev.state) : stateUpdate;
          return { state: newState };
        }),
    }),
    {
      name: "binary-martingale-store",
    }
  )
);
