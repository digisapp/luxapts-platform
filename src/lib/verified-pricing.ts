import { INVENTORY_MAX_AGE_DAYS } from "@/lib/microsite-inventory";

/**
 * Whether Stacy may quote a rent, in any channel (web chat, phone, microsite
 * chat): a positive rent captured by a scrape within the microsites' freshness
 * window. Older captures are real history, not a price anyone can rent at, and
 * the catalog carried thousands of invented January rents until 2026-09-23.
 */

const DAY_MS = 86_400_000;

export function isVerifiedPrice(
  rent: unknown,
  capturedAt: unknown,
  now: Date = new Date()
): boolean {
  const value = typeof rent === "string" ? Number(rent) : rent;
  if (typeof value !== "number" || !(value > 0)) return false;
  if (typeof capturedAt !== "string") return false;
  const captured = new Date(capturedAt).getTime();
  if (Number.isNaN(captured)) return false;
  return captured >= now.getTime() - INVENTORY_MAX_AGE_DAYS * DAY_MS;
}

/**
 * The web search's view of the same rule: an unverified capture becomes
 * `pricing: null` ("Contact for pricing") instead of being shown as a current
 * asking rent — about 43% of priced units carried months-old captures. A
 * budget filter or price sort is a claim about price, so those keep verified
 * units only: a stale $2,100 must not match "under $2,200".
 */
export function withVerifiedPricing<R extends { pricing: unknown }, T extends { results: R[] }>(
  res: T,
  params: { budget_min?: number; budget_max?: number; sort?: string },
  now: Date = new Date()
): T {
  const priceBound =
    typeof params.budget_min === "number" ||
    typeof params.budget_max === "number" ||
    params.sort === "price_low" ||
    params.sort === "price_high";
  const results = res.results
    .map((r) => {
      const p = r.pricing as { rent?: unknown; captured_at?: unknown } | null;
      return p && isVerifiedPrice(p.rent, p.captured_at, now) ? r : { ...r, pricing: null };
    })
    .filter((r) => !priceBound || r.pricing !== null);
  return { ...res, results };
}
