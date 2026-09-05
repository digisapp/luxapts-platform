import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api-helpers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = createAdminClient();

    // First get the city
    const cityRes = await supabase
      .from("cities")
      .select("id, name, slug")
      .eq("slug", slug)
      .single();

    if (cityRes.error || !cityRes.data) {
      return apiError("City not found", 404);
    }

    // Then get neighborhoods
    const { data, error } = await supabase
      .from("neighborhoods")
      .select("id, name, slug, center_lat, center_lng")
      .eq("city_id", cityRes.data.id)
      .order("name");

    if (error) {
      return apiError(error.message, 500);
    }

    return NextResponse.json(
      {
        city: cityRes.data,
        neighborhoods: data,
      },
      // Public read-only data — let the CDN serve it
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  } catch (error) {
    console.error("List neighborhoods error:", error);
    return apiError("Internal server error", 500);
  }
}
