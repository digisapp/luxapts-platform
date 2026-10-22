import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMiamiDate, formatMiamiDateTime } from "@/lib/admin/time";
import {
  AI_REPORT_WEEKS,
  CRAWLER_REPORT_DAYS,
  isAiSource,
  loadAiSearchReport,
} from "@/lib/analytics/ai-search";
import { CRAWLER_NOTES } from "@/lib/analytics/crawlers";
import { referralLabel } from "@/lib/analytics/referral";
import { statusMeta } from "@/components/admin/leads/lead-format";

export const dynamic = "force-dynamic";

// Data access outside the component so Date.now() isn't impure render work.
async function loadReport() {
  const now = Date.now();
  return loadAiSearchReport(createAdminClient(), now);
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{value.toLocaleString()}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function AiSearchPage() {
  const report = await loadReport();

  const aiSessions = report.weeks.reduce((n, w) => n + w.ai, 0);
  const aiLeads = report.leads.filter((l) => isAiSource(l.referral_source)).length;
  const chatgptUser30d = report.crawlers.find((c) => c.bot === "ChatGPT-User")?.hits30d ?? 0;
  const maxWeek = Math.max(1, ...report.weeks.map((w) => w.ai));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">AI Search</h1>
        <p className="text-muted-foreground">
          Visitors and leads that ChatGPT and other AI assistants send to staycio.com, and how often their
          crawlers read the site. Microsites are not included.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label={`Visits from AI assistants · ${AI_REPORT_WEEKS} weeks`}
          value={aiSessions}
          hint="ChatGPT tags its links with utm_source=chatgpt.com"
        />
        <Stat label={`Leads from AI assistants · ${AI_REPORT_WEEKS} weeks`} value={aiLeads} hint="Recorded since Oct 22, 2026" />
        <Stat
          label={`Pages ChatGPT opened for someone · ${CRAWLER_REPORT_DAYS} days`}
          value={chatgptUser30d}
          hint="ChatGPT-User requests, counted since Oct 22, 2026"
        />
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle as="h2" className="text-lg">AI assistant visits per week</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          <ul className="space-y-2 text-sm">
            {report.weeks.map((w) => (
              <li key={w.week} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
                <span className="text-muted-foreground">{formatMiamiDate(`${w.week}T12:00:00Z`)}</span>
                <span className="h-2.5 rounded-full bg-white/[0.06]" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-cyan-400"
                    style={{ width: `${(w.ai / maxWeek) * 100}%` }}
                  />
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  {w.ai}
                  <span className="text-muted-foreground"> · search {w.search} · all {w.total}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Weeks start Monday. &ldquo;search&rdquo; is Google, Bing, DuckDuckGo, Yahoo and Brave; &ldquo;all&rdquo;
            includes direct visits and scanners.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle as="h2" className="text-lg">Pages AI assistants sent people to</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            {report.aiLandingPages.length ? (
              <ul className="divide-y divide-white/[0.06] text-sm">
                {report.aiLandingPages.map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-3 py-2">
                    <Link href={p.path} className="min-w-0 truncate font-mono text-xs hover:underline">
                      {p.path}
                    </Link>
                    <span className="shrink-0 tabular-nums">{p.sessions}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No AI assistant visits in this window.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle as="h2" className="text-lg">All visits by source · {AI_REPORT_WEEKS} weeks</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 text-right font-medium">Visits</th>
                  <th className="py-2 text-right font-medium" title="Visits that viewed more than one page">
                    2+ pages
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.sourceTotals.map((s) => (
                  <tr key={s.source} className="border-b border-white/[0.04] last:border-0">
                    <td className={isAiSource(s.source) ? "py-2 pr-3 font-medium text-cyan-200" : "py-2 pr-3"}>
                      {referralLabel(s.source)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{s.sessions}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{s.engaged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle as="h2" className="text-lg">Leads with a known source · {AI_REPORT_WEEKS} weeks</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
          {report.leads.length ? (
            <ul className="divide-y divide-white/[0.06] text-sm">
              {report.leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <Link href={`/admin/leads/${l.id}`} className="font-medium hover:underline">
                    {l.name || "Unnamed lead"}
                  </Link>
                  <span className={isAiSource(l.referral_source) ? "text-cyan-200" : "text-muted-foreground"}>
                    via {referralLabel(l.referral_source)}
                  </span>
                  <span className={statusMeta(l.status).text}>{statusMeta(l.status).label}</span>
                  {l.landing_page && (
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{l.landing_page}</span>
                  )}
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                    {formatMiamiDateTime(l.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No leads with a recorded source yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle as="h2" className="text-lg">Crawler visits · {CRAWLER_REPORT_DAYS} days</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            {report.crawlers.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Crawler</th>
                    <th className="py-2 pr-3 text-right font-medium">7 days</th>
                    <th className="py-2 pr-3 text-right font-medium">{CRAWLER_REPORT_DAYS} days</th>
                    <th className="hidden py-2 text-right font-medium sm:table-cell">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {report.crawlers.map((c) => (
                    <tr key={c.bot} className="border-b border-white/[0.04] last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{c.bot}</span>
                        {CRAWLER_NOTES[c.bot] && (
                          <span className="block text-xs text-muted-foreground">{CRAWLER_NOTES[c.bot]}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.hits7d.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{c.hits30d.toLocaleString()}</td>
                      <td className="hidden whitespace-nowrap py-2 text-right text-xs text-muted-foreground sm:table-cell">
                        {formatMiamiDateTime(c.lastSeen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No crawler visits recorded yet. Counting started Oct 22, 2026.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle as="h2" className="text-lg">Pages ChatGPT opened while answering</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
            {report.chatgptUserPages.length ? (
              <ul className="divide-y divide-white/[0.06] text-sm">
                {report.chatgptUserPages.map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-3 py-2">
                    <Link href={p.path} className="min-w-0 truncate font-mono text-xs hover:underline">
                      {p.path}
                    </Link>
                    <span className="shrink-0 tabular-nums">{p.hits}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None yet in the last {CRAWLER_REPORT_DAYS} days.</p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Each one is ChatGPT reading the page to answer someone&apos;s question, whether or not they clicked through.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
