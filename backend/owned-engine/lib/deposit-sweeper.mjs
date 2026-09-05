/**
 * Catching up on deposits that were not confirmed at submit time.
 *
 * The submit route tries to verify immediately, which succeeds for most TRON
 * and Tron-USDT payments because they confirm in seconds. Everything else —
 * Bitcoin needing two blocks, Ethereum needing twelve, or a trader who pasted
 * the hash before broadcasting — is still PENDING when the request returns.
 * Without something to look again, those deposits would sit unpaid until
 * somebody complained.
 *
 * This is the "look again". It re-checks pending deposits on a timer and
 * credits the ones that have since confirmed, through exactly the same locked,
 * idempotent path the submit route uses, so a deposit racing between the two
 * cannot be paid twice.
 */

const DEFAULT_INTERVAL_MS = 60_000;

/* Deposits are given a fortnight to confirm. Past that, a row is far more
   likely to be a mistyped hash or an abandoned attempt than a payment still in
   flight, and re-checking it forever costs an exchange call every minute for
   the life of the platform. They are left PENDING for an operator rather than
   cancelled — a deposit that did arrive must never be closed off by a timer. */
const GIVE_UP_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/* One exchange call per deposit, so a backlog is worked in batches rather than
   all at once — a hundred pending rows must not turn into a hundred
   simultaneous requests and a rate-limit ban. */
const BATCH = 20;

export function wireDepositSweeper(compat, { intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const { models } = compat;
  let timer = null;
  let running = false;

  async function sweepOnce() {
    /* Overlap guard. A sweep that outruns its interval — slow exchange, large
       backlog — must not have a second one start on top of it and re-check the
       same rows concurrently. The credit path would still refuse to double-pay,
       but the wasted calls are what get an API key throttled. */
    if (running) return { skipped: true };
    running = true;

    try {
      const { settleDepositAndAnnounce } = compat.require("@b/api/finance/wallet-credit");

      const cutoff = new Date(Date.now() - GIVE_UP_AFTER_MS);
      const pending = await models.transaction.findAll({
        where: { type: "DEPOSIT", status: "PENDING" },
        order: [["createdAt", "ASC"]], // oldest first — nobody waits indefinitely
        limit: BATCH,
      });

      let credited = 0;
      let waiting = 0;
      for (const row of pending) {
        if (new Date(row.createdAt) < cutoff) continue; // aged out; operator's call
        try {
          const outcome = await settleDepositAndAnnounce(row.id);
          if (outcome.status === "CREDITED") {
            credited++;
            console.log(
              `[DEPOSIT] credited ${outcome.amount.toFixed(2)} to user ${row.userId} (${row.id})`
            );
          } else if (outcome.status === "PENDING") {
            waiting++;
          }
        } catch (err) {
          // One bad row must not stop the sweep for every other trader.
          console.error(`[DEPOSIT] sweep failed for ${row.id}: ${err.message}`);
        }
      }

      if (credited > 0) {
        console.log(`[DEPOSIT] sweep: ${credited} credited, ${waiting} still waiting`);
      }
      return { credited, waiting, checked: pending.length };
    } catch (err) {
      console.error(`[DEPOSIT] sweep error: ${err.message}`);
      return { error: err.message };
    } finally {
      running = false;
    }
  }

  return {
    sweepOnce,
    start() {
      if (timer) return;
      timer = setInterval(() => { void sweepOnce(); }, intervalMs);
      // Must not be the reason the process refuses to exit.
      if (typeof timer.unref === "function") timer.unref();
      console.log(`[owned-engine] Deposit sweeper ACTIVE (every ${Math.round(intervalMs / 1000)}s)`);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
