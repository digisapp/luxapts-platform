// Run with: npx tsx scripts/add-miami-suburbs.ts
// Adds Coral Gables and Miami Beach buildings to Miami

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

const BUILDINGS = [
  {
    name: "The Henry",
    address: "4131 Laguna St",
    neighborhood: "Coral Gables",
    phone: "786-882-4667",
    website: "https://thehenrycoralgables.com/",
  },
  {
    name: "Bella Isla",
    address: "31 Venetian Way",
    neighborhood: "Miami Beach",
    phone: "305-531-7134",
    website: "https://www.bellaisla.com/",
  },
  {
    name: "Berkshire Coral Gables",
    address: "301 Altara Ave",
    neighborhood: "Coral Gables",
    phone: "786-735-2180",
    website: "https://berkshirecoralgables.com/",
  },
  {
    name: "800 Capri",
    address: "800 Capri St",
    neighborhood: "Coral Gables",
    phone: "305-456-5800",
    website: "https://800capri.com/",
  },
  {
    name: "The Residences at THesis",
    address: "1350 S Dixie Hwy",
    neighborhood: "Coral Gables",
    phone: "305-779-6000",
    website: "https://thesisresidencesmiami.com/",
  },
  {
    name: "Gables Columbus Center",
    address: "2820 SW 37th Ave",
    neighborhood: "Coral Gables",
    phone: "786-220-4300",
    website: "https://www.gables.com/",
    management_company: "Gables Residential",
  },
];

const FLOOR_PLANS = [
  { name: "Studio", beds: 0, baths: 1, sqft: 500, rent: 2200 },
  { name: "A1 - One Bedroom", beds: 1, baths: 1, sqft: 750, rent: 2800 },
  { name: "A2 - Large One Bedroom", beds: 1, baths: 1, sqft: 900, rent: 3200 },
  { name: "B1 - Two Bedroom", beds: 2, baths: 2, sqft: 1100, rent: 3800 },
  { name: "B2 - Large Two Bedroom", beds: 2, baths: 2, sqft: 1300, rent: 4400 },
  { name: "C1 - Three Bedroom", beds: 3, baths: 2, sqft: 1500, rent: 5200 },
];

const AMENITIES = [
  "Rooftop Pool",
  "Fitness Center",
  "Concierge Service",
  "Valet Parking",
  "Business Center",
  "Resident Lounge",
  "Package Lockers",
  "EV Charging Stations",
  "Stainless Steel Appliances",
  "Quartz Countertops",
  "Hardwood Floors",
  "In-Unit Washer/Dryer",
];

const UNIT_IMAGES = [
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80",
  "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=800&q=80",
  "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800&q=80",
];

const BUILDING_IMAGES = [
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80",
  "https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&q=80",
];

