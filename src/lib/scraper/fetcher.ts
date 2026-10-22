// HTML fetcher for building websites
// Handles different website types and anti-bot measures

import { ScrapeResult, ImageScrapeResult, UnitsExtractionSource } from "./types";
import { extractUnitsWithAI, extractAmenitiesWithAI, extractFullBuildingData, extractImagesWithAI, verifyImagesWithVision } from "./ai-extractor";
import { isBotChallenge, needsJsRendering, renderPage } from "./renderer";
import { scrapeSightMap } from "./sightmap";
import { isGlenwoodUrl, parseGlenwoodListings } from "./glenwood";
import type { ScrapedUnit } from "./types";
import { collectImageCandidates } from "./image-candidates";

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

/** Plain GET through the SSRF guard and rate limiter; null on any failure. */
async function fetchTextSafe(url: string): Promise<string | null> {
  try {
    const res = await rateLimitedFetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return text.length <= MAX_RESPONSE_BYTES ? text : null;
  } catch {
    return null;
  }
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
    } else if (response.status === 404 || response.status === 410) {
      // The page is gone, not bot-walled. Rendering it just produced the
      // site's 404 template, which "succeeded" with 0 units every night.
      console.error(`Page gone for ${websiteUrl}: ${response.status}`);
      return null;
    } else {
      console.error(`Failed to fetch ${websiteUrl}: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Error fetching ${websiteUrl}:`, error);
  }

  // A bot wall is not the page: render instead, and never return the wall
  // itself, which used to be read as "this building lists 0 units".
  const challenged = !!fetched && isBotChallenge(fetched.html);
  if (challenged) console.error(`Bot challenge served for ${websiteUrl}`);

  // JS-rendered leasing sites (Entrata/RealPage/Yardi) ship an empty shell —
  // and bot-blocked fetches ship nothing. Try a headless render for both.
  if (!fetched || challenged || needsJsRendering(fetched.html)) {
    const rendered = await renderPage(fetched?.finalUrl || websiteUrl);
    if (rendered && !isBotChallenge(rendered.html)) {
      console.log(`Rendered ${websiteUrl} via ${rendered.renderer} (${rendered.html.length} bytes)`);
      return { html: rendered.html, finalUrl: rendered.finalUrl };
    }
    if (rendered) console.error(`Bot challenge still served after rendering ${websiteUrl}`);
  }

  return challenged ? null : fetched;
}

/**
 * Hosts compared for "same site" purposes. foo.com and www.foo.com are one
 * site: the main fetch follows the redirect between them, so comparing the
 * raw hostnames rejected every deep link on a site that canonicalises to www.
 */
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

const NON_PAGE_PATH = /\/(?:wp-json|xmlrpc\.php|feed|comments\/feed|wp-admin|wp-login)\b|\.(?:xml|json|pdf|jpe?g|png|webp|gif|svg|css|js)$/i;
// Resident/applicant portals: Entrata's "/Apartments/module/application_authentication/…"
// matched "apartments" and the scraper read a login screen.
const PORTAL_PATH = /application_authentication|kill_session|\/(?:log-?in|sign-?in|resident-?portal|apply-?now)\b/i;

const AMENITIES_LINK_PATTERNS = [
  /href=["']([^"']*(?:amenities|features|lifestyle)[^"']*)["']/gi,
  /href=["']([^"']*(?:community|about)[^"']*)["']/gi,
];
const AMENITIES_KEYWORDS = /amenities|features|lifestyle/i;

const UNITS_LINK_PATTERNS = [
  /href=["']([^"']*(?:floor[-_]?plans?|availabilit(?:y|ies)|sightmap|conventional|apartments|units|pricing)[^"']*)["']/gi,
  /href=["']([^"']*(?:rent|apply|schedule)[^"']*)["']/gi,
];
const UNITS_KEYWORDS = /floor[-_]?plans?|availabilit(?:y|ies)|sightmap|\/conventional\b|apartments|units|pricing/i;
// Narrower than UNITS_KEYWORDS: "/apartments/austin/amli-at-mueller" is a
// property home page whose floor plans live one link deeper.
const AVAILABILITY_PATH = /floor[-_]?plans?|availabilit(?:y|ies)|pricing|\/conventional\b/i;

/**
 * Lower is better. A page named for availability beats a generic
 * "apartments" match: 420 Kent's first match was /williamsburg-apartments-
 * views/ (0 prices) while /availability/ listed 20; The Tower on Piedmont's
 * was /apartments/ga/atlanta/amenities over /floor-plans.
 */
