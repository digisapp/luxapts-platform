/**
 * POST /api/analytics/track — session counters. A session row starts at
 * page_views_count = 1 / is_bounce = true (the landing page); each later page
 * view increments it and clears the bounce. The once-per-session "session"
 * event used to force is_bounce: false and increment, so every session read
 * 2 pages and no bounce, and the time-on-page ping (a page_view carrying
 * duration_ms) is not a page view of its own.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const SESSION = "1790000000000-abc123";

let earlierViews: unknown[] = [];
const queries: { table: string; calls: [string, unknown[]][] }[] = [];
const rpc = vi.fn(async () => ({ data: null, error: null }));

function builder(table: string) {
  const calls: [string, unknown[]][] = [];
  queries.push({ table, calls });
  const b: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          const isRead = calls.some(([op]) => op === "select");
          return (resolve: (v: unknown) => void) =>
            resolve({ data: isRead ? earlierViews : null, error: null });
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return b;
        };
      },
    }
  );
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  createAdminClient: () => ({ from: (table: string) => builder(table), rpc }),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ success: true }),
  getClientIp: () => "203.0.113.1",
  RATE_LIMITS: { api: {} },
}));

const { POST } = await import("@/app/api/analytics/track/route");

function track(payload: unknown) {
  return POST(
    new Request("https://staycio.com/api/analytics/track", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 (iPhone) Safari" },
      body: JSON.stringify(payload),
    })
  );
}

const op = (table: string, name: string) =>
  queries.filter((q) => q.table === table).flatMap((q) => q.calls.filter(([o]) => o === name));

describe("POST /api/analytics/track sessions", () => {
  beforeEach(() => {
    earlierViews = [];
    queries.length = 0;
    rpc.mockClear();
  });

  it("opens a session without marking it a non-bounce or counting a view", async () => {
    const res = await track({ type: "session", session_id: SESSION, data: { landing_page: "/" } });
    expect(res.status).toBe(200);
    const [[row]] = op("user_sessions", "upsert").map(([, args]) => args) as [[Record<string, unknown>]];
    expect(row.session_id).toBe(SESSION);
    expect(row).not.toHaveProperty("is_bounce");
    expect(row).not.toHaveProperty("page_views_count");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves the landing page view to the session row's own count", async () => {
    await track({ type: "page_view", session_id: SESSION, data: { path: "/" } });
    expect(op("page_views", "insert")).toHaveLength(1);
    // the earlier-view check excludes duration pings
    expect(op("page_views", "is")).toEqual([["is", ["duration_ms", null]]]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts a later page view in the session", async () => {
    earlierViews = [{ id: "pv1" }];
    await track({ type: "page_view", session_id: SESSION, data: { path: "/search" } });
    expect(op("page_views", "insert")).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("increment_session_page_views", { p_session_id: SESSION });
  });

  it("stores the time-on-page ping without counting it as a view", async () => {
    earlierViews = [{ id: "pv1" }];
    await track({ type: "page_view", session_id: SESSION, data: { path: "/search", duration_ms: 5400 } });
    const [[row]] = op("page_views", "insert").map(([, args]) => args) as [[Record<string, unknown>]];
    expect(row.duration_ms).toBe(5400);
    expect(op("page_views", "select")).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
