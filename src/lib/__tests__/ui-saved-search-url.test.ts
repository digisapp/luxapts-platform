import { describe, it, expect } from "vitest";
import { buildSavedSearchUrl } from "@/hooks/buildSavedSearchUrl";
import { isPortalRoute } from "@/hooks/portal-routes";

function paramsOf(url: string): URLSearchParams {
  return new URLSearchParams(url.split("?")[1] ?? "");
}

describe("buildSavedSearchUrl", () => {
  it("keeps the filters the old inline builders already handled", () => {
    const params = paramsOf(
      buildSavedSearchUrl({
        city: "miami",
        bedsMin: 1,
        bedsMax: 3,
        budgetMin: 2000,
        budgetMax: 5000,
      })
    );
    expect(params.get("city")).toBe("miami");
    expect(params.get("beds_min")).toBe("1");
    expect(params.get("beds_max")).toBe("3");
    expect(params.get("budget_min")).toBe("2000");
    expect(params.get("budget_max")).toBe("5000");
  });

  it("carries petFriendly through as pet_friendly=1", () => {
    expect(paramsOf(buildSavedSearchUrl({ petFriendly: true })).get("pet_friendly")).toBe("1");
    expect(paramsOf(buildSavedSearchUrl({ petFriendly: false })).has("pet_friendly")).toBe(false);
    expect(paramsOf(buildSavedSearchUrl({})).has("pet_friendly")).toBe(false);
  });

  it("carries a single neighborhood slug", () => {
    expect(paramsOf(buildSavedSearchUrl({ neighborhood: "brickell" })).get("neighborhood")).toBe(
      "brickell"
    );
  });

  it("joins multiple neighborhood slugs with commas", () => {
    expect(
      paramsOf(buildSavedSearchUrl({ neighborhood: ["brickell", "wynwood"] })).get("neighborhood")
    ).toBe("brickell,wynwood");
  });

  it("drops blank neighborhood values instead of emitting an empty param", () => {
    expect(paramsOf(buildSavedSearchUrl({ neighborhood: "  " })).has("neighborhood")).toBe(false);
    expect(
      paramsOf(buildSavedSearchUrl({ neighborhood: ["", "brickell"] })).get("neighborhood")
    ).toBe("brickell");
  });

  it("keeps beds_min=0 (studio) rather than treating 0 as unset", () => {
    expect(paramsOf(buildSavedSearchUrl({ bedsMin: 0 })).get("beds_min")).toBe("0");
  });

  it("always targets /search", () => {
    expect(buildSavedSearchUrl({ city: "austin" }).startsWith("/search?")).toBe(true);
  });
});

describe("isPortalRoute", () => {
  it("matches portal roots and their sub-routes", () => {
    for (const path of [
      "/admin",
      "/admin/buildings",
      "/shower",
      "/shower/certifications/abc",
      "/partner",
      "/partner/leads",
      "/agent",
      "/agent/schedule",
    ]) {
      expect(isPortalRoute(path)).toBe(true);
    }
  });

  it("leaves consumer routes alone", () => {
    for (const path of ["/", "/search", "/favorites", "/cities", "/buildings/abc", "/account"]) {
      expect(isPortalRoute(path)).toBe(false);
    }
  });

  it("does not match a consumer route that merely starts with a portal name", () => {
    expect(isPortalRoute("/agents")).toBe(false);
    expect(isPortalRoute("/partnership")).toBe(false);
    expect(isPortalRoute("/showers-guide")).toBe(false);
  });
});
