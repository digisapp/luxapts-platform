import { describe, it, expect } from "vitest";
import {
  normalizeHost,
  findUnitsPageIn,
  findAmenitiesPageIn,
  findGalleryPageIn,
} from "../scraper/fetcher";

const html = (...hrefs: string[]) => hrefs.map((h) => `<a href="${h}">link</a>`).join("\n");

describe("normalizeHost", () => {
  it("treats www and apex as one host", () => {
    expect(normalizeHost("www.Foo.com")).toBe("foo.com");
    expect(normalizeHost("foo.com")).toBe("foo.com");
    expect(normalizeHost("portal.foo.com")).toBe("portal.foo.com");
  });
});

describe("findUnitsPageIn", () => {
  it("ignores WordPress oEmbed/REST links that carry the page URL in their query", () => {
    const page = html("/wp-json/oembed/1.0/embed?url=https%3A%2F%2Ftower.com%2Ffloorplans%2F", "/availability/");
    expect(findUnitsPageIn(page, "https://tower.com/")).toBe("https://tower.com/availability/");
  });

  it("skips resident and applicant portal links", () => {
    const page = html("/Apartments/module/application_authentication/popup/false/kill_session/1/", "/atlanta/tower/floorplans/");
    expect(findUnitsPageIn(page, "https://tower.com/")).toBe("https://tower.com/atlanta/tower/floorplans/");
  });

  it("stays on the page when it already is the floor plans page", () => {
    expect(findUnitsPageIn(html("/amenities", "/availability"), "https://rent.tower.com/floorplans/?propertyId[]=1")).toBeNull();
  });

  it("still follows a property home page under /apartments/ to its floor plans", () => {
    expect(
      findUnitsPageIn(html("/apartments/austin/tower/floorplans"), "https://amli.com/apartments/austin/tower")
    ).toBe("https://amli.com/apartments/austin/tower/floorplans");
  });

  it("finds the floor plans page", () => {
    expect(findUnitsPageIn(html("/floorplans"), "https://tower.com")).toBe("https://tower.com/floorplans");
  });

  it("ignores a keyword that only appears in the HOSTNAME", () => {
    // The killer case: the canonical/home link on a building whose domain
    // contains "apartments" matched itself, so the real availability page was
    // never fetched and the marketing page got scraped every night.
    const page = html("https://www.midtownapartments.com/", "/availability");
    expect(findUnitsPageIn(page, "https://www.midtownapartments.com")).toBe(
      "https://www.midtownapartments.com/availability"
    );
  });

  it("never returns the home page itself", () => {
    expect(findUnitsPageIn(html("https://unitsliving.com/"), "https://unitsliving.com")).toBeNull();
  });

  it("accepts deep links after a www redirect", () => {
    // Configured URL is the apex; the fetch landed on www. Comparing raw
    // hostnames rejected every same-site link.
    const page = html("https://www.tower.com/floorplans");
    expect(findUnitsPageIn(page, "https://www.tower.com/")).toBe("https://www.tower.com/floorplans");
    expect(findUnitsPageIn(html("https://tower.com/floorplans"), "https://www.tower.com/")).toBe(
      "https://tower.com/floorplans"
    );
  });

  it("stays on the building's own site", () => {
    const page = html("https://www.apartments.com/miami/tower", "https://instagram.com/units");
    expect(findUnitsPageIn(page, "https://tower.com")).toBeNull();
  });

  it("skips anchors and non-http schemes", () => {
    expect(findUnitsPageIn(html("#floorplans", "mailto:units@tower.com"), "https://tower.com")).toBeNull();
  });

  it("matches a keyword in the query string", () => {
    expect(findUnitsPageIn(html("/search?view=availability"), "https://tower.com")).toBe(
      "https://tower.com/search?view=availability"
    );
  });
});

describe("findAmenitiesPageIn", () => {
  it("finds the amenities page and ignores the hostname", () => {
    const page = html("https://amenities-living.com/", "/community/amenities");
    expect(findAmenitiesPageIn(page, "https://amenities-living.com")).toBe(
      "https://amenities-living.com/community/amenities"
    );
  });

  it("refuses an off-site amenities link", () => {
    expect(findAmenitiesPageIn(html("https://partner.example.com/amenities"), "https://tower.com")).toBeNull();
  });
});

describe("findGalleryPageIn", () => {
  it("finds the on-site gallery", () => {
    expect(findGalleryPageIn(html("/gallery"), "https://tower.com")).toBe("https://tower.com/gallery");
  });

  it("no longer wanders off to social media", () => {
    // findGalleryPage had no same-host guard at all, so nav links to
    // instagram/google photos were fetched and "extracted" as the gallery.
    const page = html("https://www.instagram.com/towerliving/photos", "https://maps.google.com/?q=tower+photos");
    expect(findGalleryPageIn(page, "https://tower.com")).toBeNull();
  });
});
