import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Check if the current user is authenticated and has admin role
 * Returns { isAdmin: true, userId } or { isAdmin: false, error }
 */
export async function checkAdminAuth(): Promise<
  | { isAdmin: true; userId: string }
  | { isAdmin: false; error: string; status: number }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { isAdmin: false, error: "Unauthorized", status: 401 };
    }

    // Check if user has admin role in profiles table
    const adminClient = createAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return { isAdmin: false, error: "Profile not found", status: 403 };
    }

    if (profile.role !== "admin") {
      return { isAdmin: false, error: "Admin access required", status: 403 };
    }

    return { isAdmin: true, userId: user.id };
  } catch (error) {
    console.error("Admin auth check error:", error);
    return { isAdmin: false, error: "Authentication failed", status: 500 };
  }
}

/**
 * Get current user's role
 */
export async function getUserRole(): Promise<string | null> {
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

    return profile?.role || null;
  } catch {
    return null;
  }
}
