// HTML fetcher for building websites
// Handles different website types and anti-bot measures

import { ScrapeResult, ImageScrapeResult } from "./types";
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

// Try to find the amenities page from the main website
export async function findAmenitiesPage(websiteUrl: string, mainHtml: string): Promise<string | null> {
  // Common amenities page patterns
  const patterns = [
    /href=["']([^"']*(?:amenities|features|lifestyle)[^"']*)["']/gi,
    /href=["']([^"']*(?:community|about)[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    const matches = mainHtml.matchAll(pattern);
    for (const match of matches) {
      const amenitiesPath = match[1];

      // Skip if it's an anchor link
      if (amenitiesPath.startsWith("#")) continue;

      // Build full URL
      try {
        const baseUrl = new URL(websiteUrl);
        const amenitiesUrl = new URL(amenitiesPath, baseUrl).href;

        // Check if the URL contains likely amenities keywords
        if (/amenities|features|lifestyle/i.test(amenitiesUrl)) {
          return amenitiesUrl;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

// Try to find the floor plans/availability page
export async function findUnitsPage(websiteUrl: string, mainHtml: string): Promise<string | null> {
  // Common floor plans/availability page patterns
  const patterns = [
    /href=["']([^"']*(?:floor[-_]?plans?|availability|apartments|units|pricing)[^"']*)["']/gi,
    /href=["']([^"']*(?:rent|apply|schedule)[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    const matches = mainHtml.matchAll(pattern);
    for (const match of matches) {
      const unitsPath = match[1];

      // Skip if it's an anchor link
      if (unitsPath.startsWith("#")) continue;

      // Build full URL
      try {
        const baseUrl = new URL(websiteUrl);
        const unitsUrl = new URL(unitsPath, baseUrl).href;

        // Check if the URL contains likely units keywords
        if (/floor[-_]?plans?|availability|apartments|units|pricing/i.test(unitsUrl)) {
          return unitsUrl;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function scrapeUnitsOnly(websiteUrl: string): Promise<ScrapeResult> {
  try {
    // Fetch main page
    const mainResult = await fetchBuildingHTML(websiteUrl);
    if (!mainResult) {
      return { success: false, error: "Failed to fetch main page" };
    }

    // Try to find dedicated units/floor plans page
    const unitsPageUrl = await findUnitsPage(websiteUrl, mainResult.html);

    let htmlToProcess = mainResult.html;
    let sourceUrl = mainResult.finalUrl;

    if (unitsPageUrl) {
      const unitsResult = await fetchBuildingHTML(unitsPageUrl);
      if (unitsResult) {
        htmlToProcess = unitsResult.html;
        sourceUrl = unitsResult.finalUrl;
      }
    }

    // Extract units with AI
    let unitsData = await extractUnitsWithAI(htmlToProcess, sourceUrl);

    // Zero units from a dedicated availability page usually means a JS
    // widget whose shell carried enough nav text to defeat the
    // needsJsRendering heuristic. Force a render and retry before giving up.
    if (unitsData.units.length === 0 && unitsPageUrl) {
      const rendered = await renderPage(unitsPageUrl);
      if (rendered) {
        const rerun = await extractUnitsWithAI(rendered.html, rendered.finalUrl);
        if (rerun.units.length > 0) {
          console.log(`Recovered ${rerun.units.length} units from force-rendered ${unitsPageUrl}`);
          unitsData = rerun;
          sourceUrl = rendered.finalUrl;
        }
      }

      // Last resort: the main page we already fetched sometimes lists
      // availability directly (condo towers with marketing-page pricing)
      if (unitsData.units.length === 0 && htmlToProcess !== mainResult.html) {
        const fromMain = await extractUnitsWithAI(mainResult.html, mainResult.finalUrl);
        if (fromMain.units.length > 0) {
          console.log(`Recovered ${fromMain.units.length} units from main page for ${websiteUrl}`);
          unitsData = fromMain;
          sourceUrl = mainResult.finalUrl;
        }
      }
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

    // Try to find dedicated amenities page
    const amenitiesPageUrl = await findAmenitiesPage(websiteUrl, mainResult.html);

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

// Try to find the photo gallery page from the main website
export async function findGalleryPage(websiteUrl: string, mainHtml: string): Promise<string | null> {
  const patterns = [
    /href=["']([^"']*(?:gallery|photos|photo-gallery|images|media|virtual-tour)[^"']*)["']/gi,
    /href=["']([^"']*(?:gallery|photos)[^"']*)["']/gi,
  ];

  for (const pattern of patterns) {
    const matches = mainHtml.matchAll(pattern);
    for (const match of matches) {
      const galleryPath = match[1];
      if (galleryPath.startsWith("#")) continue;

      try {
        const baseUrl = new URL(websiteUrl);
        const galleryUrl = new URL(galleryPath, baseUrl).href;

        if (/gallery|photos|photo-gallery|images|media|virtual/i.test(galleryUrl)) {
          return galleryUrl;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function scrapeImagesOnly(websiteUrl: string): Promise<{ success: boolean; data?: ImageScrapeResult; error?: string; raw_html_length?: number }> {
  try {
    // Fetch main page
    const mainResult = await fetchBuildingHTML(websiteUrl);
    if (!mainResult) {
      return { success: false, error: "Failed to fetch main page" };
    }

    // Look for gallery/photos page
    const galleryPageUrl = await findGalleryPage(websiteUrl, mainResult.html);

    // Also look for amenities page (often has pool/gym photos)
    const amenitiesPageUrl = await findAmenitiesPage(websiteUrl, mainResult.html);

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
    const unitsPageUrl = await findUnitsPage(websiteUrl, mainResult.html);
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

    // Find and fetch additional pages in parallel
    const [amenitiesPageUrl, unitsPageUrl] = await Promise.all([
      findAmenitiesPage(websiteUrl, mainResult.html),
      findUnitsPage(websiteUrl, mainResult.html),
    ]);

    // Fetch additional pages
    const additionalPages: string[] = [];

    if (amenitiesPageUrl) {
      const amenitiesResult = await fetchBuildingHTML(amenitiesPageUrl);
      if (amenitiesResult) {
        additionalPages.push(`<!-- AMENITIES PAGE: ${amenitiesResult.finalUrl} -->\n${amenitiesResult.html}`);
      }
    }

    if (unitsPageUrl) {
      const unitsResult = await fetchBuildingHTML(unitsPageUrl);
      if (unitsResult) {
        additionalPages.push(`<!-- UNITS PAGE: ${unitsResult.finalUrl} -->\n${unitsResult.html}`);
      }
    }

    // Combine all HTML
    const fullHtml = [mainResult.html, ...additionalPages].join("\n\n");

    // Extract all data with AI
    const data = await extractFullBuildingData(fullHtml, mainResult.finalUrl);

    return {
      success: true,
      data,
      raw_html_length: fullHtml.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
