/**
 * Rate limiting — fixed-window limiter keyed by caller (IP by default), matching
 * how the current engine keys limits by IP. In-memory for the PoC; production
 * would back this with Redis so the limit is shared across worker processes.
 */

export function createRateLimiter({ limit = 3000, windowMs = 60_000 } = {}) {
  const buckets = new Map(); // key -> { count, resetAt }

  return {
    /** @returns {{ allowed: boolean, remaining: number, resetAt: number }} */
    check(key) {
      const now = Date.now();
      let bucket = buckets.get(key);
      if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return {
        allowed: bucket.count <= limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
      };
    },
    _reset() { buckets.clear(); }, // test helper
  };
}
