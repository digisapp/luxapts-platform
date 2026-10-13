import { createAdminClient } from "@/lib/supabase/server";
import { filtersFromParams, sortFromParam } from "@/lib/crm/filters";
import { getOverview, listContacts, listContext } from "@/lib/crm/service";
import { ContactsBook } from "@/components/admin/nyc/ContactsBook";
import { SetupNotice } from "@/components/admin/nyc/SetupNotice";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NycContactsPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  const filters = filtersFromParams(params);
  const sort = sortFromParam(params.get("sort"));
  const ctx = listContext();
  const supabase = createAdminClient();

  let loaded: [Awaited<ReturnType<typeof listContacts>>, Awaited<ReturnType<typeof getOverview>>];
  try {
    loaded = await Promise.all([listContacts(supabase, filters, sort, 0, ctx), getOverview(supabase, ctx)]);
  } catch (err) {
    console.error("NYC contacts page error:", err);
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }
  const [page, overview] = loaded;

  return (
    // Remount on every server render (a tab or "back to list" click), so
    // the view always matches the URL it was rendered for. Filtering in
    // place only rewrites the URL (replaceState) and never re-renders here.
    <ContactsBook
      key={ctx.now.getTime()}
      initialFilters={filters}
      initialSort={sort}
      initialContacts={page.rows}
      initialTotal={page.total}
      initialOverview={overview}
      today={ctx.today}
    />
  );
}
