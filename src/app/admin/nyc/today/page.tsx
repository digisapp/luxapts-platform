import { createAdminClient } from "@/lib/supabase/server";
import { getAgenda } from "@/lib/crm/service";
import { nyDateKey } from "@/lib/crm/dates";
import { TodayAgenda } from "@/components/admin/nyc/TodayAgenda";
import { SetupNotice } from "@/components/admin/nyc/SetupNotice";

export const dynamic = "force-dynamic";

export default async function NycTodayPage() {
  const today = nyDateKey();
  let tasks: Awaited<ReturnType<typeof getAgenda>>;
  try {
    tasks = await getAgenda(createAdminClient(), today);
  } catch (err) {
    console.error("NYC agenda page error:", err);
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }
  return <TodayAgenda initialTasks={tasks} today={today} />;
}
