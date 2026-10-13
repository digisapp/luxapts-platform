/**
 * POST /api/client-errors — browser error reports become analytics_events
 * rows (event_category "error") with private details stripped first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: unknown[] = [];
let rateLimited = false;
const afterTasks: (() => unknown)[] = [];
const urgentChecks: unknown[] = [];

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => afterTasks.push(task),
}));

vi.mock("@/lib/client-errors/urgent", () => ({
  maybeSendUrgentAlert: async (_supabase: unknown, report: unknown) => {
    urgentChecks.push(report);
    return "skipped";
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: unknown) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ success: !rateLimited }),
  getClientIp: () => "203.0.113.1",
  RATE_LIMITS: { clientErrors: {} },
}));

const { POST } = await import("@/app/api/client-errors/route");

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1 Mobile/15E148 Safari/604.1";

function report(payload: unknown, userAgent = IPHONE) {
  return POST(
    new Request("https://staycio.com/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": userAgent },
      body: JSON.stringify(payload),
    })
  );
}

const valid = {
  source: "map",
  message: "Failed to initialize WebGL.",
  name: "Error",
  stack: "Error: Failed to initialize WebGL.\n    at new Map (https://staycio.com/_next/static/chunks/x.js?v=1:1:2)",
  path: "/search?q=2br&email=jane@example.com",
  session_id: "1790000000000-abc123",
  extra: { note: "contact jane@example.com" },
};

beforeEach(() => {
  inserts.length = 0;
  rateLimited = false;
  afterTasks.length = 0;
  urgentChecks.length = 0;
});

describe("POST /api/client-errors", () => {
  it("stores a scrubbed report as an error event", async () => {
    const res = await report(valid);
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(1);
    const { table, row } = inserts[0] as { table: string; row: Record<string, unknown> };
    expect(table).toBe("analytics_events");
    expect(row).toMatchObject({ session_id: "1790000000000-abc123", event_name: "client_error", event_category: "error" });
    expect(row.properties).toMatchObject({
      source: "map",
      message: "Failed to initialize WebGL.",
      path: "/search",
      browser: "Safari",
      os: "iOS 14",
      device: "mobile",
      extra: { note: "contact [email]" },
    });
    expect((row.properties as { stack: string }).stack).toContain("x.js?…");

    // The urgent-alert check runs after the response, on the scrubbed report
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]();
    expect(urgentChecks).toEqual([{ source: "map", message: "Failed to initialize WebGL.", path: "/search", release: null }]);
  });

  it("rejects malformed reports", async () => {
    const res = await report({ source: "nonsense", message: "", path: "/" });
    expect(res.status).toBe(400);
    expect(inserts).toHaveLength(0);
    expect(afterTasks).toHaveLength(0);
  });

  it("ignores bots without storing anything", async () => {
    const res = await report(valid, "Mozilla/5.0 (compatible; bingbot/2.0)");
    expect(res.status).toBe(204);
    expect(inserts).toHaveLength(0);
  });

  it("rate-limits a crash loop", async () => {
    rateLimited = true;
    const res = await report(valid);
    expect(res.status).toBe(429);
    expect(inserts).toHaveLength(0);
  });
});
