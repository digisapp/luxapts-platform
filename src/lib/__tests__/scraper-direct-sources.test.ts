import { describe, it, expect } from "vitest";
import {
  apiUrlsFromEmbed,
  findSightMapPageLink,
  findSightMapRefs,
  scrapeSightMap,
  unitsFromSightMap,
} from "../scraper/sightmap";
import { isGlenwoodUrl, parseGlenwoodListings } from "../scraper/glenwood";
import { findUnitsPageIn, isLandlordHomepage } from "../scraper/fetcher";
import { isBotChallenge } from "../scraper/renderer";
import { condenseHtml, focusOnPricing } from "../scraper/ai-extractor";

const API = "https://sightmap.com/app/api/v1/jlw073q4v2y/sightmaps/70352";

const SIGHTMAP_DATA = {
  data: {
    show_pricing: true,
    floor_plans: [
      { id: "1", name: "A5b", bedroom_count: 1, bathroom_count: 1 },
      { id: "2", name: "S1", bedroom_count: 0, bathroom_count: 1 },
    ],
    units: [
      { unit_number: "11F", floor_plan_id: "1", area: 1174, price: 3323, available_on: "2026-10-22" },
      { unit_number: "11G", floor_plan_id: "2", area: 640, price: 2095, available_on: "2026-11-06" },
      { unit_number: "12A", floor_plan_id: "2", area: 600, price: null, available_on: null },
    ],
  },
};

describe("SightMap", () => {
  it("finds embeds and API urls in a page", () => {
    const html = `<iframe src="https://sightmap.com/embed/05eve212vqo"></iframe><script>fetch("${API}")</script>`;
    expect(findSightMapRefs(html)).toEqual({ embedIds: ["05eve212vqo"], apiUrls: [API] });
  });

  it("follows the site's own /sightmap page, never another host", () => {
    expect(findSightMapPageLink(`<a href="/sightmap/">Map</a>`, "https://www.emmimidtown.com/")).toBe(
      "https://www.emmimidtown.com/sightmap/"
    );
    expect(findSightMapPageLink(`<a href="sightmap.php">Map</a>`, "https://www.thecapitolnyc.com/index.php")).toBe(
      "https://www.thecapitolnyc.com/sightmap.php"
    );
    expect(findSightMapPageLink(`<a href="https://sightmap.com">SightMap</a>`, "https://x.com/")).toBeNull();
  });

  it("reads the API urls out of the embed's app config", () => {
    const embed = `<script>\n      window.__APP_CONFIG__ = {"name":"Emmi","sightmaps":[{"list_label":"C","href":"${API}"}]}\n      window.__HASH_ID__ = 'x'\n</script>`;
    expect(apiUrlsFromEmbed(embed)).toEqual([API]);
  });

  it("maps priced units with their floor plan and skips unpriced ones", () => {
    expect(unitsFromSightMap(SIGHTMAP_DATA.data)).toEqual([
      { unit_number: "11F", beds: 1, baths: 1, sqft: 1174, rent: 3323, available_on: "2026-10-22", floorplan_name: "A5b" },
      { unit_number: "11G", beds: 0, baths: 1, sqft: 640, rent: 2095, available_on: "2026-11-06", floorplan_name: "S1" },
    ]);
    expect(unitsFromSightMap({ ...SIGHTMAP_DATA.data, show_pricing: false })).toEqual([]);
  });

  it("drops a community suffix from the unit number but keeps hyphenated numbers", () => {
    const data = {
      floor_plans: [{ id: "1", name: "A1", bedroom_count: 1, bathroom_count: 1 }],
      units: [
        { unit_number: "1022 - Mueller", floor_plan_id: "1", price: 1780 },
        { unit_number: "S103 - Branch Park", floor_plan_id: "1", price: 1807 },
        { unit_number: "00-1006", floor_plan_id: "1", price: 2757 },
      ],
    };
    expect(unitsFromSightMap(data).map((u) => u.unit_number)).toEqual(["1022", "S103", "00-1006"]);
  });

  it("treats a stack map (plan codes repeated across floors) as floor plans", () => {
    const stack = {
      floor_plans: [{ id: "9", name: "B3", bedroom_count: 2, bathroom_count: 2 }],
      units: [
        { unit_number: "B3", label: "B3", floor_plan_id: "9", area: 1387, price: 8995 },
        { unit_number: "B3", label: "B3", floor_plan_id: "9", area: 1387, price: 8995 },
        { unit_number: "B3", label: "B3", floor_plan_id: "9", area: 1387, price: 9200 },
      ],
    };
    expect(unitsFromSightMap(stack)).toEqual([
      { beds: 2, baths: 2, sqft: 1387, rent: 8995, floorplan_name: "B3" },
      { beds: 2, baths: 2, sqft: 1387, rent: 9200, floorplan_name: "B3" },
    ]);
  });

  it("goes page → embed → API, and returns null for buildings without SightMap", async () => {
    const fetched: string[] = [];
    const fetchText = async (url: string) => {
      fetched.push(url);
      if (url === "https://www.emmimidtown.com/sightmap/") return `<iframe src="https://sightmap.com/embed/27vq6ggzpox"></iframe>`;
      if (url === "https://sightmap.com/embed/27vq6ggzpox")
        return `window.__APP_CONFIG__ = {"sightmaps":[{"href":"${API}"}]}\n`;
      if (url === API) return JSON.stringify(SIGHTMAP_DATA);
      return null;
    };
    const result = await scrapeSightMap(
      [{ html: `<a href="/sightmap/">Availability</a>`, url: "https://www.emmimidtown.com/" }],
      fetchText
    );
    expect(result?.units).toHaveLength(2);
    expect(result?.sourceUrl).toBe(API);
    expect(fetched).toEqual(["https://www.emmimidtown.com/sightmap/", "https://sightmap.com/embed/27vq6ggzpox", API]);

    expect(await scrapeSightMap([{ html: "<p>No map here</p>", url: "https://x.com/" }], fetchText)).toBeNull();
  });
});

