import { createAdminClient } from "@/lib/supabase/server";
import { ScrapingDashboard } from "@/components/admin/scraping/ScrapingDashboard";

export const dynamic = "force-dynamic";

export default async function AdminScrapingPage() {
  const supabase = createAdminClient();

  const { data: citiesData } = await supabase
    .from("cities")
    .select("name, slug")
    .order("name");

  const cities = (citiesData || []).map((c) => ({
    name: c.name,
    slug: c.slug,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Scraping</h1>
        <p className="text-muted-foreground">
          Monitor and control building data scraping
        </p>
      </div>

      <ScrapingDashboard cities={cities} />
    </div>
  );
}
