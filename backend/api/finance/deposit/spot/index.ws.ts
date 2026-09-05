export const metadata = {};

/* The exchange-backed spot deposit/withdraw flow was removed in 0ab1867e (fiat
   gateways deleted, withdrawals made MANUAL) — there is no longer a live route
   that calls startSpotVerificationSchedule. This module still exists because
   the compiled cron core (dist/src/cron/jobs/wallet.js, no .ts source in this
   repo) imports spotVerificationIntervals and startSpotVerificationSchedule at
   the top level; deleting the file entirely left that require unresolved and
   crashed the backend on every cold boot. Kept as a no-op so that import
   resolves; the cron job that calls it will simply find no matching pending
   transactions under the current manual-deposit flow. */
export const spotVerificationIntervals = new Map<string, ReturnType<typeof setInterval>>();

export function startSpotVerificationSchedule(
  _transactionId: string,
  _userId: string,
  _trx: string
) {}

export default async () => {};
