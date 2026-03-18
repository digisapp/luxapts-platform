import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Check if the current user is authenticated and has agent role.
 * Returns the agent's user_id on success.
 */
export async function checkAgentAuth(): Promise<
  | { isAgent: true; userId: string }
  | { isAgent: false; error: string; status: number }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { isAgent: false, error: "Unauthorized", status: 401 };
    }

    const adminClient = createAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return { isAgent: false, error: "Profile not found", status: 403 };
    }

    // Allow both agents and admins (admins can view agent portal too)
    if (profile.role !== "agent" && profile.role !== "admin") {
      return { isAgent: false, error: "Agent access required", status: 403 };
    }

    // Verify agent record exists
    const { data: agent } = await adminClient
      .from("agents")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (!agent) {
      return { isAgent: false, error: "Agent profile not found", status: 403 };
    }

    return { isAgent: true, userId: user.id };
  } catch (error) {
    console.error("Agent auth check error:", error);
    return { isAgent: false, error: "Authentication failed", status: 500 };
  }
}

/**
 * Get current user's agent ID if they are an agent.
 * Used in layout-level checks.
 */
export async function getAgentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "agent" && profile.role !== "admin")) {
      return null;
    }

    const { data: agent } = await adminClient
      .from("agents")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    return agent?.user_id || null;
  } catch {
    return null;
  }
}
