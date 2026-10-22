// SightMap (sightmap.com) availability, read from its public JSON instead of
// the rendered widget.
//
// Many leasing sites show availability only inside a SightMap iframe. The
// scraper's HTML-to-AI path never saw those units: the iframe is a separate
// document, and some sites put it on a /sightmap page the link finder ignored.
// The embed page carries window.__APP_CONFIG__ with the API URL(s) of its
// maps; each returns every unit with price, size, move-in date and floor plan.
// No model, no browser.

import type { ScrapedUnit } from "./types";

const EMBED_RE = /sightmap\.com\/embed\/([a-z0-9]{6,20})/gi;
const API_RE = /https?:\/\/sightmap\.com\/app\/api\/v1\/[a-z0-9]{6,20}\/sightmaps\/\d+/gi;
const API_URL = /^https:\/\/sightmap\.com\/app\/api\/v1\/[a-z0-9]{6,20}\/sightmaps\/\d+$/i;
// A same-site page dedicated to the map: /sightmap/, /sightmap.php
const SIGHTMAP_PAGE_RE = /href=["']([^"']*sightmap[^"']*)["']/gi;

export interface SightMapRefs {
  embedIds: string[];
  apiUrls: string[];
}

/** Embed ids and direct API URLs referenced anywhere in a page. Pure. */
export function findSightMapRefs(html: string): SightMapRefs {
  const embedIds = new Set<string>();
  for (const m of html.matchAll(EMBED_RE)) embedIds.add(m[1].toLowerCase());
  const apiUrls = new Set<string>();
  for (const m of html.matchAll(API_RE)) apiUrls.add(m[0].replace(/^http:/, "https:"));
  return { embedIds: [...embedIds], apiUrls: [...apiUrls] };
}

/** A link on the building's own site to its SightMap page, if any. Pure. */
export function findSightMapPageLink(html: string, baseUrl: string): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  const host = base.hostname.replace(/^www\./, "");
  for (const m of html.matchAll(SIGHTMAP_PAGE_RE)) {
    try {
      const url = new URL(m[1], base);
      if (url.hostname.replace(/^www\./, "") !== host) continue;
      if (!/sightmap/i.test(url.pathname)) continue;
      return url.href;
    } catch {
      continue;
    }
  }
  return null;
}

/** API URLs from an embed page's window.__APP_CONFIG__. Pure. */
export function apiUrlsFromEmbed(embedHtml: string): string[] {
  const m = /window\.__APP_CONFIG__\s*=\s*(\{[\s\S]*?\})\s*\n/.exec(embedHtml);
  if (m) {
    try {
      const config = JSON.parse(m[1]) as { sightmaps?: { href?: string }[] };
      const hrefs = (config.sightmaps ?? []).map((s) => s.href).filter((h): h is string => !!h);
      const valid = hrefs.map((h) => h.replace(/^http:/, "https:")).filter((h) => API_URL.test(h));
      if (valid.length) return valid;
    } catch {
      // fall through to the plain scan
    }
  }
  return findSightMapRefs(embedHtml).apiUrls;
}

interface SightMapUnit {
  unit_number?: string | null;
  label?: string | null;
  floor_plan_id?: string | null;
  area?: number | null;
  price?: number | null;
  available_on?: string | null;
}

interface SightMapFloorPlan {
  id: string;
  name?: string | null;
  bedroom_count?: number | null;
  bathroom_count?: number | null;
}

interface SightMapData {
  show_pricing?: boolean;
  units?: SightMapUnit[];
  floor_plans?: SightMapFloorPlan[];
}

/**
 * The apartment number as the building's own site writes it. Multi-building
 * communities suffix it in SightMap ("1022 - Mueller", "S103 - Branch Park");
 * kept as-is it no longer matched the stored "1022", so every unit would be
 * retired and recreated.
 */
