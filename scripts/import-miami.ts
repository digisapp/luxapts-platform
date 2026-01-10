#!/usr/bin/env npx ts-node

/**
 * Import Miami buildings from JSON to Supabase
 * Run: npx ts-node scripts/import-miami.ts
 * Or: curl -X POST http://localhost:3000/api/import/miami
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface MiamiBuilding {
  name: string;
  address: string;
  neighborhood: string;
  year_built?: number;
  stories?: number;
  total_units?: number;
  website?: string;
  phone?: string;
  email?: string;
  management_company?: string;
  rent_range?: { min: number; max: number };
  sqft_range?: { min: number; max: number };
  unit_types?: string[];
  available_units?: number;
  floor_plans?: Array<{
    unit?: string;
    name?: string;
    beds: number;
    baths?: number;
    sqft?: number;
    rent?: number;
    available_date?: string;
  }>;
  move_in_specials?: string;
  amenities?: string[];
  pet_policy?: string;
  min_lease?: string;
  images?: {
    gallery?: string;
    exterior?: string;
  };
}

async function importMiamiBuildings() {
  console.log("Starting Miami import...\n");

  // Load JSON data
  const jsonPath = path.join(__dirname, "../data/miami_listings.json");
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const buildings: MiamiBuilding[] = jsonData.buildings;

  console.log(`Found ${buildings.length} buildings to import\n`);

  const results = {
    cities_created: 0,
    neighborhoods_created: 0,
    buildings_created: 0,
    buildings_updated: 0,
    units_created: 0,
    errors: [] as string[],
  };

  // Get or create Miami city
  let { data: miamiCity } = await supabase
    .from("cities")
    .select("id")
    .eq("slug", "miami")
    .single();

  if (!miamiCity) {
    const { data: newCity, error } = await supabase
      .from("cities")
      .insert({
        name: "Miami",
        slug: "miami",
        state: "FL",
        country: "USA",
        center_lat: 25.7617,
        center_lng: -80.1918,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create Miami city:", error);
      return;
    }
    miamiCity = newCity;
    results.cities_created++;
    console.log("Created Miami city");
  }

  const neighborhoodCache: Record<string, string> = {};

  for (const building of buildings) {
    try {
      process.stdout.write(`Processing ${building.name}...`);

      // Get or create neighborhood
      let neighborhoodId = neighborhoodCache[building.neighborhood];
      if (!neighborhoodId) {
        const slug = building.neighborhood
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");

        let { data: neighborhood } = await supabase
          .from("neighborhoods")
          .select("id")
          .eq("city_id", miamiCity!.id)
          .eq("slug", slug)
          .single();

        if (!neighborhood) {
          const { data: newNeighborhood, error } = await supabase
            .from("neighborhoods")
            .insert({
              city_id: miamiCity!.id,
              name: building.neighborhood,
              slug,
            })
            .select("id")
            .single();

          if (error) {
            results.errors.push(`Neighborhood ${building.neighborhood}: ${error.message}`);
            console.log(" FAILED (neighborhood)");
            continue;
          }
          neighborhood = newNeighborhood;
          results.neighborhoods_created++;
        }

        neighborhoodId = neighborhood!.id;
        neighborhoodCache[building.neighborhood] = neighborhoodId;
      }

      // Parse address
      const addressParts = building.address.split(",");
      const address1 = addressParts[0]?.trim() || building.address;
      const zipMatch = building.address.match(/\d{5}/);
      const zip = zipMatch ? zipMatch[0] : null;

      // Check if building exists
      let { data: existingBuilding } = await supabase
        .from("buildings")
        .select("id")
        .eq("name", building.name)
        .eq("city_id", miamiCity!.id)
        .single();

      let buildingId: string;

      if (existingBuilding) {
        await supabase
          .from("buildings")
          .update({
            neighborhood_id: neighborhoodId,
            address_1: address1,
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
      } else {
        const { data: newBuilding, error } = await supabase
          .from("buildings")
          .insert({
            city_id: miamiCity!.id,
            neighborhood_id: neighborhoodId,
            name: building.name,
            address_1: address1,
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
          results.errors.push(`Building ${building.name}: ${error.message}`);
          console.log(" FAILED");
          continue;
        }
        buildingId = newBuilding!.id;
        results.buildings_created++;
      }

      // Add building facts
      const facts = [
        { key: "rent_min", value: building.rent_range?.min },
        { key: "rent_max", value: building.rent_range?.max },
        { key: "sqft_min", value: building.sqft_range?.min },
        { key: "sqft_max", value: building.sqft_range?.max },
        { key: "total_units", value: building.total_units },
        { key: "available_units", value: building.available_units },
        { key: "move_in_specials", value: building.move_in_specials },
        { key: "management_company", value: building.management_company },
        { key: "image_exterior", value: building.images?.exterior },
        { key: "image_gallery", value: building.images?.gallery },
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

      // Add amenities
      if (building.amenities?.length) {
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
            await supabase
              .from("building_amenities")
              .upsert(
                { building_id: buildingId, amenity_id: amenity.id },
                { onConflict: "building_id,amenity_id" }
              );
          }
        }
      }

      // Add floor plans and units
      if (building.floor_plans?.length) {
        for (const fp of building.floor_plans) {
          const floorplanName = fp.name || `${fp.beds}BR`;

          let { data: floorplan } = await supabase
            .from("floorplans")
            .select("id")
            .eq("building_id", buildingId)
            .eq("name", floorplanName)
            .single();

          if (!floorplan) {
            const { data: newFloorplan } = await supabase
              .from("floorplans")
              .insert({
                building_id: buildingId,
                name: floorplanName,
                beds: fp.beds,
                baths: fp.baths || 1,
                sqft_min: fp.sqft || null,
                sqft_max: fp.sqft || null,
              })
              .select("id")
              .single();
            floorplan = newFloorplan;
          }

          if (fp.unit && floorplan) {
            const { data: unit } = await supabase
              .from("units")
              .upsert(
                {
                  building_id: buildingId,
                  floorplan_id: floorplan.id,
                  unit_number: fp.unit,
                  beds: fp.beds,
                  baths: fp.baths || 1,
                  sqft: fp.sqft || null,
                  is_available: true,
                  available_on: fp.available_date || null,
                },
                { onConflict: "building_id,unit_number" }
              )
              .select("id")
              .single();

            if (unit && fp.rent) {
              await supabase.from("unit_price_snapshots").insert({
                unit_id: unit.id,
                rent: fp.rent,
                captured_at: new Date().toISOString(),
              });
              results.units_created++;
            }
          }
        }
      }

      console.log(" OK");
    } catch (err) {
      results.errors.push(`${building.name}: ${err}`);
      console.log(" ERROR");
    }
  }

  console.log("\n=== Import Complete ===");
  console.log(`Cities created: ${results.cities_created}`);
  console.log(`Neighborhoods created: ${results.neighborhoods_created}`);
  console.log(`Buildings created: ${results.buildings_created}`);
  console.log(`Buildings updated: ${results.buildings_updated}`);
  console.log(`Units created: ${results.units_created}`);
  if (results.errors.length) {
    console.log(`\nErrors (${results.errors.length}):`);
    results.errors.forEach((e) => console.log(`  - ${e}`));
  }
}

importMiamiBuildings().catch(console.error);
