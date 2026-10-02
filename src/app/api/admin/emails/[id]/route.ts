import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "@/lib/admin/auth";
import { apiError } from "@/lib/api-helpers";

/**
 * GET /api/admin/emails/[id]
 * Fetch a single email + full thread. Marks as read on open.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { data: email, error } = await supabase
      .from("emails")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !email) {
      return apiError("Email not found", 404);
    }

    // Fetch the full thread
    const { data: thread } = await supabase
      .from("emails")
      .select("*")
      .eq("thread_id", email.thread_id)
      .order("created_at", { ascending: true });

    // Mark as read if inbound + status is 'received'
    if (email.direction === "inbound" && email.status === "received") {
      await supabase
        .from("emails")
        .update({
          status: "read",
          read_at: new Date().toISOString(),
        })
        .eq("id", id);
    }

    return NextResponse.json({ email, thread: thread || [] });
  } catch (error) {
    console.error("Get email error:", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * PATCH /api/admin/emails/[id]
 * Update email: toggle starred, mark read/unread
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { id } = await params;
    const body = await req.json();
    const supabase = createAdminClient();
    const updates: Record<string, unknown> = {};

    if (typeof body.is_starred === "boolean") {
      updates.is_starred = body.is_starred;
    }

    if (typeof body.is_read === "boolean") {
      if (body.is_read) {
        // Mark as read — only advance status forward
        const { data: current } = await supabase
          .from("emails")
          .select("status")
          .eq("id", id)
          .single();
        if (current?.status === "received") {
          updates.status = "read";
          updates.read_at = new Date().toISOString();
        }
      } else {
        // Mark as unread
        updates.status = "received";
        updates.read_at = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return apiError("No valid updates provided");
    }
    const { data: email, error } = await supabase
      .from("emails")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return apiError("Failed to update email", 500);
    }

    return NextResponse.json({ email });
  } catch (error) {
    console.error("Update email error:", error);
    return apiError("Internal server error", 500);
  }
}

/**
 * DELETE /api/admin/emails/[id]
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
      return apiError(auth.error, auth.status);
    }

    const { id } = await params;
    const supabase = createAdminClient();

    const { error } = await supabase.from("emails").delete().eq("id", id);

    if (error) {
      return apiError("Failed to delete email", 500);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete email error:", error);
    return apiError("Internal server error", 500);
  }
}
