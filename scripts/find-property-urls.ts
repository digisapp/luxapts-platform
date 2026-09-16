// Replace management-company URLs with the property's own page.
//
// Ten Dallas buildings carry `website_url = https://www.greystar.com/`. Every
// scrape of that URL returns Greystar's corporate homepage, so those buildings
// can never get their own photos or unit data. The company's sitemap lists a
// page per property; this matches each building to its page by name and city.
//
// Proposals are conservative: every distinctive word in the building's name
// must appear in the candidate slug, and the city must match when the slug
// names one. Anything ambiguous is reported, not written.
//
// Run with: npx tsx scripts/find-property-urls.ts [--fix]

import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

async function get(url: string, timeoutMs = 30_000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Sitemap URLs a host advertises, following one level of sitemap index. */
async function sitemapUrls(origin: string): Promise<string[]> {
  const robots = await get(`${origin}/robots.txt`);
  const declared = robots
    ? [...robots.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1])
    : [];
  const roots = declared.length ? declared : [`${origin}/sitemap.xml`];

  const out = new Set<string>();
  for (const root of roots.slice(0, 8)) {
    const xml = await get(root, 60_000);
    if (!xml) continue;
    const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
    // A sitemap index points at more sitemaps; follow those one level down.
    if (/<sitemapindex/i.test(xml)) {
      for (const child of locs.slice(0, 15)) {
        const childXml = await get(child, 60_000);
        if (!childXml) continue;
        for (const m of childXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) out.add(m[1]);
      }
    } else {
      for (const l of locs) out.add(l);
    }
  }
  return [...out];
}

const STOP = new Set([
  "the", "at", "of", "and", "a", "an", "by", "on",
  "apartments", "apartment", "residences", "residence", "apts", "luxury", "living", "rentals",
]);

const tokensOf = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && t.length >= 3 && !STOP.has(t));

/** Sections that are never a property page, however well the words line up. */
const NON_PROPERTY_PATH =
  /\/(blog|news|press|tag|tags|category|categories|author|archive|search|careers|jobs|about|contact|privacy|terms|sitemap|feed|events|team|faq)(\/|$)/i;

function scoreCandidate(url: string, name: string, citySlug: string | null): number | null {
  if (NON_PROPERTY_PATH.test(url)) return null;
  const slug = url.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const tokens = tokensOf(name);
  if (!tokens.length) return null;
  // Every distinctive word has to be present — a partial match picks the wrong
  // building out of a portfolio of hundreds.
  if (!tokens.every((t) => slug.includes(t))) return null;
  if (citySlug && /[a-z]{3,}-[a-z]{2}(\/|$)/.test(url) && !slug.includes(citySlug.replace(/-/g, " "))) return null;
  // Prefer the shortest matching URL: the property page, not a sub-page of it.
  return url.length;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { isPropertySpecificUrl } = await import("../src/lib/images/quality");

  const [{ data: buildings }, { data: cities }] = await Promise.all([
    supabase.from("buildings").select("id, name, website_url, city_id").eq("status", "active").not("website_url", "is", null),
    supabase.from("cities").select("id, slug"),
  ]);
  const citySlug = new Map((cities ?? []).map((c) => [c.id, c.slug as string]));

  const stranded = (buildings ?? []).filter((b) => !isPropertySpecificUrl(b.website_url!, b.name));

  const byHost = new Map<string, typeof stranded>();
  for (const b of stranded) {
    const h = new URL(b.website_url!).origin;
    byHost.set(h, [...(byHost.get(h) ?? []), b]);
  }

  console.log(`${stranded.length} buildings on ${byHost.size} management sites\n`);

  const found: { id: string; name: string; from: string; to: string }[] = [];
  const missed: { name: string; host: string }[] = [];

  for (const [origin, group] of byHost) {
    const urls = await sitemapUrls(origin);
    console.log(`${origin} — ${urls.length} URLs in sitemap`);
    for (const b of group) {
      const scored = urls
        .map((u) => ({ u, s: scoreCandidate(u, b.name, citySlug.get(b.city_id ?? "") ?? null) }))
        .filter((x): x is { u: string; s: number } => x.s !== null)
        .sort((a, c) => a.s - c.s);
      if (!scored.length) {
        missed.push({ name: b.name, host: origin });
        console.log(`   ?  ${b.name}`);
        continue;
      }
      found.push({ id: b.id, name: b.name, from: b.website_url!, to: scored[0].u });
      console.log(`   ✓  ${b.name.padEnd(30)} -> ${scored[0].u}`);
    }
    console.log();
  }

  console.log(`Matched ${found.length}, unresolved ${missed.length}`);
  for (const m of missed) console.log(`  unresolved: ${m.name} (${m.host})`);

  if (!fix) {
    console.log("\nDry run. Re-run with --fix to write these URLs.");
    return;
  }

  for (const f of found) {
    const { error } = await supabase.from("buildings").update({ website_url: f.to }).eq("id", f.id);
    if (error) console.error(`  ${f.name}: ${error.message}`);
    // Let the scraper revisit: clear the image-scrape watermark for this building.
    await supabase
      .from("building_scrape_status")
      .update({ images_scraped_at: null, images_scrape_success: null, website_url: f.to })
      .eq("building_id", f.id);
  }
  console.log(`\nUpdated ${found.length} website URLs and queued them for re-scraping.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
