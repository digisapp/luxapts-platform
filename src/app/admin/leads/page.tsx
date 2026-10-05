import { createAdminClient } from "@/lib/supabase/server";
import { LeadsCRM } from "@/components/admin/leads/LeadsCRM";
import { getLeadStats } from "@/lib/leads/stats";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const supabase = createAdminClient();

  // Fetch initial data in parallel
  const [leadsRes, agentsRes, stats] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
        id, created_at, status, name, user_email, user_phone,
        budget_min, budget_max, beds, move_in_date, source, source_detail, notes,
        cities:city_id (name, slug)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(0, 24),
    supabase
      .from("agents")
      .select("user_id, status, profiles!agents_user_id_fkey (full_name)")
      .eq("status", "active"),
    getLeadStats(supabase),
  ]);

  // Map agents to flat shape
  const agents = (agentsRes.data || []).map((a) => {
    const profile = a.profiles as
      | { full_name: string | null }
      | { full_name: string | null }[]
      | null;
    const fullName = Array.isArray(profile)
      ? profile[0]?.full_name
      : profile?.full_name;
    return { user_id: a.user_id, full_name: fullName || null };
  });

  return (
    <LeadsCRM
      initialLeads={leadsRes.data || []}
      initialTotal={leadsRes.count || 0}
      initialStats={stats}
      agents={agents}
    />
  );
}
