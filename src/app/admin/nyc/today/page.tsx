import { createAdminClient } from "@/lib/supabase/server";
import { getAgenda, getTodayStats } from "@/lib/crm/service";
import { startOfMiamiDay } from "@/lib/admin/time";
import { nyDateKey } from "@/lib/crm/dates";
import { TodayAgenda } from "@/components/admin/nyc/TodayAgenda";
import { SetupNotice } from "@/components/admin/nyc/SetupNotice";

export const dynamic = "force-dynamic";

export default async function NycTodayPage() {
  const today = nyDateKey();
  let tasks: Awaited<ReturnType<typeof getAgenda>>;
  let stats: Awaited<ReturnType<typeof getTodayStats>>;
  try {
    const supabase = createAdminClient();
    // New York and Miami share a time zone, so the admin's "start of day" fits.
    [tasks, stats] = await Promise.all([getAgenda(supabase, today), getTodayStats(supabase, startOfMiamiDay())]);
  } catch (err) {
    console.error("NYC agenda page error:", err);
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }
  return <TodayAgenda initialTasks={tasks} today={today} stats={stats} />;
}
