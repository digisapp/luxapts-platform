import { describe, it, expect } from "vitest";
import { looksLikeUnitContent, unitSignalCount, settleForUnitContent } from "@/lib/scraper/renderer";

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

describe("settleForUnitContent", () => {
  /** A list of `n` priced one-bedroom rows. */
  const list = (n: number) => Array.from({ length: n }, (_, i) => `<li>1 bed · $${3000 + i}</li>`).join("");

  /** A fake page whose content() walks through `snapshots`, then repeats the last. */
  function fakePage(snapshots: string[]) {
    let calls = 0;
    const page = {
      content: async () => snapshots[Math.min(calls++, snapshots.length - 1)],
      evaluate: async () => {},
      waitForTimeout: async () => {},
    };
    return { page: page as unknown as Parameters<typeof settleForUnitContent>[0], calls: () => calls };
  }

  it("waits for a lazy list to stop growing instead of taking the first 3 prices", async () => {
    const { page } = fakePage([list(3), list(5), list(12), list(30), list(59)]);
    const html = await settleForUnitContent(page, 10_000);
    expect(unitSignalCount(html)).toBe(59);
  });

  it("stops after two quiet polls once the list is complete", async () => {
    const { page, calls } = fakePage([list(20)]);
    const html = await settleForUnitContent(page, 10_000);
    expect(unitSignalCount(html)).toBe(20);
    expect(calls()).toBe(3); // the first look plus two polls with no new prices
  });

  it("keeps the richest snapshot when a virtualised list drops rows on scroll", async () => {
    const { page } = fakePage([list(10), list(25), list(18)]);
    expect(unitSignalCount(await settleForUnitContent(page, 10_000))).toBe(25);
  });

  it("gives up early on a page with no prices at all", async () => {
    const { page, calls } = fakePage(["<p>Schedule a tour</p>"]);
    expect(await settleForUnitContent(page, 10_000)).toBe("<p>Schedule a tour</p>");
    expect(calls()).toBe(4);
  });
});
