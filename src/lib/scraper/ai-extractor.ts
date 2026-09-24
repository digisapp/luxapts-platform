// AI-powered data extraction from HTML
// Uses xAI (Grok) or falls back to OpenAI to extract structured data

import { createXAIClient } from "@/lib/xai/client";
import { ScrapedBuildingData, ScrapedUnit, ScrapedAmenity, ScrapedImage, ImageScrapeResult } from "./types";
import type { ImageCandidate } from "./image-candidates";

// A timed-out scrape used to keep burning the function's remaining window:
// the OpenAI-compatible client defaults to a 10-minute request timeout with
// retries, so withTimeout() returned but the call did not stop.
const XAI_REQUEST_OPTIONS = { timeout: 90_000, maxRetries: 1 } as const;

const unitsExtractionPrompt = () => `You are an expert at extracting apartment listing data from HTML.

Extract all available rental units from this apartment building's website HTML.

For each unit, extract:
- unit_number: The unit/apartment number if shown
- floor: The floor number if shown
- beds: Number of bedrooms (0 for studio)
- baths: Number of bathrooms
- sqft: Square footage
- rent: Monthly rent in dollars (number only, no $ or commas)
- available_on: Move-in date if shown (YYYY-MM-DD format)
- floorplan_name: Name of the floor plan if shown
- view: View type if mentioned (city, water, park, etc.)
- lease_term_months: The SHORTEST lease term in months offered for this unit, if lease terms are shown (e.g. a 3-15 month picker or "flexible terms from 6 months" → 6; a single "12-month lease" → 12). Omit if the page shows no lease term information — never guess.

Return a JSON object with this structure:
{
  "units": [
    {"unit_number": "1204", "beds": 2, "baths": 2, "sqft": 1100, "rent": 3500, "available_on": "${new Date().getFullYear()}-02-01", "lease_term_months": 12},
    ...
  ],
  "total_available": 15,
  "move_in_specials": ["2 months free on 13+ month lease", ...]
}

Many leasing sites list FLOORPLANS with starting prices (e.g. "A1 — 1 Bed / 1 Bath — from $3,224/mo — 2 available") instead of individual units. That data is valuable: return one entry per floorplan that is currently available or priced, with floorplan_name set, unit_number omitted, and rent = the starting price. Skip floorplans marked unavailable/sold out with no price.

If you cannot find units or priced floorplans, return {"units": [], "total_available": 0}.
Only return valid JSON, no explanations.`;

const AMENITIES_EXTRACTION_PROMPT = `You are an expert at extracting apartment amenities from HTML.

Extract all building amenities from this apartment building's website HTML.

Categorize amenities into these categories:
- fitness: Gym, yoga studio, fitness center, etc.
- outdoor: Pool, rooftop, garden, BBQ, etc.
- social: Lounge, game room, movie theater, coworking, etc.
- pet: Pet spa, dog park, dog run, etc.
- security: Doorman, concierge, 24/7 security, etc.
- convenience: Parking, EV charging, bike storage, package room, etc.
- wellness: Spa, sauna, steam room, cold plunge, hot tub, etc.
- tech: Smart home, high-speed internet, etc.
- comfort: In-unit laundry, balcony, floor-to-ceiling windows, etc.

Return a JSON object with this structure:
{
  "amenities": [
    {"name": "Rooftop Pool", "category": "outdoor", "description": "50th floor infinity pool with city views"},
    {"name": "Golf Simulator", "category": "social"},
    {"name": "Pet Spa", "category": "pet"},
    ...
  ],
  "pet_policy": "Pets welcome, $500 deposit, 2 pet max",
  "parking_policy": "$150/month for covered parking"
}

Extract as many amenities as you can find. Be thorough.
Only return valid JSON, no explanations.`;

// Page builders ship hundreds of KB of scripts/CSS before any listing data —
// naive head-truncation feeds the model nothing but boilerplate. Strip the
// bloat but KEEP script blocks that look like they carry pricing/unit JSON
// (Greystar, SightMap, and RentCafe embed listings that way).
export function condenseHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, (block) =>
      /\$\s?\d{3,}|"(?:rent|price|minPrice|min_rent|starting)/i.test(block) ? block : ""
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n");
}

