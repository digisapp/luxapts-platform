// Run with: npx tsx scripts/geocode-buildings-osm.ts
// Geocodes building addresses using OpenStreetMap Nominatim (free, no API key)

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

async function geocodeAddress(address: string, city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${address}, ${city}, ${state}, USA`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "LuxApts/1.0 (apartment rental platform)",
      },
    });

    if (!res.ok) {
      console.error(`Geocoding failed for ${address}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }
    return null;
  } catch (error) {
    console.error(`Geocoding error for ${address}:`, error);
    return null;
  }
}

async function main() {
  console.log("Geocoding building addresses using OpenStreetMap...\n");

  // Get all buildings with their city info
  const { data: buildings, error } = await supabase
    .from("buildings")
    .select(`
      id,
      name,
      address_1,
      zip,
      cities:city_id (name, state)
    `);

  if (error) {
    console.error("Error fetching buildings:", error.message);
    return;
  }

  console.log(`Found ${buildings?.length || 0} buildings to geocode\n`);

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  // Process one at a time with delay (Nominatim rate limit: 1 req/sec)
  for (let i = 0; i < (buildings?.length || 0); i++) {
    const building = buildings![i];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cityData = building.cities as any;
    const city = Array.isArray(cityData) ? cityData[0] : cityData;

    if (!city?.name || !building.address_1) {
      console.log(`  Skipping ${building.name}: missing address or city`);
      skipped++;
      continue;
    }

    const coords = await geocodeAddress(
      building.address_1,
      city.name,
      city.state || ""
    );

    if (coords) {
      const { error: updateError } = await supabase
        .from("buildings")
        .update({ lat: coords.lat, lng: coords.lng })
        .eq("id", building.id);

      if (updateError) {
        console.log(`  Error updating ${building.name}: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ ${building.name}: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
        updated++;
      }
    } else {
      console.log(`  ✗ ${building.name}: geocoding failed`);
      failed++;
    }

    // Progress update every 10 buildings
    if ((i + 1) % 10 === 0) {
      console.log(`\nProgress: ${i + 1}/${buildings!.length} processed\n`);
    }

    // Rate limit: 1 request per second for Nominatim
    await new Promise((resolve) => setTimeout(resolve, 1100));
  }

  console.log(`\n=== Done! ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch(console.error);
