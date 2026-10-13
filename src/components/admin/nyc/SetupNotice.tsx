import { AlertCircle } from "lucide-react";

/**
 * Shown when the NYC tables cannot be read, which before migration 034 is
 * applied is every time. Says so instead of crashing the page.
 */
export function SetupNotice({ detail }: { detail: string }) {
  const missing = /crm_|schema cache|does not exist|PGRST20[25]|42P01|42883/i.test(detail);
  return (
    <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm text-amber-100">
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {missing ? "NYC Contacts is not set up in the database yet" : "Could not load NYC Contacts"}
      </p>
      <p className="mt-2 text-amber-100/80">
        {missing
          ? "Apply supabase/migrations/034_nyc_crm.sql (supabase db push --linked), then reload."
          : detail}
      </p>
    </div>
  );
}
