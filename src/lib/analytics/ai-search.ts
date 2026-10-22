// Data for /admin/ai-search: how much of staycio.com's traffic and leads come
// from AI assistants, and how often their crawlers read the site.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/db-helpers";
import { classifyReferral, type ReferralSource } from "./referral";

const DAY_MS = 86_400_000;
export const AI_REPORT_WEEKS = 8;
export const CRAWLER_REPORT_DAYS = 30;

const AI_SOURCES: ReferralSource[] = ["chatgpt", "perplexity", "claude", "gemini", "copilot"];

export function isAiSource(source: string | null | undefined): boolean {
  return AI_SOURCES.includes(source as ReferralSource);
}

interface SessionRow {
  session_id: string;
  first_seen_at: string;
  utm_source: string | null;
  landing_page: string | null;
  page_views_count: number | null;
}

interface ReferrerRow {
  session_id: string;
  referrer: string | null;
}

interface LeadRow {
  id: string;
  created_at: string;
  name: string | null;
  status: string;
  referral_source: string | null;
  landing_page: string | null;
}

interface CrawlerStatRow {
  bot: string;
  hits_7d: number;
  hits_total: number;
  last_seen: string;
}

interface CrawlerPathRow {
  path: string;
  hits: number;
  last_seen: string;
}

export interface WeekBucket {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  week: string;
  ai: number;
  search: number;
  total: number;
}

export interface AiSearchReport {
  weeks: WeekBucket[];
  sourceTotals: { source: ReferralSource; sessions: number; engaged: number }[];
  aiLandingPages: { path: string; sessions: number }[];
  leads: LeadRow[];
  leadsBySource: { source: string; count: number }[];
  crawlers: { bot: string; hits7d: number; hits30d: number; lastSeen: string }[];
  chatgptUserPages: { path: string; hits: number }[];
}

function weekStart(iso: string): string {
  const d = new Date(iso);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function countBy<T>(items: T[], key: (t: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1);
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

/** Pure aggregation, unit tested. */
export function buildAiSearchReport(
  input: {
    sessions: SessionRow[];
    referrers: ReferrerRow[];
    leads: LeadRow[];
    crawlerStats: CrawlerStatRow[];
    chatgptUserPaths: CrawlerPathRow[];
  },
  now: number
): AiSearchReport {
  const referrersBySession = new Map<string, (string | null)[]>();
  for (const r of input.referrers) {
    const list = referrersBySession.get(r.session_id) ?? [];
    list.push(r.referrer);
    referrersBySession.set(r.session_id, list);
  }

  const classified = input.sessions.map((s) => ({
    ...s,
    source: classifyReferral(s.utm_source, referrersBySession.get(s.session_id) ?? []).source,
  }));

  // Every week in the window, oldest first, including empty ones
  const weeks: WeekBucket[] = [];
  for (let i = AI_REPORT_WEEKS - 1; i >= 0; i--) {
    weeks.push({ week: weekStart(new Date(now - i * 7 * DAY_MS).toISOString()), ai: 0, search: 0, total: 0 });
  }
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  for (const s of classified) {
    const w = byWeek.get(weekStart(s.first_seen_at));
    if (!w) continue;
    w.total++;
    if (isAiSource(s.source)) w.ai++;
    else if (["google", "bing", "duckduckgo", "yahoo", "brave"].includes(s.source)) w.search++;
  }

  const totals = new Map<ReferralSource, { sessions: number; engaged: number }>();
  for (const s of classified) {
    const t = totals.get(s.source) ?? { sessions: 0, engaged: 0 };
    t.sessions++;
    if ((s.page_views_count ?? 1) > 1) t.engaged++;
    totals.set(s.source, t);
  }

  return {
    weeks,
    sourceTotals: [...totals.entries()]
      .map(([source, t]) => ({ source, ...t }))
      .sort((a, b) => b.sessions - a.sessions),
    aiLandingPages: countBy(
      classified.filter((s) => isAiSource(s.source) && s.landing_page),
      (s) => s.landing_page as string
    )
      .slice(0, 15)
      .map(({ key, count }) => ({ path: key, sessions: count })),
    leads: input.leads,
    leadsBySource: countBy(input.leads, (l) => l.referral_source ?? "unknown").map(({ key, count }) => ({
      source: key,
      count,
    })),
    crawlers: input.crawlerStats.map((c) => ({
      bot: c.bot,
      hits7d: Number(c.hits_7d),
      hits30d: Number(c.hits_total),
      lastSeen: c.last_seen,
    })),
    chatgptUserPages: input.chatgptUserPaths.map((p) => ({ path: p.path, hits: Number(p.hits) })),
  };
}

export async function loadAiSearchReport(supabase: SupabaseClient, now: number) {
  const since = new Date(now - AI_REPORT_WEEKS * 7 * DAY_MS).toISOString();
  const [sessions, referrers, leadsRes, statsRes, pathsRes] = await Promise.all([
    fetchAllRows<SessionRow>((from, to) =>
      supabase
        .from("user_sessions")
        .select("session_id, first_seen_at, utm_source, landing_page, page_views_count")
        .gte("first_seen_at", since)
        .order("id")
        .range(from, to)
    ),
    // staycio.com page views only (microsite views carry source_domain)
    fetchAllRows<ReferrerRow>((from, to) =>
      supabase
        .from("page_views")
        .select("session_id, referrer")
        .gte("created_at", since)
        .not("referrer", "is", null)
        .is("source_domain", null)
        .is("duration_ms", null)
        .order("created_at")
        .order("id")
        .range(from, to)
    ),
    supabase
      .from("leads")
      .select("id, created_at, name, status, referral_source, landing_page")
      .not("referral_source", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_crawler_stats", { days_back: CRAWLER_REPORT_DAYS }),
    supabase.rpc("get_crawler_top_paths", {
      p_bot: "ChatGPT-User",
      days_back: CRAWLER_REPORT_DAYS,
      max_rows: 15,
    }),
  ]);

  return buildAiSearchReport(
    {
      sessions,
      referrers,
      leads: (leadsRes.data ?? []) as LeadRow[],
      crawlerStats: (statsRes.data ?? []) as CrawlerStatRow[],
      chatgptUserPaths: (pathsRes.data ?? []) as CrawlerPathRow[],
    },
    now
  );
}
