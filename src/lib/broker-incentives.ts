import { z } from "zod";

/**
 * Broker (OP) commission incentives: what a building pays an outside broker
 * for bringing a renter. Admin-only (migration 030); never expose these on
 * the public site, to Stacy or on a microsite.
 */

export const INCENTIVE_STATUSES = ["pays", "unknown", "none"] as const;
export type IncentiveStatus = (typeof INCENTIVE_STATUSES)[number];

export const INCENTIVE_STATUS_LABELS: Record<IncentiveStatus, string> = {
  pays: "Pays OP",
  unknown: "To confirm",
  none: "No OP",
};

/** Paying buildings first, then the ones still to call, then the refusals. */
const STATUS_ORDER: Record<IncentiveStatus, number> = { pays: 0, unknown: 1, none: 2 };

/** Terms older than this are flagged for a re-check; offers change often. */
export const STALE_AFTER_DAYS = 90;

export interface IncentiveBuilding {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  neighborhoods: { name: string } | { name: string }[] | null;
  cities: { name: string } | { name: string }[] | null;
}

export interface BrokerIncentive {
  id: string;
  building_name: string;
  building_id: string | null;
  status: IncentiveStatus;
  incentive: string | null;
  conditions: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  confirmed_on: string | null;
  updated_at: string;
  buildings: IncentiveBuilding | IncentiveBuilding[] | null;
}

export const INCENTIVE_COLUMNS = `
  id, building_name, building_id, status, incentive, conditions,
  contact_name, contact_email, contact_phone, notes, confirmed_on, updated_at,
  buildings:building_id (
    id, name, slug, status,
    neighborhoods:neighborhood_id (name),
    cities:city_id (name)
  )
`;

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

export function linkedBuilding(row: Pick<BrokerIncentive, "buildings">): IncentiveBuilding | null {
  return one(row.buildings);
}

/**
 * "Brickell, Miami" for a linked building; null when unlinked. The city is
 * dropped when the neighborhood already names it ("Downtown Miami", not
 * "Downtown Miami, Miami").
 */
export function buildingArea(b: Pick<IncentiveBuilding, "neighborhoods" | "cities"> | null): string | null {
  if (!b) return null;
  const hood = one(b.neighborhoods)?.name?.trim();
  const city = one(b.cities)?.name?.trim();
  if (hood && city && hood.toLowerCase().includes(city.toLowerCase())) return hood;
  const parts = [hood, city].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function compareIncentives(
  a: Pick<BrokerIncentive, "status" | "building_name">,
  b: Pick<BrokerIncentive, "status" | "building_name">
): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    a.building_name.localeCompare(b.building_name, "en", { sensitivity: "base" })
  );
}

/** Whole days between a YYYY-MM-DD date and `now`, by calendar date in UTC. */
export function daysSince(date: string, now: number): number {
  const then = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const today = new Date(now);
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((todayUtc - then) / 86_400_000);
}

// ---- Validation (POST creates, PATCH takes any subset) ----

/** Trimmed text; an empty string clears the field (stored as null). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .transform((v) => v || null)
    .nullable()
    .optional();

export const brokerIncentiveSchema = z.object({
  building_name: z
    .string()
    .trim()
    .min(1, "Building name is required")
    .max(200, "Building name is too long"),
  building_id: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid building")
    .nullable()
    .optional(),
  status: z.enum(INCENTIVE_STATUSES, { message: "Pick Pays OP, To confirm or No OP" }),
  incentive: optionalText(300),
  conditions: optionalText(1000),
  contact_name: optionalText(120),
  contact_email: z
    .string()
    .trim()
    .max(320)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Invalid email address")
    .transform((v) => v || null)
    .nullable()
    .optional(),
  contact_phone: optionalText(40),
  notes: optionalText(2000),
  confirmed_on: z
    .string()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Date must be YYYY-MM-DD")
    .transform((v) => v || null)
    .nullable()
    .optional(),
});

export const brokerIncentivePatchSchema = brokerIncentiveSchema.partial();

export type BrokerIncentiveInput = z.input<typeof brokerIncentiveSchema>;
