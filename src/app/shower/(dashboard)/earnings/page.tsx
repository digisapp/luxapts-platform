import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getShower } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { DollarSign, Clock, CheckCircle, TrendingUp, Info } from "lucide-react";

export const dynamic = "force-dynamic";

type EarningRow = {
  id: string;
  type: "showing_fee" | "placement_bonus" | "mentorship_bonus" | "adjustment";
  amount: number;
  status: "pending" | "approved" | "paid" | "cancelled";
  description: string | null;
  approved_at: string | null;
  paid_at: string | null;
  estimated_pay_date: string | null;
  monthly_rent: number | null;
  brokerage_commission: number | null;
  created_at: string;
  showing_leads: {
    id: string;
    preferred_date: string;
    buildings: { name: string };
  } | null;
};

const typeLabels: Record<string, string> = {
  showing_fee: "Showing Fee",
  placement_bonus: "Placement Bonus",
  mentorship_bonus: "Mentorship Bonus",
  adjustment: "Adjustment",
};

const statusConfig = {
  pending: { label: "Pending", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "Approved", color: "bg-blue-100 text-blue-700", icon: CheckCircle },
  paid: { label: "Paid", color: "bg-green-100 text-green-700", icon: CheckCircle },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-500", icon: Info },
};

export default async function EarningsPage() {
  const shower = await getShower();
  if (!shower || shower.status !== "approved") redirect("/shower");

  const adminClient = createAdminClient();

  const { data: earnings } = await adminClient
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
    .eq("shower_id", shower.id)
    .order("created_at", { ascending: false });

  const rows = (earnings || []) as unknown as EarningRow[];

  const availableBalance = rows
    .filter((e) => e.status === "approved")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const pendingBalance = rows
    .filter((e) => e.status === "pending")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalPaid = rows
    .filter((e) => e.status === "paid")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const now = new Date();
  const thisMonthEarned = rows
    .filter((e) => {
      const d = new Date(e.created_at);
      return (
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear() &&
        ["approved", "paid"].includes(e.status)
      );
    })
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // Separate available vs pending vs history
  const available = rows.filter((e) => e.status === "approved");
  const pending = rows.filter((e) => e.status === "pending");
  const history = rows.filter((e) => ["paid", "cancelled"].includes(e.status));

  function formatCurrency(n: number) {
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Earnings</h1>
        <p className="text-muted-foreground">Your showing fees and placement bonuses.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(availableBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-50">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{formatCurrency(pendingBalance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{formatCurrency(thisMonthEarned)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-50">
                <CheckCircle className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Paid Out</p>
                <p className="text-2xl font-bold">{formatCurrency(totalPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payout Info */}
      <Card className="border-blue-100 bg-blue-50/40">
        <CardContent className="flex gap-3 pt-4 pb-4 text-sm text-blue-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              <strong>Showing fees</strong> ($150) are released after admin approves your debrief, typically within 5–7 business days.
            </p>
            <p>
              <strong>Placement bonuses</strong> (25% of brokerage commission) are paid after the brokerage receives commission from the building, typically 60–100 days after lease signing.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Available */}
      {available.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Available to Withdraw</h2>
          <div className="rounded-lg border divide-y">
            {available.map((e) => (
              <EarningRow key={e.id} earning={e} formatCurrency={formatCurrency} formatDate={formatDate} />
            ))}
          </div>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Pending</h2>
          <div className="rounded-lg border divide-y">
            {pending.map((e) => (
              <EarningRow key={e.id} earning={e} formatCurrency={formatCurrency} formatDate={formatDate} />
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">History</h2>
          <div className="rounded-lg border divide-y">
            {history.map((e) => (
              <EarningRow key={e.id} earning={e} formatCurrency={formatCurrency} formatDate={formatDate} />
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <DollarSign className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No earnings yet</p>
            <p className="text-sm text-muted-foreground">
              Complete your first showing to start earning. $150 showing fee per approved tour.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EarningRow({
  earning,
  formatCurrency,
  formatDate,
}: {
  earning: EarningRow;
  formatCurrency: (n: number) => string;
  formatDate: (s: string) => string;
}) {
  const config = statusConfig[earning.status];
  const StatusIcon = config.icon;

  const lead = earning.showing_leads;
  const building = lead
    ? (Array.isArray((lead as { buildings?: unknown }).buildings)
        ? (lead as unknown as { buildings: Array<{ name: string }> }).buildings[0]
        : (lead as { buildings: { name: string } }).buildings)
    : null;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{typeLabels[earning.type]}</span>
          <Badge className={`text-xs ${config.color}`}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {config.label}
          </Badge>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          {building && <span>{building.name}</span>}
          {lead && <span>{formatDate(lead.preferred_date)}</span>}
          {earning.status === "pending" && earning.estimated_pay_date && (
            <span className="text-yellow-600">Est. {formatDate(earning.estimated_pay_date)}</span>
          )}
          {earning.status === "paid" && earning.paid_at && (
            <span>Paid {formatDate(earning.paid_at)}</span>
          )}
        </div>
        {earning.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{earning.description}</p>
        )}
      </div>
      <span className={`text-sm font-semibold ml-4 ${earning.status === "cancelled" ? "text-muted-foreground line-through" : "text-green-600"}`}>
        {formatCurrency(Number(earning.amount))}
      </span>
    </div>
  );
}
