// Run with: npx tsx scripts/check-data.ts

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("=== Database Status Check ===\n");

  // Get all cities with building counts
  const { data: cities } = await supabase.from("cities").select("id, name, slug");

  console.log("Buildings by City:");
  let totalBuildings = 0;
  for (const city of cities || []) {
    const { count } = await supabase
      .from("buildings")
      .select("*", { count: "exact", head: true })
      .eq("city_id", city.id);
    if (count && count > 0) {
      console.log(`  ${city.name}: ${count}`);
      totalBuildings += count;
    }
  }
  console.log(`  TOTAL: ${totalBuildings}\n`);

  // Get all unit IDs with pagination
  const allUnitIds: string[] = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from("units")
      .select("id")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allUnitIds.push(...data.map((u) => u.id));
    page++;
  }
  console.log(`Total Units: ${allUnitIds.length}`);

  // Get all unit_ids that have images with pagination
  const unitIdsWithImages = new Set<string>();
  page = 0;
  while (true) {
    const { data } = await supabase
      .from("unit_images")
      .select("unit_id")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    data.forEach((img) => unitIdsWithImages.add(img.unit_id));
    page++;
  }
  console.log(`Units with Images: ${unitIdsWithImages.size}`);
  console.log(`Units WITHOUT Images: ${allUnitIds.length - unitIdsWithImages.size}`);

  // Count total unit images
  const { count: totalImages } = await supabase
    .from("unit_images")
    .select("*", { count: "exact", head: true });
  console.log(`Total Unit Images: ${totalImages}`);

  // Count building images
  const { count: buildingImages } = await supabase
    .from("building_images")
    .select("*", { count: "exact", head: true });
  console.log(`Total Building Images: ${buildingImages}\n`);

  // Find units without images
  const unitsWithoutImages = allUnitIds.filter((id) => !unitIdsWithImages.has(id));

  if (unitsWithoutImages.length > 0) {
    console.log(`\nSample of 20 units missing images:`);
    for (const unitId of unitsWithoutImages.slice(0, 20)) {
      const { data: unit } = await supabase
        .from("units")
        .select("unit_number, buildings(name, city_id, cities(name))")
        .eq("id", unitId)
        .single();

      if (unit) {
        const building = unit.buildings as { name: string; cities: { name: string } } | null;
        const cityName = building?.cities?.name || "Unknown City";
        const buildingName = building?.name || "Unknown Building";
        console.log(`  - ${cityName} > ${buildingName} > Unit ${unit.unit_number}`);
      }
    }
  }

  // Check for missing cities from CSV
  console.log("\n=== Missing from CSV ===");
  const csvCities = ["Miami", "New York", "Brooklyn", "Los Angeles", "Austin", "Dallas", "Nashville", "Atlanta", "Coral Gables", "Miami Beach"];

  for (const cityName of csvCities) {
    const { data: city } = await supabase
      .from("cities")
      .select("id")
      .eq("name", cityName)
      .single();

    if (!city) {
      console.log(`  Missing city: ${cityName}`);
    }
  }
}

main().catch(console.error);
