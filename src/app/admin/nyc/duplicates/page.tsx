import { createAdminClient } from "@/lib/supabase/server";
import { getDuplicatePairs } from "@/lib/crm/service";
import { DuplicatesReview } from "@/components/admin/nyc/DuplicatesReview";
import { SetupNotice } from "@/components/admin/nyc/SetupNotice";

export const dynamic = "force-dynamic";

export default async function NycDuplicatesPage() {
  let initial: Awaited<ReturnType<typeof getDuplicatePairs>>;
  try {
    initial = await getDuplicatePairs(createAdminClient(), "high", 0);
  } catch (err) {
    console.error("NYC duplicates page error:", err);
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }
  return <DuplicatesReview initial={initial} />;
}
