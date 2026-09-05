import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_RISK_MANAGEMENT_STATE, type RiskManagementState } from "@/app/[locale]/terminal/components/risk-management/risk-management-types";

interface RiskStore {
  state: RiskManagementState;
  setState: (stateUpdate: RiskManagementState | ((prev: RiskManagementState) => RiskManagementState)) => void;
}

export const useRiskStore = create<RiskStore>()(
  persist(
    (set) => ({
      state: DEFAULT_RISK_MANAGEMENT_STATE,
      setState: (stateUpdate) =>
        set((prev) => {
          const newState = typeof stateUpdate === "function" ? stateUpdate(prev.state) : stateUpdate;
          return { state: newState };
        }),
    }),
    {
      name: "binary-risk-management-store",
    }
  )
);
