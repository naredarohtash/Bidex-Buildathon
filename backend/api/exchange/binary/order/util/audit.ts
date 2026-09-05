// Observability for the binary trade path: an append-only audit trail plus an
// optional Sentry error capture. Both are intentionally dependency-free and
// never throw — observability must never break a live trade.
//
// Audit records are single-line JSON on stdout under the "AUDIT " prefix, so
// they flow into the process log stream (PM2 / file / log aggregator) and are
// immutable after the fact. Ship these lines to your log store to get a
// defensible "who moved what, when, and why" record for any dispute.

export interface AuditEntry {
  action: string;
  userId?: string;
  walletId?: string;
  orderId?: string;
  amount?: number;
  balanceBefore?: number;
  balanceAfter?: number;
  currency?: string;
  side?: string;
  type?: string;
  price?: number;
  detail?: string;
  [k: string]: any;
}

export function writeAuditLog(entry: AuditEntry): void {
  try {
    console.log("AUDIT " + JSON.stringify({ ts: new Date().toISOString(), ...entry }));
  } catch {
    /* auditing must never throw */
  }
}

// ── Optional Sentry error capture ──────────────────────────────────────────
// Lights up only when @sentry/node is installed AND SENTRY_DSN is set; otherwise
// it degrades to a structured error line with zero dependencies. To activate:
//   pnpm --filter backend add @sentry/node   (and set SENTRY_DSN in .env)
let _sentry: any = null;
let _sentryTried = false;

function getSentry(): any {
  if (_sentryTried) return _sentry;
  _sentryTried = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    // Lazy require so the package stays optional and never blocks the build.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require("@sentry/node");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    _sentry = Sentry;
    console.log("[Observability] Sentry initialised.");
  } catch {
    _sentry = null; // package not installed — degrade to structured logging
  }
  return _sentry;
}

export function captureException(err: any, context?: Record<string, any>): void {
  try {
    const sentry = getSentry();
    if (sentry) {
      sentry.captureException(err, context ? { extra: context } : undefined);
    }
    console.error(
      "ERROR " +
        JSON.stringify({
          ts: new Date().toISOString(),
          message: err?.message || String(err),
          ...(context || {}),
        })
    );
  } catch {
    /* never throw from error capture */
  }
}
