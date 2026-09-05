import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export interface NeighborhoodRow {
  slug: string;
  name: string;
  city_slug: string;
}

// The catalog is ~100 rows and changes rarely; one query per hour is plenty.
export const getNeighborhoodCatalog = unstable_cache(
  async (): Promise<NeighborhoodRow[]> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("neighborhoods")
      .select("slug, name, cities:city_id ( slug )")
      .limit(1000);
    return (data || []).map((n) => {
      const city = Array.isArray(n.cities) ? n.cities[0] : n.cities;
      return { slug: n.slug as string, name: n.name as string, city_slug: (city as { slug?: string } | null)?.slug ?? "" };
    });
  },
  ["parse-query-neighborhoods"],
  { revalidate: 3600 },
);

/**
 * Resolve neighborhood names the model extracted against the real catalog.
 * Prefers matches in the target city; if the only matches live in one other
 * city (e.g. "Williamsburg" while the model said new-york), the city switches
 * to follow the neighborhood — the neighborhood is the more specific signal.
 */
export function resolveNeighborhoods(
  names: string[],
  targetCity: string | undefined,
  catalog: NeighborhoodRow[],
): { slugs: string[]; city_slug?: string } {
  const slugs = new Set<string>();
  let switchedCity: string | undefined;

  for (const raw of names) {
    const full = slugify(raw);
    if (!full) continue;
    // The model sometimes echoes a phrase ("walk-to-downtown", "near-brickell");
    // try the whole term first, then progressively shorter trailing suffixes.
    const words = full.split("-");
    const terms = words.map((_, i) => words.slice(i).join("-"));
    let matches: NeighborhoodRow[] = [];
    for (const term of terms) {
      matches = catalog.filter((n) => {
        const nameSlug = slugify(n.name);
        const headSlug = slugify(n.name.split(",")[0]);
        return n.slug === term || nameSlug === term || headSlug === term || nameSlug.startsWith(`${term}-`);
      });
      if (matches.length) break;
    }
    if (!matches.length) continue;

    const city = switchedCity ?? targetCity;
    const inCity = city ? matches.filter((m) => m.city_slug === city) : [];
    if (inCity.length) {
      inCity.forEach((m) => slugs.add(m.slug));
      continue;
    }
    const cities = [...new Set(matches.map((m) => m.city_slug).filter(Boolean))];
    if (cities.length === 1 && !switchedCity) {
      switchedCity = cities[0];
      matches.forEach((m) => slugs.add(m.slug));
    }
    // Ambiguous across several cities with no city context → skip the term.
  }

  return { slugs: [...slugs], city_slug: switchedCity };
}
