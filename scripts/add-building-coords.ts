// Run with: npx tsx scripts/add-building-coords.ts
// Adds lat/lng coordinates to buildings based on city and neighborhood

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

// Load .env.local
try {
  const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
  for (const line of envFile.split("\n")) {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  }
} catch {
  console.log("Could not load .env.local");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// City center coordinates
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "miami": { lat: 25.7617, lng: -80.1918 },
  "new-york": { lat: 40.7128, lng: -74.0060 },
  "los-angeles": { lat: 34.0522, lng: -118.2437 },
  "austin": { lat: 30.2672, lng: -97.7431 },
  "dallas": { lat: 32.7767, lng: -96.7970 },
  "nashville": { lat: 36.1627, lng: -86.7816 },
  "atlanta": { lat: 33.7490, lng: -84.3880 },
  "brooklyn": { lat: 40.6782, lng: -73.9442 },
  "chicago": { lat: 41.8781, lng: -87.6298 },
  "san-francisco": { lat: 37.7749, lng: -122.4194 },
};

// Neighborhood offsets from city center (approximate)
const NEIGHBORHOOD_OFFSETS: Record<string, { lat: number; lng: number }> = {
  // Miami
  "brickell": { lat: -0.02, lng: 0.01 },
  "downtown-miami": { lat: 0.01, lng: 0.005 },
  "wynwood": { lat: 0.02, lng: 0.01 },
  "edgewater": { lat: 0.03, lng: 0.015 },
  "midtown": { lat: 0.025, lng: 0.01 },
  "coral-gables": { lat: -0.04, lng: -0.03 },
  "miami-beach": { lat: 0.02, lng: 0.06 },
  "coconut-grove": { lat: -0.035, lng: 0.02 },

  // NYC
  "tribeca": { lat: -0.01, lng: -0.005 },
  "soho": { lat: -0.005, lng: 0.002 },
  "chelsea": { lat: 0.01, lng: -0.01 },
  "midtown-manhattan": { lat: 0.03, lng: -0.005 },
  "upper-west-side": { lat: 0.05, lng: -0.01 },
  "upper-east-side": { lat: 0.05, lng: 0.01 },
  "east-village": { lat: -0.002, lng: 0.01 },
  "west-village": { lat: -0.005, lng: -0.01 },
  "financial-district": { lat: -0.015, lng: -0.002 },
  "lower-east-side": { lat: -0.008, lng: 0.008 },
  "fidi": { lat: -0.015, lng: -0.002 },
  "flatiron": { lat: 0.012, lng: 0.002 },
  "gramercy": { lat: 0.015, lng: 0.005 },
  "kips-bay": { lat: 0.02, lng: 0.008 },
  "murray-hill": { lat: 0.022, lng: 0.005 },
  "nomad": { lat: 0.018, lng: 0.003 },
  "hell's-kitchen": { lat: 0.025, lng: -0.015 },
  "hudson-yards": { lat: 0.022, lng: -0.02 },

  // Brooklyn
  "williamsburg": { lat: 0.015, lng: 0.02 },
  "dumbo": { lat: -0.01, lng: -0.02 },
  "downtown-brooklyn": { lat: -0.005, lng: -0.01 },
  "brooklyn-heights": { lat: -0.008, lng: -0.015 },
  "fort-greene": { lat: 0.002, lng: -0.005 },
  "boerum-hill": { lat: -0.005, lng: 0.005 },
  "prospect-heights": { lat: 0.01, lng: 0.02 },
  "clinton-hill": { lat: 0.008, lng: 0.01 },

  // LA
  "downtown-la": { lat: 0.0, lng: 0.0 },
  "hollywood": { lat: 0.04, lng: -0.03 },
  "west-hollywood": { lat: 0.035, lng: -0.05 },
  "santa-monica": { lat: 0.02, lng: -0.12 },
  "beverly-hills": { lat: 0.03, lng: -0.06 },
  "koreatown": { lat: 0.02, lng: -0.01 },
  "arts-district": { lat: -0.005, lng: 0.02 },
  "silver-lake": { lat: 0.025, lng: 0.03 },
  "los-feliz": { lat: 0.04, lng: 0.02 },
  "echo-park": { lat: 0.02, lng: 0.02 },
  "culver-city": { lat: -0.01, lng: -0.08 },
  "marina-del-rey": { lat: -0.02, lng: -0.11 },
  "venice": { lat: -0.01, lng: -0.12 },
  "playa-vista": { lat: -0.03, lng: -0.10 },

  // Austin
  "downtown-austin": { lat: 0.0, lng: 0.0 },
  "east-austin": { lat: 0.01, lng: 0.03 },
  "south-congress": { lat: -0.02, lng: 0.01 },
  "rainey-street": { lat: -0.005, lng: 0.01 },
  "mueller": { lat: 0.03, lng: 0.04 },
  "domain": { lat: 0.08, lng: -0.02 },
  "zilker": { lat: -0.02, lng: -0.02 },
  "clarksville": { lat: 0.01, lng: -0.02 },
  "west-campus": { lat: 0.015, lng: -0.01 },
  "east-riverside": { lat: -0.03, lng: 0.02 },

  // Dallas
  "uptown": { lat: 0.02, lng: -0.01 },
  "downtown-dallas": { lat: 0.0, lng: 0.0 },
  "deep-ellum": { lat: -0.005, lng: 0.02 },
  "oak-lawn": { lat: 0.03, lng: -0.02 },
  "victory-park": { lat: 0.015, lng: -0.005 },
  "design-district": { lat: 0.025, lng: -0.015 },
  "bishop-arts": { lat: -0.02, lng: -0.02 },
  "lower-greenville": { lat: 0.025, lng: 0.02 },
  "knox-henderson": { lat: 0.03, lng: 0.01 },
  "lakewood": { lat: 0.02, lng: 0.04 },

  // Nashville
  "the-gulch": { lat: -0.005, lng: -0.01 },
  "downtown-nashville": { lat: 0.0, lng: 0.0 },
  "east-nashville": { lat: 0.015, lng: 0.025 },
  "germantown": { lat: 0.02, lng: 0.005 },
  "12-south": { lat: -0.025, lng: -0.015 },
  "midtown-nashville": { lat: 0.01, lng: -0.015 },
  "music-row": { lat: 0.005, lng: -0.02 },
  "sobro": { lat: -0.01, lng: 0.01 },
  "west-end": { lat: 0.01, lng: -0.03 },

  // Atlanta
  "midtown-atlanta": { lat: 0.02, lng: 0.0 },
  "downtown-atlanta": { lat: 0.0, lng: 0.0 },
  "buckhead": { lat: 0.06, lng: 0.01 },
  "old-fourth-ward": { lat: 0.015, lng: 0.02 },
  "west-midtown": { lat: 0.025, lng: -0.02 },
  "inman-park": { lat: 0.01, lng: 0.03 },
  "virginia-highland": { lat: 0.03, lng: 0.025 },
  "atlantic-station": { lat: 0.04, lng: -0.015 },
  "beltline": { lat: 0.02, lng: 0.015 },
  "poncey-highland": { lat: 0.02, lng: 0.028 },
};

