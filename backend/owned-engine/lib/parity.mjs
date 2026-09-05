/**
 * Parity harness — replays the same request against the current ("old") engine
 * and the owned ("new") engine and reports meaningful differences.
 *
 * Two responsibilities beyond a naive diff:
 *   1. Ignore volatile fields (timestamps, tokens, generated ids) that always
 *      differ harmlessly, so only REAL differences are flagged.
 *   2. Refuse to run against production, and default to read-only requests.
 *
 * This module is transport-only (it uses `fetch`); it never opens a DB.
 */

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const JWT_LIKE = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;

/** Field names whose values are expected to differ between runs. */
export const DEFAULT_VOLATILE_KEYS = new Set([
  "createdAt", "updatedAt", "deletedAt", "time", "timestamp", "date",
  "token", "accessToken", "refreshToken", "csrfToken", "sessionId",
  "jti", "iat", "exp", "expiresAt", "lastLogin", "nonce", "requestId",
  // runtime/host metrics that legitimately change every call or per machine
  "performance", "cpu", "memory", "freeMemory", "totalMemory", "usedMemory",
  "uptime", "score", "loadAverage", "pid", "hostname", "heapUsed", "heapTotal",
  "rss", "usage", "responseTime", "latency", "currentWorkingDirectory",
  "environment", "nodeVersion", "platform", "arch",
  // cron / scheduler state (changes between runs)
  "lastRun", "lastExecutions", "nextRun", "nextScheduledRun", "executionTime",
  // process-specific values
  "processArgv", "processExecPath",
  // host-specific config / diagnostics that differ between engine instances
  "fcmAvailable", "vapidPublicKey",
]);

export function makeOptions(overrides = {}) {
  return {
    volatileKeys: overrides.volatileKeys || DEFAULT_VOLATILE_KEYS,
    maskIsoTimestamps: overrides.maskIsoTimestamps !== false,
    maskJwt: overrides.maskJwt !== false,
  };
}

/** Deep-copy `value`, replacing volatile fields/values with stable sentinels. */
export function maskVolatile(value, opts = makeOptions()) {
  const walk = (v, keyName) => {
    if (keyName && opts.volatileKeys.has(keyName)) return "<volatile>";
    if (typeof v === "string") {
      if (opts.maskIsoTimestamps && ISO_TIMESTAMP.test(v)) return "<timestamp>";
      if (opts.maskJwt && JWT_LIKE.test(v)) return "<token>";
      return v;
    }
    if (Array.isArray(v)) {
      const walked = v.map((x) => walk(x, undefined));
      if (walked.length > 1 && walked[0] && typeof walked[0] === "object" && !Array.isArray(walked[0])) {
        const sortKey = ["id", "name", "slug", "key", "path", "symbol", "code"].find((k) => k in walked[0]);
        if (sortKey) walked.sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")));
      }
      return walked;
    }
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val, k);
      return out;
    }
    return v;
  };
  return walk(value, undefined);
}

/** Recursively list differing leaves as { path, old, new }. */
export function diff(a, b, path = "") {
  const diffs = [];
  const bothObjects = a && b && typeof a === "object" && typeof b === "object";
  if (bothObjects) {
    if (Array.isArray(a) !== Array.isArray(b)) {
      diffs.push({ path: path || "(root)", old: a, new: b });
      return diffs;
    }
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      diffs.push(...diff(a[k], b[k], path ? `${path}.${k}` : k));
    }
    return diffs;
  }
  if (a !== b) diffs.push({ path: path || "(root)", old: a, new: b });
  return diffs;
}

/** Compare two replayed responses after masking volatile fields. */
export function compareResponses(oldRes, newRes, opts = makeOptions()) {
  const statusMatch = oldRes.status === newRes.status;
  const bodyDiffs = diff(maskVolatile(oldRes.body, opts), maskVolatile(newRes.body, opts));
  return {
    statusMatch,
    bodyMatch: bodyDiffs.length === 0,
    statusDiff: statusMatch ? null : { old: oldRes.status, new: newRes.status },
    bodyDiffs,
  };
}

/** Send one request spec to a base URL; parse JSON when possible. */
export async function replay(base, spec, fetchImpl = fetch) {
  const init = { method: spec.method || "GET", headers: { ...(spec.headers || {}) } };
  if (spec.body != null) {
    init.body = typeof spec.body === "string" ? spec.body : JSON.stringify(spec.body);
    init.headers["content-type"] = "application/json";
  }
  const res = await fetchImpl(base + spec.path, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

/** Hosts we will never let the harness hit. */
export const PRODUCTION_HOSTS = new Set(["terminal.web-bytes.in"]);

/** Throw unless `url` points somewhere safe (not production). */
export function assertSafeTarget(url, { allowHosts = [] } = {}) {
  const host = new URL(url).host;
  if (PRODUCTION_HOSTS.has(host) && !allowHosts.includes(host)) {
    throw new Error(
      `Refusing to run parity against production host "${host}". Point both engines at a staging copy.`
    );
  }
}

/**
 * Replay every spec against both engines and summarise.
 * @returns {{ total, matched, mismatched, results }}
 */
export async function runParity({ oldBase, newBase, specs, opts = makeOptions(), fetchImpl = fetch, guard = true }) {
  if (guard) {
    assertSafeTarget(oldBase);
    assertSafeTarget(newBase);
  }
  const results = [];
  for (const spec of specs) {
    const [oldRes, newRes] = await Promise.all([
      replay(oldBase, spec, fetchImpl),
      replay(newBase, spec, fetchImpl),
    ]);
    const cmp = compareResponses(oldRes, newRes, opts);
    results.push({ spec, old: oldRes, new: newRes, ...cmp, match: cmp.statusMatch && cmp.bodyMatch });
  }
  const matched = results.filter((r) => r.match).length;
  return { total: results.length, matched, mismatched: results.length - matched, results };
}
