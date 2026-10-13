import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import {
  groupClientErrors,
  summarizeClientErrors,
  type ClientErrorRow,
} from "@/lib/client-errors/group";
import { ClientErrorsView } from "@/components/admin/errors/ClientErrorsView";

export const dynamic = "force-dynamic";

const DAYS = 30;

// Data access lives outside the component so the time window and the
// relative-time baseline don't count as impure render work (react-hooks/purity).
async function loadClientErrors() {
  const supabase = createAdminClient();
  const now = Date.now();
  const since = new Date(now - DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Property mutation, not reassignment: react-hooks/immutability forbids
  // reassigning a captured binding inside an async callback.
  const loadError: { message: string | null } = { message: null };
  const rows = await fetchAllRows<ClientErrorRow>(async (from, to) => {
    const res = await supabase
      .from("analytics_events")
      .select("session_id, created_at, properties")
      .eq("event_name", "client_error")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (res.error) loadError.message = res.error.message ?? "Unknown error";
    return res as unknown as { data: ClientErrorRow[] | null; error: unknown };
  });

  return {
    now,
    groups: groupClientErrors(rows, now),
    summary: summarizeClientErrors(rows, now),
    loadError: loadError.message,
  };
}

export default async function SiteErrorsPage() {
  const { now, groups, summary, loadError } = await loadClientErrors();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Site Errors</h1>
        <p className="text-muted-foreground">
          What broke in visitors&apos; browsers on staycio.com over the last {DAYS} days, grouped by error.
          Open one for its stack trace and the deploy it came from.
        </p>
      </div>
      <ClientErrorsView groups={groups} summary={summary} days={DAYS} loadError={loadError} now={now} />
    </div>
  );
}