const MODEL_HTML_BUDGET = 100_000;
const HEAD_CHARS = 6_000;
const WINDOW_RADIUS = 2_500;
const PRICING_SIGNAL = /\$\s?\d{1,2},?\d{3}(?!\d)|"(?:rent|price|minPrice|maxPrice|min_rent|max_rent)"\s*:/gi;

/**
 * Fit a condensed page into the model's budget without dropping the listings.
 *
 * Head-truncation was the default, and on large rendered pages it cut the
 * inventory off entirely: Greystar's Miro page condenses to 643k chars with
 * all 45 rents between 493k and 549k, so the model saw a 100k head with no
 * prices and reported zero units. Oversized pages now send the head (for the
 * building's name and context) plus windows around every pricing signal,
 * merged and in page order, until the budget is spent.
 */
export function focusOnPricing(text: string, budget = MODEL_HTML_BUDGET): string {
  if (text.length <= budget) return text;

  const spans: [number, number][] = [];
  for (const m of text.matchAll(PRICING_SIGNAL)) {
    const start = Math.max(HEAD_CHARS, m.index! - WINDOW_RADIUS);
    const end = Math.min(text.length, m.index! + WINDOW_RADIUS);
    const last = spans[spans.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  if (spans.length === 0) return text.slice(0, budget) + "\n... [truncated]";

  const parts = [text.slice(0, HEAD_CHARS)];
  let used = HEAD_CHARS;
  for (const [start, end] of spans) {
    const room = budget - used;
    if (room <= 0) break;
    const piece = text.slice(start, Math.min(end, start + room));
    parts.push(piece);
    used += piece.length;
  }
  return parts.join("\n... [skipped] ...\n");
}

export interface UnitsExtraction {
  units: ScrapedUnit[];
  total_available: number;
  move_in_specials: string[];
  /**
   * Set when the extraction itself failed — model outage, 429, unparseable
   * response, no API key. NOT the same as "the page lists no units", and the
   * difference decides whether the caller may retire a building's inventory.
   */
  error?: string;
}

export async function extractUnitsWithAI(
  html: string,
  sourceUrl: string
): Promise<UnitsExtraction> {
  // Condense, then keep the parts of the page that carry prices.
  const truncatedHtml = focusOnPricing(condenseHtml(html));

  const empty = { units: [] as ScrapedUnit[], total_available: 0, move_in_specials: [] as string[] };

  try {
    // Try xAI first
    if (process.env.XAI_API_KEY) {
      const client = createXAIClient();
      const response = await client.chat.completions.create(
        {
          model: "grok-4.3",
          messages: [
            { role: "system", content: unitsExtractionPrompt() },
            { role: "user", content: `URL: ${sourceUrl}\n\nHTML:\n${truncatedHtml}` },
          ],
          temperature: 0.1,
        },
        XAI_REQUEST_OPTIONS,
      );

      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { ...empty, error: "Model response contained no JSON object" };
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        units: parsed.units || [],
        total_available: parsed.total_available || parsed.units?.length || 0,
        move_in_specials: parsed.move_in_specials || [],
      };
    }

    console.warn("No AI service configured for unit extraction");
    return { ...empty, error: "No AI service configured (XAI_API_KEY missing)" };
  } catch (error) {
    console.error("AI unit extraction error:", error);
    return { ...empty, error: error instanceof Error ? error.message : "Unknown AI error" };
  }
}

export async function extractAmenitiesWithAI(
  html: string,
  sourceUrl: string
): Promise<{ amenities: ScrapedAmenity[]; pet_policy?: string; parking_policy?: string }> {
  // Condense first, then truncate
  const condensed = condenseHtml(html);
  const truncatedHtml = condensed.length > 100000 ? condensed.slice(0, 100000) + "\n... [truncated]" : condensed;

  try {
    // Try xAI first
    if (process.env.XAI_API_KEY) {
      const client = createXAIClient();
      const response = await client.chat.completions.create(
        {
          model: "grok-4.3",
          messages: [
            { role: "system", content: AMENITIES_EXTRACTION_PROMPT },
            { role: "user", content: `URL: ${sourceUrl}\n\nHTML:\n${truncatedHtml}` },
          ],
          temperature: 0.1,
        },
        XAI_REQUEST_OPTIONS,
      );

      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          amenities: parsed.amenities || [],
          pet_policy: parsed.pet_policy,
          parking_policy: parsed.parking_policy,
        };
      }
    }

    // Fallback: return empty if no AI available
    console.warn("No AI service configured for amenity extraction");
    return { amenities: [] };
  } catch (error) {
    console.error("AI amenity extraction error:", error);
    return { amenities: [] };
  }
}

