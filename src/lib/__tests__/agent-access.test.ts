import { describe, it, expect } from "vitest";
import { ACTIVE_ASSIGNMENT_STATUSES, isLeadStatus } from "../agent/access";

describe("ACTIVE_ASSIGNMENT_STATUSES", () => {
  it("matches the RLS policies: assigned and accepted only", () => {
    expect([...ACTIVE_ASSIGNMENT_STATUSES].sort()).toEqual(["accepted", "assigned"]);
    expect(ACTIVE_ASSIGNMENT_STATUSES).not.toContain("declined");
    expect(ACTIVE_ASSIGNMENT_STATUSES).not.toContain("reassigned");
  });
});

describe("isLeadStatus", () => {
  it("accepts every leads.status value", () => {
    for (const s of ["new", "contacted", "touring", "applied", "leased", "lost"]) {
      expect(isLeadStatus(s)).toBe(true);
    }
  });

  it("rejects anything else the status form could be made to post", () => {
    expect(isLeadStatus("spam")).toBe(false);
    expect(isLeadStatus("")).toBe(false);
    expect(isLeadStatus(null)).toBe(false);
    expect(isLeadStatus(new File([], "x"))).toBe(false);
  });
});
