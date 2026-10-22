// One-off (2026-10-22): correct buildings whose website pointed somewhere
// else (a landlord homepage, a parked domain, a wedding venue), so they never
// got prices. Researched by hand, each matched on street address:
//   - new website (and the scraper's override) for 15 real rentals; 4 of them
//     renamed, 3 on the wrong street, 3 with the street number as the zip
//   - 6 deactivated: condos, or no such building at the stored address
// Each changed building is queued first for the next unit scrape.
//
// Writes a backup of every touched row to the repo root before changing it.
// Run with: npx tsx scripts/fix-building-websites-2026-10.ts [--apply]

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient } from "@supabase/supabase-js";

interface Fix {
  slug: string;
  url?: string;
  name?: string;
  address_1?: string;
  zip?: string;
  lat?: number;
  lng?: number;
  neighborhood_slug?: string;
  year_built?: number;
  deactivate?: string;
}

const FIXES: Fix[] = [
  // New website, same building
  { slug: "2-cooper-square", url: "https://www.2cooper.com/" }, // own site; enquiry form only, no prices
  { slug: "21-west-street", url: "https://www.21west.com/availabilities" },
  { slug: "london-terrace-gardens", url: "https://www.londonterrace.com/availabilities" },
  { slug: "oskar", url: "https://www.oskarluxuryapartmentsnyc.com/" }, // own site; prices only on StreetEasy
  { slug: "the-brooklyn-tower", url: "https://brooklyntowerrentals.com/availability/" },
  { slug: "chase-knolls", url: "https://www.chaseknollsapts.com/sherman-oaks/chase-knolls-i/conventional/", zip: "91423" },
  { slug: "c-on-pico", url: "https://www.cpicoapts.com/los-angeles/c-on-pico/conventional/", zip: "90064" },
  { slug: "paseo-austin", url: "https://www.paseoatx.com/floorplans/" },
  { slug: "the-travis", url: "https://thetravisatx.com/floorplans/" },
  { slug: "soma-at-brickell", url: "https://www.somabrickell.com/miami/soma-at-brickell/conventional/" },
  // Stored on the wrong street
  {
    slug: "brady",
    url: "https://www.liveatbrady.com/floorplans/",
    address_1: "2728 Cedar Springs Rd",
    zip: "75201",
    lat: 32.8012585,
    lng: -96.8055214,
  },
  {
    slug: "the-sevens",
    url: "https://www.sevensapts.com/tx/dallas/floorplans",
    address_1: "7777 Manderville Ln",
    zip: "75231",
    lat: 32.8871584,
    lng: -96.7653562,
    neighborhood_slug: "north-dallas",
  },
  // Renamed
  { slug: "electra", name: "The Cole", url: "https://www.stonehengenyc.com/buildings/the-cole" },
  // Built 1964 (renovated), not 2024 as imported
  { slug: "1655-peachtree", name: "The Peach", url: "https://www.peachatlantaapartments.com/floorplans/", year_built: 1964 },
  {
    slug: "cortland-north-dallas",
    name: "Oak Row North Dallas",
    url: "https://www.oakrowdallas.com/dallas/oak-row-north-dallas/conventional/",
    zip: "75287",
  },
  {
    slug: "marquis-at-buckhead",
    name: "The Jane",
    url: "https://www.thejaneatlanta.com/atlanta/the-jane/conventional/",
    address_1: "214 Colonial Homes Dr NW",
    zip: "30309",
    lat: 33.8138258,
    lng: -84.3958412,
  },
  // Not a rental, or nothing at the stored address
  { slug: "atelier", deactivate: "condominium; sponsor rentals by phone only" },
  { slug: "vesper-austin", deactivate: "condo tower, units sold" },
  { slug: "pullman-gulch-union", deactivate: "condo, units for sale" },
  { slug: "leksa-at-cityplace", deactivate: "the real Leksa at CityPlace is in Doral, FL; nothing at the Dallas address" },
  { slug: "spanish-village", deactivate: "3232 Sumter Dr is Villas del Zocalo; no Spanish Village in Dallas" },
  { slug: "lookout-austin", deactivate: "only Lookout (RPM) is at 13059 Four Star Blvd 78737, not the stored downtown address" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from("buildings")
    .select("*, building_scrape_status(*)")
    .in("slug", FIXES.map((f) => f.slug));
  if (error) throw error;
  if ((rows ?? []).length !== FIXES.length) {
    const found = new Set((rows ?? []).map((r) => r.slug));
    throw new Error(`Missing buildings: ${FIXES.filter((f) => !found.has(f.slug)).map((f) => f.slug).join(", ")}`);
  }

  const hoodSlugs = FIXES.map((f) => f.neighborhood_slug).filter(Boolean) as string[];
  const { data: hoods } = hoodSlugs.length
    ? await supabase.from("neighborhoods").select("id, slug, city_id").in("slug", hoodSlugs)
    : { data: [] as { id: string; slug: string; city_id: string }[] };

  if (apply) {
    const backup = `building-website-fixes-backup-${Date.now()}.json`;
    writeFileSync(resolve(__dirname, "..", backup), JSON.stringify(rows, null, 2));
    console.log(`Backup of ${rows!.length} rows: ${backup}`);
  }

  for (const fix of FIXES) {
    const row = rows!.find((r) => r.slug === fix.slug)!;
    const update: Record<string, unknown> = {};
    if (fix.deactivate) {
      update.status = "inactive";
    } else {
      if (fix.url) update.website_url = fix.url;
      if (fix.name) update.name = fix.name;
      if (fix.address_1) update.address_1 = fix.address_1;
      if (fix.zip) update.zip = fix.zip;
      if (fix.year_built) update.year_built = fix.year_built;
      if (fix.lat != null && fix.lng != null) {
        update.lat = fix.lat;
        update.lng = fix.lng;
      }
      if (fix.neighborhood_slug) {
        const hood = hoods?.find((h) => h.slug === fix.neighborhood_slug && h.city_id === row.city_id);
        if (!hood) throw new Error(`No neighborhood ${fix.neighborhood_slug} in ${fix.slug}'s city`);
        update.neighborhood_id = hood.id;
      }
    }

    const changes = Object.entries(update)
      .filter(([k, v]) => row[k] !== v)
      .map(([k, v]) => `${k}: ${JSON.stringify(row[k])} -> ${JSON.stringify(v)}`);
    console.log(`${apply ? "write" : "would"}  ${fix.slug}${fix.deactivate ? ` (deactivate: ${fix.deactivate})` : ""}`);
    for (const c of changes) console.log(`         ${c}`);
    if (!apply || changes.length === 0) continue;

    const { error: uErr } = await supabase.from("buildings").update(update).eq("id", row.id);
    if (uErr) throw uErr;

    // The scraper prefers its own stored URL when it names the building;
    // point it at the new site too, and put the building at the front of
    // the next run.
    if (!fix.deactivate) {
      const { error: sErr } = await supabase
        .from("building_scrape_status")
        .update({ website_url: fix.url, units_scraped_at: null })
        .eq("building_id", row.id);
      if (sErr) throw sErr;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
