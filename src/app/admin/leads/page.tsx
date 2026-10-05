import { createAdminClient } from "@/lib/supabase/server";
import { LeadsCRM } from "@/components/admin/leads/LeadsCRM";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "touring", "applied", "leased", "lost"] as const;

export default async function AdminLeadsPage() {
  const supabase = createAdminClient();

  // Fetch initial data in parallel
  const [leadsRes, agentsRes, ...countResults] = await Promise.all([
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
    // Head counts per status, as /api/leads does: tallying selected rows in
    // JS stopped at PostgREST's 1000-row cap.
    ...STATUSES.map((s) =>
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", s)
    ),
  ]);

  const status_counts: Record<string, number> = {};
  STATUSES.forEach((s, i) => {
    status_counts[s] = countResults[i].count ?? 0;
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
        <h1 className="text-2xl font-bold sm:text-3xl">Leads</h1>
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
