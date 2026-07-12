import { describe, it, expect } from "vitest";
import { isBridgeable } from "../leads/bridge";

const base = {
  leadId: "00000000-0000-0000-0000-000000000001",
  buildingId: "00000000-0000-0000-0000-000000000002",
  name: "Jane Renter",
  email: "jane@example.com",
  phone: null,
  tourDate: "2026-08-01",
  tourTime: "14:00",
  notes: null,
};

describe("isBridgeable", () => {
  it("bridges a tour request with name, contact, building, and date", () => {
    expect(isBridgeable(base)).toBe(true);
  });

  it("accepts phone as the only contact method", () => {
    expect(isBridgeable({ ...base, email: null, phone: "3055551234" })).toBe(true);
  });

  it("requires a building target", () => {
    expect(isBridgeable({ ...base, buildingId: null })).toBe(false);
  });

  it("requires a client name", () => {
    expect(isBridgeable({ ...base, name: null })).toBe(false);
  });

  it("requires at least one contact method", () => {
    expect(isBridgeable({ ...base, email: null, phone: null })).toBe(false);
  });

  it("requires a tour date (general inquiries stay in the CRM)", () => {
    expect(isBridgeable({ ...base, tourDate: null })).toBe(false);
  });

  it("does not require a tour time", () => {
    expect(isBridgeable({ ...base, tourTime: null })).toBe(true);
  });
});
