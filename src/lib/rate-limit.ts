/**
 * Rate limiter for API routes.
 *
 * Uses Upstash Redis (sliding window) when UPSTASH_REDIS_REST_URL/TOKEN are
 * set, so limits hold across all Vercel instances. Without those env vars
 * (local dev, tests) — or if Redis errors — it falls back to a per-instance
 * in-memory limiter, which is best-effort only.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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
 * In-memory sliding window rate limiter (per-instance fallback).
 * Tracks individual request timestamps for more accurate limiting
 * compared to fixed-window counters.
 */
export function rateLimitInMemory(
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

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// One Ratelimit instance per distinct config
const limiters = new Map<string, Ratelimit>();

function getLimiter(config: RateLimitConfig): Ratelimit | null {
  if (!redis) return null;
  const key = `${config.limit}:${config.windowMs}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, `${config.windowMs} ms`),
      prefix: `staycio:rl:${key}`,
      // Fail open quickly rather than stall the request if Redis is slow
      timeout: 1000,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/**
 * Distributed rate limiter. Uses Upstash when configured, otherwise
 * (or on Redis error) the in-memory limiter.
 */
export async function rateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 60, windowMs: 60 * 1000 }
): Promise<RateLimitResult> {
  const limiter = getLimiter(config);
  if (!limiter) return rateLimitInMemory(identifier, config);

  try {
    const { success, remaining, reset } = await limiter.limit(identifier);
    return { success, remaining, resetTime: reset };
  } catch (err) {
    console.error("[rate-limit] Upstash error, using in-memory fallback", err);
    return rateLimitInMemory(identifier, config);
  }
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
 * Internal server-to-server calls (e.g. the AI tool-executor calling
 * /api/search or /api/leads) carry no client IP, so they would all share the
 * "unknown" bucket. They authenticate with CRON_SECRET so target routes can
 * skip IP-based limiting — the calling endpoint (chat) is already rate-limited,
 * which bounds these calls transitively.
 */
const INTERNAL_HEADER = "x-internal-secret";

export function internalHeaders(): Record<string, string> {
  const secret = process.env.CRON_SECRET;
  return secret ? { [INTERNAL_HEADER]: secret } : {};
}

export function isInternalRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get(INTERNAL_HEADER) === secret;
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

  // Welcome email - strict, one real signup shouldn't need more
  welcome: { limit: 5, windowMs: 60 * 1000 }, // 5 req/min
};
