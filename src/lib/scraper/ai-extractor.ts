// AI-powered data extraction from HTML
// Uses xAI (Grok) or falls back to OpenAI to extract structured data

import { createXAIClient } from "@/lib/xai/client";
import { ScrapedBuildingData, ScrapedUnit, ScrapedAmenity } from "./types";

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

Return a JSON object with this structure:
{
  "units": [
    {"unit_number": "1204", "beds": 2, "baths": 2, "sqft": 1100, "rent": 3500, "available_on": "2024-02-01"},
    ...
  ],
  "total_available": 15,
  "move_in_specials": ["2 months free on 13+ month lease", ...]
}

If you cannot find units, return {"units": [], "total_available": 0}.
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
        model: "grok-3",
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
        model: "grok-3",
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
