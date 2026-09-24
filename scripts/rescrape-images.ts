// Scrape photos for active buildings that have none, from each building's own
// website. Buildings with available units go first: they are the live,
// indexable listings currently rendering a placeholder.
//
// Every photo is probed before it is saved (still served, really an image,
// at least 400px wide, not a banner sliver), so nothing here needs a
// follow-up prune.
//
// Runs locally so JS-heavy sites can be rendered with Playwright.
//
// Run with: npx tsx scripts/rescrape-images.ts [--dry-run] [--limit N] [--all]
//   --all       include buildings that already have photos (default: none only)

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const PROBE_CONCURRENCY = 8;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function main() {
  const { scrapeImagesOnly, saveScrapedBuildingImages, saveScrapedUnitImages, updateScrapeStatus, scrapeStatusOf } =
    await import("../src/lib/scraper");
  const { probeImage, isPropertySpecificUrl } = await import("../src/lib/images/quality");

  const dryRun = process.argv.includes("--dry-run");
  const includeAll = process.argv.includes("--all");
  const limit = parseInt(arg("--limit") ?? "1000", 10);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: buildings, error } = await supabase
    .from("buildings")
    .select(
      "id, name, website_url, building_images(id), units(is_available), building_scrape_status(website_url, scrape_enabled)"
    )
    .eq("status", "active");
  if (error || !buildings) throw error ?? new Error("no buildings");

  const targets = buildings
    .map((b) => ({
      ...b,
      available: (b.units ?? []).filter((u: { is_available: boolean }) => u.is_available).length,
      photos: (b.building_images ?? []).length,
      url: (scrapeStatusOf(b)?.website_url as string | null | undefined) || b.website_url,
    }))
    .filter((b) => b.url && (includeAll || b.photos === 0))
    .sort((a, b) => b.available - a.available)
    .slice(0, limit);

  console.log(`${dryRun ? "[dry run] " : ""}Scraping photos for ${targets.length} buildings\n`);

  let withPhotos = 0;
  let saved = 0;

  for (const b of targets) {
    const label = `${b.name} (${b.available} units)`.padEnd(44);

    if (!isPropertySpecificUrl(b.url!, b.name)) {
      console.log(`  SKIP  ${label} ${b.url} is a portfolio page, not this building's site`);
      continue;
    }

    const result = await scrapeImagesOnly(b.url!);
    if (!result.success || !result.data) {
      console.log(`  FAIL  ${label} ${result.error}`);
      if (!dryRun) {
        await updateScrapeStatus(supabase, b.id, { type: "images", success: false, error: result.error });
      }
      continue;
    }

    // Keep only photos that still load and are real photography
    const probed = await mapLimit(result.data.building_images, PROBE_CONCURRENCY, async (img) => ({
      img,
      probe: await probeImage(img.url),
    }));
    const good = probed
      .filter((p) => p.probe.ok)
      .map((p) => ({ ...p.img, width: p.probe.width ?? p.img.width, height: p.probe.height }));
    const rejected = probed.length - good.length;

    if (good.length === 0) {
      console.log(`  MISS  ${label} ${probed.length} candidates, none usable`);
      if (!dryRun) {
        await updateScrapeStatus(supabase, b.id, { type: "images", success: true, imagesFound: 0, websiteUrl: b.url! });
      }
      continue;
    }

    if (dryRun) {
      const hero = good.find((g) => g.is_hero) ?? good[0];
      console.log(`  OK    ${label} ${good.length} photos (${rejected} rejected), hero: ${hero.url}`);
      withPhotos++;
      saved += good.length;
      continue;
    }

    const buildingSaved = await saveScrapedBuildingImages(supabase, b.id, good, {
      source: { websiteUrl: b.url!, buildingName: b.name },
    });
    const unitSaved = await saveScrapedUnitImages(supabase, b.id, result.data.unit_images);
    await updateScrapeStatus(supabase, b.id, {
      type: "images",
      success: true,
      imagesFound: buildingSaved + unitSaved,
      websiteUrl: b.url!,
    });
    if (buildingSaved > 0) withPhotos++;
    saved += buildingSaved;
    console.log(`  OK    ${label} ${buildingSaved} photos saved (${rejected} rejected), ${unitSaved} unit photos`);
  }

  console.log(
    `\nDone: ${withPhotos}/${targets.length} buildings ${dryRun ? "would get" : "got"} photos (${saved} total).`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
