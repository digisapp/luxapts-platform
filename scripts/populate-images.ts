// Run with: npx tsx scripts/populate-images.ts

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

const BUILDING_IMAGES = [
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80",
  "https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&q=80",
  "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=800&q=80",
  "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
  "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=800&q=80",
  "https://images.unsplash.com/photo-1613545325278-f24b0cae1224?w=800&q=80",
];

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
  ],
};

const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

async function main() {
  console.log("Starting image population...");

  // Get buildings
  const { data: buildings } = await supabase
    .from("buildings")
    .select("id, name")
    .eq("status", "active");

  console.log(`Found ${buildings?.length || 0} buildings`);

  // Add building images
  let buildingImagesAdded = 0;
  for (const building of buildings || []) {
    const { data: existing } = await supabase
      .from("building_images")
      .select("id")
      .eq("building_id", building.id)
      .limit(1);

    if (existing && existing.length > 0) continue;

    await supabase.from("building_images").insert({
      building_id: building.id,
      url: getRandom(BUILDING_IMAGES),
      alt_text: `${building.name} exterior`,
      category: "exterior",
      is_primary: true,
      sort_order: 0,
    });
    buildingImagesAdded++;
  }
  console.log(`Added ${buildingImagesAdded} building images`);

  // Get units (limit to 500)
  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, beds")
    .eq("is_available", true)
    .limit(500);

  console.log(`Found ${units?.length || 0} units`);

  // Add unit images in batches
  let unitImagesAdded = 0;
  const batchSize = 50;

  for (let i = 0; i < (units?.length || 0); i += batchSize) {
    const batch = units!.slice(i, i + batchSize);
    const imagesToInsert: {
      unit_id: string;
      url: string;
      alt_text: string;
      category: string;
      is_primary: boolean;
      sort_order: number;
    }[] = [];

    for (const unit of batch) {
      // Check if already has images
      const { data: existing } = await supabase
        .from("unit_images")
        .select("id")
        .eq("unit_id", unit.id)
        .limit(1);

      if (existing && existing.length > 0) continue;

      // Add living room (primary)
      imagesToInsert.push({
        unit_id: unit.id,
        url: getRandom(UNIT_IMAGES.living),
        alt_text: `Unit ${unit.unit_number} living room`,
        category: "living",
        is_primary: true,
        sort_order: 0,
      });

      // Add bedroom if not studio
      if (unit.beds && unit.beds > 0) {
        imagesToInsert.push({
          unit_id: unit.id,
          url: getRandom(UNIT_IMAGES.bedroom),
          alt_text: `Unit ${unit.unit_number} bedroom`,
          category: "bedroom",
          is_primary: false,
          sort_order: 1,
        });
      }

      // Add kitchen (70% chance)
      if (Math.random() > 0.3) {
        imagesToInsert.push({
          unit_id: unit.id,
          url: getRandom(UNIT_IMAGES.kitchen),
          alt_text: `Unit ${unit.unit_number} kitchen`,
          category: "kitchen",
          is_primary: false,
          sort_order: 2,
        });
      }
    }

    if (imagesToInsert.length > 0) {
      const { error } = await supabase.from("unit_images").insert(imagesToInsert);
      if (error) {
        console.error("Error inserting batch:", error.message);
      } else {
        unitImagesAdded += imagesToInsert.length;
        console.log(`Progress: ${i + batch.length}/${units?.length} units, ${unitImagesAdded} images added`);
      }
    }
  }

  console.log(`\nDone! Added ${buildingImagesAdded} building images and ${unitImagesAdded} unit images`);
}

main().catch(console.error);
