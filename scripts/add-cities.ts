// Run with: npx tsx scripts/add-cities.ts

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

// New cities to add
const NEW_CITIES = [
  {
    name: "Los Angeles",
    slug: "los-angeles",
    state: "CA",
    center_lat: 34.0522,
    center_lng: -118.2437,
    neighborhoods: [
      { name: "Downtown LA", slug: "downtown-la" },
      { name: "Santa Monica", slug: "santa-monica" },
      { name: "Hollywood", slug: "hollywood" },
      { name: "Beverly Hills", slug: "beverly-hills" },
      { name: "West Hollywood", slug: "west-hollywood" },
      { name: "Venice", slug: "venice" },
      { name: "Silver Lake", slug: "silver-lake" },
      { name: "Koreatown", slug: "koreatown" },
    ],
  },
  {
    name: "Austin",
    slug: "austin",
    state: "TX",
    center_lat: 30.2672,
    center_lng: -97.7431,
    neighborhoods: [
      { name: "Downtown Austin", slug: "downtown-austin" },
      { name: "South Congress", slug: "south-congress" },
      { name: "East Austin", slug: "east-austin" },
      { name: "The Domain", slug: "the-domain" },
      { name: "Hyde Park", slug: "hyde-park" },
      { name: "Mueller", slug: "mueller" },
      { name: "Rainey Street", slug: "rainey-street" },
    ],
  },
  {
    name: "Chicago",
    slug: "chicago",
    state: "IL",
    center_lat: 41.8781,
    center_lng: -87.6298,
    neighborhoods: [
      { name: "The Loop", slug: "the-loop" },
      { name: "River North", slug: "river-north" },
      { name: "Lincoln Park", slug: "lincoln-park" },
      { name: "Wicker Park", slug: "wicker-park" },
      { name: "Gold Coast", slug: "gold-coast" },
      { name: "West Loop", slug: "west-loop" },
      { name: "Lakeview", slug: "lakeview" },
      { name: "South Loop", slug: "south-loop" },
    ],
  },
  {
    name: "San Francisco",
    slug: "san-francisco",
    state: "CA",
    center_lat: 37.7749,
    center_lng: -122.4194,
    neighborhoods: [
      { name: "SOMA", slug: "soma" },
      { name: "Mission District", slug: "mission-district" },
      { name: "Marina", slug: "marina" },
      { name: "Pacific Heights", slug: "pacific-heights" },
      { name: "Nob Hill", slug: "nob-hill" },
      { name: "Hayes Valley", slug: "hayes-valley" },
      { name: "Castro", slug: "castro" },
      { name: "Financial District", slug: "financial-district" },
    ],
  },
];

// Sample buildings for each city
const BUILDING_TEMPLATES = [
  {
    name_suffix: "Tower",
    stories: 30,
    year_built: 2020,
    pet_policy: "Cats and small dogs allowed with deposit",
    parking_policy: "Underground parking available",
    deposit_policy: "One month deposit required",
    rent_min: 2500,
    rent_max: 8000,
  },
  {
    name_suffix: "Lofts",
    stories: 8,
    year_built: 2018,
    pet_policy: "Pet-friendly, all sizes welcome",
    parking_policy: "Street parking only",
    deposit_policy: "Security deposit equal to one month rent",
    rent_min: 2000,
    rent_max: 5500,
  },
  {
    name_suffix: "Residences",
    stories: 20,
    year_built: 2022,
    pet_policy: "No pets allowed",
    parking_policy: "Valet parking included",
    deposit_policy: "First and last month required",
    rent_min: 3500,
    rent_max: 12000,
  },
  {
    name_suffix: "Apartments",
    stories: 12,
    year_built: 2019,
    pet_policy: "Dogs under 50 lbs allowed",
    parking_policy: "Garage parking $200/month",
    deposit_policy: "One month security deposit",
    rent_min: 1800,
    rent_max: 4500,
  },
  {
    name_suffix: "Place",
    stories: 6,
    year_built: 2021,
    pet_policy: "Cats only",
    parking_policy: "Limited covered parking",
    deposit_policy: "Flexible deposit options",
    rent_min: 1500,
    rent_max: 3500,
  },
];

const BUILDING_IMAGES = [
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80",
  "https://images.unsplash.com/photo-1515263487990-61b07816b324?w=800&q=80",
  "https://images.unsplash.com/photo-1460317442991-0ec209397118?w=800&q=80",
  "https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&q=80",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80",
];

const UNIT_IMAGES = [
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80",
  "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80",
];

const getRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function main() {
  console.log("Starting city population...\n");

  for (const cityData of NEW_CITIES) {
    console.log(`\n=== Processing ${cityData.name} ===`);

    // Check if city already exists
    const { data: existingCity } = await supabase
      .from("cities")
      .select("id")
      .eq("slug", cityData.slug)
      .single();

    let cityId: string;

    if (existingCity) {
      console.log(`City ${cityData.name} already exists, skipping creation`);
      cityId = existingCity.id;
    } else {
      // Create city
      const { data: newCity, error: cityError } = await supabase
        .from("cities")
        .insert({
          name: cityData.name,
          slug: cityData.slug,
          state: cityData.state,
          country: "USA",
          center_lat: cityData.center_lat,
          center_lng: cityData.center_lng,
        })
        .select("id")
        .single();

      if (cityError || !newCity) {
        console.error(`Failed to create city ${cityData.name}:`, cityError?.message);
        continue;
      }

      cityId = newCity.id;
      console.log(`Created city: ${cityData.name}`);
    }

    // Create neighborhoods
    const neighborhoodIds: Record<string, string> = {};

    for (const hood of cityData.neighborhoods) {
      const { data: existingHood } = await supabase
        .from("neighborhoods")
        .select("id")
        .eq("city_id", cityId)
        .eq("slug", hood.slug)
        .single();

      if (existingHood) {
        neighborhoodIds[hood.slug] = existingHood.id;
      } else {
        const { data: newHood, error: hoodError } = await supabase
          .from("neighborhoods")
          .insert({
            city_id: cityId,
            name: hood.name,
            slug: hood.slug,
          })
          .select("id")
          .single();

        if (!hoodError && newHood) {
          neighborhoodIds[hood.slug] = newHood.id;
          console.log(`  Created neighborhood: ${hood.name}`);
        }
      }
    }

    // Check if city already has buildings
    const { data: existingBuildings } = await supabase
      .from("buildings")
      .select("id")
      .eq("city_id", cityId)
      .limit(1);

    if (existingBuildings && existingBuildings.length > 0) {
      console.log(`  City already has buildings, skipping building creation`);
      continue;
    }

    // Create buildings (3-5 per neighborhood)
    let buildingsCreated = 0;
    let unitsCreated = 0;

    for (const hood of cityData.neighborhoods) {
      const neighborhoodId = neighborhoodIds[hood.slug];
      if (!neighborhoodId) continue;

      const numBuildings = getRandomInt(3, 5);

      for (let i = 0; i < numBuildings; i++) {
        const template = getRandom(BUILDING_TEMPLATES);
        const buildingName = `${hood.name} ${template.name_suffix}`;
        const streetNum = getRandomInt(100, 999);

        // Create building
        const { data: building, error: buildingError } = await supabase
          .from("buildings")
          .insert({
            city_id: cityId,
            neighborhood_id: neighborhoodId,
            name: buildingName,
            address_1: `${streetNum} ${hood.name.split(" ")[0]} Street`,
            zip: `${getRandomInt(10000, 99999)}`,
            year_built: template.year_built,
            stories: template.stories,
            pet_policy: template.pet_policy,
            parking_policy: template.parking_policy,
            deposit_policy: template.deposit_policy,
            status: "active",
          })
          .select("id")
          .single();

        if (buildingError || !building) {
          console.error(`  Failed to create building: ${buildingError?.message}`);
          continue;
        }

        buildingsCreated++;

        // Add building image
        await supabase.from("building_images").insert({
          building_id: building.id,
          url: getRandom(BUILDING_IMAGES),
          alt_text: `${buildingName} exterior`,
          category: "exterior",
          is_primary: true,
          sort_order: 0,
        });

        // Add building facts
        await supabase.from("building_facts").insert([
          { building_id: building.id, key: "rent_min", value: template.rent_min },
          { building_id: building.id, key: "rent_max", value: template.rent_max },
        ]);

        // Create units (5-10 per building)
        const numUnits = getRandomInt(5, 10);

        for (let j = 0; j < numUnits; j++) {
          const beds = getRandomInt(0, 3);
          const baths = beds === 0 ? 1 : beds;
          const sqft = 400 + beds * 300 + getRandomInt(0, 200);
          const rent = template.rent_min + (beds * (template.rent_max - template.rent_min) / 3) + getRandomInt(-200, 200);
          const unitNumber = `${getRandomInt(1, template.stories)}${String.fromCharCode(65 + j)}`;

          // Create unit
          const { data: unit, error: unitError } = await supabase
            .from("units")
            .insert({
              building_id: building.id,
              unit_number: unitNumber,
              beds,
              baths,
              sqft: Math.round(sqft),
              is_available: true,
              available_on: new Date(Date.now() + getRandomInt(7, 90) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            })
            .select("id")
            .single();

          if (unitError || !unit) continue;

          unitsCreated++;

          // Add price snapshot
          await supabase.from("unit_price_snapshots").insert({
            unit_id: unit.id,
            rent: Math.round(rent / 10) * 10,
            captured_at: new Date().toISOString(),
          });

          // Add unit image
          await supabase.from("unit_images").insert({
            unit_id: unit.id,
            url: getRandom(UNIT_IMAGES),
            alt_text: `${buildingName} Unit ${unitNumber}`,
            category: "living",
            is_primary: true,
            sort_order: 0,
          });
        }
      }
    }

    console.log(`  Created ${buildingsCreated} buildings and ${unitsCreated} units`);
  }

  console.log("\n=== Done! ===");
}

main().catch(console.error);
