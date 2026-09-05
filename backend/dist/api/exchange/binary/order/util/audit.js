"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeAuditLog = writeAuditLog;
exports.captureException = captureException;
function writeAuditLog(entry) {
    try {
        console.log("AUDIT " + JSON.stringify({ ts: new Date().toISOString(), ...entry }));
    }
    catch (_a) {
    }
}
let _sentry = null;
let _sentryTried = false;
function getSentry() {
    if (_sentryTried)
        return _sentry;
    _sentryTried = true;
    if (!process.env.SENTRY_DSN)
        return null;
    try {
        const Sentry = require("@sentry/node");
        Sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || "development",
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
        });
        _sentry = Sentry;
        console.log("[Observability] Sentry initialised.");
    }
    catch (_a) {
        _sentry = null;
    }
    return _sentry;
}
function captureException(err, context) {
    try {
        const sentry = getSentry();
        if (sentry) {
            sentry.captureException(err, context ? { extra: context } : undefined);
        }
        console.error("ERROR " +
            JSON.stringify({
                ts: new Date().toISOString(),
                message: (err === null || err === void 0 ? void 0 : err.message) || String(err),
                ...(context || {}),
            }));
    }
    catch (_a) {
    }
}
