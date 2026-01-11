// Run with: npx tsx scripts/import-scraped.ts [austin|la|both]
// Example: npx tsx scripts/import-scraped.ts austin
// Example: npx tsx scripts/import-scraped.ts both

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

interface Building {
  name: string;
  address: string;
  neighborhood: string;
  phone?: string;
  email?: string;
  website?: string;
  management_company?: string;
  year_built?: number;
  stories?: number;
  total_units?: number;
  rent_range?: { min: number; max: number };
  sqft_range?: { min: number; max: number };
  unit_types?: string[];
  floor_plans: Array<{
    name: string;
    type: string;
    beds: number;
    baths: number;
    sqft: number;
    rent: number;
  }>;
  amenities: string[];
  pet_policy: string;
  images?: {
    exterior?: string;
  };
}

interface Results {
  neighborhoods_created: number;
  buildings_created: number;
  buildings_updated: number;
  units_created: number;
  amenities_linked: number;
  images_created: number;
  errors: string[];
}

async function importCity(
  cityName: string,
  citySlug: string,
  state: string,
  defaultZip: string,
  centerLat: number,
  centerLng: number,
  listingsFile: string
) {
  console.log(`\n=== Importing ${cityName} ===\n`);

  const results: Results = {
    neighborhoods_created: 0,
    buildings_created: 0,
    buildings_updated: 0,
    units_created: 0,
    amenities_linked: 0,
    images_created: 0,
    errors: [],
  };

  // Load listings
  const listings = JSON.parse(
    readFileSync(join(process.cwd(), "data", listingsFile), "utf-8")
  ) as { buildings: Building[] };

  console.log(`Loaded ${listings.buildings.length} buildings from ${listingsFile}`);

  // Get or create city
  let { data: city } = await supabase
    .from("cities")
    .select("id")
    .eq("slug", citySlug)
    .single();

  if (!city) {
    const { data: newCity, error } = await supabase
      .from("cities")
      .insert({
        name: cityName,
        slug: citySlug,
        state,
        country: "USA",
        center_lat: centerLat,
        center_lng: centerLng,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`Failed to create city: ${error.message}`);
      return results;
    }
    city = newCity;
    console.log(`Created city: ${cityName}`);
  } else {
    console.log(`Using existing city: ${cityName}`);
  }

  // Cache neighborhoods
  const neighborhoodCache: Record<string, string> = {};

  // Process each building
  for (const building of listings.buildings) {
    try {
      console.log(`\nProcessing: ${building.name}`);

      // Get or create neighborhood
      let neighborhoodId = neighborhoodCache[building.neighborhood];
      if (!neighborhoodId) {
        const neighborhoodSlug = building.neighborhood
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");

        let { data: neighborhood } = await supabase
          .from("neighborhoods")
          .select("id")
          .eq("city_id", city.id)
          .eq("slug", neighborhoodSlug)
          .single();

        if (!neighborhood) {
          const { data: newNeighborhood, error } = await supabase
            .from("neighborhoods")
            .insert({
              city_id: city.id,
              name: building.neighborhood,
              slug: neighborhoodSlug,
            })
            .select("id")
            .single();

          if (error) {
            results.errors.push(`Failed to create neighborhood ${building.neighborhood}`);
            continue;
          }
          neighborhood = newNeighborhood;
          results.neighborhoods_created++;
          console.log(`  Created neighborhood: ${building.neighborhood}`);
        }

        neighborhoodId = neighborhood!.id;
        neighborhoodCache[building.neighborhood] = neighborhoodId;
      }

      // Parse zip
      const zipMatch = building.address.match(/\d{5}/);
      const zip = zipMatch ? zipMatch[0] : defaultZip;

      // Check if building exists
      let { data: existingBuilding } = await supabase
        .from("buildings")
        .select("id")
        .eq("name", building.name)
        .eq("city_id", city.id)
        .single();

      let buildingId: string;

      if (existingBuilding) {
        await supabase
          .from("buildings")
          .update({
            neighborhood_id: neighborhoodId,
            address_1: building.address,
            zip,
            year_built: building.year_built || null,
            stories: building.stories || null,
            website_url: building.website || null,
            leasing_phone: building.phone || null,
            leasing_email: building.email || null,
            pet_policy: building.pet_policy || null,
            status: "active",
          })
          .eq("id", existingBuilding.id);

        buildingId = existingBuilding.id;
        results.buildings_updated++;
        console.log(`  Updated building`);
      } else {
        const { data: newBuilding, error } = await supabase
          .from("buildings")
          .insert({
            city_id: city.id,
            neighborhood_id: neighborhoodId,
            name: building.name,
            address_1: building.address,
            zip,
            year_built: building.year_built || null,
            stories: building.stories || null,
            website_url: building.website || null,
            leasing_phone: building.phone || null,
            leasing_email: building.email || null,
            pet_policy: building.pet_policy || null,
            status: "active",
          })
          .select("id")
          .single();

        if (error) {
          results.errors.push(`Failed to create building ${building.name}: ${error.message}`);
          continue;
        }
        buildingId = newBuilding!.id;
        results.buildings_created++;
        console.log(`  Created building`);
      }

      // Add building facts
      const facts = [
        { key: "rent_min", value: building.rent_range?.min },
        { key: "rent_max", value: building.rent_range?.max },
        { key: "sqft_min", value: building.sqft_range?.min },
        { key: "sqft_max", value: building.sqft_range?.max },
        { key: "total_units", value: building.total_units },
        { key: "management_company", value: building.management_company },
        { key: "unit_types", value: building.unit_types?.join(", ") },
      ].filter((f) => f.value !== undefined && f.value !== null);

      for (const fact of facts) {
        await supabase.from("building_facts").upsert(
          {
            building_id: buildingId,
            key: fact.key,
            value: fact.value,
            source: "scrape",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "building_id,key" }
        );
      }

      // Add building image if valid
      if (building.images?.exterior && building.images.exterior.startsWith("http")) {
        const { data: existingImage } = await supabase
          .from("building_images")
          .select("id")
          .eq("building_id", buildingId)
          .eq("is_primary", true)
          .single();

        if (!existingImage) {
          await supabase.from("building_images").insert({
            building_id: buildingId,
            url: building.images.exterior,
            alt_text: `${building.name} exterior`,
            category: "exterior",
            is_primary: true,
            sort_order: 0,
          });
          results.images_created++;
        }
      }

      // Add amenities
      for (const amenityName of building.amenities) {
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
            {
              building_id: buildingId,
              amenity_id: amenity.id,
            },
            { onConflict: "building_id,amenity_id" }
          );
          results.amenities_linked++;
        }
      }

      // Add floor plans and units
      for (const fp of building.floor_plans) {
        let { data: floorplan } = await supabase
          .from("floorplans")
          .select("id")
          .eq("building_id", buildingId)
          .eq("name", fp.name)
          .single();

        if (!floorplan) {
          const { data: newFloorplan } = await supabase
            .from("floorplans")
            .insert({
              building_id: buildingId,
              name: fp.name,
              beds: fp.beds,
              baths: fp.baths,
              sqft_min: fp.sqft,
              sqft_max: fp.sqft,
            })
            .select("id")
            .single();
          floorplan = newFloorplan;
        }

        if (!floorplan) continue;

        // Create 2-4 units per floor plan
        const numUnits = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < numUnits; i++) {
          const floor = Math.floor(Math.random() * (building.stories || 20)) + 1;
          const unitLetter = String.fromCharCode(65 + i);
          const unitNumber = `${floor}${unitLetter}`;

          const { data: existingUnit } = await supabase
            .from("units")
            .select("id")
            .eq("building_id", buildingId)
            .eq("unit_number", unitNumber)
            .single();

          if (existingUnit) continue;

          const { data: unit } = await supabase
            .from("units")
            .insert({
              building_id: buildingId,
              floorplan_id: floorplan.id,
              unit_number: unitNumber,
              beds: fp.beds,
              baths: fp.baths,
              sqft: fp.sqft + Math.floor(Math.random() * 50) - 25,
              is_available: true,
              available_on: new Date(
                Date.now() + Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000
              )
                .toISOString()
                .split("T")[0],
            })
            .select("id")
            .single();

          if (unit) {
            const rentVariance = Math.floor(Math.random() * 200) - 100;
            await supabase.from("unit_price_snapshots").insert({
              unit_id: unit.id,
              rent: fp.rent + rentVariance,
              captured_at: new Date().toISOString(),
            });
            results.units_created++;
          }
        }
      }

      console.log(`  Added ${building.floor_plans.length} floor plans`);
    } catch (err) {
      results.errors.push(`Error processing ${building.name}: ${err}`);
      console.error(`  Error: ${err}`);
    }
  }

  console.log(`\n--- ${cityName} Results ---`);
  console.log(`Neighborhoods created: ${results.neighborhoods_created}`);
  console.log(`Buildings created: ${results.buildings_created}`);
  console.log(`Buildings updated: ${results.buildings_updated}`);
  console.log(`Units created: ${results.units_created}`);
  console.log(`Amenities linked: ${results.amenities_linked}`);
  console.log(`Images created: ${results.images_created}`);
  if (results.errors.length > 0) {
    console.log(`Errors: ${results.errors.length}`);
  }

  return results;
}

