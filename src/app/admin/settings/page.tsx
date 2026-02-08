import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import {
  Database,
  Building2,
  Users,
  MapPin,
  UserCircle,
  RefreshCw,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = createAdminClient();
  const userClient = await createClient();

  // Fetch all stats in parallel
  const [
    { data: { user } },
    profileRes,
    citiesRes,
    buildingsRes,
    leadsRes,
    agentsRes,
    scrapeStatusRes,
    recentJobRes,
    dbPing,
  ] = await Promise.all([
    userClient.auth.getUser(),
    // We'll get admin profile below after we have the user
    supabase.from("profiles").select("*").limit(0), // placeholder
    supabase.from("cities").select("id", { count: "exact", head: true }),
    supabase.from("buildings").select("id", { count: "exact", head: true }),
    supabase.from("leads").select("id", { count: "exact", head: true }),
    supabase.from("agents").select("user_id", { count: "exact", head: true }),
    supabase
      .from("building_scrape_status")
      .select("building_id, units_scraped_at")
      .order("units_scraped_at", { ascending: true })
      .limit(1),
    supabase
      .from("scrape_jobs")
      .select("id, created_at, status")
      .order("created_at", { ascending: false })
      .limit(1),
    // Quick db connectivity test
    supabase.from("cities").select("id").limit(1),
  ]);

  // Get admin profile
  let adminProfile: { full_name: string | null; role: string; created_at: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role, created_at")
      .eq("id", user.id)
      .single();
    adminProfile = data;
  }

  const dbConnected = !dbPing.error;
  const totalCities = citiesRes.count || 0;
  const totalBuildings = buildingsRes.count || 0;
  const totalLeads = leadsRes.count || 0;
  const totalAgents = agentsRes.count || 0;

  // Scrape freshness
  const oldestScrape = scrapeStatusRes.data?.[0]?.units_scraped_at || null;

  // Count never scraped: buildings without a scrape_status entry
  const { count: buildingsWithScrapeStatus } = await supabase
    .from("building_scrape_status")
    .select("building_id", { count: "exact", head: true });

  const neverScrapedCount = totalBuildings - (buildingsWithScrapeStatus || 0);

  const mostRecentJob = recentJobRes.data?.[0] || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Platform information and configuration</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Platform Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Platform Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Database</span>
              <Badge variant={dbConnected ? "success" : "destructive"}>
                {dbConnected ? "Connected" : "Error"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Cities
              </span>
              <span className="font-medium">{totalCities}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Buildings
              </span>
              <span className="font-medium">{totalBuildings}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Leads
              </span>
              <span className="font-medium">{totalLeads}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <UserCircle className="h-3.5 w-3.5" /> Agents
              </span>
              <span className="font-medium">{totalAgents}</span>
            </div>
          </CardContent>
        </Card>

        {/* Admin Account */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5" />
              Admin Account
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{user?.email || "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Name</span>
              <span className="text-sm font-medium">
                {adminProfile?.full_name || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Role</span>
              <Badge>{adminProfile?.role || "admin"}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Account Created</span>
              <span className="text-sm">
                {adminProfile?.created_at
                  ? formatDate(adminProfile.created_at)
                  : "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Data Freshness */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Data Freshness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Oldest Scrape</p>
                <p className="mt-1 font-medium">
                  {oldestScrape ? formatDate(oldestScrape) : "No scrapes yet"}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Buildings Never Scraped</p>
                <p className="mt-1 font-medium">{neverScrapedCount}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">Most Recent Scrape Job</p>
                <p className="mt-1 font-medium">
                  {mostRecentJob
                    ? `${mostRecentJob.status} — ${formatDate(mostRecentJob.created_at)}`
                    : "No jobs yet"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
