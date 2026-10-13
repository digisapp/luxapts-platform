import { createAdminClient } from "@/lib/supabase/server";
import { getSender, getTemplates } from "@/lib/crm/service";
import { nyDateKey } from "@/lib/crm/dates";
import { TemplatesEditor } from "@/components/admin/nyc/TemplatesEditor";
import { SetupNotice } from "@/components/admin/nyc/SetupNotice";

export const dynamic = "force-dynamic";

export default async function NycTemplatesPage() {
  const supabase = createAdminClient();
  let loaded: [Awaited<ReturnType<typeof getTemplates>>, Awaited<ReturnType<typeof getSender>>];
  try {
    loaded = await Promise.all([getTemplates(supabase), getSender(supabase)]);
  } catch (err) {
    console.error("NYC templates page error:", err);
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }
  return <TemplatesEditor initialTemplates={loaded[0]} initialSender={loaded[1]} today={nyDateKey()} />;
}
