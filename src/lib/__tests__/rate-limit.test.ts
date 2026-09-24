import { describe, it, expect } from "vitest";
import { rateLimit, rateLimitInMemory, getClientIp } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test:${Math.random()}`;
    const config = { limit: 3, windowMs: 60_000 };

    expect(rateLimitInMemory(key, config).success).toBe(true);
    expect(rateLimitInMemory(key, config).success).toBe(true);
    const third = rateLimitInMemory(key, config);
    expect(third.success).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = rateLimitInMemory(key, config);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetTime).toBeGreaterThan(Date.now());
  });

  it("isolates identifiers", () => {
    const config = { limit: 1, windowMs: 60_000 };
    const a = `test:${Math.random()}`;
    const b = `test:${Math.random()}`;
    expect(rateLimitInMemory(a, config).success).toBe(true);
    expect(rateLimitInMemory(a, config).success).toBe(false);
    expect(rateLimitInMemory(b, config).success).toBe(true);
  });

  it("falls back to in-memory when Upstash is not configured", async () => {
    const key = `test:${Math.random()}`;
    const config = { limit: 1, windowMs: 60_000 };
    expect((await rateLimit(key, config)).success).toBe(true);
    expect((await rateLimit(key, config)).success).toBe(false);
  });
});

describe("getClientIp", () => {
  it("prefers x-real-ip", () => {
    const req = new Request("https://x.test", {
      headers: { "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8, 9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to first x-forwarded-for entry", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "5.6.7.8, 9.9.9.9" },
    });
    expect(getClientIp(req)).toBe("5.6.7.8");
  });

  it("returns unknown with no headers", () => {
    expect(getClientIp(new Request("https://x.test"))).toBe("unknown");
  });
});
