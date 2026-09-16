// Headless rendering for JavaScript-heavy leasing sites (Entrata, RealPage,
// Yardi/RentCafe, Funnel). The plain fetcher gets an empty shell from these;
// this module renders the page in a real browser and returns the hydrated HTML.
//
// Provider chain:
//   1. Browserless-compatible HTTP API (BROWSERLESS_URL [+ BROWSERLESS_API_KEY])
//      — plain HTTP, safe on Vercel/serverless.
//   2. Local Playwright (dev only, devDependency) — lets you scrape JS sites
//      from your machine without any external service.
// If neither is available, callers fall back to the un-rendered HTML.

import { isSafeUrl } from "./fetcher";

const RENDER_TIMEOUT_MS = 30000;
/** Extra time, after network idle, spent coaxing listings onto the page. */
const SETTLE_BUDGET_MS = 12000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// Platforms that never ship content in the initial HTML
const SPA_PLATFORM_MARKERS = [
  "entrata.com",
  "realpage.com",
  "rentcafe.com",
  "securecafe.com",
  "funnelleasing.com",
  "knockrentals.com",
  "appfolio.com",
  "sightmap.com",
];

/**
 * Heuristic: does this HTML look like an empty SPA shell that needs a browser?
 * Cheap by design — runs on every scrape.
 */
export function needsJsRendering(html: string): boolean {
  if (!html) return true;

  // Strip scripts/styles/tags to estimate the visible text payload
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // A real leasing page has hundreds of chars of copy; an SPA shell has ~nothing
  if (visibleText.length < 500) return true;

  // Known JS-only leasing platforms embedded in the page
  const lower = html.toLowerCase();
  if (SPA_PLATFORM_MARKERS.some((m) => lower.includes(m)) && visibleText.length < 2000) {
    return true;
  }

  return false;
}

export interface RenderResult {
  html: string;
  finalUrl: string;
  renderer: "browserless" | "playwright";
}

