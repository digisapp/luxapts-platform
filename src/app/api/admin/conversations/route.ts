import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";
import { safeParseInt } from "@/lib/utils";
import {
  NEEDS_REVIEW_OR,
  PAGE_SIZE,
  isMissingSchemaError,
  parseReviewFilter,
  parseSurface,
  sanitizeSearchTerm,
} from "@/components/admin/conversations/helpers";

const SESSION_COLUMNS = `
  id, created_at, last_message_at, messages_count, resolved, lead_id,
  surface, city_slug, first_question, tool_calls_count, error_count, empty_results_count,
  buildings:building_id (id, name)
`;

/**
 * GET /api/admin/conversations
 * Paged Stacy chat sessions for the admin Chat Log.
 * Query: ?surface=chat|voice&filter=needs_review|converted&q=<search>&page=N
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { searchParams } = req.nextUrl;
    const surface = parseSurface(searchParams.get("surface"));
    const filter = parseReviewFilter(searchParams.get("filter"));
    // Strip PostgREST wildcards and filter-grammar separators before this ever
    // reaches an .ilike() expression.
    const q = sanitizeSearchTerm(searchParams.get("q"));
    const page = safeParseInt(searchParams.get("page"), 1, 1, 100_000);
    const offset = (page - 1) * PAGE_SIZE;

    const supabase = createAdminClient();

    let query = supabase
      .from("chat_sessions")
      .select(SESSION_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (surface) query = query.eq("surface", surface);
    if (filter === "needs_review") query = query.or(NEEDS_REVIEW_OR);
    if (filter === "converted") query = query.not("lead_id", "is", null);
    if (q) query = query.ilike("first_question", `%${q}%`);

    const { data, count, error } = await query;

    if (error) {
      // Migration 025 not applied yet: answer with an empty, flagged payload so
      // the UI can explain itself instead of showing a failure.
      if (isMissingSchemaError(error)) {
        return NextResponse.json({
          sessions: [],
          total: 0,
          page,
          page_size: PAGE_SIZE,
          schema_missing: true,
        });
      }
      console.error("List conversations error:", error);
      return apiError("Failed to load conversations", 500);
    }

    return NextResponse.json({
      sessions: data || [],
      total: count || 0,
      page,
      page_size: PAGE_SIZE,
      schema_missing: false,
    });
  } catch (error) {
    console.error("List conversations error:", error);
    return apiError("Internal server error", 500);
  }
}
