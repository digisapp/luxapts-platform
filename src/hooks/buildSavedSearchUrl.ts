/**
 * Saved-search filters as stored locally and in `saved_searches.query_params`.
 * `neighborhood` is a slug (or several) — the DB copy can hold an array.
 */
export interface SavedSearchFilters {
  city?: string;
  neighborhood?: string | string[];
  bedsMin?: number;
  bedsMax?: number;
  budgetMin?: number;
  budgetMax?: number;
  petFriendly?: boolean;
}

/**
 * Turn saved-search filters into a /search URL.
 *
 * Shared by the favorites and account pages: both used to build this inline
 * and both dropped `petFriendly` and `neighborhood`, so re-running a saved
 * search silently returned different (broader) results than the one saved.
 * /search reads `neighborhood` as comma-separated slugs and `pet_friendly=1`.
 */
export function buildSavedSearchUrl(filters: SavedSearchFilters): string {
  const params = new URLSearchParams();

  if (filters.city) params.set("city", filters.city);

  const neighborhoods = (
    Array.isArray(filters.neighborhood)
      ? filters.neighborhood
      : filters.neighborhood
        ? [filters.neighborhood]
        : []
  )
    .map((slug) => slug.trim())
    .filter(Boolean);
  if (neighborhoods.length > 0) {
    params.set("neighborhood", neighborhoods.join(","));
  }

  if (filters.bedsMin !== undefined) params.set("beds_min", String(filters.bedsMin));
  if (filters.bedsMax !== undefined) params.set("beds_max", String(filters.bedsMax));
  if (filters.budgetMin !== undefined) params.set("budget_min", String(filters.budgetMin));
  if (filters.budgetMax !== undefined) params.set("budget_max", String(filters.budgetMax));
  if (filters.petFriendly) params.set("pet_friendly", "1");

  return `/search?${params.toString()}`;
}
