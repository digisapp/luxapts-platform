import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { importContacts } from "@/lib/crm/service";
import { importBatchSchema } from "@/lib/crm/validation";
import type { ImportContact } from "@/lib/crm/import-map";

// A batch of 250 contacts with full text history is well under a minute,
// but leave room for a slow database.
export const maxDuration = 120;

/**
 * One batch from the importer page, already mapped in the browser
 * (src/lib/crm/import-map.ts). The page sends batches one at a time; see
 * importContacts for why they must not overlap.
 */
export async function POST(req: Request) {
  const auth = await checkAdminAuth();
  if (!auth.isAdmin) return apiError(auth.error, auth.status);

  const parsed = importBatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiError(`Invalid import batch: ${issue?.path.join(".")} ${issue?.message}`);
  }

  try {
    const result = await importContacts(
      createAdminClient(),
      parsed.data.contacts as ImportContact[],
      parsed.data.batch
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("NYC import batch error:", err);
    return apiError(err instanceof Error ? err.message : "Import failed.", 500);
  }
}
