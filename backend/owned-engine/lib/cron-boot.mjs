/**
 * Cron boot — start the platform's scheduled jobs under the owned engine.
 *
 * WHY THIS EXISTS
 * The vendor server starts the scheduled jobs itself: `server.js` calls
 * `setupCronJobs()` on the main thread, which does
 *   `(await CronJobManager.getInstance()).getCronJobs()` -> `createWorker(...)`
 * for each of the 33 registered jobs. The owned engine reimplemented routing,
 * auth and WebSockets but never reimplemented that call, so booting with
 * USE_OWNED_ENGINE=1 silently stopped every background job on the platform —
 * deposits and withdrawals never processed, currency prices never refreshed,
 * investments never matured, user blocks never expired. Nothing errored; the
 * work simply stopped happening.
 *
 * The jobs themselves are ordinary readable business code under
 * `dist/src/cron/**`; only the call that starts them was missing.
 *
 * TWO JOBS ARE SKIPPED BY DEFAULT
 * - `licenseHeartbeat`     — the license/phone-home job. Its outbound IP lookup
 *                            is already neutered (BIDEX_NO_PHONE_HOME), and
 *                            re-running it would walk back a deliberate
 *                            decision. Keep it off.
 * - `processPendingOrders` — "Processes pending binary orders", i.e. exactly
 *                            what the owned settlement engine replaces. Caller
 *                            passes it in `skip` when USE_OWNED_SETTLEMENT=1,
 *                            otherwise the same order gets settled twice.
 */

/** Jobs never started by this wiring, whatever the caller asks for. */
export const ALWAYS_SKIP = ["licenseHeartbeat"];

/**
 * @param {object} compat                 from setupCompat() — provides require()
 * @param {object}   [opts]
 * @param {string[]} [opts.skip]          extra job names to leave stopped
 * @param {object}   [opts.logger]        { info, warn, error }
 * @returns {Promise<{ started: string[], skipped: string[], failed: string[] }>}
 */
export async function wireCron(compat, { skip = [], logger = console } = {}) {
  const cron = compat.require("@b/cron");

  const getInstance = cron.default?.getInstance ?? cron.getInstance;
  if (typeof getInstance !== "function") {
    throw new Error("@b/cron does not expose getInstance() — cron layout changed");
  }
  if (typeof cron.createWorker !== "function") {
    throw new Error("@b/cron does not expose createWorker() — cron layout changed");
  }

  const manager = await getInstance.call(cron.default ?? cron);
  const jobs = (await manager.getCronJobs()) || [];

  const skipSet = new Set([...ALWAYS_SKIP, ...skip]);
  const started = [], skipped = [], failed = [];

  for (const job of jobs) {
    if (skipSet.has(job.name)) { skipped.push(job.name); continue; }
    try {
      // Same call the vendor makes: (name, handler, period-in-ms).
      await cron.createWorker(job.name, job.handler, job.period);
      started.push(job.name);
    } catch (err) {
      // One bad job must not take the other 32 down with it.
      failed.push(job.name);
      logger.warn?.(`[owned-engine] cron job ${job.name} failed to start: ${err.message}`);
    }
  }

  return { started, skipped, failed };
}
