// HTML fetcher for building websites
// Handles different website types and anti-bot measures

import { ScrapeResult, ImageScrapeResult, UnitsExtractionSource } from "./types";
import { extractUnitsWithAI, extractAmenitiesWithAI, extractFullBuildingData, extractImagesWithAI } from "./ai-extractor";
import { needsJsRendering, renderPage } from "./renderer";

// Common headers to appear as a real browser
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

// Rate limiting: track requests per domain
const domainLastRequest = new Map<string, number>();
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests to same domain
const FETCH_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB cap on fetched HTML

// SSRF guard: only allow public http(s) URLs — block localhost, private and
// link-local ranges (cloud metadata endpoints live at 169.254.169.254).
// Exported for tests.
export function isSafeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  // IPv6 literals (loopback, link-local, unique-local, mapped) — reject outright
  if (host === "::1" || host.includes(":")) return false;
  // IPv4 private/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return false;
    }
  }
  return true;
}

async function rateLimitedFetch(url: string): Promise<Response> {
  if (!isSafeUrl(url)) {
    throw new Error(`Blocked unsafe URL: ${url}`);
  }

  const domain = new URL(url).hostname;
  const lastRequest = domainLastRequest.get(domain) || 0;
  const timeSinceLastRequest = Date.now() - lastRequest;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  domainLastRequest.set(domain, Date.now());

  const response = await fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  // Re-check the final URL in case a redirect landed somewhere unsafe
  if (response.url && !isSafeUrl(response.url)) {
    throw new Error(`Blocked unsafe redirect target: ${response.url}`);
  }

  return response;
}

export async function fetchBuildingHTML(websiteUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  let fetched: { html: string; finalUrl: string } | null = null;

  try {
    const response = await rateLimitedFetch(websiteUrl);

    if (response.ok) {
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength <= MAX_RESPONSE_BYTES) {
        const html = await response.text();
        if (html.length <= MAX_RESPONSE_BYTES) {
          fetched = { html, finalUrl: response.url };
        } else {
          console.error(`Response body too large for ${websiteUrl}`);
        }
      } else {
        console.error(`Response too large for ${websiteUrl}: ${contentLength} bytes`);
      }
    } else {
      console.error(`Failed to fetch ${websiteUrl}: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error fetching ${websiteUrl}:`, error);
  }

  // JS-rendered leasing sites (Entrata/RealPage/Yardi) ship an empty shell —
  // and bot-blocked fetches ship nothing. Try a headless render for both.
  if (!fetched || needsJsRendering(fetched.html)) {
    const rendered = await renderPage(fetched?.finalUrl || websiteUrl);
    if (rendered) {
      console.log(`Rendered ${websiteUrl} via ${rendered.renderer} (${rendered.html.length} bytes)`);
      return { html: rendered.html, finalUrl: rendered.finalUrl };
    }
  }

  return fetched;
}

/**
 * Hosts compared for "same site" purposes. foo.com and www.foo.com are one
 * site: the main fetch follows the redirect between them, so comparing the
 * raw hostnames rejected every deep link on a site that canonicalises to www.
 */
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

const AMENITIES_LINK_PATTERNS = [
  /href=["']([^"']*(?:amenities|features|lifestyle)[^"']*)["']/gi,
  /href=["']([^"']*(?:community|about)[^"']*)["']/gi,
];
const AMENITIES_KEYWORDS = /amenities|features|lifestyle/i;

const UNITS_LINK_PATTERNS = [
  /href=["']([^"']*(?:floor[-_]?plans?|availability|apartments|units|pricing)[^"']*)["']/gi,
  /href=["']([^"']*(?:rent|apply|schedule)[^"']*)["']/gi,
];
const UNITS_KEYWORDS = /floor[-_]?plans?|availability|apartments|units|pricing/i;

const GALLERY_LINK_PATTERNS = [
  /href=["']([^"']*(?:gallery|photos|photo-gallery|images|media|virtual-tour)[^"']*)["']/gi,
  /href=["']([^"']*(?:gallery|photos)[^"']*)["']/gi,
];
const GALLERY_KEYWORDS = /gallery|photos|photo-gallery|images|media|virtual/i;

/**
 * Find the first same-site link whose PATH (never the hostname) matches a
 * section keyword. Pure and exported for tests.
 *
 * `baseUrl` must be the page's FINAL url — the one the main fetch actually
 * landed on after redirects — or every resolved link looks cross-host.
 */
