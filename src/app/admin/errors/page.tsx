import { createAdminClient } from "@/lib/supabase/server";
import { loadClientErrorRows } from "@/lib/client-errors/load";
import { groupClientErrors, summarizeClientErrors } from "@/lib/client-errors/group";
import { ClientErrorsView } from "@/components/admin/errors/ClientErrorsView";

export const dynamic = "force-dynamic";

const DAYS = 30;

// Data access lives outside the component so the time window and the
// relative-time baseline don't count as impure render work (react-hooks/purity).
async function loadClientErrors() {
  const supabase = createAdminClient();
  const now = Date.now();
  const since = new Date(now - DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { rows, error } = await loadClientErrorRows(supabase, since);

  return {
    now,
    groups: groupClientErrors(rows, now),
    summary: summarizeClientErrors(rows, now),
    loadError: error,
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
