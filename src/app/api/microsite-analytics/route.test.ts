import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ success: true }),
  getClientIp: () => "203.0.113.7",
  RATE_LIMITS: { api: {} },
}));

const insert = vi.fn(async () => ({ error: null }));
const from = vi.fn(() => ({ insert }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => ({ from }) }));

import { OPTIONS, POST } from "./route";

const ENDPOINT = "https://staycio.com/api/microsite-analytics";

function post(origin: string, body: unknown) {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const event = (domain: string, extra: Record<string, unknown>) => ({
  type: "event",
  domain,
  session_id: "abc123def",
  path: "/",
  ...extra,
});

describe("/api/microsite-analytics", () => {
  beforeEach(() => {
    insert.mockClear();
    from.mockClear();
  });

  it("allows credentials on the preflight so sendBeacon's JSON blob gets through", async () => {
    const res = await OPTIONS(
      new Request(ENDPOINT, { method: "OPTIONS", headers: { origin: "https://downtown6miami.com" } })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://downtown6miami.com");
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("sends no CORS headers at all to an unknown origin", async () => {
    const res = await OPTIONS(
      new Request(ENDPOINT, { method: "OPTIONS", headers: { origin: "https://evil.example" } })
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("rejects a microsite posting traffic for another microsite", async () => {
    const res = await POST(
      post("https://downtown6miami.com", event("perrinbrickell.com", { event_name: "cta_click" }))
    );
    expect(res.status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
  });

  it("stores an event with an uncastable depth, minus the depth", async () => {
    const res = await POST(
      post(
        "https://downtown6miami.com",
        event("downtown6miami.com", { event_name: "scroll_depth", properties: { depth: "x" } })
      )
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(from).toHaveBeenCalledWith("analytics_events");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "scroll_depth",
        properties: {},
        source_domain: "downtown6miami.com",
      })
    );
  });
});
