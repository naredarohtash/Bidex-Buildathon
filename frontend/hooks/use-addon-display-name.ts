import { useCallback } from "react";
import { useSettings } from "@/hooks/use-settings";

export function useAddonDisplayName() {
  const { settings } = useSettings();

  const getWalletTypeLabel = useCallback(
    (type: string, fallback: string) => {
      if (type === "ECO") {
        return settings?.ecosystem_name || settings?.ecosystemName || fallback;
      }
      return fallback;
    },
    [settings]
  );

  return { getWalletTypeLabel };
}