describe("Glenwood", () => {
  const card = (id: number, beds: string, baths: string, price: string) => `
    <div class="listing"><h4>Paramount Tower <span>ID: ${id}</span></h4>
    <div class="col"><p>Bedrooms</p><svg><path d="M1"/></svg><span>${beds}</span></div>
    <div class="col"><p>Bathrooms</p><span>${baths}</span></div>
    <div class="col"><p>Video</p><a href="#"><span>1</span></a></div>
    <div class="col"><p>Monthly Price</p><p class="monthy-rent"><span>${price}</span></p></div>
    <a href="https://www.glenwoodnyc.com/listing-detail/?lid=${id}">View Apartment</a></div>`;

  it("parses every listing card, once each", () => {
    const html = card(2990, "2", "2", "$8,995") + card(5632, "2", "2.5", "$8,995") + card(2990, "2", "2", "$8,995") + card(77, "Studio", "1", "$3,450");
    expect(parseGlenwoodListings(html)).toEqual([
      { beds: 2, baths: 2, rent: 8995 },
      { beds: 2, baths: 2.5, rent: 8995 },
      { beds: 0, baths: 1, rent: 3450 },
    ]);
  });

  it("only claims glenwoodnyc.com", () => {
    expect(isGlenwoodUrl("https://www.glenwoodnyc.com/properties/midtown-east/paramount-tower/")).toBe(true);
    expect(isGlenwoodUrl("https://notglenwoodnyc.com.evil.io/")).toBe(false);
  });
});

