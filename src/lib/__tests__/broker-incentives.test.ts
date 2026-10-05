import { describe, expect, it } from "vitest";
import {
  brokerIncentivePatchSchema,
  brokerIncentiveSchema,
  buildingArea,
  compareIncentives,
  daysSince,
} from "@/lib/broker-incentives";

describe("brokerIncentiveSchema", () => {
  it("trims text and stores blank fields as null", () => {
    const r = brokerIncentiveSchema.parse({
      building_name: "  Maizon Brickell ",
      building_id: null,
      status: "pays",
      incentive: " $2,000 ",
      conditions: "",
      contact_name: "Velkies",
      contact_email: "",
      contact_phone: "   ",
      notes: "",
      confirmed_on: "",
    });
    expect(r).toEqual({
      building_name: "Maizon Brickell",
      building_id: null,
      status: "pays",
      incentive: "$2,000",
      conditions: null,
      contact_name: "Velkies",
      contact_email: null,
      contact_phone: null,
      notes: null,
      confirmed_on: null,
    });
  });

  it("requires a building name and a known status", () => {
    expect(brokerIncentiveSchema.safeParse({ building_name: " ", status: "pays" }).success).toBe(false);
    expect(brokerIncentiveSchema.safeParse({ building_name: "Gio", status: "maybe" }).success).toBe(false);
  });

  it("rejects a malformed email, date or building id", () => {
    const base = { building_name: "Forma Miami", status: "pays" };
    expect(brokerIncentiveSchema.safeParse({ ...base, contact_email: "leasing@" }).success).toBe(false);
    expect(brokerIncentiveSchema.safeParse({ ...base, confirmed_on: "10/05/2026" }).success).toBe(false);
    expect(brokerIncentiveSchema.safeParse({ ...base, building_id: "42" }).success).toBe(false);
    expect(
      brokerIncentiveSchema.safeParse({ ...base, contact_email: "leasing@rentsformamiami.com" }).success
    ).toBe(true);
  });

  it("PATCH leaves omitted fields out and can unlink a building", () => {
    expect(brokerIncentivePatchSchema.parse({ incentive: "$1,500" })).toEqual({ incentive: "$1,500" });
    expect(brokerIncentivePatchSchema.parse({ building_id: null })).toEqual({ building_id: null });
  });
});

describe("compareIncentives", () => {
  it("lists paying buildings first, then to-confirm, then no OP, each A–Z", () => {
    const rows = [
      { status: "none" as const, building_name: "Bella Isla" },
      { status: "unknown" as const, building_name: "Soma" },
      { status: "pays" as const, building_name: "muze at Met" },
      { status: "pays" as const, building_name: "CMPND" },
      { status: "unknown" as const, building_name: "Miro" },
    ];
    expect(rows.sort(compareIncentives).map((r) => r.building_name)).toEqual([
      "CMPND",
      "muze at Met",
      "Miro",
      "Soma",
      "Bella Isla",
    ]);
  });
});

describe("daysSince", () => {
  it("counts calendar days to the viewer's today", () => {
    const now = new Date(2026, 9, 5, 23, 30).getTime(); // Oct 5, local, late evening
    expect(daysSince("2026-10-05", now)).toBe(0);
    expect(daysSince("2026-10-04", now)).toBe(1);
    expect(daysSince("2026-07-06", now)).toBe(91);
  });
});

describe("buildingArea", () => {
  it("joins neighborhood and city, tolerating either shape or a gap", () => {
    expect(buildingArea({ neighborhoods: [{ name: "Brickell" }], cities: { name: "Miami" } })).toBe(
      "Brickell, Miami"
    );
    expect(buildingArea({ neighborhoods: null, cities: { name: "Miami" } })).toBe("Miami");
    expect(buildingArea(null)).toBeNull();
  });
});
