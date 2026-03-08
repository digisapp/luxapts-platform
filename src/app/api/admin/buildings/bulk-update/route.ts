import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";

interface BulkUpdateItem {
  id: string;
  leasing_phone?: string;
  leasing_email?: string;
  website_url?: string;
  description?: string;
  pet_policy?: string;
  parking_policy?: string;
  deposit_policy?: string;
  [key: string]: string | undefined;
}

export async function POST(req: Request) {
  const authResult = await checkAdminAuth();
  if (!authResult.isAdmin) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const body = await req.json();
  const { updates } = body as { updates: BulkUpdateItem[] };

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json(
      { error: "updates array is required" },
      { status: 400 }
    );
  }

  if (updates.length > 100) {
    return NextResponse.json(
      { error: "Maximum 100 updates at a time" },
      { status: 400 }
    );
  }

  const allowedFields = [
    "leasing_phone",
    "leasing_email",
    "website_url",
    "description",
    "pet_policy",
    "parking_policy",
    "deposit_policy",
  ];

  const supabase = createAdminClient();
  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const item of updates) {
    if (!item.id || !isValidUUID(item.id)) {
      results.push({ id: item.id || "unknown", success: false, error: "Invalid ID" });
      continue;
    }

    const fields: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in item) {
        fields[key] = item[key];
      }
    }

    if (Object.keys(fields).length === 0) {
      results.push({ id: item.id, success: false, error: "No valid fields" });
      continue;
    }

    const { error } = await supabase
      .from("buildings")
      .update(fields)
      .eq("id", item.id);

    if (error) {
      results.push({ id: item.id, success: false, error: error.message });
    } else {
      results.push({ id: item.id, success: true });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  return NextResponse.json({
    updated: successCount,
    failed: results.length - successCount,
    results,
  });
}
