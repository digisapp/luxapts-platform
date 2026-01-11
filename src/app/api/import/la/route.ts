import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import laListings from "../../../../../data/la_listings.json";

interface LABuilding {
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

export async function POST() {
  try {
    const supabase = createAdminClient();
    const results = {
      neighborhoods_created: 0,
      buildings_created: 0,
      buildings_updated: 0,
      units_created: 0,
      amenities_linked: 0,
      images_created: 0,
      errors: [] as string[],
    };

    // Get LA city
    let { data: laCity } = await supabase
      .from("cities")
      .select("id")
      .eq("slug", "los-angeles")
      .single();

    if (!laCity) {
      const { data: newCity, error } = await supabase
        .from("cities")
        .insert({
          name: "Los Angeles",
          slug: "los-angeles",
          state: "CA",
          country: "USA",
          center_lat: 34.0522,
          center_lng: -118.2437,
        })
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: `Failed to create LA: ${error.message}` }, { status: 500 });
      }
      laCity = newCity;
    }

    // Cache neighborhoods
    const neighborhoodCache: Record<string, string> = {};

    // Process each building
    for (const building of (laListings as { buildings: LABuilding[] }).buildings) {
      try {
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
            .eq("city_id", laCity.id)
            .eq("slug", neighborhoodSlug)
            .single();

          if (!neighborhood) {
            const { data: newNeighborhood, error } = await supabase
              .from("neighborhoods")
              .insert({
                city_id: laCity.id,
                name: building.neighborhood,
                slug: neighborhoodSlug,
              })
              .select("id")
              .single();

            if (error) {
              results.errors.push(`Failed to create neighborhood ${building.neighborhood}: ${error.message}`);
              continue;
            }
            neighborhood = newNeighborhood;
            results.neighborhoods_created++;
          }

          neighborhoodId = neighborhood!.id;
          neighborhoodCache[building.neighborhood] = neighborhoodId;
        }

        // Parse address for zip code
        const zipMatch = building.address.match(/\d{5}/);
        const zip = zipMatch ? zipMatch[0] : "90012"; // Default DTLA zip

        // Check if building exists
        let { data: existingBuilding } = await supabase
          .from("buildings")
          .select("id")
          .eq("name", building.name)
          .eq("city_id", laCity.id)
          .single();

        let buildingId: string;

        if (existingBuilding) {
          // Update existing building
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
        } else {
          // Create new building
          const { data: newBuilding, error } = await supabase
            .from("buildings")
            .insert({
              city_id: laCity.id,
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

        // Add building image
        if (building.images?.exterior) {
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
          // Create floorplan
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

          // Create sample units for this floor plan
          const numUnits = Math.floor(Math.random() * 3) + 2; // 2-4 units per floor plan
          for (let i = 0; i < numUnits; i++) {
            const floor = Math.floor(Math.random() * (building.stories || 25)) + 1;
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
              // Add price snapshot
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
      } catch (err) {
        results.errors.push(`Error processing ${building.name}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Los Angeles buildings imported successfully",
      results,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed", details: String(error) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to import Los Angeles buildings",
    buildings_count: (laListings as { buildings: unknown[] }).buildings.length,
  });
}
