// AI-powered data extraction from HTML
// Uses xAI (Grok) or falls back to OpenAI to extract structured data

import { createXAIClient } from "@/lib/xai/client";
import { ScrapedBuildingData, ScrapedUnit, ScrapedAmenity, ScrapedImage, ImageScrapeResult } from "./types";

const UNITS_EXTRACTION_PROMPT = `You are an expert at extracting apartment listing data from HTML.

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
    {"unit_number": "1204", "beds": 2, "baths": 2, "sqft": 1100, "rent": 3500, "available_on": "2024-02-01", "lease_term_months": 12},
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

export async function extractUnitsWithAI(
  html: string,
  sourceUrl: string
): Promise<{ units: ScrapedUnit[]; total_available: number; move_in_specials: string[] }> {
  // Truncate HTML if too long (keep first 100k chars for context)
  const truncatedHtml = html.length > 100000 ? html.slice(0, 100000) + "\n... [truncated]" : html;

  try {
    // Try xAI first
    if (process.env.XAI_API_KEY) {
      const client = createXAIClient();
      const response = await client.chat.completions.create({
        model: "grok-4.3",
        messages: [
          { role: "system", content: UNITS_EXTRACTION_PROMPT },
          { role: "user", content: `URL: ${sourceUrl}\n\nHTML:\n${truncatedHtml}` },
        ],
        temperature: 0.1,
      });

      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          units: parsed.units || [],
          total_available: parsed.total_available || parsed.units?.length || 0,
          move_in_specials: parsed.move_in_specials || [],
        };
      }
    }

    // Fallback: return empty if no AI available
    console.warn("No AI service configured for unit extraction");
    return { units: [], total_available: 0, move_in_specials: [] };
  } catch (error) {
    console.error("AI unit extraction error:", error);
    return { units: [], total_available: 0, move_in_specials: [] };
  }
}

export async function extractAmenitiesWithAI(
  html: string,
  sourceUrl: string
): Promise<{ amenities: ScrapedAmenity[]; pet_policy?: string; parking_policy?: string }> {
  // Truncate HTML if too long
  const truncatedHtml = html.length > 100000 ? html.slice(0, 100000) + "\n... [truncated]" : html;

  try {
    // Try xAI first
    if (process.env.XAI_API_KEY) {
      const client = createXAIClient();
      const response = await client.chat.completions.create({
        model: "grok-4.3",
        messages: [
          { role: "system", content: AMENITIES_EXTRACTION_PROMPT },
          { role: "user", content: `URL: ${sourceUrl}\n\nHTML:\n${truncatedHtml}` },
        ],
        temperature: 0.1,
      });

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

const IMAGES_EXTRACTION_PROMPT = `You are an expert at extracting property images from apartment building website HTML.

Your job is to find ALL high-quality property photos from this apartment building's website.

Look for images in:
- <img> tags (src, data-src, data-lazy-src attributes)
- <source> tags inside <picture> elements
- CSS background-image URLs in style attributes
- data-bg, data-background attributes
- srcset attributes (pick the largest resolution)
- JSON-LD structured data with image URLs
- Open Graph meta tags (og:image)
- Gallery/carousel data attributes
- Lightbox data attributes (data-full, data-large, data-zoom)

IMPORTANT FILTERING RULES:
- ONLY include property photos (building exterior, lobby, amenities, apartments, views)
- SKIP icons, logos, favicons, SVGs, map tiles, tracking pixels, social media icons
- SKIP images smaller than 200px in any dimension
- SKIP images from: google.com, facebook.com, instagram.com, twitter.com, maps.googleapis.com, googletagmanager.com, analytics
- PREFER the highest resolution version of each image
- If srcset is available, pick the largest size
- Convert relative URLs to absolute using the website URL as base
- Remove duplicate images (same image at different sizes)

Categorize each image:
- "exterior": Building exterior, facade, entrance
- "lobby": Lobby, entrance hall, reception
- "amenity": General amenity spaces
- "pool": Swimming pool, hot tub
- "gym": Fitness center, gym equipment
- "rooftop": Rooftop deck, terrace with views
- "common": Shared spaces, lounge, coworking, game room
- "interior": General apartment interior
- "kitchen": Kitchen
- "bathroom": Bathroom
- "bedroom": Bedroom
- "living": Living room
- "view": City/water/park views from the building
- "floorplan": Floor plan diagrams
- "other": Anything else that's a real property photo

Return a JSON object:
{
  "building_images": [
    {"url": "https://...", "alt_text": "Rooftop pool with city views", "category": "pool", "is_hero": true},
    {"url": "https://...", "alt_text": "Modern lobby", "category": "lobby", "is_hero": false},
    ...
  ],
  "unit_images": [
    {"url": "https://...", "alt_text": "Open kitchen with quartz counters", "category": "kitchen"},
    {"url": "https://...", "alt_text": "Master bedroom", "category": "bedroom"},
    ...
  ]
}

Put building-level photos (exterior, lobby, amenities, pool, gym, rooftop, common areas) in building_images.
Put apartment-level photos (interior, kitchen, bathroom, bedroom, living room) in unit_images.
Mark the best exterior or hero shot with is_hero: true.

Only return valid JSON, no explanations.`;

export async function extractImagesWithAI(
  html: string,
  sourceUrl: string
): Promise<ImageScrapeResult> {
  // Truncate HTML if too long - images are often in the first part of the page
  const truncatedHtml = html.length > 120000 ? html.slice(0, 120000) + "\n... [truncated]" : html;

  try {
    if (process.env.XAI_API_KEY) {
      const client = createXAIClient();
      const response = await client.chat.completions.create({
        model: "grok-4.3",
        messages: [
          { role: "system", content: IMAGES_EXTRACTION_PROMPT },
          { role: "user", content: `Website URL: ${sourceUrl}\n\nHTML:\n${truncatedHtml}` },
        ],
        temperature: 0.1,
      });

      const content = response.choices[0].message.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const buildingImages: ScrapedImage[] = (parsed.building_images || []).map((img: ScrapedImage) => ({
          url: resolveUrl(img.url, sourceUrl),
          alt_text: img.alt_text,
          category: img.category || "other",
          is_hero: img.is_hero || false,
          width: img.width,
          height: img.height,
        }));
        const unitImages: ScrapedImage[] = (parsed.unit_images || []).map((img: ScrapedImage) => ({
          url: resolveUrl(img.url, sourceUrl),
          alt_text: img.alt_text,
          category: img.category || "other",
          is_hero: false,
          width: img.width,
          height: img.height,
        }));

        return {
          building_images: deduplicateImages(buildingImages),
          unit_images: deduplicateImages(unitImages),
        };
      }
    }

    console.warn("No AI service configured for image extraction");
    return { building_images: [], unit_images: [] };
  } catch (error) {
    console.error("AI image extraction error:", error);
    return { building_images: [], unit_images: [] };
  }
}

/** Resolve potentially relative URLs against a base */
function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
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
    move_in_specials: unitsResult.move_in_specials,
    amenities: amenitiesResult.amenities,
    pet_policy: amenitiesResult.pet_policy,
    parking_policy: amenitiesResult.parking_policy,
    scraped_at: new Date().toISOString(),
    source_url: sourceUrl,
  };
}