function unitsLinkRank(url: URL): number {
  const path = (url.pathname + url.search).toLowerCase();
  if (/amenit|gallery|photos|neighborhood|contact|blog|news/.test(path)) return 4;
  if (/avail|floor[-_]?plans?|pricing|sightmap|\/conventional\b/.test(path)) return 0;
  if (/units/.test(path)) return 1;
  if (/apartments/.test(path)) return 2;
  return 3;
}

const GALLERY_LINK_PATTERNS = [
  /href=["']([^"']*(?:gallery|photos|photo-gallery|images|media|virtual-tour)[^"']*)["']/gi,
  /href=["']([^"']*(?:gallery|photos)[^"']*)["']/gi,
];
const GALLERY_KEYWORDS = /gallery|photos|photo-gallery|images|media|virtual/i;

// A WHOLE path segment naming a section of the same property (optionally with
// a file extension). Whole, not substring: a sibling property's slug can
// contain "gallery" (Gallery at Turtle Creek) but is never exactly "gallery".
const UNITS_SECTION_SEGMENT = /^(?:floor[-_]?plans?|availabilit(?:y|ies)|pricing|sightmap)(?:\.[a-z]+)?$/i;
const AMENITIES_SECTION_SEGMENT = /^(?:amenities|features|lifestyle)(?:\.[a-z]+)?$/i;
const GALLERY_SECTION_SEGMENT = /^(?:gallery|photos|photo-gallery|images|media|virtual-tour)(?:\.[a-z]+)?$/i;

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
}

/**
 * On a portfolio host the property lives in a sub-path
 * (greystar.com/novel-turtle-creek-dallas-tx/p_18979) and the nav links to
 * sibling properties on the same host. "apartments" in a sibling's slug sent
 * Novel Turtle Creek to Gallery at Turtle Creek's page, and Novel carried
 * Gallery's floorplans. So for a base path of 2+ segments, accept only links
 * under the base path, or next to it whose differing segment is itself the
 * section (/en/home → /en/floorplans). Root and one-segment bases are
 * single-property sites and keep the old behaviour.
 */
function staysOnProperty(base: URL, candidate: URL, sectionSegment: RegExp): boolean {
  const baseParts = pathSegments(base.pathname);
  if (baseParts.length < 2) return true;

  const parts = pathSegments(candidate.pathname);
  if (baseParts.every((p, i) => parts[i] === p)) return true;

  const parent = baseParts.slice(0, -1);
  return (
    parts.length > parent.length &&
    parent.every((p, i) => parts[i] === p) &&
    sectionSegment.test(parts[parent.length])
  );
}

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
  sectionSegment: RegExp,
  rank?: (url: URL) => number,
): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }

  // Without a rank the first match wins (amenities, gallery). With one, every
  // match is collected and the best-ranked wins, ties going to page order.
  let best: { href: string; score: number } | null = null;

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

      // WordPress plumbing (oEmbed/REST/feeds) carries the page URL in its
      // query string, so "…/oembed/1.0/embed?url=…/floorplans/" matched and
      // the scraper read a 2KB JSON stub instead of the floor plans page.
      if (NON_PAGE_PATH.test(candidate.pathname) || PORTAL_PATH.test(candidate.pathname)) continue;

      if (!staysOnProperty(base, candidate, sectionSegment)) continue;

      if (keywords.test(candidate.pathname + candidate.search)) {
        if (!rank) return candidate.href;
        const score = rank(candidate);
        if (!best || score < best.score) best = { href: candidate.href, score };
      }
    }
  }

  return best?.href ?? null;
}

/** Amenities page finder (pure). */
export function findAmenitiesPageIn(mainHtml: string, baseUrl: string): string | null {
  return findLinkedPage(mainHtml, baseUrl, AMENITIES_LINK_PATTERNS, AMENITIES_KEYWORDS, AMENITIES_SECTION_SEGMENT);
}

/**
 * Floor plans/availability page finder (pure). When the configured URL is
 * already the availability page (e.g. /floorplans/?propertyId=…), stay on it:
 * hopping to "the first availability-looking link" from there only ever
 * lands somewhere worse.
 */
