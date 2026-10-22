// Re-scrape buildings that import-verified-buildings.ts left inactive, and
// activate the ones that now yield a priced unit (and have coordinates).
// The regular scrape only visits active buildings, so a held building never
// gets a second look without this.
//
// Run with: npx tsx scripts/recheck-held-buildings.ts <slug> [<slug> …] [--apply]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";
import { scrapeUnitsOnly } from "../src/lib/scraper/fetcher";
import { saveScrapedUnits, updateScrapeStatus } from "../src/lib/scraper/db";

async function main() {
  const apply = process.argv.includes("--apply");
  const slugs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const slug of slugs) {
    const { data: b } = await supabase
      .from("buildings")
      .select("id, name, website_url, status, lat, lng")
      .eq("slug", slug)
      .maybeSingle();
    if (!b?.website_url) {
      console.log(`skip   ${slug}: not found or no website`);
      continue;
    }
    if (b.status === "active") {
      console.log(`skip   ${slug}: already active`);
      continue;
    }

    const scraped = await scrapeUnitsOnly(b.website_url);
    const units = scraped.data?.units ?? [];
    const priced = units.filter((u) => u.rent > 0).length;
    const live = scraped.success && priced > 0 && b.lat != null && b.lng != null;
    console.log(
      `${live ? (apply ? "LIVE " : "would") : "held "}  ${b.name}: ${priced} priced unit(s)${b.lat == null ? ", no coordinates" : ""}${scraped.error ? `, ${scraped.error}` : ""}`
    );
    if (!apply) continue;

    if (units.length) await saveScrapedUnits(supabase, b.id, units);
    await updateScrapeStatus(supabase, b.id, {
      type: "units",
      success: scraped.success,
      error: scraped.error,
      unitsFound: units.length,
    });
    if (live) await supabase.from("buildings").update({ status: "active" }).eq("id", b.id);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
