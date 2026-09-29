import { describe, expect, it } from "vitest";
import { parkingAvailable, petsAllowed, policyText, withPolicyText } from "@/lib/policy-text";
import { heroImageUrl } from "@/lib/images/hero";
import { compareSiblingRows, compareUnitRows, toUnitRowData } from "@/app/buildings/[id]/unit-rows";

describe("policyText", () => {
  it("drops values that are only filler", () => {
    for (const v of [
      "Not specified in the provided HTML",
      "Not specified in provided HTML",
      "Pet policy not specified",
      "Parking information not provided",
      "Parking: N/A",
      "N/A",
      "Not available",
      "Unknown",
      "No information available",
      "   ",
    ]) expect(policyText(v), v).toBeNull();
    expect(policyText(null)).toBeNull();
  });

  it("keeps real policies and strips only the filler clauses", () => {
    expect(policyText("  $150/month covered parking ")).toBe("$150/month covered parking");
    expect(policyText("No pets allowed")).toBe("No pets allowed");
    expect(policyText("Unknown breed restrictions apply")).toBe("Unknown breed restrictions apply");
    expect(policyText("Pets allowed, $1,500 deposit")).toBe("Pets allowed, $1,500 deposit");
    expect(policyText("Cats and dogs allowed; pet fees not specified in the provided HTML")).toBe(
      "Cats and dogs allowed"
    );
    expect(policyText("Pets allowed (see the HTML page)")).toBe("Pets allowed");
    expect(policyText("Pets allowed; fees not specified")).toBe("Pets allowed");
  });
});

describe("petsAllowed", () => {
  it("is true only for a real, welcoming pet policy", () => {
    expect(petsAllowed("Pet friendly community with pet spa")).toBe(true);
    expect(petsAllowed("Pets welcome, no pet rent")).toBe(true);
    expect(petsAllowed("Pet friendly! No pet deposit")).toBe(true);
    expect(petsAllowed("No pets allowed")).toBe(false);
    expect(petsAllowed("No pet policy: pets are not allowed")).toBe(false);
    expect(petsAllowed("Pet policy not specified")).toBe(false);
    expect(petsAllowed("Not available")).toBe(false);
    expect(petsAllowed(null)).toBe(false);
  });
});

describe("parkingAvailable", () => {
  it("is true only when parking exists", () => {
    expect(parkingAvailable("$150/month covered parking")).toBe(true);
    expect(parkingAvailable("Secure parking available")).toBe(true);
    expect(parkingAvailable("No parking available")).toBe(false);
    expect(parkingAvailable("No on-site parking; street parking nearby")).toBe(false);
    expect(parkingAvailable("Parking information not provided")).toBe(false);
  });
});

describe("withPolicyText", () => {
  it("cleans only the policy columns", () => {
    expect(
      withPolicyText({ name: "Not specified", pet_policy: "Cats OK", parking_policy: "N/A" })
    ).toEqual({ name: "Not specified", pet_policy: "Cats OK", parking_policy: null });
    expect(withPolicyText(null)).toBeNull();
  });
});

describe("heroImageUrl", () => {
  it("prefers the primary, then sort order, and skips site furniture", () => {
    expect(
      heroImageUrl([
        { url: "https://x.com/b.jpg", is_primary: false, sort_order: 0 },
        { url: "https://x.com/a.jpg", is_primary: true, sort_order: 5 },
      ])
    ).toBe("https://x.com/a.jpg");
    expect(
      heroImageUrl([
        { url: "https://x.com/logo.png", is_primary: true, sort_order: 0 },
        { url: "https://x.com/pool.jpg", is_primary: null, sort_order: null },
      ])
    ).toBe("https://x.com/pool.jpg");
    expect(heroImageUrl([])).toBeNull();
    expect(heroImageUrl(null)).toBeNull();
  });
});

describe("unit rows", () => {
  const row = (id: string, beds: number | null, price: number | null) =>
    toUnitRowData(
      { id, unit_number: id, beds, baths: 1, sqft: 600, available_on: "2026-01-01" },
      { basePath: "/buildings/x", today: "2026-09-29", price, planName: null }
    );

  it("maps availability and the link", () => {
    const r = row("101", 1, 2000);
    expect(r.href).toBe("/buildings/x/units/101");
    expect(r.availableLabel).toBe("Available now");
    expect(r.availableOn).toBe("2026-01-01");
  });

  it("sorts by verified rent with unpriced units last", () => {
    const sorted = [row("a", 1, null), row("b", 2, 3000), row("c", 0, 2000)].sort(compareUnitRows);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("puts the same layout first, and never groups unknown layouts", () => {
    const rows = [row("a", 2, 2000), row("b", 1, 3000), row("c", null, 1000)];
    expect([...rows].sort(compareSiblingRows(1)).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect([...rows].sort(compareSiblingRows(null)).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });
});
