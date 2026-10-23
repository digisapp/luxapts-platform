// Add researched rental buildings, live only once their own website yields a
// current price.
//
// The January 2026 import took names, units and rents from hand-compiled JSON
// and invented thousands of them. Nothing here trusts the input for anything
// but identity (name, address, website): each building is inserted INACTIVE,
// priced by the real unit scraper, and activated only when at least one
// priced unit was saved. Amenities and pet/parking policies come from the
// building's site the same way. Photos: run scripts/rescrape-images.ts after.
//
// Input: a JSON array of {key, name, address, zip, neighborhood,
// new_neighborhood?, year_built?, url} (research proposals).
//
// --pre-leasing: new buildings whose leasing hasn't opened. No price is
// required; each needs a quoted, dated expected_opening and is activated with
// building_facts leasing_status=pre_leasing (the page shows "Pre-leasing" and a
// first-access form until the scraper finds units on its leasing site).
//
// Run with: npx tsx scripts/import-verified-buildings.ts <proposals.json> --city <slug> [--pre-leasing]
//   [--also-dedupe new-york,brooklyn] [--only k1,k2] [--apply]
// --also-dedupe: cities whose buildings also count as duplicates (Brooklyn
// buildings are filed under both "new-york" and "brooklyn").

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { scrapeUnitsOnly, scrapeAmenitiesOnly } from "../src/lib/scraper/fetcher";
import { saveScrapedUnits, saveScrapedAmenities, updateScrapeStatus } from "../src/lib/scraper/db";
import { addressKey } from "../src/lib/address-key";

interface Proposal {
  key: string;
  name: string;
  address: string;
  zip?: string | null;
  neighborhood?: string | null;
  new_neighborhood?: boolean;
  year_built?: number | null;
  url: string | null;
  // --pre-leasing only: a new building whose leasing hasn't opened
  developer?: string | null;
  units_total?: number | null;
  /** The source's own words, e.g. "Leasing begins winter 2026" */
  expected_opening?: string | null;
  opening_checked_at?: string | null;
  opening_source_url?: string | null;
  // --condo only: a condominium tower; rentals come from the MLS feed
  stories?: number | null;
  extra_addresses?: string[] | null;
  pets?: string | null;
  min_lease_term?: string | null;
  short_term_allowed?: boolean | string | null;
  website?: string | null;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const nameKey = (n: string) => slugify(n.replace(/^the\s+/i, "")).replace(/-(apartments|nyc|residences|rentals)$/, "");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function geocode(address: string, city: string, state: string, zip?: string | null) {
  const q = encodeURIComponent(`${address}, ${city}, ${state}${zip ? ` ${zip}` : ""}, USA`);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { "User-Agent": "Staycio/1.0 (apartment rental platform)" },
    });
    const hit = ((await res.json()) as { lat: string; lon: string }[])[0];
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
  } catch {
    return null;
  } finally {
    await sleep(1100); // Nominatim: max 1 request/second
  }
}

async function pricedUnitCount(supabase: SupabaseClient, buildingId: string): Promise<number> {
  const { data: units } = await supabase.from("units").select("id").eq("building_id", buildingId).eq("is_available", true);
  const ids = (units ?? []).map((u) => u.id);
  if (!ids.length) return 0;
  const { data: snaps } = await supabase.from("unit_price_snapshots").select("unit_id").in("unit_id", ids.slice(0, 150));
  return new Set((snaps ?? []).map((s) => s.unit_id)).size;
}

