import type { SupabaseClient } from "@supabase/supabase-js";

export const LEAD_STATUSES = ["new", "contacted", "touring", "applied", "leased", "lost"] as const;

export interface LeadStats {
  status_counts: Record<string, number>;
  /** "new" leads that arrived more than a day ago: nobody has answered them. */
  waiting_count: number;
  /** created_at of the oldest lead still "new", or null when there is none. */
  oldest_new_at: string | null;
}

const DAY_MS = 86_400_000;

/**
 * Pipeline numbers for the admin leads page, shared by its server render and
 * /api/leads so the two can never disagree. Counts are head counts: tallying
 * selected rows in JS stopped at PostgREST's 1000-row cap.
 */
export async function getLeadStats(supabase: SupabaseClient): Promise<LeadStats> {
  const dayAgo = new Date(Date.now() - DAY_MS).toISOString();

  const [waiting, oldest, ...counts] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .lt("created_at", dayAgo),
    supabase
      .from("leads")
      .select("created_at")
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(1),
    ...LEAD_STATUSES.map((s) =>
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", s)
    ),
  ]);

  const status_counts: Record<string, number> = {};
  LEAD_STATUSES.forEach((s, i) => {
    const res = counts[i];
    if (res.error) console.error(`Lead status count error (${s}):`, res.error.message);
    status_counts[s] = res.count ?? 0;
  });
  if (waiting.error) console.error("Lead waiting count error:", waiting.error.message);
  if (oldest.error) console.error("Oldest new lead error:", oldest.error.message);

  return {
    status_counts,
    waiting_count: waiting.count ?? 0,
    oldest_new_at: (oldest.data?.[0]?.created_at as string | undefined) ?? null,
  };
}
