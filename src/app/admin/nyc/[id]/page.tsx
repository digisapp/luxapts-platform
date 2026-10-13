import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { getContactBundle, getFacets } from "@/lib/crm/service";
import { nyDateKey } from "@/lib/crm/dates";
import { ContactView } from "@/components/admin/nyc/ContactView";
import { SetupNotice } from "@/components/admin/nyc/SetupNotice";
import { readReach, readWork } from "@/components/admin/nyc/work";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NycContactPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  if (!isValidUUID(id)) notFound();
  const raw = await searchParams;
  const sp = { get: (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : null) };

  const supabase = createAdminClient();
  let bundle, facets;
  try {
    [bundle, facets] = await Promise.all([getContactBundle(supabase, id), getFacets(supabase)]);
  } catch (err) {
    console.error("NYC contact page error:", err);
    return <SetupNotice detail={err instanceof Error ? err.message : String(err)} />;
  }
  if (!bundle) notFound();

  return (
    // Keyed so "Next" mounts a fresh view instead of carrying state over.
    <ContactView
      key={id}
      initial={bundle}
      facets={facets}
      today={nyDateKey()}
      work={readWork(sp)}
      reach={readReach(sp)}
    />
  );
}
