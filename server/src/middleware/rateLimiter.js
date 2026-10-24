import { env } from "../utils/env.js";
import { ApiError } from "../utils/errors.js";

export function createRateLimiter({
  windowMs = env.RATE_LIMIT_WINDOW_MS,
  maxRequests = env.RATE_LIMIT_MAX_REQUESTS,
  scope = "global",
  maxEntries = 10000,
} = {}) {
  const buckets = new Map();

  function pruneExpiredBuckets(now) {
    for (const [key, value] of buckets.entries()) {
      if (now >= value.resetAt) {
        buckets.delete(key);
      }
    }
    if (buckets.size >= maxEntries) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey) buckets.delete(oldestKey);
    }
  }

  function middleware(req, res, next) {
    const now = Date.now();
    if (buckets.size >= maxEntries / 2) {
      pruneExpiredBuckets(now);
    }
    const clientKey = `${scope}:${req.ip || "127.0.0.1"}`;
    let entry = buckets.get(clientKey);

    if (!entry || now >= entry.resetAt) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
      };
      buckets.set(clientKey, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, maxRequests - entry.count);
    res.setHeader("x-ratelimit-limit", String(maxRequests));
    res.setHeader("x-ratelimit-remaining", String(remaining));

    if (entry.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("retry-after", String(retryAfterSec));
      return next(
        ApiError.tooManyRequests(
          `İstek sınırı aşıldı (${maxRequests} istek / ${Math.round(windowMs / 1000)} sn). Lütfen ${retryAfterSec} saniye sonra tekrar deneyin.`
        )
      );
    }

    next();
  }

  middleware.resetForTesting = () => buckets.clear();
  return middleware;
}
