/**
 * GET /api/cron/error-digest — the daily "what broke" email: only with the
 * cron secret, only to a configured mailbox, only when something broke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let rows: unknown[] = [];
const sent: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({}),
}));
vi.mock("@/lib/client-errors/load", () => ({
  loadClientErrorRows: async () => ({ rows, error: null }),
}));
vi.mock("@/lib/resend/client", () => ({
  getFromEmail: () => "Staycio <hello@staycio.com>",
  getResendClient: () => ({
    emails: {
      send: async (msg: Record<string, unknown>) => {
        sent.push(msg);
        return { error: null };
      },
    },
  }),
}));

const { GET } = await import("@/app/api/cron/error-digest/route");

const call = (auth = "Bearer test-secret") =>
  GET(new Request("https://staycio.com/api/cron/error-digest", { headers: { authorization: auth } }));

const recentCrash = () => ({
  session_id: "s1",
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  properties: { source: "boundary", message: "x is undefined", path: "/search" },
});

beforeEach(() => {
  process.env.CRON_SECRET = "test-secret";
  process.env.ERROR_ALERT_EMAIL = "dev@example.com";
  delete process.env.LEAD_NOTIFY_EMAIL;
  rows = [];
  sent.length = 0;
});

describe("GET /api/cron/error-digest", () => {
  it("refuses callers without the cron secret", async () => {
    const res = await call("Bearer nope");
    expect(res.status).toBe(401);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when no mailbox is configured", async () => {
    delete process.env.ERROR_ALERT_EMAIL;
    rows = [recentCrash()];
    const body = await (await call()).json();
    expect(body.sent).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing on a clean day", async () => {
    const body = await (await call()).json();
    expect(body).toMatchObject({ sent: false, reason: "No errors in the last 24 hours" });
    expect(sent).toHaveLength(0);
  });

  it("emails the digest when something broke", async () => {
    rows = [recentCrash()];
    const body = await (await call()).json();
    expect(body.sent).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: ["dev@example.com"],
      subject: "Staycio: 1 browser error in the last 24 hours (1 new)",
    });
  });
});
