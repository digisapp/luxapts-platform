import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("cities")
      .select("id, name, slug, state, country, center_lat, center_lng")
      .order("name");

    if (error) {
      return apiError(error.message, 500);
    }

    return NextResponse.json(
      { cities: data },
      // Public read-only data — let the CDN serve it
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  } catch (error) {
    console.error("List cities error:", error);
    return apiError("Internal server error", 500);
  }
}