const IMAGES_CLASSIFICATION_PROMPT = `You are selecting property photos for an apartment building listing.

You get a numbered list of image URLs found on the building's own website, each with its alt text when the page gave one. The URLs are real; judge each from its filename, path and alt text.

KEEP only photos of this property: building exterior, lobby, amenities, pool, gym, rooftop, common areas, apartment interiors, views.
DROP logos, icons, badges, maps, staff/people headshots, stock lifestyle shots of people, neighborhood/restaurant photos, awards, banners with text, floor plan diagrams, and anything that looks like a different property.

Categorize each kept image:
- building-level: "exterior", "lobby", "amenity", "pool", "gym", "rooftop", "common", "view", "other"
- apartment-level: "interior", "kitchen", "bathroom", "bedroom", "living"

Return JSON only:
{
  "building_images": [{"i": 3, "category": "exterior", "alt_text": "Tower facade at dusk", "is_hero": true}, ...],
  "unit_images": [{"i": 7, "category": "kitchen", "alt_text": "Kitchen with island"}, ...]
}

"i" is the number from the list. Mark exactly one building image as is_hero (the best exterior or signature shot). If nothing qualifies, return empty arrays.`;

type PickedImage = { i?: number; category?: string; alt_text?: string; is_hero?: boolean };

export async function extractImagesWithAI(
  candidates: ImageCandidate[],
  sourceUrl: string
): Promise<ImageScrapeResult> {
  const empty = { building_images: [], unit_images: [] };
  if (candidates.length === 0) return empty;

  if (!process.env.XAI_API_KEY) {
    console.warn("No AI service configured for image classification");
    return empty;
  }

  const list = candidates
    .map((c, i) => `${i}. ${c.url}${c.alt ? ` | alt: ${c.alt}` : ""}`)
    .join("\n");

  try {
    const client = createXAIClient();
    const response = await client.chat.completions.create(
      {
        model: "grok-4.3",
        messages: [
          { role: "system", content: IMAGES_CLASSIFICATION_PROMPT },
          { role: "user", content: `Website: ${sourceUrl}\n\nImages:\n${list}` },
        ],
        temperature: 0.1,
      },
      XAI_REQUEST_OPTIONS,
    );

    const content = response.choices[0].message.content || "{}";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return empty;
    const parsed = JSON.parse(jsonMatch[0]) as { building_images?: PickedImage[]; unit_images?: PickedImage[] };

    // The model picks by index, so it can only return URLs that were really on the page
    const pick = (items: PickedImage[] | undefined, allowHero: boolean): ScrapedImage[] =>
      (items ?? [])
        .filter((p) => Number.isInteger(p.i) && candidates[p.i!])
        .map((p) => ({
          url: candidates[p.i!].url,
          alt_text: p.alt_text || candidates[p.i!].alt,
          category: (p.category || "other") as ScrapedImage["category"],
          is_hero: allowHero && Boolean(p.is_hero),
          width: candidates[p.i!].width,
        }));

    return {
      building_images: deduplicateImages(pick(parsed.building_images, true)),
      unit_images: deduplicateImages(pick(parsed.unit_images, false)),
    };
  } catch (error) {
    console.error("AI image classification error:", error);
    return empty;
  }
}

const VISION_BATCH = 6;
const VISION_MAX = 12;

type VisionVerdict = {
  i?: number;
  photo?: boolean;
  added_text?: boolean;
  subject?: string;
  quality?: number;
};

const VISION_PROMPT = (n: number) => `You are checking listing photos for an apartment building. There are ${n} images, numbered from 0 in the order given.

For each image return:
- "photo": true only for a real photograph of a building or its spaces. False for textures, patterns, illustrations, maps, logos, floor plans, collages and solid-colour graphics.
- "added_text": true when marketing text or a logo is overlaid on the image (share cards, banners). Signage that is physically on the building does NOT count.
- "subject": "exterior", "lobby", "amenity", "pool", "gym", "rooftop", "common", "interior", "view" or "other".
- "quality": 1-5, how good a first impression this would make as the listing's main photo.

Return a JSON array only: [{"i":0,"photo":true,"added_text":false,"subject":"exterior","quality":4}, ...]`;