function unitNumber(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return value.replace(/\s+-\s+[A-Za-z][\w .'&-]*$/, "") || value;
}

/**
 * Priced units from one SightMap API response. Pure.
 *
 * Most maps list real apartments ("11F", "14A"). Some are stack maps: one
 * entry per plan per floor range, labelled with the plan code (The Landmark
 * LA: 263 entries, 12 labels, all on "3-30"). A label that repeats is a plan,
 * not an apartment, so those come back as one floorplan-level entry per plan
 * and price, with no unit number, the way floorplan sites are stored.
 */
export function unitsFromSightMap(data: SightMapData): ScrapedUnit[] {
  if (data.show_pricing === false) return [];
  const plans = new Map((data.floor_plans ?? []).map((p) => [String(p.id), p]));
  const labels = (data.units ?? []).map((u) => u.unit_number || u.label || "");
  const planLevel = new Set(labels).size < labels.length;
  const seenPlanPrice = new Set<string>();
  const units: ScrapedUnit[] = [];
  for (const u of data.units ?? []) {
    const rent = typeof u.price === "number" ? u.price : Number(u.price);
    if (!Number.isFinite(rent) || rent < 300) continue; // unpriced or placeholder
    const plan = u.floor_plan_id ? plans.get(String(u.floor_plan_id)) : undefined;
    if (plan?.bedroom_count == null) continue; // beds are required downstream
    if (planLevel) {
      const key = `${u.floor_plan_id}|${rent}`;
      if (seenPlanPrice.has(key)) continue;
      seenPlanPrice.add(key);
      units.push({
        beds: plan.bedroom_count,
        baths: plan.bathroom_count ?? 1,
        sqft: u.area && u.area > 0 ? u.area : undefined,
        rent,
        floorplan_name: plan.name || u.label || undefined,
      });
      continue;
    }
    units.push({
      unit_number: unitNumber(u.unit_number || u.label),
      beds: plan.bedroom_count,
      baths: plan.bathroom_count ?? 1,
      sqft: u.area && u.area > 0 ? u.area : undefined,
      rent,
      available_on: u.available_on && /^\d{4}-\d{2}-\d{2}$/.test(u.available_on) ? u.available_on : undefined,
      floorplan_name: plan.name ?? undefined,
    });
  }
  return units;
}

export interface SightMapPage {
  html: string;
  url: string;
}

/**
 * Units from every SightMap the building's pages reference, following one
 * same-site /sightmap link when the pages themselves carry no embed.
 * `fetchText` must apply the scraper's SSRF guard and rate limiting.
 * Returns null when the building does not use SightMap.
 */
export async function scrapeSightMap(
  pages: SightMapPage[],
  fetchText: (url: string) => Promise<string | null>,
  log: (line: string) => void = () => {}
): Promise<{ units: ScrapedUnit[]; sourceUrl: string } | null> {
  const embedIds = new Set<string>();
  const apiUrls = new Set<string>();
  const collect = (html: string) => {
    const refs = findSightMapRefs(html);
    refs.embedIds.forEach((id) => embedIds.add(id));
    refs.apiUrls.forEach((u) => apiUrls.add(u));
  };
  for (const p of pages) collect(p.html);

  // The map often lives on its own page (/sightmap/, sightmap.php)
  for (const p of pages) {
    const link = findSightMapPageLink(p.html, p.url);
    if (!link || pages.some((q) => q.url === link)) continue;
    const html = await fetchText(link);
    if (html) collect(html);
    break;
  }

  for (const id of embedIds) {
    const html = await fetchText(`https://sightmap.com/embed/${id}`);
    if (html) apiUrlsFromEmbed(html).forEach((u) => apiUrls.add(u));
  }
  if (apiUrls.size === 0) return embedIds.size ? { units: [], sourceUrl: `https://sightmap.com/embed/${[...embedIds][0]}` } : null;

  // Several maps can be referenced (an old one without prices beside the live
  // one): keep the units of every map that has prices, de-duplicated.
  const byKey = new Map<string, ScrapedUnit>();
  let sourceUrl = [...apiUrls][0];
  for (const url of apiUrls) {
    const body = await fetchText(url);
    if (!body) continue;
    let data: SightMapData;
    try {
      data = (JSON.parse(body) as { data?: SightMapData }).data ?? {};
    } catch {
      continue;
    }
    const units = unitsFromSightMap(data);
    log(`SightMap ${url}: ${units.length} priced unit(s)`);
    if (units.length && byKey.size === 0) sourceUrl = url;
    for (const u of units) byKey.set(`${u.unit_number ?? ""}|${u.floorplan_name ?? ""}|${u.rent}`, u);
  }
  return { units: [...byKey.values()], sourceUrl };
}