export function findUnitsPageIn(mainHtml: string, baseUrl: string): string | null {
  try {
    const here = new URL(baseUrl);
    if (AVAILABILITY_PATH.test(here.pathname)) return null;
  } catch {
    return null;
  }
  // A link back to the page itself outranks everything: on property pages
  // like Cortland's and AMLI's (/apartments/<city>/<property>) the page lists
  // the individual apartments, and the floor plans page only "from" prices.
  const here = new URL(baseUrl);
  const samePath = (u: URL) => u.pathname.replace(/\/+$/, "") === here.pathname.replace(/\/+$/, "");
  return findLinkedPage(mainHtml, baseUrl, UNITS_LINK_PATTERNS, UNITS_KEYWORDS, UNITS_SECTION_SEGMENT, (u) =>
    samePath(u) ? -1 : unitsLinkRank(u)
  );
}

/** Photo gallery page finder (pure). */
export function findGalleryPageIn(mainHtml: string, baseUrl: string): string | null {
  return findLinkedPage(mainHtml, baseUrl, GALLERY_LINK_PATTERNS, GALLERY_KEYWORDS, GALLERY_SECTION_SEGMENT);
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

    // Sources read directly, before any model call: exact and free.
    const pages = [{ html: mainResult.html, url: mainResult.finalUrl }];
    if (source === "units_page") pages.push({ html: htmlToProcess, url: sourceUrl });

    const directResult = (units: ScrapedUnit[], url: string, from: UnitsExtractionSource): ScrapeResult => ({
      success: true,
      data: {
        units,
        total_available: units.length,
        move_in_specials: [],
        amenities: [],
        scraped_at: new Date().toISOString(),
        source_url: url,
      },
      raw_html_length: htmlToProcess.length,
      source: from,
      units_page_fetch_failed: unitsPageFetchFailed,
      units_page_url: unitsPageUrl || undefined,
    });

    if (isGlenwoodUrl(mainResult.finalUrl)) {
      for (const page of [...pages].reverse()) {
        const units = parseGlenwoodListings(page.html);
        if (units.length) {
          console.log(`Glenwood: ${units.length} listing(s) parsed from ${page.url}`);
          return directResult(units, page.url, page.url === mainResult.finalUrl && source !== "units_page" ? "main_page_fallback" : source);
        }
      }
    }

    // SightMap's JSON lists every unit, so it is an authoritative units page.
    const sightmap = await scrapeSightMap(pages, fetchTextSafe, (line) => console.log(line));
    if (sightmap && sightmap.units.length) {
      return directResult(sightmap.units, sightmap.sourceUrl, "units_page");
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

    // Same rule as units: an AI outage is not "this building has no
    // amenities". Reporting it as success stamped amenities_scraped_at and
    // deferred the building for 180 days.
    if (amenitiesData.error) {
      return {
        success: false,
        error: `Amenity extraction failed: ${amenitiesData.error}`,
        raw_html_length: htmlToProcess.length,
      };
    }

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

    // Collect candidates per page so relative URLs resolve against the page
    // they came from, not the homepage.
    const pages: { html: string; url: string }[] = [{ html: mainResult.html, url: mainResult.finalUrl }];

    for (const extraUrl of [galleryPageUrl, amenitiesPageUrl, findUnitsPageIn(mainResult.html, mainResult.finalUrl)]) {
      if (!extraUrl) continue;
      const extra = await fetchBuildingHTML(extraUrl);
      if (extra) pages.push({ html: extra.html, url: extra.finalUrl });
    }

    // Gallery first: it has the most (and the best) photos
    const ordered = [...pages.slice(1), pages[0]];
    const seen = new Set<string>();
    const candidates = ordered
      .flatMap((p) => collectImageCandidates(p.html, p.url))
      .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
      .slice(0, 150);

    const classified = await extractImagesWithAI(candidates, mainResult.finalUrl);
    // Unit photos get looked at too: search cards show a unit photo ahead of
    // the building's, so an unchecked texture would become the card image.
    const [buildingImages, unitImages] = await Promise.all([
      verifyImagesWithVision(classified.building_images),
      verifyImagesWithVision(classified.unit_images),
    ]);
    const imageData = {
      ...classified,
      building_images: buildingImages,
      unit_images: unitImages.map((img) => ({ ...img, is_hero: false })),
    };

    return {
      success: true,
      data: {
        ...imageData,
        gallery_page_url: galleryPageUrl || undefined,
      },
      raw_html_length: pages.reduce((n, p) => n + p.html.length, 0),
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
