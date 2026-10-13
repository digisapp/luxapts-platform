import { createAdminClient } from "@/lib/supabase/server";
import { filtersFromParams, sortFromParam } from "@/lib/crm/filters";
import { getFacets, listContacts, listContext } from "@/lib/crm/service";
import { RecruitingBook } from "@/components/admin/nyc/RecruitingBook";
import { SetupNotice } from "@/components/admin/nyc/SetupNotice";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NycRecruitingPage({ searchParams }: PageProps) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  // This view is brokers only, whatever the URL says.
  const filters = filtersFromParams(params);
  delete filters.kind;
  const sort = sortFromParam(params.get("sort"), "added");
  const ctx = listContext();
  const supabase = createAdminClient();

  let loaded: [Awaited<ReturnType<typeof listContacts>>, Awaited<ReturnType<typeof getFacets>>];
  try {
    loaded = await Promise.all([listContacts(supabase, { ...filters, kind: "broker" }, sort, 0, ctx), getFacets(supabase)]);
  } catch (err) {
    console.error("NYC recruiting page error:", err);
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }
  return (
    <RecruitingBook
      key={ctx.now.getTime()}
      initialContacts={loaded[0].rows}
      initialTotal={loaded[0].total}
      initialFacets={loaded[1]}
      initialFilters={filters}
      initialSort={sort}
    />
  );
}