/** Render via a Browserless-compatible /content endpoint (production path). */
async function renderViaBrowserless(url: string): Promise<RenderResult | null> {
  const base = process.env.BROWSERLESS_URL;
  if (!base) return null;

  const params = new URLSearchParams();
  const token = process.env.BROWSERLESS_API_KEY;
  if (token) params.set("token", token);
  // Residential proxy defeats datacenter-IP bot walls (AMLI, RentCafe, WP Engine
  // sites). Costs extra units — enable per Browserless plan via env:
  //   BROWSERLESS_PROXY=residential  (optionally BROWSERLESS_PROXY_COUNTRY=us)
  const proxy = process.env.BROWSERLESS_PROXY;
  if (proxy) {
    params.set("proxy", proxy);
    params.set("proxyCountry", process.env.BROWSERLESS_PROXY_COUNTRY || "us");
  }
  params.set("timeout", String(RENDER_TIMEOUT_MS));
  const endpoint = `${base.replace(/\/$/, "")}/content?${params.toString()}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: "networkidle2", timeout: RENDER_TIMEOUT_MS },
        rejectResourceTypes: ["image", "media", "font"],
      }),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS + 5000),
    });

    if (!response.ok) {
      console.error(`Browserless render failed for ${url}: ${response.status}`);
      return null;
    }

    const html = await response.text();
    if (!html || html.length > MAX_RESPONSE_BYTES) return null;

    return { html, finalUrl: url, renderer: "browserless" };
  } catch (error) {
    console.error(`Browserless render error for ${url}:`, error);
    return null;
  }
}

/**
 * Does this HTML actually carry apartment inventory? A price near a bed/bath/
 * sqft mention, in either order. Used to decide when a page has finished
 * loading the thing we came for.
 */
const UNIT_SIGNAL =
  /\$\s?[\d,]{3,}[\s\S]{0,400}?\b(?:bed|bath|studio|sq\.?\s?ft)\b|\b(?:bed|bath|studio)\b[\s\S]{0,400}?\$\s?[\d,]{3,}/i;

/** True when the markup carries apartment inventory rather than just chrome. */
export function looksLikeUnitContent(html: string): boolean {
  return UNIT_SIGNAL.test(html);
}

/** How many unit-ish signals a snapshot carries — more is a better snapshot. */
export function unitSignalCount(html: string): number {
  return (html.match(/\$\s?[\d,]{3,}/g) ?? []).length;
}

/**
 * `networkidle` is not the same as "the listings arrived".
 *
 * Availability widgets on these sites fetch their inventory after the network
 * has already gone quiet, and several only render it once scrolled into view.
 * Atlas New York was the case that exposed this: identical renders returned 23
 * prices one run and 9 the next, so the same building extracted seven units or
 * zero depending on timing. Scroll the page and keep sampling until the markup
 * actually contains units, then hand back the richest snapshot seen.
 */
async function settleForUnitContent(
  page: import("playwright").Page,
  budgetMs: number,
): Promise<string> {
  let best = await page.content();
  let bestScore = unitSignalCount(best);
  if (looksLikeUnitContent(best) && bestScore >= 3) return best;

  const deadline = Date.now() + budgetMs;
  let rounds = 0;
  while (Date.now() < deadline) {
    await page
      .evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.9)))
      .catch(() => {});
    await page.waitForTimeout(900);
    rounds++;

    const html = await page.content().catch(() => "");
    if (!html) break;
    const score = unitSignalCount(html);
    if (score > bestScore) {
      best = html;
      bestScore = score;
    }
    // Enough inventory on the page to be worth extracting — stop paying for time.
    if (looksLikeUnitContent(html) && score >= 3) return html;

    // Most of the fleet's stubborn sites (Greystar's property pages, marketing
    // one-pagers) publish no pricing at all. Once a few scrolls have produced
    // not one price, more scrolling will not conjure one — and paying the full
    // budget on every such page is what makes a fleet-wide refresh crawl.
    if (rounds >= 3 && bestScore === 0) break;
  }
  return best;
}

/**
 * Leasing sites routinely embed availability from a separate host — The
 * Nathaniel's units live in an `availability.rosenyc.com` iframe while its own
 * page is an 18KB shell. `page.content()` returns the main document only, so
 * that inventory was invisible to the extractor. Append any frame that carries
 * units, clearly delimited, so the extractor sees one document.
 */
async function appendFrameContent(
  page: import("playwright").Page,
  html: string,
): Promise<string> {
  const extras: string[] = [];
  let budget = MAX_RESPONSE_BYTES - html.length;

  for (const frame of page.frames()) {
    if (frame === page.mainFrame() || budget <= 0) continue;
    const frameUrl = frame.url();
    if (!frameUrl || frameUrl === "about:blank" || !isSafeUrl(frameUrl)) continue;
    try {
      const content = await frame.content();
      if (!content || !looksLikeUnitContent(content)) continue;
      if (content.length > budget) continue;
      budget -= content.length;
      extras.push(`\n<!-- embedded availability frame: ${frameUrl} -->\n${content}`);
    } catch {
      // Cross-origin frames we cannot read; nothing to recover.
    }
  }

  return extras.length ? html + extras.join("") : html;
}

/** Render via local Playwright (dev path; playwright is a devDependency). */
async function renderViaPlaywright(url: string): Promise<RenderResult | null> {
  let chromium;
  try {
    // Marked external in next.config so this resolves at runtime only where
    // the devDependency is installed; in production it throws and we skip.
    ({ chromium } = await import("playwright"));
  } catch {
    return null;
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    // Skip heavy assets — we only want the DOM
    await page.route("**/*", (route) => {
      const type = route.request().resourceType();
      if (type === "image" || type === "media" || type === "font") {
        return route.abort();
      }
      return route.continue();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: RENDER_TIMEOUT_MS });
    // Let the SPA hydrate and fire its data fetches
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {}); // busy pages never go idle — take what we have

    const finalUrl = page.url();
    if (!isSafeUrl(finalUrl)) {
      console.error(`Blocked unsafe redirect during render: ${finalUrl}`);
      return null;
    }

    // Network-idle only means the page stopped talking; the listings often
    // arrive after that, or on scroll. Keep looking for them.
    let html = await settleForUnitContent(page, SETTLE_BUDGET_MS);
    html = await appendFrameContent(page, html);
    if (!html || html.length > MAX_RESPONSE_BYTES) return null;

    return { html, finalUrl, renderer: "playwright" };
  } catch (error) {
    console.error(`Playwright render error for ${url}:`, error);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * Render a page in a headless browser. Returns null when no renderer is
 * configured/available — callers keep the plain-fetch HTML in that case.
 */
export async function renderPage(url: string): Promise<RenderResult | null> {
  if (!isSafeUrl(url)) return null;

  const viaService = await renderViaBrowserless(url);
  if (viaService) return viaService;

  return renderViaPlaywright(url);
}
