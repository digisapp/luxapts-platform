import { describe, it, expect, afterEach } from "vitest";
import { buildErrorDigest } from "@/lib/client-errors/digest";
import { groupClientErrors, summarizeClientErrors, type ClientErrorRow } from "@/lib/client-errors/group";
import { getErrorAlertRecipients } from "@/lib/email/recipients";

const NOW = Date.parse("2026-10-14T13:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();
const row = (h: number, session: string, properties: ClientErrorRow["properties"]): ClientErrorRow => ({
  created_at: hoursAgo(h),
  session_id: session,
  properties,
});

function digestFor(rows: ClientErrorRow[]) {
  return buildErrorDigest(groupClientErrors(rows, NOW), summarizeClientErrors(rows, NOW), NOW);
}

describe("buildErrorDigest", () => {
  it("sends nothing on a clean day, or when only the map was unavailable", () => {
    expect(digestFor([])).toBeNull();
    expect(digestFor([row(2, "s1", { source: "map", message: "Failed to initialize WebGL.", path: "/search" })])).toBeNull();
    // An error from last week alone is not today's news
    expect(digestFor([row(100, "s1", { source: "boundary", message: "old", path: "/" })])).toBeNull();
  });

  it("counts today's errors, marks the ones first seen today, and mentions the map", () => {
    const d = digestFor([
      row(1, "s1", { source: "boundary", message: "x is undefined", path: "/search" }),
      row(3, "s2", { source: "boundary", message: "x is undefined", path: "/search" }),
      row(200, "s3", { source: "boundary", message: "x is undefined", path: "/search" }), // seen before: not new
      row(5, "s4", { source: "promise", message: "refresh failed", path: "/favorites" }), // new today
      row(6, "s5", { source: "map", message: "Failed to initialize WebGL.", path: "/search" }),
    ])!;
    expect(d.subject).toBe("Staycio: 3 browser errors in the last 24 hours (1 new)");
    expect(d.text).toContain("couldn't show the map");
    expect(d.text).toContain("[new] Unhandled promise: refresh failed");
    // Today's numbers only: the same error last week adds neither a count nor a session
    expect(d.text).toContain("Error screen: x is undefined\n  2× today · 2 sessions · /search");
    expect(d.html).toContain("https://staycio.com/admin/errors");
  });

  it("escapes error text in the HTML", () => {
    const d = digestFor([row(1, "s1", { source: "window", message: '<img src=x onerror="alert(1)">', path: "/" })])!;
    expect(d.html).not.toContain("<img src=x");
    expect(d.html).toContain("&lt;img src=x");
  });
});

describe("getErrorAlertRecipients", () => {
  const saved = { a: process.env.ERROR_ALERT_EMAIL, l: process.env.LEAD_NOTIFY_EMAIL };
  afterEach(() => {
    if (saved.a === undefined) delete process.env.ERROR_ALERT_EMAIL;
    else process.env.ERROR_ALERT_EMAIL = saved.a;
    if (saved.l === undefined) delete process.env.LEAD_NOTIFY_EMAIL;
    else process.env.LEAD_NOTIFY_EMAIL = saved.l;
  });

  it("uses ERROR_ALERT_EMAIL, else the lead-alert mailbox, else nobody", () => {
    delete process.env.ERROR_ALERT_EMAIL;
    delete process.env.LEAD_NOTIFY_EMAIL;
    expect(getErrorAlertRecipients()).toEqual([]);

    process.env.LEAD_NOTIFY_EMAIL = "owner@example.com";
    expect(getErrorAlertRecipients()).toEqual(["owner@example.com"]);

    process.env.ERROR_ALERT_EMAIL = "dev@example.com, ops@example.com";
    expect(getErrorAlertRecipients()).toEqual(["dev@example.com", "ops@example.com"]);
  });
});
