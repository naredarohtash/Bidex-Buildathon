"use client";

/**
 * Deposit Funds — the terminal's window onto the shared deposit flow.
 *
 * This file was 1,949 lines. It carried its own hard-coded list of five coins,
 * its own modal chrome, its own history panel, and a submit handler that posted
 * to the manual fiat endpoint — so every method it advertised was one the
 * button could not actually process. All of that now lives in
 * components/finance and is shared with the full finance page, which is what
 * stops the two drifting apart again.
 *
 * The props are unchanged, so every existing caller keeps working.
 */

import { useCallback, useRef } from "react";
import { DepositFlow } from "@/components/finance/deposit-flow";
import { FinanceDrawer } from "@/components/finance/finance-drawer";
import { useBinaryStore } from "@/store/trade/use-binary-store";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DepositModal({ isOpen, onClose }: DepositModalProps) {
  /* A confirmed deposit credits the wallet server-side and the terminal is told
     over the wallet socket, the same way a trade payout arrives. Refreshing
     here as well means the number on the header moves the instant this screen
     says it did, rather than on the next poll. */
  const refreshWallet = useBinaryStore((s) => s.fetchWalletData);

  const onCredited = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem("wallet_USDT");
    void refreshWallet("USDT", true, true);
  }, [refreshWallet]);

  /* The flow decides whether closing is safe — it is the only thing that knows
     whether a payment address is open. Held in a ref and registered through a
     stable callback so re-registering on every state change does not re-run the
     flow's effect in a loop. */
  const guard = useRef<() => boolean>(() => true);
  const registerCloseGuard = useCallback((fn: () => boolean) => {
    guard.current = fn;
  }, []);

  return (
    <FinanceDrawer
      isOpen={isOpen}
      onClose={onClose}
      confirmClose={() => guard.current()}
      title="Deposit"
      subtitle="Add funds to your trading balance"
    >
      <DepositFlow
        onCredited={onCredited}
        onClose={onClose}
        /* Already on the terminal — "back to trading" just means getting this
           panel out of the way. */
        onSettled={onClose}
        registerCloseGuard={registerCloseGuard}
      />
    </FinanceDrawer>
  );
}
