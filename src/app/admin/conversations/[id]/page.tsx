import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  MapPin,
  MessageCircle,
  Mic,
  SearchX,
  Wrench,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows, getFirstRelation } from "@/lib/db-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, isValidUUID } from "@/lib/utils";
import { DeleteConversationButton } from "@/components/admin/conversations/DeleteConversationButton";
import { MigrationNotice } from "@/components/admin/conversations/MigrationNotice";
import {
  TranscriptMessage,
  type TranscriptMessageRow,
} from "@/components/admin/conversations/TranscriptMessage";
import {
  isMissingSchemaError,
  relativeTime,
} from "@/components/admin/conversations/helpers";

export const dynamic = "force-dynamic";

// NOTE: deliberately no loading.tsx in this route. Three of them were removed
// elsewhere in this codebase because the Suspense boundary they create flushes
// a 200 before notFound() runs, turning a real 404 into a soft-404.

interface SessionDetail {
  id: string;
  created_at: string;
  // Everything below arrives only once migration 025 has been applied, so the
  // row is read with `select("*")` and these stay undefined until then.
  session_key?: string | null;
  surface?: string | null;
  user_id?: string | null;
  city_slug?: string | null;
  first_question?: string | null;
  last_message_at?: string | null;
  messages_count?: number | null;
  tool_calls_count?: number | null;
  error_count?: number | null;
  empty_results_count?: number | null;
  resolved?: boolean | null;
  lead_id?: string | null;
  buildings?: { id: string; name: string } | { id: string; name: string }[] | null;
}

interface TranscriptData {
  nowMs: number;
  session: SessionDetail | null;
  messages: TranscriptMessageRow[];
  /** chat_messages (or its columns) do not exist yet — migration 025 pending. */
  schemaMissing: boolean;
  loadFailed: boolean;
}

/**
 * Data access outside the component: Date.now() inside a server component's
 * render is impure work react-hooks/purity rejects.
 */
async function loadTranscript(id: string): Promise<TranscriptData> {
  const supabase = createAdminClient();
  const nowMs = Date.now();

  // `*` rather than an explicit column list: pre-migration the new columns do
  // not exist, and naming them would turn a missing migration into a 42703
  // instead of a renderable page.
  const sessionRes = await supabase
    .from("chat_sessions")
    .select("*, buildings:building_id (id, name)")
    .eq("id", id)
    .maybeSingle();

  if (sessionRes.error) {
    console.error("Chat transcript session query error:", sessionRes.error);
  }

  const session = (sessionRes.data as SessionDetail | null) ?? null;
  if (!session) {
    return { nowMs, session: null, messages: [], schemaMissing: false, loadFailed: false };
  }

  // A mutable holder, not a captured `let`: react-hooks/immutability forbids
  // reassigning a captured binding from inside an async callback.
  const status: { error: unknown } = { error: null };

  const messages = await fetchAllRows<TranscriptMessageRow>(async (from, to) => {
    const res = await supabase
      .from("chat_messages")
      .select("id, seq, role, content, tool_name, tool_args, result_count, error, created_at")
      .eq("session_id", id)
      .order("seq", { ascending: true })
      .range(from, to);
    if (res.error) status.error = res.error;
    return res as unknown as { data: TranscriptMessageRow[] | null; error: unknown };
  });

  const schemaMissing = isMissingSchemaError(status.error);
  if (status.error && !schemaMissing) {
    console.error("Chat transcript messages query error:", status.error);
  }

  return {
    nowMs,
    session,
    messages,
    schemaMissing,
    loadFailed: Boolean(status.error) && !schemaMissing,
  };
}

/** HH:MM beside the date. Deterministic given the timestamp. */
function clock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 truncate text-sm">{children}</div>
    </div>
  );
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Both 404 paths run before any JSX is returned, so the response status is
  // still ours to set.
  if (!isValidUUID(id)) notFound();

  const { nowMs, session, messages, schemaMissing, loadFailed } = await loadTranscript(id);
  if (!session) notFound();

  const building = getFirstRelation(session.buildings ?? null);
  const errors = session.error_count ?? 0;
  const empties = session.empty_results_count ?? 0;
  const isVoice = session.surface === "voice";
  const needsReview = errors > 0 || empties > 0;
  const lastActivity = session.last_message_at || session.created_at;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/conversations"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Chat Log
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-snug break-words">
              {session.first_question || "Conversation"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(session.created_at)} {clock(session.created_at)}
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              {relativeTime(session.created_at, nowMs)}
            </p>
          </div>
          <DeleteConversationButton sessionId={session.id} />
        </div>
      </div>

      {/* Session metadata */}
      <Card>
        <CardContent className="grid gap-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Surface">
            <Badge variant="outline" className="gap-1 capitalize">
              {isVoice ? <Mic className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
              {session.surface || "chat"}
            </Badge>
          </Meta>

          <Meta label="City">
            {session.city_slug ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                {session.city_slug}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Meta>

          <Meta label="Building">
            {building?.name ? (
              <Link
                href="/admin/buildings"
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                {building.name}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Meta>

          <Meta label="Lead">
            {session.lead_id ? (
              <Link href={`/admin/leads/${session.lead_id}`}>
                <Badge variant="success">Lead created</Badge>
              </Link>
            ) : (
              <span className="text-muted-foreground">No lead</span>
            )}
          </Meta>

          <Meta label="Messages">{session.messages_count ?? messages.length}</Meta>

          <Meta label="Tool calls">
            <span className="inline-flex items-center gap-1">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
              {session.tool_calls_count ?? 0}
            </span>
          </Meta>

          <Meta label="Errors">
            <span className={errors > 0 ? "font-semibold text-red-400" : "text-muted-foreground"}>
              {errors}
            </span>
          </Meta>

          <Meta label="Empty results">
            <span
              className={empties > 0 ? "font-semibold text-amber-300" : "text-muted-foreground"}
            >
              {empties}
            </span>
          </Meta>

          <Meta label="Last activity">
            {formatDate(lastActivity)} {clock(lastActivity)}
          </Meta>

          {session.session_key && <Meta label="Session key">{session.session_key}</Meta>}

          <Meta label="Session ID">
            <span className="text-xs text-muted-foreground">{session.id}</span>
          </Meta>
        </CardContent>
      </Card>

      {needsReview && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <span className="font-medium">Needs review:</span>
          {errors > 0 && (
            <span className="text-muted-foreground">
              {errors} error{errors === 1 ? "" : "s"}
            </span>
          )}
          {empties > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <SearchX className="h-3.5 w-3.5" />
              {empties} search{empties === 1 ? "" : "es"} returned nothing
            </span>
          )}
        </div>
      )}

      {/* Transcript */}
      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
        </CardHeader>
        <CardContent>
          {schemaMissing ? (
            <MigrationNotice detail="The chat_messages table does not exist in this database yet." />
          ) : loadFailed ? (
            <div className="py-10 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-amber-400" />
              <p className="mt-2 text-muted-foreground">
                Could not load this transcript. Check the server logs for details.
              </p>
            </div>
          ) : messages.length === 0 ? (
            <div className="py-10 text-center">
              <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                No messages were stored for this session. Transcripts are only recorded
                for conversations that ran after the chat writer was deployed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <TranscriptMessage key={message.id} message={message} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
