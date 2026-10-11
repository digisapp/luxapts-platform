import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { devRoutesEnabled, notFound } from "@/lib/api-helpers";
import { importCityBuildings } from "@/lib/import/city-importer";
import brooklynListings from "../../../../../data/brooklyn_listings.json";

const CITY_CONFIG = {
  name: "Brooklyn",
  slug: "brooklyn",
  state: "NY",
  center_lat: 40.6782,
  center_lng: -73.9442,
};

export async function POST() {
  // Seeds from the bundled January JSON: writes units whose rents are stamped
  // as captured now (some importers invent them outright) and overwrites live
  // buildings' website_url and status. Disabled in production unless
  // explicitly enabled with ENABLE_DEV_ROUTES=1.
  if (!devRoutesEnabled()) return notFound();

  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const supabase = createAdminClient();
    const buildings = (brooklynListings as { buildings: unknown[] }).buildings;

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
  if (!devRoutesEnabled()) return notFound();

  return NextResponse.json({
    message: `POST to this endpoint to import ${CITY_CONFIG.name} buildings`,
    buildings_count: (brooklynListings as { buildings: unknown[] }).buildings.length,
  });
}
