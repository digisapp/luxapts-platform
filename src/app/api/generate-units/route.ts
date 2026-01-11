import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = createAdminClient();
    const results = {
      buildings_processed: 0,
      units_created: 0,
      price_snapshots_created: 0,
      errors: [] as string[],
    };

    // Get all active buildings
    const { data: buildings, error: buildingsError } = await supabase
      .from("buildings")
      .select("id, name")
      .eq("status", "active");

    if (buildingsError || !buildings) {
      return NextResponse.json({ error: "Failed to fetch buildings" }, { status: 500 });
    }

    for (const building of buildings) {
      try {
        // Check if building already has units
        const { data: existingUnits } = await supabase
          .from("units")
          .select("id")
          .eq("building_id", building.id)
          .limit(1);

        if (existingUnits && existingUnits.length > 0) {
          // Skip buildings that already have units
          continue;
        }

        // Get building facts for rent range
        const { data: facts } = await supabase
          .from("building_facts")
          .select("key, value")
          .eq("building_id", building.id);

        const factsMap: Record<string, string | number> = {};
        for (const f of facts || []) {
          factsMap[f.key] = f.value as string | number;
        }

        const rentMin = Number(factsMap.rent_min) || 2500;
        const rentMax = Number(factsMap.rent_max) || rentMin + 3000;
        const sqftMin = Number(factsMap.sqft_min) || 450;
        const sqftMax = Number(factsMap.sqft_max) || 1400;

        // Parse unit types if available
        const unitTypesStr = factsMap.unit_types as string || "Studio, 1BR, 2BR";
        const hasStudio = unitTypesStr.toLowerCase().includes("studio");
        const has1BR = unitTypesStr.includes("1BR") || unitTypesStr.includes("1 bed");
        const has2BR = unitTypesStr.includes("2BR") || unitTypesStr.includes("2 bed");
        const has3BR = unitTypesStr.includes("3BR") || unitTypesStr.includes("3 bed");

        // Calculate rent increments
        const rentRange = rentMax - rentMin;
        const rentStep = rentRange / 4;

        // Define unit configurations based on available types
        const unitConfigs: Array<{
          beds: number;
          baths: number;
          sqft: number;
          rent: number;
          prefix: string;
          count: number;
        }> = [];

        if (hasStudio) {
          unitConfigs.push({
            beds: 0,
            baths: 1,
            sqft: sqftMin,
            rent: rentMin,
            prefix: "S",
            count: 3,
          });
        }

        if (has1BR || !hasStudio) {
          unitConfigs.push({
            beds: 1,
            baths: 1,
            sqft: Math.round(sqftMin + (sqftMax - sqftMin) * 0.3),
            rent: Math.round(rentMin + rentStep),
            prefix: "A",
            count: 4,
          });
        }

        if (has2BR) {
          unitConfigs.push({
            beds: 2,
            baths: 2,
            sqft: Math.round(sqftMin + (sqftMax - sqftMin) * 0.6),
            rent: Math.round(rentMin + rentStep * 2),
            prefix: "B",
            count: 3,
          });
        }

        if (has3BR) {
          unitConfigs.push({
            beds: 3,
            baths: 2,
            sqft: sqftMax,
            rent: rentMax,
            prefix: "C",
            count: 2,
          });
        }

        // Generate availability dates (next 1-3 months)
        const today = new Date();
        const getAvailDate = (weeksOut: number) => {
          const date = new Date(today);
          date.setDate(date.getDate() + weeksOut * 7);
          return date.toISOString().split("T")[0];
        };

        // Create units for each configuration
        for (const config of unitConfigs) {
          for (let i = 1; i <= config.count; i++) {
            const unitNumber = `${config.prefix}${100 + i * 100 + Math.floor(Math.random() * 50)}`;

            // Vary the rent slightly (+/- 5%)
            const rentVariation = config.rent * (0.95 + Math.random() * 0.1);
            const finalRent = Math.round(rentVariation / 10) * 10;

            // Vary sqft slightly (+/- 3%)
            const sqftVariation = config.sqft * (0.97 + Math.random() * 0.06);
            const finalSqft = Math.round(sqftVariation);

            // Random availability date
            const availDate = getAvailDate(Math.floor(Math.random() * 12) + 1);

            // Create the unit
            const { data: unit, error: unitError } = await supabase
              .from("units")
              .insert({
                building_id: building.id,
                unit_number: unitNumber,
                beds: config.beds,
                baths: config.baths,
                sqft: finalSqft,
                is_available: true,
                available_on: availDate,
              })
              .select("id")
              .single();

            if (unitError) {
              results.errors.push(`Unit ${unitNumber} in ${building.name}: ${unitError.message}`);
              continue;
            }

            results.units_created++;

            // Create price snapshot
            if (unit) {
              const { error: priceError } = await supabase
                .from("unit_price_snapshots")
                .insert({
                  unit_id: unit.id,
                  rent: finalRent,
                  captured_at: new Date().toISOString(),
                });

              if (!priceError) {
                results.price_snapshots_created++;
              }
            }
          }
        }

        results.buildings_processed++;
      } catch (err) {
        results.errors.push(`Building ${building.name}: ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Units generated successfully",
      results,
    });
  } catch (error) {
    console.error("Generate units error:", error);
    return NextResponse.json(
      { error: "Generation failed", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to generate units for all buildings",
  });
}
