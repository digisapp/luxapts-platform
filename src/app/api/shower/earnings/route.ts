import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";

// GET /api/shower/earnings — get the shower's earnings wallet
export async function GET() {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const adminClient = createAdminClient();

    const { data: earnings, error } = await adminClient
      .from("shower_earnings")
      .select(`
        id, type, amount, status, description,
        approved_at, paid_at, estimated_pay_date,
        monthly_rent, brokerage_commission, created_at,
        showing_leads:showing_lead_id (
          id, preferred_date,
          buildings:building_id (name)
        )
      `)
      .eq("shower_id", auth.showerId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Get earnings error:", error);
      return apiError("Failed to load earnings", 500);
    }

    const rows = earnings || [];

    // Summarize
    const availableBalance = rows
      .filter((e) => e.status === "approved")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const pendingBalance = rows
      .filter((e) => e.status === "pending")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const totalPaid = rows
      .filter((e) => e.status === "paid")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const thisMonthEarned = rows
      .filter((e) => {
        const date = new Date(e.created_at);
        const now = new Date();
        return (
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear() &&
          ["approved", "paid"].includes(e.status)
        );
      })
      .reduce((sum, e) => sum + Number(e.amount), 0);

    return apiSuccess({
      available_balance: availableBalance,
      pending_balance: pendingBalance,
      total_paid: totalPaid,
      this_month_earned: thisMonthEarned,
      earnings: rows,
    });
  } catch (error) {
    console.error("Earnings route error:", error);
    return apiError("Internal server error", 500);
  }
}
