// Run with: npx tsx scripts/geocode-buildings.ts
// Geocodes building addresses using Mapbox API to get accurate coordinates

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

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
if (!MAPBOX_TOKEN) {
  console.error("NEXT_PUBLIC_MAPBOX_TOKEN is required");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function geocodeAddress(address: string, city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${address}, ${city}, ${state}`);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Geocoding failed for ${address}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error(`Geocoding error for ${address}:`, error);
    return null;
  }
}

async function main() {
  console.log("Geocoding building addresses...\n");

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

  // Process in batches to avoid rate limiting
  const batchSize = 10;
  const delayMs = 1000; // 1 second between batches

  for (let i = 0; i < (buildings?.length || 0); i += batchSize) {
    const batch = buildings!.slice(i, i + batchSize);

    const promises = batch.map(async (building) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cityData = building.cities as any;
      const city = Array.isArray(cityData) ? cityData[0] : cityData;

      if (!city?.name || !building.address_1) {
        console.log(`  Skipping ${building.name}: missing address or city`);
        return { status: "skipped" };
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
          return { status: "failed" };
        }

        console.log(`  ✓ ${building.name}: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
        return { status: "updated" };
      } else {
        console.log(`  ✗ ${building.name}: geocoding failed`);
        return { status: "failed" };
      }
    });

    const results = await Promise.all(promises);

    for (const r of results) {
      if (r.status === "updated") updated++;
      else if (r.status === "failed") failed++;
      else skipped++;
    }

    // Progress update
    console.log(`\nProgress: ${Math.min(i + batchSize, buildings!.length)}/${buildings!.length} processed`);

    // Delay between batches to avoid rate limiting
    if (i + batchSize < buildings!.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.log(`\n=== Done! ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);
}

main().catch(console.error);
