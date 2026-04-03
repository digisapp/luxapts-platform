import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Get the current user's shower record.
 * Returns the shower row or null if the user is not a registered shower.
 */
export async function getShower(): Promise<{
  id: string;
  user_id: string;
  display_name: string;
  status: string;
  tier: string;
  total_showings: number;
  avg_rating: number;
  strike_count: number;
  agreement_accepted: boolean;
} | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("showers")
      .select("id, user_id, display_name, status, tier, total_showings, avg_rating, strike_count, agreement_accepted")
      .eq("user_id", user.id)
      .single();

    return data || null;
  } catch {
    return null;
  }
}

/**
 * Get the current user's shower ID.
 * Returns null if not a shower.
 */
export async function getShowerId(): Promise<string | null> {
  const shower = await getShower();
  return shower?.id || null;
}

/**
 * Check if the current user is an approved shower.
 */
export async function checkShowerAuth(): Promise<
  | { isShower: true; showerId: string; userId: string; tier: string }
  | { isShower: false; error: string; status: number }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { isShower: false, error: "Unauthorized", status: 401 };
    }

    const adminClient = createAdminClient();
    const { data: shower, error: showerError } = await adminClient
      .from("showers")
      .select("id, status, tier")
      .eq("user_id", user.id)
      .single();

    if (showerError || !shower) {
      return { isShower: false, error: "Shower profile not found", status: 404 };
    }

    if (shower.status !== "approved") {
      return {
        isShower: false,
        error: shower.status === "pending"
          ? "Your shower application is pending admin approval"
          : `Your account is ${shower.status}`,
        status: 403,
      };
    }

    return {
      isShower: true,
      showerId: shower.id,
      userId: user.id,
      tier: shower.tier,
    };
  } catch (error) {
    console.error("Shower auth check error:", error);
    return { isShower: false, error: "Authentication failed", status: 500 };
  }
}

/**
 * Check if a shower is certified for a specific building.
 */
export async function isShowerCertifiedForBuilding(
  showerId: string,
  buildingId: string
): Promise<boolean> {
  try {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("shower_certifications")
      .select("id")
      .eq("shower_id", showerId)
      .eq("building_id", buildingId)
      .eq("status", "certified")
      .gt("expires_at", new Date().toISOString())
      .single();

    return !!data;
  } catch {
    return false;
  }
}
