import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MessageCircle,
  Mic,
  SearchX,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { getFirstRelation } from "@/lib/db-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, safeParseInt } from "@/lib/utils";
import { ConversationFilters } from "@/components/admin/conversations/ConversationFilters";
import { MigrationNotice } from "@/components/admin/conversations/MigrationNotice";
import {
  NEEDS_REVIEW_OR,
  PAGE_SIZE,
  buildConversationsHref,
  conversionRate,
  isMissingSchemaError,
  parseReviewFilter,
  parseSurface,
  relativeTime,
  sanitizeSearchTerm,
  totalPages,
  type ReviewFilter,
  type Surface,
} from "@/components/admin/conversations/helpers";

export const dynamic = "force-dynamic";

const SESSION_COLUMNS = `
  id, created_at, last_message_at, messages_count, resolved, lead_id,
  surface, city_slug, first_question, tool_calls_count, error_count, empty_results_count,
  buildings:building_id (id, name)
`;

interface SessionRow {
  id: string;
  created_at: string;
  last_message_at: string | null;
  messages_count: number | null;
  resolved: boolean | null;
  lead_id: string | null;
  surface: string | null;
  city_slug: string | null;
  first_question: string | null;
  tool_calls_count: number | null;
  error_count: number | null;
  empty_results_count: number | null;
  buildings: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface ListQuery {
  surface: Surface | null;
  filter: ReviewFilter | null;
  q: string;
  page: number;
}

interface ConversationsData {
  /** Captured once, outside render, and threaded through to relativeTime(). */
  nowMs: number;
  schemaMissing: boolean;
  loadFailed: boolean;
  sessions: SessionRow[];
  filteredTotal: number;
  stats: { total: number; today: number; converted: number; needsReview: number | null };
}

/**
 * All data access lives outside the component: `Date.now()` / `new Date()` for
 * the "today" boundary and the relative-time baseline count as impure render
 * work under react-hooks/purity.
 */
async function loadConversations(params: ListQuery): Promise<ConversationsData> {
  const supabase = createAdminClient();
  const nowMs = Date.now();
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const offset = (params.page - 1) * PAGE_SIZE;

  let listQuery = supabase
    .from("chat_sessions")
    .select(SESSION_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.surface) listQuery = listQuery.eq("surface", params.surface);
  if (params.filter === "needs_review") listQuery = listQuery.or(NEEDS_REVIEW_OR);
  if (params.filter === "converted") listQuery = listQuery.not("lead_id", "is", null);
  if (params.q) listQuery = listQuery.ilike("first_question", `%${params.q}%`);

  // Counts are head queries — never pull rows to count them, PostgREST caps a
  // row fetch at 1000 and the totals would silently freeze.
  const [listRes, totalRes, todayRes, convertedRes, needsReviewRes] = await Promise.all([
    listQuery,
    supabase.from("chat_sessions").select("id", { count: "exact", head: true }),
    supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .not("lead_id", "is", null),
    supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .or(NEEDS_REVIEW_OR),
  ]);

  const schemaMissing =
    isMissingSchemaError(listRes.error) || isMissingSchemaError(needsReviewRes.error);

  if (listRes.error && !schemaMissing) {
    console.error("Chat Log list query error:", listRes.error);
  }

  return {
    nowMs,
    schemaMissing,
    loadFailed: Boolean(listRes.error) && !schemaMissing,
    sessions: (listRes.data || []) as unknown as SessionRow[],
    filteredTotal: listRes.count ?? 0,
    stats: {
      total: totalRes.count ?? 0,
      today: todayRes.count ?? 0,
      converted: convertedRes.count ?? 0,
      needsReview: needsReviewRes.error ? null : needsReviewRes.count ?? 0,
    },
  };
}

/** HH:MM beside the date. Deterministic given the timestamp. */
function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof MessageCircle;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ surface?: string; filter?: string; q?: string; page?: string }>;
}) {
  const raw = await searchParams;
  const params: ListQuery = {
    surface: parseSurface(raw.surface),
    filter: parseReviewFilter(raw.filter),
    q: sanitizeSearchTerm(raw.q),
    page: safeParseInt(raw.page ?? null, 1, 1, 100_000),
  };

  const { nowMs, schemaMissing, loadFailed, sessions, filteredTotal, stats } =
    await loadConversations(params);

  const pageCount = totalPages(filteredTotal);
  const hasFilters = Boolean(params.surface || params.filter || params.q);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Chat Log</h1>
        <p className="text-muted-foreground">
          Every conversation with Stacy — what renters asked, what she searched, and
          where she came up empty.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Sessions" value={String(stats.total)} icon={MessageCircle} />
        <StatCard title="Today" value={String(stats.today)} icon={MessageCircle} />
        <StatCard
          title="Lead Conversion"
          value={`${conversionRate(stats.converted, stats.total)}%`}
          hint={`${stats.converted} of ${stats.total} sessions created a lead`}
          icon={TrendingUp}
        />
        <StatCard
          title="Needs Review"
          value={stats.needsReview === null ? "—" : String(stats.needsReview)}
          hint="Errors or empty search results"
          icon={AlertTriangle}
        />
      </div>

      {schemaMissing ? (
        <MigrationNotice detail="Sessions and transcripts stay empty until the migration runs." />
      ) : (
        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Recent Sessions</CardTitle>
              <p className="text-sm text-muted-foreground">
                {filteredTotal} session{filteredTotal === 1 ? "" : "s"}
                {hasFilters ? " matching filters" : ""}
              </p>
            </div>
            <ConversationFilters
              surface={params.surface}
              filter={params.filter}
              q={params.q}
            />
          </CardHeader>
          <CardContent>
            {loadFailed ? (
              <div className="py-12 text-center">
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
                <p className="mt-2 text-muted-foreground">
                  Could not load sessions. Check the server logs for details.
                </p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-12 text-center">
                <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
                {hasFilters ? (
                  <>
                    <p className="mt-2 text-muted-foreground">
                      No sessions match these filters.
                    </p>
                    <Link
                      href="/admin/conversations"
                      className="mt-2 inline-block text-sm underline underline-offset-4"
                    >
                      Clear filters
                    </Link>
                  </>
                ) : (
                  <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                    No chat sessions yet. Transcripts start appearing here once the chat
                    writer is deployed and migration 025_chat_transcripts.sql has been
                    applied.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => {
                  const building = getFirstRelation(session.buildings);
                  const errors = session.error_count ?? 0;
                  const empties = session.empty_results_count ?? 0;
                  const isVoice = session.surface === "voice";

                  return (
                    <div
                      key={session.id}
                      className="group relative rounded-lg border p-4 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">
                            {relativeTime(session.created_at, nowMs)}
                            <span className="mx-1.5 text-muted-foreground/40">·</span>
                            {formatDate(session.created_at)} {clock(session.created_at)}
                          </p>

                          {/* Stretched link: the whole card opens the transcript,
                              while the lead badge below stays its own link (an
                              anchor inside an anchor is invalid HTML). */}
                          <Link
                            href={`/admin/conversations/${session.id}`}
                            className="mt-1 block font-medium leading-snug after:absolute after:inset-0 after:content-['']"
                          >
                            <span className="line-clamp-2 break-words">
                              {session.first_question || "Conversation (no opening question recorded)"}
                            </span>
                          </Link>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {building?.name && (
                              <span className="inline-flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {building.name}
                              </span>
                            )}
                            {session.city_slug && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {session.city_slug}
                              </span>
                            )}
                            {(session.tool_calls_count ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Wrench className="h-3 w-3" />
                                {session.tool_calls_count} tool call
                                {session.tool_calls_count === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="relative z-[1] flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="gap-1 capitalize">
                            {isVoice ? (
                              <Mic className="h-3 w-3" />
                            ) : (
                              <MessageCircle className="h-3 w-3" />
                            )}
                            {session.surface || "chat"}
                          </Badge>
                          <Badge variant="outline">
                            {session.messages_count || 0} messages
                          </Badge>
                          {empties > 0 && (
                            <Badge className="gap-1 border-amber-500/40 bg-amber-500/15 text-amber-300">
                              <SearchX className="h-3 w-3" />
                              No results
                            </Badge>
                          )}
                          {errors > 0 && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Error
                            </Badge>
                          )}
                          {session.lead_id && (
                            <Link href={`/admin/leads/${session.lead_id}`}>
                              <Badge variant="success">Lead created</Badge>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {pageCount > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4 text-sm">
                <span className="text-muted-foreground">
                  Page {params.page} of {pageCount}
                </span>
                <div className="flex items-center gap-2">
                  {params.page > 1 ? (
                    <Link
                      href={buildConversationsHref({ ...params, page: params.page - 1 })}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/[0.06]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.04] px-3 py-1.5 text-muted-foreground/40">
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </span>
                  )}
                  {params.page < pageCount ? (
                    <Link
                      href={buildConversationsHref({ ...params, page: params.page + 1 })}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/[0.06]"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-white/[0.04] px-3 py-1.5 text-muted-foreground/40">
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
