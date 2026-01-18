import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { importCityBuildings } from "@/lib/import/city-importer";
import dallasListings from "../../../../../data/dallas_listings.json";

const CITY_CONFIG = {
  name: "Dallas",
  slug: "dallas",
  state: "TX",
  center_lat: 32.7767,
  center_lng: -96.7970,
};

export async function POST() {
  try {
    const supabase = createAdminClient();
    const buildings = (dallasListings as { buildings: unknown[] }).buildings;

    const results = await importCityBuildings(supabase, CITY_CONFIG, buildings as never[]);

    return NextResponse.json({
      success: true,
      message: `${CITY_CONFIG.name} buildings imported successfully`,
      results,
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "Import failed", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: `POST to this endpoint to import ${CITY_CONFIG.name} buildings`,
    buildings_count: (dallasListings as { buildings: unknown[] }).buildings.length,
  });
}
