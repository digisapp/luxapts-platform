import { describe, expect, it } from "vitest";
import { callSummary, describeFilters, inquirySummary, leaseUpSoon, safeHttpUrl, touchSummary } from "./nyc-format";
import { contactHref, readReach, readWork } from "./work";
import { NO_AGENT } from "@/lib/crm/filters";

const NOW = Date.parse("2026-10-12T15:00:00Z");
const base = { do_not_contact: false, contacted: false, last_contacted_at: null, last_inbound_at: null };

describe("touchSummary", () => {
  it("flags people never reached", () => {
    expect(touchSummary(base, NOW)).toEqual({ label: "Never contacted", tone: "amber" });
  });

  it("prefers a reply newer than our last touch", () => {
    expect(
      touchSummary({ ...base, contacted: true, last_contacted_at: "2026-10-10T15:00:00Z", last_inbound_at: "2026-10-11T15:00:00Z" }, NOW)
    ).toEqual({ label: "Replied 1d ago", tone: "sky" });
    expect(
      touchSummary({ ...base, contacted: true, last_contacted_at: "2026-10-12T12:00:00Z", last_inbound_at: "2026-10-11T15:00:00Z" }, NOW).label
    ).toBe("Contacted 3h ago");
  });

  it("keeps imported 'contacted' without a date, and do-not-contact wins", () => {
    expect(touchSummary({ ...base, contacted: true }, NOW).label).toBe("Contacted");
    expect(touchSummary({ ...base, do_not_contact: true }, NOW).tone).toBe("red");
  });
});

describe("summaries", () => {
  it("describes the inquiry and calls", () => {
    expect(inquirySummary({ property_address: "100 Example St #5F", price: 5400, beds: 0 })).toBe(
      "100 Example St #5F · $5,400 · Studio"
    );
    expect(inquirySummary({ property_address: null, price: null, beds: null })).toBeNull();
    expect(callSummary("talked", 304)).toBe("Talked · 5m 4s");
    expect(callSummary(null, 12)).toBe("12s");
    expect(callSummary("no_answer", undefined)).toBe("No answer");
  });

  it("describes filters in words", () => {
    expect(describeFilters({ q: "ann", stages: ["Setup Showing"], agent: NO_AGENT, touch: "never", added: "365" })).toEqual([
      "“ann”",
      "Stage: Showing",
      "Agent: Unassigned",
      "Never contacted",
      "Added last year",
    ]);
  });

  it("lets only http(s) links through", () => {
    expect(safeHttpUrl("https://streeteasy.com/rental/1")).toBe("https://streeteasy.com/rental/1");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe("leaseUpSoon", () => {
  it("matches the Lease up soon list: same months, 10+ months ago", () => {
    expect(leaseUpSoon("2025-11-03T17:00:00Z", "2026-10-12")).toBe(true);
    expect(leaseUpSoon("2024-12-20T17:00:00Z", "2026-10-12")).toBe(true);
    expect(leaseUpSoon("2026-01-05T17:00:00Z", "2026-10-12")).toBe(false); // January: outside Oct-Dec
    expect(leaseUpSoon("2026-10-01T16:00:00Z", "2026-10-12")).toBe(false); // too recent
    expect(leaseUpSoon(null, "2026-10-12")).toBe(false);
  });
});

describe("work links", () => {
  it("round-trips the list context through the contact URL", () => {
    const href = contactHref("abc", { query: "touch=never&sort=added", label: "Never contacted", index: 4, total: 120 }, "call");
    const params = new URL(href, "https://x").searchParams;
    expect(readWork(params)).toEqual({ query: "touch=never&sort=added", label: "Never contacted", index: 4, total: 120 });
    expect(readReach(params)).toBe("call");
  });

  it("opens without a list when none is given", () => {
    expect(contactHref("abc")).toBe("/admin/nyc/abc");
    expect(readWork(new URLSearchParams())).toBeNull();
    expect(readReach(new URLSearchParams("log=fax"))).toBeNull();
  });
});