// Add some randomness to coordinates
function addJitter(coord: number, maxJitter: number = 0.003): number {
  return coord + (Math.random() - 0.5) * 2 * maxJitter;
}

async function main() {
  console.log("Adding coordinates to buildings...\n");

  // Get all buildings without coordinates
  const { data: buildings, error } = await supabase
    .from("buildings")
    .select(`
      id,
      name,
      lat,
      lng,
      cities:city_id (slug),
      neighborhoods:neighborhood_id (slug)
    `)
    .or("lat.is.null,lng.is.null");

  if (error) {
    console.error("Error fetching buildings:", error.message);
    return;
  }

  console.log(`Found ${buildings?.length || 0} buildings without coordinates\n`);

  let updated = 0;
  let failed = 0;

  for (const building of buildings || []) {
    const citySlug = (building.cities as { slug: string } | null)?.slug;
    const neighborhoodSlug = (building.neighborhoods as { slug: string } | null)?.slug;

    if (!citySlug) {
      console.log(`  Skipping ${building.name}: no city`);
      failed++;
      continue;
    }

    const cityCoords = CITY_COORDS[citySlug];
    if (!cityCoords) {
      console.log(`  Skipping ${building.name}: unknown city ${citySlug}`);
      failed++;
      continue;
    }

    // Get neighborhood offset or use random offset
    const neighborhoodOffset = neighborhoodSlug
      ? NEIGHBORHOOD_OFFSETS[neighborhoodSlug] || { lat: (Math.random() - 0.5) * 0.04, lng: (Math.random() - 0.5) * 0.04 }
      : { lat: (Math.random() - 0.5) * 0.04, lng: (Math.random() - 0.5) * 0.04 };

    const lat = addJitter(cityCoords.lat + neighborhoodOffset.lat);
    const lng = addJitter(cityCoords.lng + neighborhoodOffset.lng);

    const { error: updateError } = await supabase
      .from("buildings")
      .update({ lat, lng })
      .eq("id", building.id);

    if (updateError) {
      console.log(`  Error updating ${building.name}: ${updateError.message}`);
      failed++;
    } else {
      console.log(`  Updated ${building.name} (${neighborhoodSlug || citySlug}): ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      updated++;
    }
  }

  console.log(`\n=== Done! ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
