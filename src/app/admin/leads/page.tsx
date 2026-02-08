import { createAdminClient } from "@/lib/supabase/server";
import { LeadsCRM } from "@/components/admin/leads/LeadsCRM";

export const dynamic = "force-dynamic";

export default async function AdminLeadsPage() {
  const supabase = createAdminClient();

  // Fetch initial data in parallel
  const [leadsRes, agentsRes, statusCountsRes] = await Promise.all([
    supabase
      .from("leads")
      .select(
        `
        id, created_at, status, name, user_email, user_phone,
        budget_min, budget_max, beds, move_in_date, source, notes,
        cities:city_id (name, slug)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(0, 24),
    supabase
      .from("agents")
      .select("user_id, status, profiles:user_id (full_name)")
      .eq("status", "active"),
    supabase.from("leads").select("status"),
  ]);

  // Aggregate status counts
  const status_counts: Record<string, number> = {
    new: 0,
    contacted: 0,
    touring: 0,
    applied: 0,
    leased: 0,
    lost: 0,
  };
  statusCountsRes.data?.forEach((row) => {
    const s = row.status as string;
    if (s in status_counts) {
      status_counts[s]++;
    }
  });

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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Leads</h1>
        <p className="text-muted-foreground">
          Manage and track all incoming leads
        </p>
      </div>

      <LeadsCRM
        initialLeads={leadsRes.data || []}
        initialTotal={leadsRes.count || 0}
        initialStatusCounts={status_counts}
        agents={agents}
      />
    </div>
  );
}
