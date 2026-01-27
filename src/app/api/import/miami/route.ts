import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import miamiListings from "../../../../../data/miami_listings.json";

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
  parking?: Record<string, number | string>;
  utilities_included?: string[];
  notable?: string;
  walk_score?: number;
  transit_score?: number;
  images?: {
    gallery?: string;
    exterior?: string;
    amenities?: string;
  };
}

export async function POST(req: Request) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();
    const results = {
      cities_created: 0,
      neighborhoods_created: 0,
      buildings_created: 0,
      buildings_updated: 0,
      units_created: 0,
      amenities_linked: 0,
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
        results.errors.push(`Failed to create Miami city: ${error.message}`);
      } else {
        miamiCity = newCity;
        results.cities_created++;
      }
    }

    if (!miamiCity) {
      return NextResponse.json({ error: "Failed to get Miami city", results }, { status: 500 });
    }

    // Cache neighborhoods
    const neighborhoodCache: Record<string, string> = {};

    // Process each building
    for (const building of (miamiListings as { buildings: MiamiBuilding[] }).buildings) {
      try {
        // Get or create neighborhood
        let neighborhoodId = neighborhoodCache[building.neighborhood];
        if (!neighborhoodId) {
          const neighborhoodSlug = building.neighborhood.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

          let { data: neighborhood } = await supabase
            .from("neighborhoods")
            .select("id")
            .eq("city_id", miamiCity.id)
            .eq("slug", neighborhoodSlug)
            .single();

          if (!neighborhood) {
            const { data: newNeighborhood, error } = await supabase
              .from("neighborhoods")
              .insert({
                city_id: miamiCity.id,
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
          .eq("city_id", miamiCity.id)
          .single();

        let buildingId: string;

        if (existingBuilding) {
          // Update existing building
          const { error } = await supabase
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
              description: building.notable || null,
              status: "active",
            })
            .eq("id", existingBuilding.id);

          if (error) {
            results.errors.push(`Failed to update building ${building.name}: ${error.message}`);
            continue;
          }
          buildingId = existingBuilding.id;
          results.buildings_updated++;
        } else {
          // Create new building
          const { data: newBuilding, error } = await supabase
            .from("buildings")
            .insert({
              city_id: miamiCity.id,
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
              description: building.notable || null,
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

        // Add building facts for additional data
        const facts = [
          { key: "rent_min", value: building.rent_range?.min },
          { key: "rent_max", value: building.rent_range?.max },
          { key: "sqft_min", value: building.sqft_range?.min },
          { key: "sqft_max", value: building.sqft_range?.max },
          { key: "total_units", value: building.total_units },
          { key: "available_units", value: building.available_units },
          { key: "move_in_specials", value: building.move_in_specials },
          { key: "management_company", value: building.management_company },
          { key: "walk_score", value: building.walk_score },
          { key: "transit_score", value: building.transit_score },
          { key: "image_exterior", value: building.images?.exterior },
          { key: "image_gallery", value: building.images?.gallery },
          { key: "unit_types", value: building.unit_types?.join(", ") },
        ].filter(f => f.value !== undefined && f.value !== null);

        for (const fact of facts) {
          await supabase
            .from("building_facts")
            .upsert({
              building_id: buildingId,
              key: fact.key,
              value: fact.value,
              source: "scrape",
              updated_at: new Date().toISOString(),
            }, { onConflict: "building_id,key" });
        }

        // Add amenities
        if (building.amenities?.length) {
          for (const amenityName of building.amenities) {
            // Get or create amenity
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
                .upsert({
                  building_id: buildingId,
                  amenity_id: amenity.id,
                }, { onConflict: "building_id,amenity_id" });
              results.amenities_linked++;
            }
          }
        }

        // Add floor plans and units
        if (building.floor_plans?.length) {
          for (const fp of building.floor_plans) {
            // Create floorplan
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

            // Create unit if we have unit number
            if (fp.unit && floorplan) {
              const { data: unit, error: unitError } = await supabase
                .from("units")
                .upsert({
                  building_id: buildingId,
                  floorplan_id: floorplan.id,
                  unit_number: fp.unit,
                  beds: fp.beds,
                  baths: fp.baths || 1,
                  sqft: fp.sqft || null,
                  is_available: true,
                  available_on: fp.available_date || null,
                }, { onConflict: "building_id,unit_number" })
                .select("id")
                .single();

              if (unit && fp.rent) {
                await supabase
                  .from("unit_price_snapshots")
                  .insert({
                    unit_id: unit.id,
                    rent: fp.rent,
                    captured_at: new Date().toISOString(),
                  });
                results.units_created++;
              }
            }
          }
        }
      } catch (err) {
        results.errors.push(`Error processing ${building.name}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Miami buildings imported successfully",
      results,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to import Miami buildings",
    buildings_count: (miamiListings as { buildings: unknown[] }).buildings.length,
  });
}
