import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { importCityBuildings } from "@/lib/import/city-importer";
import nashvilleListings from "../../../../../data/nashville_listings.json";

const CITY_CONFIG = {
  name: "Nashville",
  slug: "nashville",
  state: "TN",
  center_lat: 36.1627,
  center_lng: -86.7816,
};

export async function POST() {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const supabase = createAdminClient();
    const buildings = (nashvilleListings as { buildings: unknown[] }).buildings;

    const results = await importCityBuildings(supabase, CITY_CONFIG, buildings as never[]);

    return NextResponse.json({
      success: true,
      message: `${CITY_CONFIG.name} buildings imported successfully`,
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
    message: `POST to this endpoint to import ${CITY_CONFIG.name} buildings`,
    buildings_count: (nashvilleListings as { buildings: unknown[] }).buildings.length,
  });
}
