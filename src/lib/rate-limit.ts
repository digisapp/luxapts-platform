/**
 * Rate limiter for API routes.
 *
 * IMPORTANT: This uses in-memory storage which works per-instance only.
 * On Vercel serverless, each function invocation may run in a different
 * container, so this provides best-effort limiting (not strict).
 *
 * For strict distributed rate limiting, replace with:
 *   - @upstash/ratelimit + @upstash/redis (recommended for Vercel)
 *   - Vercel KV
 *   - Redis (self-hosted)
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      // Remove entries with no recent timestamps
      entry.timestamps = entry.timestamps.filter((t) => now - t < 10 * 60 * 1000);
      if (entry.timestamps.length === 0) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

interface RateLimitConfig {
  limit: number; // Max requests
  windowMs: number; // Time window in milliseconds
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
}

/**
 * Sliding window rate limiter.
 * Tracks individual request timestamps for more accurate limiting
 * compared to fixed-window counters.
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 60, windowMs: 60 * 1000 }
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = store.get(identifier);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(identifier, entry);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= config.limit) {
    // Rate limited - find when the oldest request in window expires
    const oldestInWindow = entry.timestamps[0];
    return {
      success: false,
      remaining: 0,
      resetTime: oldestInWindow + config.windowMs,
    };
  }

  // Allow request
  entry.timestamps.push(now);

  return {
    success: true,
    remaining: config.limit - entry.timestamps.length,
    resetTime: now + config.windowMs,
  };
}

/**
 * Get client IP from request headers.
 * Handles Vercel's x-forwarded-for (which includes the real client IP)
 * and falls back to x-real-ip.
 */
export function getClientIp(request: Request): string {
  // Vercel sets x-real-ip to the actual client IP
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // x-forwarded-for may contain multiple IPs: client, proxy1, proxy2
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

/**
 * Rate limit configurations for different endpoints
 */
export const RATE_LIMITS = {
  // General API endpoints
  api: { limit: 100, windowMs: 60 * 1000 }, // 100 req/min

  // Search is more intensive
  search: { limit: 30, windowMs: 60 * 1000 }, // 30 req/min

  // AI chat - more restrictive to control costs
  chat: { limit: 20, windowMs: 60 * 1000 }, // 20 req/min

  // Lead creation - prevent spam
  leads: { limit: 10, windowMs: 60 * 1000 }, // 10 req/min

  // Auth endpoints - prevent brute force
  auth: { limit: 10, windowMs: 5 * 60 * 1000 }, // 10 req/5min
};
