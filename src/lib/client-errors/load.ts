// Reads stored browser error reports for /admin/errors and the daily digest.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/db-helpers";
import type { ClientErrorRow } from "./group";

export async function loadClientErrorRows(
  supabase: SupabaseClient,
  sinceIso: string
): Promise<{ rows: ClientErrorRow[]; error: string | null }> {
  // Property mutation, not reassignment: react-hooks/immutability forbids
  // reassigning a captured binding inside an async callback.
  const failure: { message: string | null } = { message: null };
  const rows = await fetchAllRows<ClientErrorRow>(async (from, to) => {
    const res = await supabase
      .from("analytics_events")
      .select("session_id, created_at, properties")
      .eq("event_name", "client_error")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (res.error) failure.message = res.error.message ?? "Unknown error";
    return res as unknown as { data: ClientErrorRow[] | null; error: unknown };
  });
  return { rows, error: failure.message };
}
