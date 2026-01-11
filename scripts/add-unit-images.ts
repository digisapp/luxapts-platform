// Run with: npx tsx scripts/add-unit-images.ts
// Adds images to all units that don't have them

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
  console.log("Could not load .env.local, using existing env vars");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const UNIT_IMAGES = {
  living: [
    "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
    "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80",
    "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80",
    "https://images.unsplash.com/photo-1600607687644-c7171b42498f?w=800&q=80",
  ],
  bedroom: [
    "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&q=80",
    "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=800&q=80",
    "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=800&q=80",
    "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=800&q=80",
  ],
  kitchen: [
    "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
    "https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?w=800&q=80",
    "https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=800&q=80",
    "https://images.unsplash.com/photo-1556909212-d5b604d0c90d?w=800&q=80",
  ],
  bathroom: [
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80",
    "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800&q=80",
    "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800&q=80",
  ],
};

const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  console.log("Starting unit image population...\n");

  // Get total count
  const { count } = await supabase.from("units").select("*", { count: "exact", head: true });
  console.log(`Total units in database: ${count}`);

  // Fetch all units in pages of 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allUnits: Array<any> = [];

  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data: pageData, error } = await supabase
      .from("units")
      .select(`
        id,
        unit_number,
        beds,
        building_id,
        buildings:building_id (name)
      `)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Failed to fetch units:", error.message);
      process.exit(1);
    }

    if (!pageData || pageData.length === 0) break;

    allUnits.push(...pageData);
    console.log(`Fetched page ${page + 1}: ${pageData.length} units (total: ${allUnits.length})`);
    page++;
  }

  console.log(`\nProcessing ${allUnits.length} units...`);

  let imagesAdded = 0;
  let unitsProcessed = 0;

  // Process in batches
  const batchSize = 50;

  for (let i = 0; i < allUnits.length; i += batchSize) {
    const batch = allUnits.slice(i, i + batchSize);
    const imagesToInsert: {
      unit_id: string;
      url: string;
      alt_text: string;
      category: string;
      is_primary: boolean;
      sort_order: number;
    }[] = [];

    for (const unit of batch) {
      // Check if unit already has images
      const { data: existingImages } = await supabase
        .from("unit_images")
        .select("id")
        .eq("unit_id", unit.id)
        .limit(1);

      if (existingImages && existingImages.length > 0) {
        continue; // Skip units that already have images
      }

      const buildingName = (unit.buildings as { name: string } | null)?.name || "Apartment";

      // Add living room (primary)
      imagesToInsert.push({
        unit_id: unit.id,
        url: getRandom(UNIT_IMAGES.living),
        alt_text: `${buildingName} - Unit ${unit.unit_number} living room`,
        category: "living",
        is_primary: true,
        sort_order: 0,
      });

      // Add bedroom if not studio
      if (unit.beds && unit.beds > 0) {
        imagesToInsert.push({
          unit_id: unit.id,
          url: getRandom(UNIT_IMAGES.bedroom),
          alt_text: `${buildingName} - Unit ${unit.unit_number} bedroom`,
          category: "bedroom",
          is_primary: false,
          sort_order: 1,
        });
      }

      // Add kitchen (80% chance)
      if (Math.random() > 0.2) {
        imagesToInsert.push({
          unit_id: unit.id,
          url: getRandom(UNIT_IMAGES.kitchen),
          alt_text: `${buildingName} - Unit ${unit.unit_number} kitchen`,
          category: "kitchen",
          is_primary: false,
          sort_order: 2,
        });
      }

      // Add bathroom (60% chance)
      if (Math.random() > 0.4) {
        imagesToInsert.push({
          unit_id: unit.id,
          url: getRandom(UNIT_IMAGES.bathroom),
          alt_text: `${buildingName} - Unit ${unit.unit_number} bathroom`,
          category: "bathroom",
          is_primary: false,
          sort_order: 3,
        });
      }

      unitsProcessed++;
    }

    if (imagesToInsert.length > 0) {
      const { error } = await supabase.from("unit_images").insert(imagesToInsert);
      if (error) {
        console.error(`Error inserting batch: ${error.message}`);
      } else {
        imagesAdded += imagesToInsert.length;
        console.log(`Progress: ${i + batch.length}/${allUnits.length} units checked, ${imagesAdded} images added`);
      }
    } else {
      console.log(`Progress: ${i + batch.length}/${allUnits.length} units checked (batch had existing images)`);
    }
  }

  console.log(`\n=== Done! ===`);
  console.log(`Units processed: ${unitsProcessed}`);
  console.log(`Images added: ${imagesAdded}`);
}

main().catch(console.error);
