import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";

export async function POST() {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const supabase = createAdminClient();
    const results = {
      cities_updated: 0,
      units_created: 0,
      price_snapshots_created: 0,
      errors: [] as string[],
    };

    // "new-york" is the canonical NYC slug (the duplicate empty "nyc" row was
    // deleted 2026-07-12) — do NOT rename slugs here.

    // 1. Get all buildings that don't have units
    const { data: buildings } = await supabase
      .from("buildings")
      .select(`
        id, name,
        units:units(id)
      `)
      .eq("status", "active");

    const buildingsWithoutUnits = (buildings || []).filter(
      (b) => !b.units || b.units.length === 0
    );

    // 2. For each building without units, get rent_min/rent_max from building_facts
    //    and create a sample unit with price snapshot
    for (const building of buildingsWithoutUnits) {
      try {
        // Get building facts for rent range
        const { data: facts } = await supabase
          .from("building_facts")
          .select("key, value")
          .eq("building_id", building.id)
          .in("key", ["rent_min", "rent_max", "sqft_min", "sqft_max"]);

        const factsMap: Record<string, number> = {};
        for (const f of facts || []) {
          factsMap[f.key] = Number(f.value);
        }

        const rentMin = factsMap.rent_min || 3000;
        const rentMax = factsMap.rent_max || rentMin + 2000;
        const sqftMin = factsMap.sqft_min || 500;
        const sqftMax = factsMap.sqft_max || 1200;

        // Create sample units for different bed counts
        const unitConfigs = [
          { beds: 0, baths: 1, sqft: sqftMin, rent: rentMin, suffix: "S1" },
          { beds: 1, baths: 1, sqft: Math.round((sqftMin + sqftMax) / 2), rent: Math.round((rentMin + rentMax) / 2), suffix: "A1" },
          { beds: 2, baths: 2, sqft: sqftMax, rent: rentMax, suffix: "B1" },
        ];

        for (const config of unitConfigs) {
          // Create unit
          const { data: unit, error: unitError } = await supabase
            .from("units")
            .insert({
              building_id: building.id,
              unit_number: config.suffix,
              beds: config.beds,
              baths: config.baths,
              sqft: config.sqft,
              is_available: true,
              available_on: new Date().toISOString().split("T")[0],
            })
            .select("id")
            .single();

          if (unitError) {
            // Unit might already exist, try to get it
            const { data: existingUnit } = await supabase
              .from("units")
              .select("id")
              .eq("building_id", building.id)
              .eq("unit_number", config.suffix)
              .single();

            if (existingUnit) {
              // Create price snapshot for existing unit
              await supabase.from("unit_price_snapshots").insert({
                unit_id: existingUnit.id,
                rent: config.rent,
                captured_at: new Date().toISOString(),
              });
              results.price_snapshots_created++;
            }
            continue;
          }

          results.units_created++;

          // Create price snapshot
          if (unit) {
            const { error: priceError } = await supabase
              .from("unit_price_snapshots")
              .insert({
                unit_id: unit.id,
                rent: config.rent,
                captured_at: new Date().toISOString(),
              });

            if (!priceError) {
              results.price_snapshots_created++;
            }
          }
        }
      } catch (err) {
        results.errors.push(`Error processing ${building.name}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Data fixed successfully",
      buildings_processed: buildingsWithoutUnits.length,
      results,
    });
  } catch (error) {
    console.error("Fix data error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to fix city slugs and create sample units",
  });
}
