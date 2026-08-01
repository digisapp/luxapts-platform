/**
 * Helpers for working with Supabase relation types.
 *
 * Supabase returns joined relations as T | T[] | null depending on the
 * relationship cardinality. These helpers eliminate the repeated
 * `Array.isArray(x) ? x[0] : x` pattern used across the codebase.
 */

/** Extract the first item from a Supabase relation (handles T | T[] | null). */
export function getFirstRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (relation == null) return null;
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

/**
 * Count occurrences of a property value across an array of items.
 * Returns a Record mapping each value to its count, plus a sorted top-N list.
 *
 * Replaces the repeated pattern:
 *   const counts: Record<string, number> = {};
 *   items.forEach(i => { counts[i.key] = (counts[i.key] || 0) + 1; });
 *   const top = Object.entries(counts).sort(...).slice(0, limit).map(...)
 */
/**
 * Fetch every row of a query that would otherwise be silently truncated at
 * Supabase's 1000-row response cap, by paging with .range().
 *
 * The caller builds the query per page and MUST apply a deterministic order
 * (e.g. .order("id")) so pages don't overlap or skip rows:
 *
 *   const units = await fetchAllRows((from, to) =>
 *     supabase.from("units").select("id, building_id")
 *       .eq("is_available", true).order("id").range(from, to)
 *   );
 */
export async function fetchAllRows<T>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  { pageSize = 1000, maxPages = 30 }: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

export function aggregateByProperty<T>(
  items: T[],
  getKey: (item: T) => string | null | undefined,
  limit?: number,
): { counts: Record<string, number>; topIds: string[] } {
  const counts: Record<string, number> = {};

  for (const item of items) {
    const key = getKey(item);
    if (key) {
      counts[key] = (counts[key] || 0) + 1;
    }
  }

  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1]);

  const topIds = (limit ? sorted.slice(0, limit) : sorted).map(([id]) => id);

  return { counts, topIds };
}
