import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { MICROSITE_DOMAINS } from "@/lib/validations";
import { MICROSITE_BUILDINGS } from "@/lib/microsites";
import { ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

type Stat = {
  domain: string;
  views: number;
  visitors: number;
  leads: number;
  form_starts: number;
  // Added by migration 027. Optional so the page renders (with zeros) until it
  // has been run.
  engaged?: number;
  search_visitors?: number;
};

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

// Data access lives outside the component so time-dependent query bounds
// don't count as impure render work (react-hooks/purity).
async function loadMicrositeData(days: number) {
  const supabase = createAdminClient();
  return Promise.all([
    supabase.rpc("get_microsite_stats", { days_back: days }),
    supabase
      .from("leads")
      .select("id, created_at, name, user_email, notes, status, source_detail")
      .not("source_detail", "is", null)
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("analytics_events")
      .select("event_name, source_domain, properties")
      .not("source_domain", "is", null)
      .gte("created_at", new Date(Date.now() - days * 86400000).toISOString())
      .limit(1000),
  ]);
}

export default async function AdminMicrositesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = Math.min(Math.max(parseInt(params.days || "30", 10) || 30, 1), 365);

  const [statsRes, recentLeadsRes, eventsRes] = await loadMicrositeData(days);

  const statsByDomain = new Map<string, Stat>();
  ((statsRes.data as Stat[] | null) || []).forEach((s) => statsByDomain.set(s.domain, s));

  // Always show every owned domain, even at zero — a site with no traffic is
  // itself the signal worth seeing.
  const rows: Stat[] = MICROSITE_DOMAINS.map(
    (d) =>
      statsByDomain.get(d) ?? {
        domain: d,
        views: 0,
        visitors: 0,
        leads: 0,
        form_starts: 0,
        engaged: 0,
        search_visitors: 0,
      }
  ).sort((a, b) => b.views - a.views);

  const totals = rows.reduce(
    (acc, r) => ({
      views: acc.views + Number(r.views),
      visitors: acc.visitors + Number(r.visitors),
      leads: acc.leads + Number(r.leads),
      form_starts: acc.form_starts + Number(r.form_starts),
      engaged: acc.engaged + Number(r.engaged ?? 0),
      search: acc.search + Number(r.search_visitors ?? 0),
    }),
    { views: 0, visitors: 0, leads: 0, form_starts: 0, engaged: 0, search: 0 }
  );
  const hasEngaged = rows.some((r) => r.engaged !== undefined);

  // The page script logs every .btn click as cta_click, including the form's
  // submit button, so the raw count overstated calls to action by one per
  // submission attempt. Only clicks on a link with an anchor target are a
  // visitor choosing to go to the form.
  const ctaClicks = (eventsRes.data || []).filter((e) => {
    if (e.event_name !== "cta_click") return false;
    const href = (e.properties as { href?: string | null } | null)?.href;
    return typeof href === "string" && href.startsWith("#");
  }).length;
  const staycioClicks = (eventsRes.data || []).filter(
    (e) => e.event_name === "staycio_click"
  ).length;

  const rpcMissing = Boolean(statsRes.error);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Building Microsites</h1>
          <p className="text-sm text-muted-foreground">
            Traffic and conversions across the {MICROSITE_DOMAINS.length} owned building domains.
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Link
              key={d}
              href={`/admin/microsites?days=${d}`}
              className={`rounded-md border px-3 py-1.5 text-sm ${
                d === days ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>

      {rpcMissing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Stats function unavailable — run migration{" "}
          <code>022_microsite_analytics.sql</code>. ({statsRes.error?.message})
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7">
        {[
          { label: "Page views", value: totals.views },
          { label: "Visitors", value: totals.visitors },
          { label: "Engaged", value: totals.engaged },
          { label: "From search", value: totals.search },
          { label: "Form starts", value: totals.form_starts },
          { label: "Leads", value: totals.leads },
          { label: "CTA clicks", value: ctaClicks },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border p-4">
            <div className="text-2xl font-bold">{c.value.toLocaleString()}</div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-3">Site</th>
              <th className="p-3">Views</th>
              <th className="p-3">Visitors</th>
              <th className="p-3" title="Scrolled past half the page, stayed 10s+, clicked a CTA or started the form">
                Engaged
              </th>
              <th className="p-3">From search</th>
              <th className="p-3">Form starts</th>
              <th className="p-3">Leads</th>
              <th className="p-3" title="Leads as a share of engaged sessions">
                Conv. rate
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.domain} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{MICROSITE_BUILDINGS[r.domain] ?? r.domain}</div>
                  <a
                    href={`https://${r.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                  >
                    {r.domain} <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
                <td className="p-3">{Number(r.views).toLocaleString()}</td>
                <td className="p-3">{Number(r.visitors).toLocaleString()}</td>
                <td className="p-3">{Number(r.engaged ?? 0).toLocaleString()}</td>
                <td className="p-3">{Number(r.search_visitors ?? 0).toLocaleString()}</td>
                <td className="p-3">{Number(r.form_starts).toLocaleString()}</td>
                <td className="p-3 font-semibold">{Number(r.leads).toLocaleString()}</td>
                <td className="p-3">
                  {pct(Number(r.leads), Number(hasEngaged ? r.engaged ?? 0 : r.visitors))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Recent microsite leads</h2>
        {recentLeadsRes.data?.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Site</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Detail</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentLeadsRes.data.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="whitespace-nowrap p-3 text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      {MICROSITE_BUILDINGS[l.source_detail as string] ?? l.source_detail}
                    </td>
                    <td className="p-3">{l.name}</td>
                    <td className="p-3">{l.user_email}</td>
                    <td className="max-w-xs truncate p-3 text-muted-foreground">{l.notes}</td>
                    <td className="p-3">{l.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border p-6 text-sm text-muted-foreground">
            No microsite leads yet. Leads appear here the moment someone submits a form on one of
            the building sites.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        &ldquo;Visitors&rdquo; counts every session that loaded the page, and on a new domain most
        of those are scanners with browser user agents. &ldquo;Engaged&rdquo; is the human number:
        sessions that scrolled past half the page, stayed 10 seconds, clicked a CTA or started the
        form. Conversion rate is leads over engaged sessions
        {hasEngaged ? "" : " (falling back to visitors until migration 027 is run)"}.
      </p>
      <p className="text-xs text-muted-foreground">
        Outbound clicks to staycio.com from microsites in this window: {staycioClicks}. Traffic is
        recorded in <code>page_views</code>/<code>analytics_events</code> tagged by{" "}
        <code>source_domain</code>; leads join on <code>leads.source_detail</code>.
      </p>
    </div>
  );
}
