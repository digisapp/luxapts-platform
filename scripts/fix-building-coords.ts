/**
 * Re-geocodes buildings whose stored coordinates disagree with their
 * neighborhood. Several active buildings sit hundreds of kilometres from where
 * they belong — 555TEN was pinned near Albany, The Dupont near Buffalo — which
 * puts wrong pins on the public map.
 *
 * Uses the US Census geocoder: free, no key, and Mapbox is billing-blocked.
 *
 *   npx tsx scripts/fix-building-coords.ts          # dry run
 *   npx tsx scripts/fix-building-coords.ts --apply  # write
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APPLY = process.argv.includes("--apply");
const OUTLIER_KM = 4;

type Building = {
  id: string;
  name: string;
  address_1: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  status: string;
  neighborhoods: { name: string } | null;
  cities: { name: string; state: string } | null;
};

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function geocode(q: string): Promise<{ lat: number; lng: number; matched: string; zip: string | null } | null> {
  const url =
    "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
    `?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`;
  try {
    const res = await fetch(url);
    const json = (await res.json()) as {
      result?: { addressMatches?: { coordinates: { x: number; y: number }; matchedAddress: string }[] };
    };
    const m = json.result?.addressMatches?.[0];
    if (!m) return null;
    const zip = m.matchedAddress.match(/\b(\d{5})\b\s*$/)?.[1] ?? null;
    return { lat: m.coordinates.y, lng: m.coordinates.x, matched: m.matchedAddress, zip };
  } catch {
    return null;
  }
}

async function main() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/buildings?select=id,name,address_1,zip,lat,lng,status,neighborhoods(name),cities(name,state)&limit=1000`,
    { headers }
  );
  const all = (await res.json()) as Building[];

  // Neighborhood centroid from its own members — no hardcoded boundaries.
  const groups = new Map<string, Building[]>();
  for (const b of all) {
    if (!b.lat || !b.lng || !b.neighborhoods || !b.cities) continue;
    const key = `${b.cities.name}|${b.neighborhoods.name}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }

  const suspects: { b: Building; from: number }[] = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const cLat = median(list.map((x) => Number(x.lat)));
    const cLng = median(list.map((x) => Number(x.lng)));
    for (const b of list) {
      const d = km(Number(b.lat), Number(b.lng), cLat, cLng);
      if (d > OUTLIER_KM) suspects.push({ b, from: d });
    }
  }
  suspects.sort((a, b) => b.from - a.from);

  console.log(`\n${suspects.length} buildings sit >${OUTLIER_KM}km from their neighborhood centroid.`);
  console.log(APPLY ? "Applying fixes.\n" : "Dry run — pass --apply to write.\n");

  let fixed = 0;
  let skipped = 0;

  for (const { b, from } of suspects) {
    const city = b.cities!;
    const q = `${b.address_1}, ${city.name}, ${city.state} ${b.zip ?? ""}`.trim();
    let hit = await geocode(q);
    await new Promise((r) => setTimeout(r, 250)); // be polite to a free service
    if (!hit) {
      // A corrupt zip poisons the lookup; the street + city alone is enough.
      hit = await geocode(`${b.address_1}, ${city.name}, ${city.state}`);
      await new Promise((r) => setTimeout(r, 250));
    }

    if (!hit) {
      console.log(`  ? ${b.name} — no geocode match for "${q}"`);
      skipped++;
      continue;
    }

    // Decide against the geocoder, NOT against the centroid. A neighborhood
    // with few members has its median dragged by the very record being checked
    // — East Village had two buildings, one of them 367km out, so the broken
    // one defined the centroid and its own correct fix looked like a
    // regression. The centroid only finds suspects; Census decides.
    const drift = km(Number(b.lat), Number(b.lng), hit.lat, hit.lng);
    if (drift < 1) {
      console.log(`  · ${b.name} — stored coords agree with the geocoder (${drift.toFixed(1)}km); the neighborhood label is what is wrong`);
      skipped++;
      continue;
    }
    const now = drift;

    const zipNote = hit.zip && hit.zip !== b.zip ? `  zip ${b.zip ?? "-"}→${hit.zip}` : "";
    console.log(
      `  ✓ ${b.name.padEnd(28)} moved ${now.toFixed(1)}km to ${hit.matched}${zipNote}` +
        `  (was ${from.toFixed(0)}km from its neighborhood)`
    );

    if (APPLY) {
      const upd = await fetch(`${SUPABASE_URL}/rest/v1/buildings?id=eq.${b.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(
          hit.zip && hit.zip !== b.zip
            ? { lat: hit.lat, lng: hit.lng, zip: hit.zip }
            : { lat: hit.lat, lng: hit.lng }
        ),
      });
      if (!upd.ok) {
        console.log(`    write failed: ${upd.status}`);
        continue;
      }
    }
    fixed++;
  }

  console.log(`\n${APPLY ? "Fixed" : "Would fix"}: ${fixed} · skipped: ${skipped}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