export function findLinkedPage(
  mainHtml: string,
  baseUrl: string,
  patterns: RegExp[],
  keywords: RegExp,
): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  for (const pattern of patterns) {
    for (const match of mainHtml.matchAll(pattern)) {
      const path = match[1];
      if (!path || path.startsWith("#")) continue;

      let candidate: URL;
      try {
        candidate = new URL(path, base);
      } catch {
        continue;
      }

      if (candidate.protocol !== "http:" && candidate.protocol !== "https:") continue;

      // Never leave the building's own site — nav pages link out to Google
      // Maps, Instagram, portfolio sites etc., and "apartments" in those
      // URLs would send the scraper off to render the wrong site entirely.
      if (normalizeHost(candidate.hostname) !== normalizeHost(base.hostname)) continue;

      // Match the PATH only. Testing the whole href meant any building on a
      // domain containing "apartments"/"units"/"pricing" matched its own
      // canonical/home link first and the real /floorplans page was never
      // fetched — the marketing page got scraped instead, every night.
      if (candidate.pathname === "" || candidate.pathname === "/") continue;

      if (keywords.test(candidate.pathname + candidate.search)) {
        return candidate.href;
      }
    }
  }

  return null;
}

/** Amenities page finder (pure). */
export function findAmenitiesPageIn(mainHtml: string, baseUrl: string): string | null {
  return findLinkedPage(mainHtml, baseUrl, AMENITIES_LINK_PATTERNS, AMENITIES_KEYWORDS);
}

/** Floor plans/availability page finder (pure). */
export function findUnitsPageIn(mainHtml: string, baseUrl: string): string | null {
  return findLinkedPage(mainHtml, baseUrl, UNITS_LINK_PATTERNS, UNITS_KEYWORDS);
}

/** Photo gallery page finder (pure). */
export function findGalleryPageIn(mainHtml: string, baseUrl: string): string | null {
  return findLinkedPage(mainHtml, baseUrl, GALLERY_LINK_PATTERNS, GALLERY_KEYWORDS);
}

// Try to find the amenities page from the main website
export async function findAmenitiesPage(websiteUrl: string, mainHtml: string): Promise<string | null> {
  return findAmenitiesPageIn(mainHtml, websiteUrl);
}

// Try to find the floor plans/availability page
export async function findUnitsPage(websiteUrl: string, mainHtml: string): Promise<string | null> {
  return findUnitsPageIn(mainHtml, websiteUrl);
}

