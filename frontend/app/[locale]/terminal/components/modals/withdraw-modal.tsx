"use client";

/**
 * Withdraw Funds — the terminal's window onto the shared withdrawal flow.
 *
 * Was 1,174 lines with no working submit path at all: the Proceed button
 * validated a form and went nowhere. Everything now lives in components/finance
 * alongside the deposit flow and the full finance page.
 *
 * The balance passed in is the real wallet balance, in USDT. The screen this
 * replaces showed "Available Balance: 0.00 INR" on funded accounts, because it
 * looked up a wallet in whatever currency the header was displaying — one that
 * does not exist. The header picker is a display setting; the money is USDT.
 *
 * Props are unchanged, so existing callers keep working.
 */

import { useCallback } from "react";
import { WithdrawFlow } from "@/components/finance/withdraw-flow";
import { FinanceDrawer } from "@/components/finance/finance-drawer";
import { useBinaryStore } from "@/store/trade/use-binary-store";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WithdrawModal({ isOpen, onClose }: WithdrawModalProps) {
  const realBalance = useBinaryStore((s) => s.realBalance);
  const refreshWallet = useBinaryStore((s) => s.fetchWalletData);

  // The request holds the funds immediately, so the header has to stop showing
  // them as spendable immediately too.
  const onSubmitted = useCallback(() => {
    if (typeof window !== "undefined") sessionStorage.removeItem("wallet_USDT");
    void refreshWallet("USDT", true, true);
  }, [refreshWallet]);

  return (
    <FinanceDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Withdraw"
      subtitle="Take funds out of your trading balance"
    >
      <WithdrawFlow balance={Number(realBalance) || 0} onSubmitted={onSubmitted} />
    </FinanceDrawer>
  );
}
