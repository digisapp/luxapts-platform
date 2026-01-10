import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

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
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    // Then get neighborhoods
    const { data, error } = await supabase
      .from("neighborhoods")
      .select("id, name, slug, center_lat, center_lng")
      .eq("city_id", cityRes.data.id)
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      city: cityRes.data,
      neighborhoods: data,
    });
  } catch (error) {
    console.error("List neighborhoods error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
