/**
 * Collapse unit-level search results into one entry per building.
 *
 * The search API returns one row per available unit, so a building with nine
 * matching units filled the first screen with nine near-identical cards (same
 * photo, same name, different unit number). Grouping keeps the API's sort
 * order: a building sits where its first unit ranked, so "price low to high"
 * orders buildings by their cheapest match.
 */

export interface GroupableResult {
  building: { id: string };
  unit: {
    beds: number | null;
    sqft: number | null;
    available_on: string | null;
  };
  pricing: { rent: number; captured_at: string } | null;
  images?: unknown[];
  floorplan?: { layout_image_url?: string | null } | null;
}

export interface BuildingGroup<R extends GroupableResult> {
  building: R["building"];
  /** Units in the order the API ranked them. */
  units: R[];
  /** The unit whose rent the card quotes: the cheapest (fresh, if any) priced unit. */
  lead: R;
  /** First unit that has photos, for the card image. */
  imageUnit: R | undefined;
  minRent: number | null;
  maxRent: number | null;
  bedsMin: number | null;
  bedsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  /** Earliest move-in date across the units (ISO string). */
  earliestAvailable: string | null;
  hasFloorplan: boolean;
}

/**
 * `isFresh` decides which prices the card may lead with: when a building has
 * any freshly verified unit, "From $X" and the rent range come only from
 * those — otherwise a months-old capture undercut the real asking rents (29
 * Wyn led with a $2,100 April price over twelve units verified at $2,369+).
 * Buildings with no fresh price fall back to what they have.
 */
export function groupByBuilding<R extends GroupableResult>(
  results: R[],
  isFresh: (capturedAt: string) => boolean = () => true
): BuildingGroup<R>[] {
  const order: string[] = [];
  const byId = new Map<string, R[]>();
  for (const r of results) {
    const id = r.building.id;
    if (!byId.has(id)) {
      byId.set(id, []);
      order.push(id);
    }
    byId.get(id)!.push(r);
  }

  return order.map((id) => {
    const units = byId.get(id)!;
    const allPriced = units.filter((u) => u.pricing);
    const fresh = allPriced.filter((u) => isFresh(u.pricing!.captured_at));
    const priced = fresh.length ? fresh : allPriced;
    const lead = priced.length
      ? priced.reduce((a, b) => (b.pricing!.rent < a.pricing!.rent ? b : a))
      : units[0];
    const rents = priced.map((u) => u.pricing!.rent);
    const beds = units.map((u) => u.unit.beds).filter((b): b is number => b !== null);
    const sqft = units.map((u) => u.unit.sqft).filter((s): s is number => s !== null && s > 0);
    const dates = units.map((u) => u.unit.available_on).filter((d): d is string => !!d).sort();

    return {
      building: units[0].building,
      units,
      lead,
      imageUnit: units.find((u) => (u.images?.length ?? 0) > 0),
      minRent: rents.length ? Math.min(...rents) : null,
      maxRent: rents.length ? Math.max(...rents) : null,
      bedsMin: beds.length ? Math.min(...beds) : null,
      bedsMax: beds.length ? Math.max(...beds) : null,
      sqftMin: sqft.length ? Math.min(...sqft) : null,
      sqftMax: sqft.length ? Math.max(...sqft) : null,
      earliestAvailable: dates[0] ?? null,
      hasFloorplan: units.some((u) => !!u.floorplan?.layout_image_url),
    };
  });
}

/** "Studio", "2 bed", "Studio–2 bed", "1–3 bed". */
export function bedRangeLabel(min: number | null, max: number | null): string | null {
  if (min === null || max === null) return null;
  const one = (n: number) => (n === 0 ? "Studio" : `${n}`);
  if (min === max) return min === 0 ? "Studio" : `${min} bed`;
  return `${one(min)}–${max} bed`;
}