/**
 * Look at the photos. The classifier only sees URLs and alt text, so a
 * filename like "Gio_Header.jpg" (a purple palm texture) or an OG share card
 * with the building's name printed across it passed as the hero shot. Keep
 * real photographs without overlaid text, and make the best exterior the hero.
 * On a vision failure the images pass through unchanged.
 */
export async function verifyImagesWithVision(images: ScrapedImage[]): Promise<ScrapedImage[]> {
  if (images.length === 0 || !process.env.XAI_API_KEY) return images;
  const client = createXAIClient();
  const toCheck = images.slice(0, VISION_MAX);
  const verdicts = new Map<number, VisionVerdict>();

  for (let start = 0; start < toCheck.length; start += VISION_BATCH) {
    const batch = toCheck.slice(start, start + VISION_BATCH);
    try {
      const response = await client.chat.completions.create(
        {
          model: "grok-4.3",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: VISION_PROMPT(batch.length) },
                ...batch.map((img) => ({ type: "image_url" as const, image_url: { url: img.url } })),
              ],
            },
          ],
          temperature: 0,
        },
        XAI_REQUEST_OPTIONS,
      );
      const content = response.choices[0].message.content || "[]";
      const json = content.match(/\[[\s\S]*\]/);
      if (!json) continue;
      for (const v of JSON.parse(json[0]) as VisionVerdict[]) {
        if (Number.isInteger(v.i) && v.i! >= 0 && v.i! < batch.length) verdicts.set(start + v.i!, v);
      }
    } catch (error) {
      console.error("Vision check failed; keeping batch unverified:", error instanceof Error ? error.message : error);
    }
  }

  const kept: (ScrapedImage & { quality: number })[] = [];
  toCheck.forEach((img, i) => {
    const v = verdicts.get(i);
    if (!v) {
      kept.push({ ...img, is_hero: false, quality: 0 });
      return;
    }
    if (v.photo === false || v.added_text === true) return;
    const category = (v.subject && v.subject !== "other" ? v.subject : img.category) as ScrapedImage["category"];
    kept.push({ ...img, category, is_hero: false, quality: v.quality ?? 0 });
  });
  // Unchecked tail (beyond VISION_MAX) keeps its place after the checked ones
  const tail = images.slice(VISION_MAX).map((img) => ({ ...img, is_hero: false, quality: 0 }));

  // Hero: best verified exterior, else best verified photo of any kind
  const verified = kept.filter((k) => k.quality > 0);
  const byQuality = (a: { quality: number }, b: { quality: number }) => b.quality - a.quality;
  const hero =
    verified.filter((k) => k.category === "exterior").sort(byQuality)[0] ?? verified.sort(byQuality)[0];

  return [...kept, ...tail].map((img) => ({
    url: img.url,
    alt_text: img.alt_text,
    category: img.category,
    width: img.width,
    height: img.height,
    is_hero: hero !== undefined && img.url === hero.url,
  }));
}

/** Remove duplicate images by normalizing URLs */
function deduplicateImages(images: ScrapedImage[]): ScrapedImage[] {
  const seen = new Set<string>();
  return images.filter((img) => {
    // Normalize URL: strip query params for dedup comparison but keep original
    let key: string;
    try {
      const u = new URL(img.url);
      // Keep path as key, ignore size params
      key = u.origin + u.pathname;
    } catch {
      key = img.url;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function extractFullBuildingData(
  html: string,
  sourceUrl: string
): Promise<ScrapedBuildingData> {
  // Run both extractions in parallel
  const [unitsResult, amenitiesResult] = await Promise.all([
    extractUnitsWithAI(html, sourceUrl),
    extractAmenitiesWithAI(html, sourceUrl),
  ]);

  return {
    units: unitsResult.units,
    total_available: unitsResult.total_available,
    units_error: unitsResult.error,
    move_in_specials: unitsResult.move_in_specials,
    amenities: amenitiesResult.amenities,
    pet_policy: amenitiesResult.pet_policy,
    parking_policy: amenitiesResult.parking_policy,
    scraped_at: new Date().toISOString(),
    source_url: sourceUrl,
  };
}
