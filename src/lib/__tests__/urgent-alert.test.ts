/**
 * Urgent error emails: one as soon as an error screen hits 3+ visitor
 * sessions within an hour, at most one per error per day.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: Record<string, unknown>[] = [];
let sendError: unknown = null;

vi.mock("@/lib/resend/client", () => ({
  getFromEmail: () => "Staycio <hello@staycio.com>",
  getResendClient: () => ({
    emails: {
      send: async (msg: Record<string, unknown>) => {
        sent.push(msg);
        return { error: sendError };
      },
    },
  }),
}));

const { maybeSendUrgentAlert, buildUrgentAlert } = await import("@/lib/client-errors/urgent");

/** Fake Supabase: client_error reads return `sessions`, alert-marker reads return `markers`. */
function fakeDb(sessions: string[], markers: { id: string }[] = []) {
  const ops: string[] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let mode: "select" | "insert" | "delete" = "select";
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (col: string, val: unknown) => ((filters[col] = val), q),
      in: () => q,
      gte: () => q,
      limit: () => q,
      single: () => q,
      insert: (row: unknown) => ((mode = "insert"), ops.push(`insert ${table} ${JSON.stringify(row)}`), q),
      delete: () => ((mode = "delete"), ops.push(`delete ${table}`), q),
      then: (resolve: (v: unknown) => void) => {
        if (mode === "insert") return resolve({ data: { id: "marker-1" }, error: null });
        if (mode === "delete") return resolve({ data: null, error: null });
        if (filters.event_name === "client_error") return resolve({ data: sessions.map((s) => ({ session_id: s })), error: null });
        return resolve({ data: markers, error: null });
      },
    };
    return q;
  };
  return { db: { from } as never, ops };
}

const crash = { source: "boundary", message: "x is undefined", path: "/search", release: "abc1234" };

beforeEach(() => {
  sent.length = 0;
  sendError = null;
  process.env.ERROR_ALERT_EMAIL = "dev@example.com";
  delete process.env.LEAD_NOTIFY_EMAIL;
});

describe("maybeSendUrgentAlert", () => {
  it("emails once 3 different visitors hit the same error screen within the hour", async () => {
    const { db, ops } = fakeDb(["a", "b", "c", "c"]);
    expect(await maybeSendUrgentAlert(db, crash)).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ["dev@example.com"], subject: "Staycio: pages breaking on /search — 3 visitors in the last hour" });
    expect(ops.some((o) => o.startsWith("insert analytics_events") && o.includes("client_error_alert"))).toBe(true);
  });

  it("stays quiet below the threshold (anonymous reports don't count as visitors)", async () => {
    const { db } = fakeDb(["a", "b", "none", "none"]);
    expect(await maybeSendUrgentAlert(db, crash)).toBe("skipped");
    expect(sent).toHaveLength(0);
  });

  it("sends at most one email per error per day", async () => {
    const { db } = fakeDb(["a", "b", "c"], [{ id: "earlier-alert" }]);
    expect(await maybeSendUrgentAlert(db, crash)).toBe("skipped");
    expect(sent).toHaveLength(0);
  });

  it("ignores minor errors and the map, and does nothing with no mailbox set", async () => {
    const { db } = fakeDb(["a", "b", "c"]);
    expect(await maybeSendUrgentAlert(db, { ...crash, source: "window" })).toBe("skipped");
    expect(await maybeSendUrgentAlert(db, { ...crash, source: "map" })).toBe("skipped");
    delete process.env.ERROR_ALERT_EMAIL;
    expect(await maybeSendUrgentAlert(db, crash)).toBe("skipped");
    expect(sent).toHaveLength(0);
  });

  it("removes its marker when the email is rejected, so the next report retries", async () => {
    sendError = { message: "domain not verified" };
    const { db, ops } = fakeDb(["a", "b", "c"]);
    expect(await maybeSendUrgentAlert(db, crash)).toBe("skipped");
    expect(ops).toContain("delete analytics_events");
  });
});

describe("buildUrgentAlert", () => {
  it("escapes the error text and names the deploy", () => {
    const a = buildUrgentAlert({ ...crash, message: "<script>x</script>" }, 4);
    expect(a.html).not.toContain("<script>x");
    expect(a.html).toContain("&lt;script&gt;");
    expect(a.text).toContain("deploy abc1234");
  });
});
