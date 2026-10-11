import { createAdminClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/seo/urls";

export interface ChatBuilding {
  id: string;
  name: string;
}

/**
 * The building a chat was opened on. The widget sends the /buildings/<segment>
 * it sits on, which is the slug since migration 026 (old links still carry the
 * UUID). Unknown, inactive or unreadable means no building context, never an
 * error: the chat works either way. Never throws.
 */
export async function resolveChatBuilding(ref: string | null | undefined): Promise<ChatBuilding | null> {
  if (!ref) return null;
  try {
    const uuid = isUuid(ref);
    const { data } = await createAdminClient()
      .from("buildings")
      .select("id, name")
      .eq(uuid ? "id" : "slug", uuid ? ref : ref.toLowerCase())
      .eq("status", "active")
      .maybeSingle();
    if (!data?.id) return null;
    // The name goes into the system prompt: one line, bounded.
    const name = String(data.name ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 120);
    return { id: data.id as string, name };
  } catch (err) {
    console.error("Chat building lookup failed:", err);
    return null;
  }
}
