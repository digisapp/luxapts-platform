import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// No network, no browser, no model: fetch is stubbed per test, the renderer
// and the AI extractor are mocks.
vi.mock("../scraper/renderer", () => ({
  needsJsRendering: vi.fn(() => false),
  renderPage: vi.fn(async (url: string) => ({
    html: "<html><body>rendered</body></html>",
    finalUrl: url,
    renderer: "playwright",
  })),
}));
vi.mock("../scraper/ai-extractor", () => ({
  extractUnitsWithAI: vi.fn(),
  extractAmenitiesWithAI: vi.fn(),
  extractFullBuildingData: vi.fn(),
  extractImagesWithAI: vi.fn(),
  verifyImagesWithVision: vi.fn(),
}));

import { fetchBuildingHTML, scrapeAmenitiesOnly } from "../scraper/fetcher";
import { renderPage } from "../scraper/renderer";
import { extractAmenitiesWithAI } from "../scraper/ai-extractor";

const PAGE = `<html><body>${"<p>Luxury rental apartments with amenities.</p>".repeat(30)}</body></html>`;

function stubFetch(status: number, body = PAGE) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
}

// The fetcher rate-limits per host, so every test uses its own host.
let host = 0;
const nextUrl = () => `https://tower${++host}.example.com/`;

beforeEach(() => {
  vi.mocked(renderPage).mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchBuildingHTML — dead pages", () => {
  it.each([404, 410])("returns null for %i without rendering the error template", async (status) => {
    stubFetch(status, "<html><body>Page not found</body></html>");
    expect(await fetchBuildingHTML(nextUrl())).toBeNull();
    expect(renderPage).not.toHaveBeenCalled();
  });

  it.each([403, 429, 503])("still renders past a %i bot wall", async (status) => {
    stubFetch(status);
    const result = await fetchBuildingHTML(nextUrl());
    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(result?.html).toContain("rendered");
  });
});

describe("scrapeAmenitiesOnly — extraction failures", () => {
  it("reports an AI failure as a failed scrape, not as zero amenities", async () => {
    stubFetch(200);
    vi.mocked(extractAmenitiesWithAI).mockResolvedValue({ amenities: [], error: "429 Too Many Requests" });
    const result = await scrapeAmenitiesOnly(nextUrl());
    expect(result.success).toBe(false);
    expect(result.error).toContain("429 Too Many Requests");
  });

  it("still succeeds when the page genuinely lists no amenities", async () => {
    stubFetch(200);
    vi.mocked(extractAmenitiesWithAI).mockResolvedValue({ amenities: [] });
    const result = await scrapeAmenitiesOnly(nextUrl());
    expect(result.success).toBe(true);
    expect(result.data?.amenities).toEqual([]);
  });
});
