import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/db-helpers";
import { BED_FACETS, MIN_FACET_BUILDINGS, facetPath } from "@/lib/seo/facets";

export const metadata: Metadata = {
  title: "Search Apartments for Rent — Live Availability | Staycio",
  description:
    "Describe the apartment you want and Stacy searches live listings across New York, Brooklyn, Miami, Los Angeles, Dallas, Austin, Nashville and Atlanta — verified rents, floor plans and availability.",
  alternates: { canonical: "/search" },
  openGraph: {
    title: "Search Apartments for Rent — Live Availability | Staycio",
    description:
      "Describe the apartment you want and Stacy searches live listings with verified rents and availability.",
    url: "/search",
    type: "website",
  },
};

// The directory below is built from live inventory, so the hub can't be static.
export const revalidate = 3600;

/** Cities with inventory, plus the bedroom facets that have enough behind them. */
async function getDirectory() {
  try {
    const supabase = createAdminClient();
    const [citiesRes, buildings, units] = await Promise.all([
      supabase.from("cities").select("id, name, slug, state").order("name"),
      fetchAllRows<{ id: string; city_id: string | null }>((from, to) =>
        supabase
          .from("buildings")
          .select("id, city_id")
          .eq("status", "active")
          .order("id")
          .range(from, to)
      ),
      fetchAllRows<{ building_id: string; beds: number | null }>((from, to) =>
        supabase
          .from("units")
          .select("building_id, beds")
          .eq("is_available", true)
          .order("building_id")
          .range(from, to)
      ),
    ]);

    const cityOfBuilding = new Map(buildings.map((b) => [b.id, b.city_id]));

    const counts = new Map<string, number>();
    for (const b of buildings) {
      if (!b.city_id) continue;
      counts.set(b.city_id, (counts.get(b.city_id) || 0) + 1);
    }

    const facetSets = new Map<string, Set<string>>();
    for (const u of units) {
      const cityId = cityOfBuilding.get(u.building_id);
      if (!cityId) continue;
      const facet = BED_FACETS.find((f) => f.matches(u.beds));
      if (!facet) continue;
      const key = `${cityId}:${facet.slug}`;
      const set = facetSets.get(key) || new Set<string>();
      set.add(u.building_id);
      facetSets.set(key, set);
    }

    return (citiesRes.data || [])
      .filter((c) => (counts.get(c.id) || 0) > 0)
      .sort((a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0))
      .map((c) => ({
        ...c,
        buildings: counts.get(c.id) || 0,
        facets: BED_FACETS.filter(
          (f) => (facetSets.get(`${c.id}:${f.slug}`)?.size || 0) >= MIN_FACET_BUILDINGS
        ),
      }));
  } catch {
    // The directory is supplementary — never fail the search page over it.
    return [];
  }
}

export default async function SearchLayout({ children }: { children: React.ReactNode }) {
  const directory = await getDirectory();

  return (
    <>
      {/* The map is client-only and loads late; warming the Mapbox origins
          during SSR shaves the DNS/TLS handshake off its first tile request. */}
      <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://events.mapbox.com" crossOrigin="anonymous" />
      {/*
        /search renders no heading of its own (the UI opens straight into the
        query box), so the page had no h1 at all. This names the page for
        assistive tech and gives it a document outline without altering the
        search UI.
      */}
      <h1 className="sr-only">
        Search apartments for rent in New York, Brooklyn, Miami, Los Angeles, Dallas, Austin,
        Nashville and Atlanta
      </h1>
      {children}

      {/*
        /search itself is a client component: a crawler gets a JS shell with no
        headings and no links to the catalogue, which made the site's most
        linked-to page a dead end for discovery. This server-rendered directory
        sits below it — invisible to the search UX, but it gives /search an
        outline and a crawlable path into every city, layout and neighborhood
        hub. It is real navigation, not a keyword block: every link goes to a
        page that exists and has inventory behind it.
      */}
      {directory.length > 0 && (
        <nav
          aria-label="Browse apartments by city and layout"
          className="border-t border-border bg-background px-6 py-12"
        >
          <div className="max-w-6xl mx-auto">
            <h2 className="text-lg font-semibold mb-6">Browse apartments for rent</h2>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {directory.map((city) => (
                <div key={city.id}>
                  <h3 className="text-sm font-semibold mb-2">
                    <Link href={`/cities/${city.slug}`} className="hover:text-primary transition-colors">
                      {city.name}, {city.state} apartments
                    </Link>
                  </h3>
                  <p className="text-xs text-muted-foreground mb-2">
                    {city.buildings} building{city.buildings === 1 ? "" : "s"}
                  </p>
                  <ul className="space-y-1">
                    {city.facets.map((f) => (
                      <li key={f.slug}>
                        <Link
                          href={facetPath(city.slug, f.slug)}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          {f.label} in {city.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-4 text-xs text-muted-foreground">
              <Link href="/cities" className="hover:text-primary transition-colors">
                All cities
              </Link>
              <Link href="/neighborhoods" className="hover:text-primary transition-colors">
                All neighborhoods
              </Link>
            </div>
          </div>
        </nav>
      )}
    </>
  );
}
