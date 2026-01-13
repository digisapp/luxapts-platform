/**
 * Simple in-memory rate limiter for API routes
 * In production, consider using Redis for distributed rate limiting
 */

interface RateLimitStore {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitStore>();

// Clean up old entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of store.entries()) {
      if (now > value.resetTime) {
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

export function rateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 60, windowMs: 60 * 1000 }
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  const current = store.get(key);

  if (!current || now > current.resetTime) {
    // New window
    store.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return {
      success: true,
      remaining: config.limit - 1,
      resetTime: now + config.windowMs,
    };
  }

  if (current.count >= config.limit) {
    // Rate limited
    return {
      success: false,
      remaining: 0,
      resetTime: current.resetTime,
    };
  }

  // Increment count
  current.count++;
  store.set(key, current);

  return {
    success: true,
    remaining: config.limit - current.count,
    resetTime: current.resetTime,
  };
}

/**
 * Get client IP from request headers
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
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
