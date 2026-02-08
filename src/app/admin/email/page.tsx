import { createAdminClient } from "@/lib/supabase/server";
import { EmailCampaignsDashboard } from "@/components/admin/email/EmailCampaignsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const supabase = createAdminClient();

  const [campaignsRes, citiesRes, leadsWithEmailRes] = await Promise.all([
    supabase
      .from("email_campaigns")
      .select("id, subject, recipients_count, sent_at")
      .order("sent_at", { ascending: false })
      .limit(50),
    supabase.from("cities").select("id, name").order("name"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("user_email", "is", null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Email Campaigns</h1>
        <p className="text-muted-foreground">
          Send targeted emails to your leads
        </p>
      </div>

      <EmailCampaignsDashboard
        initialCampaigns={campaignsRes.data || []}
        cities={citiesRes.data || []}
        totalLeadsWithEmail={leadsWithEmailRes.count || 0}
      />
    </div>
  );
}
