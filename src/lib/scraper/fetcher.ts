// HTML fetcher for building websites
// Handles different website types and anti-bot measures

import { ScrapeResult } from "./types";
import { extractUnitsWithAI, extractAmenitiesWithAI, extractFullBuildingData } from "./ai-extractor";

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

async function rateLimitedFetch(url: string): Promise<Response> {
  const domain = new URL(url).hostname;
  const lastRequest = domainLastRequest.get(domain) || 0;
  const timeSinceLastRequest = Date.now() - lastRequest;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  domainLastRequest.set(domain, Date.now());

  return fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
  });
}

export async function fetchBuildingHTML(websiteUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const response = await rateLimitedFetch(websiteUrl);

    if (!response.ok) {
      console.error(`Failed to fetch ${websiteUrl}: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    return {
      html,
      finalUrl: response.url, // In case of redirects
    };
  } catch (error) {
    console.error(`Error fetching ${websiteUrl}:`, error);
    return null;
  }
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
      let amenitiesPath = match[1];

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
      let unitsPath = match[1];

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
    const unitsData = await extractUnitsWithAI(htmlToProcess, sourceUrl);

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
