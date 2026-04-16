import { createClient, createAdminClient } from "@/lib/supabase/server";

export interface PartnerProfile {
  user_id: string;
  company_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  created_at: string;
}

/**
 * Get the current user's partner record.
 * Returns null if the user is not a partner.
 */
export async function getPartner(): Promise<PartnerProfile | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("partners")
      .select("user_id, company_name, contact_name, contact_email, contact_phone, status, created_at")
      .eq("user_id", user.id)
      .single();

    return data || null;
  } catch {
    return null;
  }
}

/**
 * Check partner auth for API routes.
 */
export async function checkPartnerAuth(): Promise<
  | { isPartner: true; userId: string }
  | { isPartner: false; error: string; status: number }
> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { isPartner: false, error: "Unauthorized", status: 401 };
    }

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "partner") {
      return { isPartner: false, error: "Partner access required", status: 403 };
    }

    return { isPartner: true, userId: user.id };
  } catch {
    return { isPartner: false, error: "Authentication failed", status: 500 };
  }
}