const CITY_CONFIGS: Record<string, { name: string; slug: string; state: string; zip: string; lat: number; lng: number; file: string }> = {
  austin: { name: "Austin", slug: "austin", state: "TX", zip: "78701", lat: 30.2672, lng: -97.7431, file: "austin_listings.json" },
  la: { name: "Los Angeles", slug: "los-angeles", state: "CA", zip: "90012", lat: 34.0522, lng: -118.2437, file: "la_listings.json" },
  dallas: { name: "Dallas", slug: "dallas", state: "TX", zip: "75201", lat: 32.7767, lng: -96.7970, file: "dallas_listings.json" },
  nashville: { name: "Nashville", slug: "nashville", state: "TN", zip: "37203", lat: 36.1627, lng: -86.7816, file: "nashville_listings.json" },
  atlanta: { name: "Atlanta", slug: "atlanta", state: "GA", zip: "30309", lat: 33.7490, lng: -84.3880, file: "atlanta_listings.json" },
  brooklyn: { name: "Brooklyn", slug: "brooklyn", state: "NY", zip: "11201", lat: 40.6782, lng: -73.9442, file: "brooklyn_listings.json" },
};

async function main() {
  const cityArg = process.argv[2]?.toLowerCase();
  const validCities = [...Object.keys(CITY_CONFIGS), "all"];

  if (!cityArg || !validCities.includes(cityArg)) {
    console.log("Usage: npx tsx scripts/import-scraped.ts [city|all]");
    console.log("Available cities: " + Object.keys(CITY_CONFIGS).join(", ") + ", all");
    process.exit(1);
  }

  const citiesToProcess = cityArg === "all" ? Object.keys(CITY_CONFIGS) : [cityArg];

  for (const city of citiesToProcess) {
    const config = CITY_CONFIGS[city];
    if (config) {
      await importCity(
        config.name,
        config.slug,
        config.state,
        config.zip,
        config.lat,
        config.lng,
        config.file
      );
    }
  }

  console.log("\n=== Done! ===");
}

main().catch(console.error);