export async function scrapeUnitsOnly(websiteUrl: string): Promise<ScrapeResult> {
  try {
    // Fetch main page
    const mainResult = await fetchBuildingHTML(websiteUrl);
    if (!mainResult) {
      return { success: false, error: "Failed to fetch main page" };
    }

    // Try to find dedicated units/floor plans page. The finder keys off the
    // page we actually landed on, not the configured URL.
    const unitsPageUrl = findUnitsPageIn(mainResult.html, mainResult.finalUrl);

    let htmlToProcess = mainResult.html;
    let sourceUrl = mainResult.finalUrl;
    let source: UnitsExtractionSource = "main_page_fallback";
    let unitsPageFetchFailed = false;

    if (unitsPageUrl) {
      const unitsResult = await fetchBuildingHTML(unitsPageUrl);
      if (unitsResult) {
        htmlToProcess = unitsResult.html;
        sourceUrl = unitsResult.finalUrl;
        source = "units_page";
      } else {
        // Bot wall or timeout on the availability page. Anything we extract
        // below comes off the marketing page — the caller MUST NOT read it
        // as "the building's numbered units are gone".
        unitsPageFetchFailed = true;
      }
    }

    // Extract units with AI
    let unitsData = await extractUnitsWithAI(htmlToProcess, sourceUrl);
    let extractionError = unitsData.error;

    // Zero units from a dedicated availability page usually means a JS
    // widget whose shell carried enough nav text to defeat the
    // needsJsRendering heuristic. Force a render and retry before giving up.
    if (unitsData.units.length === 0 && unitsPageUrl) {
      const rendered = await renderPage(unitsPageUrl);
      if (rendered) {
        const rerun = await extractUnitsWithAI(rendered.html, rendered.finalUrl);
        extractionError = rerun.error ?? extractionError;
        if (rerun.units.length > 0) {
          console.log(`Recovered ${rerun.units.length} units from force-rendered ${unitsPageUrl}`);
          unitsData = rerun;
          sourceUrl = rendered.finalUrl;
          source = "units_page";
          unitsPageFetchFailed = false;
          extractionError = undefined;
        }
      }

      // Last resort: the main page we already fetched sometimes lists
      // availability directly (condo towers with marketing-page pricing)
      if (unitsData.units.length === 0 && htmlToProcess !== mainResult.html) {
        const fromMain = await extractUnitsWithAI(mainResult.html, mainResult.finalUrl);
        extractionError = fromMain.error ?? extractionError;
        if (fromMain.units.length > 0) {
          console.log(`Recovered ${fromMain.units.length} units from main page for ${websiteUrl}`);
          unitsData = fromMain;
          sourceUrl = mainResult.finalUrl;
          source = "main_page_fallback";
          extractionError = undefined;
        }
      }
    }

    // No separate availability page: the main page may be it (Related Rentals
    // lists units under #available_apartments on the building page), with the
    // listings rendered by JavaScript. The forced render above only covered a
    // separate units page, so these buildings always came back empty.
    if (unitsData.units.length === 0 && !unitsPageUrl) {
      const rendered = await renderPage(mainResult.finalUrl);
      if (rendered) {
        const rerun = await extractUnitsWithAI(rendered.html, rendered.finalUrl);
        extractionError = rerun.error ?? extractionError;
        if (rerun.units.length > 0) {
          console.log(`Recovered ${rerun.units.length} units from force-rendered main page ${websiteUrl}`);
          unitsData = rerun;
          sourceUrl = rendered.finalUrl;
          extractionError = undefined;
        }
      }
    }

    // An AI outage / 429 / unparseable response is NOT "this building has no
    // units". Reporting it as success recorded units_found=0 and deferred the
    // building for another 7 days.
    if (unitsData.units.length === 0 && extractionError) {
      return {
        success: false,
        error: `Unit extraction failed: ${extractionError}`,
        raw_html_length: htmlToProcess.length,
        source,
        units_page_fetch_failed: unitsPageFetchFailed,
        units_page_url: unitsPageUrl || undefined,
      };
    }

    return {
      success: true,
      data: {
        units: unitsData.units,
        total_available: unitsData.total_available,
        move_in_specials: unitsData.move_in_specials,
        amenities: [],
        scraped_at: new Date().toISOString(),
        source_url: sourceUrl,
      },
      raw_html_length: htmlToProcess.length,
      source,
      units_page_fetch_failed: unitsPageFetchFailed,
      units_page_url: unitsPageUrl || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function scrapeAmenitiesOnly(websiteUrl: string): Promise<ScrapeResult> {
  try {
    // Fetch main page
    const mainResult = await fetchBuildingHTML(websiteUrl);
    if (!mainResult) {
      return { success: false, error: "Failed to fetch main page" };
    }

    // Try to find dedicated amenities page (relative to the URL we landed on)
    const amenitiesPageUrl = findAmenitiesPageIn(mainResult.html, mainResult.finalUrl);

    let htmlToProcess = mainResult.html;
    let sourceUrl = mainResult.finalUrl;

    if (amenitiesPageUrl) {
      const amenitiesResult = await fetchBuildingHTML(amenitiesPageUrl);
      if (amenitiesResult) {
        // Combine both pages for better coverage
        htmlToProcess = mainResult.html + "\n\n<!-- AMENITIES PAGE -->\n\n" + amenitiesResult.html;
        sourceUrl = amenitiesResult.finalUrl;
      }
    }

    // Extract amenities with AI
    const amenitiesData = await extractAmenitiesWithAI(htmlToProcess, sourceUrl);

    return {
      success: true,
      data: {
        units: [],
        amenities: amenitiesData.amenities,
        pet_policy: amenitiesData.pet_policy,
        parking_policy: amenitiesData.parking_policy,
        scraped_at: new Date().toISOString(),
        source_url: sourceUrl,
      },
      raw_html_length: htmlToProcess.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Try to find the photo gallery page from the main website.
// Same-host guarded like the other finders — without it an Instagram or
// Google-Maps link in the nav was fetched and "extracted" as the gallery.
export async function findGalleryPage(websiteUrl: string, mainHtml: string): Promise<string | null> {
  return findGalleryPageIn(mainHtml, websiteUrl);
}

export async function scrapeImagesOnly(websiteUrl: string): Promise<{ success: boolean; data?: ImageScrapeResult; error?: string; raw_html_length?: number }> {
  try {
    // Fetch main page
    const mainResult = await fetchBuildingHTML(websiteUrl);
    if (!mainResult) {
      return { success: false, error: "Failed to fetch main page" };
    }

    // Look for gallery/photos page
    const galleryPageUrl = findGalleryPageIn(mainResult.html, mainResult.finalUrl);

    // Also look for amenities page (often has pool/gym photos)
    const amenitiesPageUrl = findAmenitiesPageIn(mainResult.html, mainResult.finalUrl);

    // Combine HTML from all relevant pages
    const pages: string[] = [mainResult.html];

    if (galleryPageUrl) {
      const galleryResult = await fetchBuildingHTML(galleryPageUrl);
      if (galleryResult) {
        pages.push(`<!-- GALLERY PAGE: ${galleryResult.finalUrl} -->\n${galleryResult.html}`);
      }
    }

    if (amenitiesPageUrl) {
      const amenitiesResult = await fetchBuildingHTML(amenitiesPageUrl);
      if (amenitiesResult) {
        pages.push(`<!-- AMENITIES PAGE: ${amenitiesResult.finalUrl} -->\n${amenitiesResult.html}`);
      }
    }

    // Also try floor plans page for floorplan images
    const unitsPageUrl = findUnitsPageIn(mainResult.html, mainResult.finalUrl);
    if (unitsPageUrl) {
      const unitsResult = await fetchBuildingHTML(unitsPageUrl);
      if (unitsResult) {
        pages.push(`<!-- FLOORPLANS PAGE: ${unitsResult.finalUrl} -->\n${unitsResult.html}`);
      }
    }

    const fullHtml = pages.join("\n\n");

    // Extract images with AI
    const imageData = await extractImagesWithAI(fullHtml, mainResult.finalUrl);

    return {
      success: true,
      data: {
        ...imageData,
        gallery_page_url: galleryPageUrl || undefined,
      },
      raw_html_length: fullHtml.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function scrapeFullBuilding(websiteUrl: string): Promise<ScrapeResult> {
  try {
    // Fetch main page
    const mainResult = await fetchBuildingHTML(websiteUrl);
    if (!mainResult) {
      return { success: false, error: "Failed to fetch main page" };
    }

    // Find additional pages (relative to the URL we landed on)
    const amenitiesPageUrl = findAmenitiesPageIn(mainResult.html, mainResult.finalUrl);
    const unitsPageUrl = findUnitsPageIn(mainResult.html, mainResult.finalUrl);

    // Fetch additional pages
    const additionalPages: string[] = [];

    if (amenitiesPageUrl) {
      const amenitiesResult = await fetchBuildingHTML(amenitiesPageUrl);
      if (amenitiesResult) {
        additionalPages.push(`<!-- AMENITIES PAGE: ${amenitiesResult.finalUrl} -->\n${amenitiesResult.html}`);
      }
    }

    let source: UnitsExtractionSource = "main_page_fallback";
    let unitsPageFetchFailed = false;

    if (unitsPageUrl) {
      const unitsResult = await fetchBuildingHTML(unitsPageUrl);
      if (unitsResult) {
        additionalPages.push(`<!-- UNITS PAGE: ${unitsResult.finalUrl} -->\n${unitsResult.html}`);
        source = "units_page";
      } else {
        unitsPageFetchFailed = true;
      }
    }

    // Combine all HTML
    const fullHtml = [mainResult.html, ...additionalPages].join("\n\n");

    // Extract all data with AI
    const data = await extractFullBuildingData(fullHtml, mainResult.finalUrl);

    if (data.units.length === 0 && data.units_error) {
      return {
        success: false,
        error: `Unit extraction failed: ${data.units_error}`,
        raw_html_length: fullHtml.length,
        source,
        units_page_fetch_failed: unitsPageFetchFailed,
        units_page_url: unitsPageUrl || undefined,
      };
    }

    return {
      success: true,
      data,
      raw_html_length: fullHtml.length,
      source,
      units_page_fetch_failed: unitsPageFetchFailed,
      units_page_url: unitsPageUrl || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