async function main() {
  const file = process.argv[2];
  const citySlug = arg("--city");
  const apply = process.argv.includes("--apply");
  const only = arg("--only")?.split(",");
  const preLeasingMode = process.argv.includes("--pre-leasing");
  // Operating buildings the owner wants listed before their prices are found
  // (no pricing site, or one the scraper can't read): live with "Contact for
  // pricing", noindexed until units are listed (see the building page).
  const allowUnpriced = process.argv.includes("--allow-unpriced");
  // Condominium towers (migration 040): property_type=condo, live without a
  // price, listings from the MLS. No website_url, so the unit scraper never
  // visits them (an association site has no inventory); the official site is
  // kept as a fact.
  const condoMode = process.argv.includes("--condo");
  if (!file || !citySlug) throw new Error("usage: <proposals.json> --city <slug> [--only k1,k2] [--apply]");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: city } = await supabase.from("cities").select("id, name, slug, state").eq("slug", citySlug).single();
  if (!city) throw new Error(`No city ${citySlug}`);

  // Dedupe against every building in the city, active or not: a deactivated
  // fake must not come back under a slightly different name.
  const dedupeSlugs = [citySlug, ...(arg("--also-dedupe")?.split(",") ?? [])];
  const { data: dedupeCities } = await supabase.from("cities").select("id").in("slug", dedupeSlugs);
  const { data: existing } = await supabase
    .from("buildings")
    .select("name, address_1, city_id")
    .in("city_id", (dedupeCities ?? []).map((c) => c.id));
  // Names repeat across cities (Manhattan's Atelier, Williamsburg's Atelier
  // Apartments), so a name only counts in the import city; an address counts
  // in all of them.
  const takenNames = new Set((existing ?? []).filter((b) => b.city_id === city.id).map((b) => nameKey(b.name)));
  const takenAddresses = new Set((existing ?? []).filter((b) => b.address_1).map((b) => addressKey(b.address_1)));

  const { data: hoods } = await supabase.from("neighborhoods").select("id, name, slug").eq("city_id", city.id);
  const hoodList = [...(hoods ?? [])];

  // New York's neighborhoods read "Chelsea, Manhattan" (slug manhattan-chelsea);
  // Brooklyn's are bare ("DUMBO", slug dumbo).
  const hoodName = (n: string) => (citySlug === "new-york" && !n.includes(",") ? `${n}, Manhattan` : n);
  const hoodSlug = (n: string) => (citySlug === "new-york" ? `manhattan-${slugify(n.split(",")[0])}` : slugify(n));

  const proposals = (JSON.parse(readFileSync(file, "utf8")) as Proposal[]).filter((p) => !only || only.includes(p.key));
  const summary = { added_live: 0, added_inactive: 0, skipped: 0 };

  for (const p of proposals) {
    const label = `${p.name} (${p.address})`;
    if (preLeasingMode && !p.expected_opening) {
      console.log(`skip   ${label}: no stated opening date`);
      summary.skipped++;
      continue;
    }
    if (takenNames.has(nameKey(p.name)) || takenAddresses.has(addressKey(p.address))) {
      console.log(`skip   ${label}: already listed (${dedupeSlugs.join(", ")})`);
      summary.skipped++;
      continue;
    }

    const wanted = p.neighborhood ? hoodName(p.neighborhood) : null;
    let hood = wanted
      ? hoodList.find((h) => h.name.toLowerCase() === wanted.toLowerCase() || h.slug === hoodSlug(wanted))
      : undefined;
    if (!apply) {
      console.log(
        `would  ${label} → ${hood ? hood.name : wanted ? `NEW neighborhood "${wanted}"` : "no neighborhood"} · ${
          condoMode ? "condo" : preLeasingMode ? `pre-leasing "${p.expected_opening}"` : p.url
        }`
      );
      continue;
    }

    if (!hood && wanted) {
      const { data: created, error } = await supabase
        .from("neighborhoods")
        .insert({ city_id: city.id, name: wanted, slug: hoodSlug(wanted) })
        .select("id, name, slug")
        .single();
      if (error) throw error;
      hood = created;
      hoodList.push(created);
      console.log(`       new neighborhood ${created.name}`);
    }

    // The postal city, not the site's city record: Manhattan addresses are
    // "New York", and Miami Beach is its own city inside Staycio's Miami.
    const postalCity =
      citySlug === "new-york"
        ? "New York"
        : /miami beach|south beach/i.test(p.neighborhood ?? "")
          ? "Miami Beach"
          : city.name;
    const coords = await geocode(p.address, postalCity, city.state, p.zip);

    const { data: building, error: insErr } = await supabase
      .from("buildings")
      .insert({
        city_id: city.id,
        neighborhood_id: hood?.id ?? null,
        name: p.name,
        address_1: p.address,
        zip: p.zip ?? null,
        year_built: p.year_built ?? null,
        website_url: condoMode ? null : p.url,
        ...(condoMode ? { property_type: "condo", stories: p.stories ?? null, pet_policy: p.pets ?? null } : {}),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        status: "inactive",
      })
      .select("id, slug")
      .single();
    if (insErr) throw insErr;
    takenNames.add(nameKey(p.name));
    takenAddresses.add(addressKey(p.address));

    if (condoMode) {
      const facts = [
        ["developer", p.developer],
        ["total_units", p.units_total],
        ["addresses", p.extra_addresses?.length ? p.extra_addresses : null],
        ["min_lease_term", p.min_lease_term],
        ["short_term_allowed", p.short_term_allowed == null ? null : String(p.short_term_allowed)],
        ["website", p.website],
      ].filter(([, v]) => v != null && v !== "");
      if (facts.length) {
        const { error: factErr } = await supabase.from("building_facts").upsert(
          facts.map(([key, value]) => ({ building_id: building.id, key, value, source: "research" })),
          { onConflict: "building_id,key" }
        );
        if (factErr) throw factErr;
      }
      if (coords) {
        await supabase.from("buildings").update({ status: "active" }).eq("id", building.id);
        summary.added_live++;
        console.log(`LIVE   ${label}: /buildings/${building.slug} condo`);
      } else {
        summary.added_inactive++;
        console.log(`HELD   ${label}: /buildings/${building.slug} left inactive (address not geocoded)`);
      }
      continue;
    }

    if (p.url) {
      await supabase
        .from("building_scrape_status")
        .upsert({ building_id: building.id, website_url: p.url, scrape_enabled: true }, { onConflict: "building_id" });
    }

    if (preLeasingMode) {
      const facts = [
        ["leasing_status", "pre_leasing"],
        ["expected_opening", p.expected_opening],
        ["opening_checked_at", p.opening_checked_at ?? new Date().toISOString().slice(0, 10)],
        ["opening_source_url", p.opening_source_url],
        ["developer", p.developer],
        ["total_units", p.units_total],
      ].filter(([, v]) => v != null && v !== "");
      const { error: factErr } = await supabase.from("building_facts").upsert(
        facts.map(([key, value]) => ({ building_id: building.id, key, value, source: "research" })),
        { onConflict: "building_id,key" }
      );
      if (factErr) throw factErr;

      const amenities = p.url ? await scrapeAmenitiesOnly(p.url).catch(() => null) : null;
      if (amenities?.success && amenities.data?.amenities.length) {
        await saveScrapedAmenities(supabase, building.id, amenities.data.amenities);
      }
      if (coords) {
        await supabase.from("buildings").update({ status: "active" }).eq("id", building.id);
        summary.added_live++;
        console.log(`LIVE   ${label}: /buildings/${building.slug} pre-leasing, ${amenities?.data?.amenities.length ?? 0} amenities`);
      } else {
        summary.added_inactive++;
        console.log(`HELD   ${label}: /buildings/${building.slug} left inactive (address not geocoded)`);
      }
      continue;
    }

    // Units and prices: the real scraper, nothing from the proposal
    if (!p.url && !allowUnpriced) throw new Error(`${label}: no url (required outside --pre-leasing/--allow-unpriced)`);
    const scraped = p.url
      ? await scrapeUnitsOnly(p.url)
      : { success: true, data: undefined, error: undefined };

    // The scraper shares its xAI account with Stacy. Out of credit, every
    // further building would fail anyway and Stacy is about to stop
    // answering: stop the batch here so nothing else draws on the account.
    if (/credits|spending limit/i.test(scraped.error ?? "")) {
      console.error(`STOP   xAI credit/spending limit reached at ${label}: ${scraped.error}`);
      console.log(JSON.stringify({ ...summary, stopped_at: p.key }));
      process.exit(2);
    }
    let priced = 0;
    if (scraped.success && scraped.data && scraped.data.units.length > 0) {
      await saveScrapedUnits(supabase, building.id, scraped.data.units);
      priced = await pricedUnitCount(supabase, building.id);
    }
    if (p.url) {
      await updateScrapeStatus(supabase, building.id, {
        type: "units",
        success: scraped.success,
        error: scraped.error,
        unitsFound: scraped.data?.units.length ?? 0,
      });
    }

    // Amenities and policies from the building's own site
    const amenities = p.url ? await scrapeAmenitiesOnly(p.url).catch(() => null) : null;
    if (amenities?.success && amenities.data) {
      if (amenities.data.amenities.length) await saveScrapedAmenities(supabase, building.id, amenities.data.amenities);
      if (amenities.data.pet_policy || amenities.data.parking_policy) {
        await supabase
          .from("buildings")
          .update({
            pet_policy: amenities.data.pet_policy || undefined,
            parking_policy: amenities.data.parking_policy || undefined,
          })
          .eq("id", building.id);
      }
    }

    if ((priced > 0 || allowUnpriced) && coords) {
      await supabase.from("buildings").update({ status: "active" }).eq("id", building.id);
      summary.added_live++;
      console.log(`LIVE   ${label}: /buildings/${building.slug}, ${priced} priced units, ${amenities?.data?.amenities.length ?? 0} amenities`);
    } else {
      summary.added_inactive++;
      console.log(
        `HELD   ${label}: /buildings/${building.slug} left inactive (${priced} priced units${coords ? "" : ", address not geocoded"})`
      );
    }
  }

  console.log(JSON.stringify(summary));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
