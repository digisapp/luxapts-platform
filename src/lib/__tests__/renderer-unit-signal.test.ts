import { describe, it, expect } from "vitest";
import { looksLikeUnitContent, unitSignalCount } from "@/lib/scraper/renderer";

describe("looksLikeUnitContent", () => {
  it("recognises inventory in either word order", () => {
    expect(looksLikeUnitContent("<td>12B</td><td>1 Bed</td><td>$4,945</td>")).toBe(true);
    expect(looksLikeUnitContent("<li>$5,050 · 2 bath · 1,100 sq ft</li>")).toBe(true);
    expect(looksLikeUnitContent("Studio from $3,200/mo")).toBe(true);
  });

  it("ignores a price with no unit context nearby", () => {
    // A donation ask or a deposit figure is not inventory.
    expect(looksLikeUnitContent("<p>Application fee $250,000 endowment</p>")).toBe(false);
    expect(looksLikeUnitContent("<footer>© 2026 · call 555-1234</footer>")).toBe(false);
  });

  it("does not fire on an empty SPA shell", () => {
    expect(looksLikeUnitContent('<div id="root"></div>')).toBe(false);
    expect(looksLikeUnitContent("")).toBe(false);
  });

  it("counts prices so the richest snapshot wins", () => {
    // Atlas New York returned 23 prices on a good render and 9 on a bad one;
    // the settle loop keeps whichever snapshot carries more.
    const poor = "$4,945 one bed";
    const rich = "$4,945 1 bed $5,050 1 bed $5,057 1 bed";
    expect(unitSignalCount(rich)).toBeGreaterThan(unitSignalCount(poor));
    expect(unitSignalCount("no prices here")).toBe(0);
  });
});
