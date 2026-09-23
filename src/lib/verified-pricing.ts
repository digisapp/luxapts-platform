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
