import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error || "Unauthorized", auth.status);
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("email_campaigns")
      .select("id, subject, recipients_count, recipient_filter, sent_at, created_at")
      .order("sent_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("List campaigns error:", error);
      return apiError("Internal server error", 500);
    }

    return NextResponse.json({ campaigns: data || [] });
  } catch (error) {
    console.error("Campaigns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
