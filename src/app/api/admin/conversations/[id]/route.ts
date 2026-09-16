import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { fetchAllRows } from "@/lib/db-helpers";
import { isValidUUID } from "@/lib/utils";
import { isMissingSchemaError } from "@/components/admin/conversations/helpers";

interface MessageRow {
  id: string;
  seq: number;
  role: string;
  content: string | null;
  tool_name: string | null;
  tool_args: unknown;
  result_count: number | null;
  error: string | null;
  created_at: string;
}

/**
 * GET /api/admin/conversations/[id]
 * One session plus its full transcript, in seq order.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return apiError("Invalid conversation ID");
    }

    const supabase = createAdminClient();

    // `*`, not a column list: naming the migration-025 columns would fail with
    // 42703 on a database where the migration has not run.
    const sessionRes = await supabase
      .from("chat_sessions")
      .select("*, buildings:building_id (id, name)")
      .eq("id", id)
      .maybeSingle();

    if (sessionRes.error) {
      console.error("Get conversation error:", sessionRes.error);
      return apiError("Failed to load conversation", 500);
    }
    if (!sessionRes.data) {
      return apiError("Conversation not found", 404);
    }

    // Mutable holder rather than a captured `let`, which react-hooks/immutability
    // forbids reassigning from inside an async callback.
    const status: { error: unknown } = { error: null };

    const messages = await fetchAllRows<MessageRow>(async (from, to) => {
      const res = await supabase
        .from("chat_messages")
        .select("id, seq, role, content, tool_name, tool_args, result_count, error, created_at")
        .eq("session_id", id)
        .order("seq", { ascending: true })
        .range(from, to);
      if (res.error) status.error = res.error;
      return res as unknown as { data: MessageRow[] | null; error: unknown };
    });

    const schemaMissing = isMissingSchemaError(status.error);
    if (status.error && !schemaMissing) {
      console.error("Get conversation messages error:", status.error);
      return apiError("Failed to load transcript", 500);
    }

    return NextResponse.json({
      session: sessionRes.data,
      messages,
      schema_missing: schemaMissing,
    });
  } catch (error) {
    console.error("Get conversation error:", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/conversations/[id]
 * Purge one transcript. Transcripts can hold a renter's name, email and phone
 * number, so deleting a single conversation has to be possible. chat_messages
 * is removed by the FK's ON DELETE CASCADE.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return apiError("Invalid conversation ID");
    }

    const supabase = createAdminClient();
    const { error, count } = await supabase
      .from("chat_sessions")
      .delete({ count: "exact" })
      .eq("id", id);

    if (error) {
      // Never hand a raw Postgres message to the client.
      console.error("Delete conversation error:", error);
      return apiError("Failed to delete conversation", 500);
    }

    if (!count) {
      return apiError("Conversation not found", 404);
    }

    return NextResponse.json({ success: true, deleted: count });
  } catch (error) {
    console.error("Delete conversation error:", error);
    return apiError("Internal server error", 500);
  }
}
