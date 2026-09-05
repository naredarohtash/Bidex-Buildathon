"use client";

/**
 * Deposit — full page.
 *
 * The same DepositFlow the terminal modal mounts, given a page instead of a
 * window. Two mount points, one implementation: the previous client.tsx was
 * 3,257 lines of a separate deposit UI that had already diverged from the
 * modal's, and keeping the two in step by hand is not a thing anyone does
 * successfully for long.
 *
 * A client component only so it can hand the flow somewhere to go once a
 * deposit lands. The drawer version merely closes itself; from here there is an
 * actual navigation to make, and money in the balance is worth nothing sitting
 * on the finance page.
 */

import { useRouter } from "next/navigation";
import { FinancePageShell } from "@/components/finance/finance-page-shell";
import { DepositFlow } from "@/components/finance/deposit-flow";
import { LedgerPanel } from "@/components/finance/ledger-panel";

export default function DepositPage() {
  const router = useRouter();

  return (
    <FinancePageShell
      title="Deposit funds"
      subtitle="Add money to your trading balance. Crypto only — your balance is held in USDT."
      aside={<LedgerPanel kind="deposit" title="Recent deposits" collapsible={false} />}
    >
      <DepositFlow onSettled={() => router.push("/terminal")} />
    </FinancePageShell>
  );
}