const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
  console.log("Adding Coral Gables and Miami Beach buildings to Miami...\n");

  // Get Miami city
  const { data: miamiCity } = await supabase
    .from("cities")
    .select("id")
    .eq("slug", "miami")
    .single();

  if (!miamiCity) {
    console.error("Miami city not found!");
    return;
  }

  console.log("Found Miami city:", miamiCity.id);

  const neighborhoodCache: Record<string, string> = {};
  let buildingsCreated = 0;
  let unitsCreated = 0;

  for (const building of BUILDINGS) {
    console.log(`\nProcessing: ${building.name}`);

    // Get or create neighborhood
    let neighborhoodId = neighborhoodCache[building.neighborhood];
    if (!neighborhoodId) {
      const slug = building.neighborhood.toLowerCase().replace(/\s+/g, "-");

      let { data: hood } = await supabase
        .from("neighborhoods")
        .select("id")
        .eq("city_id", miamiCity.id)
        .eq("slug", slug)
        .single();

      if (!hood) {
        const { data: newHood } = await supabase
          .from("neighborhoods")
          .insert({
            city_id: miamiCity.id,
            name: building.neighborhood,
            slug,
          })
          .select("id")
          .single();
        hood = newHood;
        console.log(`  Created neighborhood: ${building.neighborhood}`);
      }

      neighborhoodId = hood!.id;
      neighborhoodCache[building.neighborhood] = neighborhoodId;
    }

    // Check if building exists
    const { data: existingBuilding } = await supabase
      .from("buildings")
      .select("id")
      .eq("name", building.name)
      .eq("city_id", miamiCity.id)
      .single();

    if (existingBuilding) {
      console.log("  Building already exists, skipping");
      continue;
    }

    // Create building
    const { data: newBuilding, error } = await supabase
      .from("buildings")
      .insert({
        city_id: miamiCity.id,
        neighborhood_id: neighborhoodId,
        name: building.name,
        address_1: building.address,
        zip: "33134",
        year_built: getRandomInt(2018, 2023),
        stories: getRandomInt(10, 25),
        website_url: building.website,
        leasing_phone: building.phone,
        pet_policy: "Pets welcome with deposit. Breed restrictions may apply.",
        status: "active",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  Error creating building: ${error.message}`);
      continue;
    }

    buildingsCreated++;
    console.log("  Created building");

    // Add building image
    await supabase.from("building_images").insert({
      building_id: newBuilding.id,
      url: getRandom(BUILDING_IMAGES),
      alt_text: `${building.name} exterior`,
      category: "exterior",
      is_primary: true,
      sort_order: 0,
    });

    // Add amenities
    for (const amenityName of AMENITIES) {
      let { data: amenity } = await supabase
        .from("amenities")
        .select("id")
        .eq("name", amenityName)
        .single();

      if (!amenity) {
        const { data: newAmenity } = await supabase
          .from("amenities")
          .insert({ name: amenityName })
          .select("id")
          .single();
        amenity = newAmenity;
      }

      if (amenity) {
        await supabase.from("building_amenities").upsert(
          { building_id: newBuilding.id, amenity_id: amenity.id },
          { onConflict: "building_id,amenity_id" }
        );
      }
    }

    // Add floor plans and units
    for (const fp of FLOOR_PLANS) {
      const { data: floorplan } = await supabase
        .from("floorplans")
        .insert({
          building_id: newBuilding.id,
          name: fp.name,
          beds: fp.beds,
          baths: fp.baths,
          sqft_min: fp.sqft,
          sqft_max: fp.sqft,
        })
        .select("id")
        .single();

      if (!floorplan) continue;

      // Create 2-3 units per floor plan
      const numUnits = getRandomInt(2, 3);
      for (let i = 0; i < numUnits; i++) {
        const floor = getRandomInt(1, 20);
        const unitLetter = String.fromCharCode(65 + i);
        const unitNumber = `${floor}${unitLetter}`;

        const { data: unit } = await supabase
          .from("units")
          .insert({
            building_id: newBuilding.id,
            floorplan_id: floorplan.id,
            unit_number: unitNumber,
            beds: fp.beds,
            baths: fp.baths,
            sqft: fp.sqft + getRandomInt(-25, 25),
            is_available: true,
            available_on: new Date(Date.now() + getRandomInt(7, 60) * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
          })
          .select("id")
          .single();

        if (unit) {
          // Add price snapshot
          await supabase.from("unit_price_snapshots").insert({
            unit_id: unit.id,
            rent: fp.rent + getRandomInt(-100, 100),
            captured_at: new Date().toISOString(),
          });

          // Add unit images
          await supabase.from("unit_images").insert([
            {
              unit_id: unit.id,
              url: getRandom(UNIT_IMAGES),
              alt_text: `${building.name} Unit ${unitNumber} living room`,
              category: "living",
              is_primary: true,
              sort_order: 0,
            },
            {
              unit_id: unit.id,
              url: UNIT_IMAGES[3],
              alt_text: `${building.name} Unit ${unitNumber} bedroom`,
              category: "bedroom",
              is_primary: false,
              sort_order: 1,
            },
            {
              unit_id: unit.id,
              url: UNIT_IMAGES[4],
              alt_text: `${building.name} Unit ${unitNumber} kitchen`,
              category: "kitchen",
              is_primary: false,
              sort_order: 2,
            },
          ]);

          unitsCreated++;
        }
      }
    }
  }

  console.log(`\n=== Done! ===`);
  console.log(`Buildings created: ${buildingsCreated}`);
  console.log(`Units created: ${unitsCreated}`);
}

main().catch(console.error);
