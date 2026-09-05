/**
 * Withdraw — full page.
 *
 * The same WithdrawFlow the terminal modal mounts. No balance is passed: the
 * terminal has a live figure to hand and gives it, while here the flow uses the
 * one carried with the method catalogue, which is a single call rather than a
 * page that renders a zero balance and corrects itself a moment later.
 */

import { FinancePageShell } from "@/components/finance/finance-page-shell";
import { WithdrawFlow } from "@/components/finance/withdraw-flow";
import { LedgerPanel } from "@/components/finance/ledger-panel";

export default function WithdrawPage() {
  return (
    <FinancePageShell
      title="Withdraw funds"
      subtitle="Take money out of your trading balance to crypto, a bank account or UPI."
      aside={<LedgerPanel kind="withdraw" title="Recent withdrawals" collapsible={false} />}
    >
      <WithdrawFlow />
    </FinancePageShell>
  );
}
