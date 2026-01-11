import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  BuildingCSVRow,
  ImportResponse,
  ImportRowResult,
} from "@/types/import";

export async function POST(req: Request) {
  try {
    const { rows } = (await req.json()) as { rows: BuildingCSVRow[] };

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        { error: "Invalid request: rows must be an array" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Build lookup maps
    const { data: cities } = await supabase.from("cities").select("id, slug");
    const cityMap = new Map(cities?.map((c) => [c.slug, c.id]) || []);

    const { data: neighborhoods } = await supabase
      .from("neighborhoods")
      .select("id, slug, city_id");
    const neighborhoodMap = new Map(
      neighborhoods?.map((n) => [`${n.city_id}:${n.slug}`, n.id]) || []
    );

    const results: ImportRowResult[] = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      try {
        const cityId = cityMap.get(row.city_slug);
        if (!cityId) {
          results.push({
            rowIndex: i + 1,
            success: false,
            error: `City not found: ${row.city_slug}`,
            action: "failed",
          });
          failed++;
          continue;
        }

        const neighborhoodId = row.neighborhood_slug
          ? neighborhoodMap.get(`${cityId}:${row.neighborhood_slug}`)
          : null;

        // Check if building exists by name and city
        const { data: existing } = await supabase
          .from("buildings")
          .select("id")
          .eq("name", row.name)
          .eq("city_id", cityId)
          .maybeSingle();

        const buildingData = {
          name: row.name,
          address_1: row.address_1,
          address_2: row.address_2 || null,
          zip: row.zip || null,
          city_id: cityId,
          neighborhood_id: neighborhoodId || null,
          year_built: row.year_built || null,
          stories: row.stories || null,
          description: row.description || null,
          website_url: row.website_url || null,
          leasing_phone: row.leasing_phone || null,
          leasing_email: row.leasing_email || null,
          pet_policy: row.pet_policy || null,
          parking_policy: row.parking_policy || null,
          status: row.status || "active",
        };

        if (existing) {
          // Update existing building
          const { error } = await supabase
            .from("buildings")
            .update(buildingData)
            .eq("id", existing.id);

          if (error) throw error;
          results.push({
            rowIndex: i + 1,
            success: true,
            building_id: existing.id,
            action: "updated",
          });
          updated++;
        } else {
          // Create new building
          const { data: newBuilding, error } = await supabase
            .from("buildings")
            .insert(buildingData)
            .select("id")
            .single();

          if (error) throw error;
          results.push({
            rowIndex: i + 1,
            success: true,
            building_id: newBuilding!.id,
            action: "created",
          });
          created++;
        }
      } catch (err) {
        results.push({
          rowIndex: i + 1,
          success: false,
          error: String(err),
          action: "failed",
        });
        failed++;
      }
    }

    const response: ImportResponse = {
      success: failed === 0,
      total: rows.length,
      created,
      updated,
      failed,
      results,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