describe("findUnitsPageIn ranking", () => {
  it("prefers an availability page over a generic 'apartments' link that comes first", () => {
    const html = `<a href="/williamsburg-apartments-views/">Views</a><a href="/availability/">Availability</a>`;
    expect(findUnitsPageIn(html, "https://420kent.com/")).toBe("https://420kent.com/availability/");
  });

  it("does not send the scraper to an amenities page that says 'apartments'", () => {
    const html = `<a href="/apartments/ga/atlanta/amenities">Amenities</a><a href="/floor-plans">Floor Plans</a>`;
    expect(findUnitsPageIn(html, "https://www.thetoweronpiedmont.com/")).toBe("https://www.thetoweronpiedmont.com/floor-plans");
  });

  it("keeps a property page that links to itself (Cortland, AMLI list units there)", () => {
    const html = `<a href="/apartments/cortland-m-line/">Overview</a><a href="/apartments/cortland-m-line/floorplans/">Floor Plans</a>`;
    expect(findUnitsPageIn(html, "https://cortland.com/apartments/cortland-m-line/")).toBe(
      "https://cortland.com/apartments/cortland-m-line/"
    );
  });

  it("recognises /availabilities and /sightmap", () => {
    expect(findUnitsPageIn(`<a href="/availabilities">Avail</a>`, "https://atxtower-residences.com/")).toBe(
      "https://atxtower-residences.com/availabilities"
    );
    expect(findUnitsPageIn("", "https://atxtower-residences.com/availabilities")).toBeNull();
  });
});

describe("isBotChallenge", () => {
  it("spots Cloudflare, Akamai and Incapsula walls", () => {
    expect(isBotChallenge("<html><head><title>Just a moment...</title></head></html>")).toBe(true);
    expect(isBotChallenge("<html><head><title>Access Denied</title></head><body>You don't have permission</body></html>")).toBe(true);
    expect(isBotChallenge(`<html><body><script src="/_Incapsula_Resource?x=1"></script></body></html>`)).toBe(true);
    expect(isBotChallenge(`<html><body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script></body></html>`)).toBe(true);
  });

  it("does not flag a real page that loads Cloudflare's script", () => {
    const real = `<html><head><title>Emmi Midtown</title></head><body>${"<p>Luxury apartments in Midtown Atlanta.</p>".repeat(40)}<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body></html>`;
    expect(isBotChallenge(real)).toBe(false);
  });
});

describe("focusOnPricing on a page whose prices carry no $", () => {
  it("keeps Related-style unit cards and drops the budget dropdown", () => {
    const filler = "<p>" + "Luxury living in Chelsea. ".repeat(400) + "</p>";
    const dropdown = `<select name="max">${Array.from({ length: 200 }, (_, i) => `<option>$${(3000 + i * 50).toLocaleString()}</option>`).join("")}</select>`;
    const cardHtml = `<div class="unit-card"><article data-price="5675"><h3>Alcove Studio, 1 Bath</h3><span>Price: 5,675</span></article></div>`;
    const html = `<html><body>${filler.repeat(12)}${dropdown}${filler.repeat(12)}${cardHtml}${filler.repeat(4)}</body></html>`;
    const sent = focusOnPricing(condenseHtml(html));
    expect(sent).toContain("Price: 5,675");
    expect(sent).not.toContain("<option>");
  });
});

describe("groundedSpecials", () => {
  const page = "<div class='promo'>Limited time: 6 weeks free on select 14-month leases!</div><p>Studio apartments</p>";
  it("keeps a special the page states", async () => {
    const { groundedSpecials } = await import("../scraper/ai-extractor");
    expect(groundedSpecials(["6 weeks free on select 14-month leases"], page)).toEqual([
      "6 weeks free on select 14-month leases",
    ]);
  });
  it("drops one copied from the prompt or with numbers the page lacks", async () => {
    const { groundedSpecials } = await import("../scraper/ai-extractor");
    expect(groundedSpecials(["2 months free on 13+ month lease"], page)).toEqual([]);
    expect(groundedSpecials(["Contact for current specials", 42, null], page)).toEqual([]);
    expect(groundedSpecials("not an array", page)).toEqual([]);
  });
});

describe("isLandlordHomepage", () => {
  it("refuses a landlord's homepage but not one building's page on it", () => {
    expect(isLandlordHomepage("https://www.rockrose.com/")).toBe(true);
    expect(isLandlordHomepage("https://rockrose.com")).toBe(true);
    expect(isLandlordHomepage("https://cortland.com/apartments/cortland-m-line/")).toBe(false);
    expect(isLandlordHomepage("https://420kent.com/")).toBe(false);
  });
});
