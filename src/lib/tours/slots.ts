import type { SupabaseClient } from "@supabase/supabase-js";

// Real bookable tour slots for a building.
//
// Capacity model: a slot on a given date is offered when at least one
// certified, approved shower has a recurring weekly availability window
// covering the full slot — minus showings already booked for that building
// at the same date + time (open, claimed, or in-progress all consume
// capacity, since an open lead will be claimed by one of the same showers).
//
// Dates and times are naive (building-local by convention, matching the
// preferred_date/preferred_time columns). The lead-time cutoff uses server
// UTC time, which is ahead of all US timezones, so same-day slots are
// hidden conservatively rather than offered too late.

export const SLOT_MINUTES = 60;
export const TOUR_DAYS_AHEAD = 7;
export const MIN_LEAD_HOURS = 3;

export interface AvailabilityWindow {
  showerId: string;
  dayOfWeek: number; // 0 = Sunday
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
}

export interface SlotBooking {
  date: string; // "YYYY-MM-DD"
  time: string; // "HH:MM" or "HH:MM:SS"
}

export interface DaySlots {
  date: string;
  slots: { time: string; available: number }[];
}

/** "HH:MM[:SS]" -> minutes since midnight. Returns null on garbage. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/** Day of week (0 = Sunday) for a YYYY-MM-DD date, timezone-independent. */
export function dayOfWeekUTC(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function addDaysUTC(date: Date, days: number): string {
  const d = new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute bookable slots for the next `days` days.
 * Pure: caller injects `now` (also keeps server-component purity lint happy).
 */
export function computeSlots(opts: {
  windows: AvailabilityWindow[];
  bookings: SlotBooking[];
  now: Date;
  days?: number;
  slotMinutes?: number;
  minLeadHours?: number;
}): DaySlots[] {
  const {
    windows,
    bookings,
    now,
    days = TOUR_DAYS_AHEAD,
    slotMinutes = SLOT_MINUTES,
    minLeadHours = MIN_LEAD_HOURS,
  } = opts;

  if (windows.length === 0) return [];

  // Booked count per "date|HH:MM"
  const booked = new Map<string, number>();
  for (const b of bookings) {
    const mins = timeToMinutes(b.time);
    if (mins === null) continue;
    const key = `${b.date}|${minutesToTime(mins)}`;
    booked.set(key, (booked.get(key) ?? 0) + 1);
  }

  const cutoff = new Date(now.getTime() + minLeadHours * 60 * 60 * 1000);
  const result: DaySlots[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDaysUTC(now, i);
    const dow = dayOfWeekUTC(date);

    // Capacity per slot start time: distinct showers covering the full slot
    const capacity = new Map<number, Set<string>>();
    for (const w of windows) {
      if (w.dayOfWeek !== dow) continue;
      const start = timeToMinutes(w.startTime);
      const end = timeToMinutes(w.endTime);
      if (start === null || end === null) continue;
      // Slots start on the hour within the window
      const firstSlot = Math.ceil(start / slotMinutes) * slotMinutes;
      for (let t = firstSlot; t + slotMinutes <= end; t += slotMinutes) {
        if (!capacity.has(t)) capacity.set(t, new Set());
        capacity.get(t)!.add(w.showerId);
      }
    }

    const slots: DaySlots["slots"] = [];
    for (const [t, showers] of [...capacity.entries()].sort((a, b) => a[0] - b[0])) {
      const time = minutesToTime(t);
      const slotStart = new Date(`${date}T${time}:00Z`);
      if (slotStart < cutoff) continue;
      const available = showers.size - (booked.get(`${date}|${time}`) ?? 0);
      if (available > 0) slots.push({ time, available });
    }

    if (slots.length > 0) result.push({ date, slots });
  }

  return result;
}

/**
 * Fetch inputs and compute slots for a building. Uses whatever client is
 * passed (routes pass the admin client — shower_availability has no anon
 * read policy by design).
 */
export async function getBuildingTourSlots(
  supabase: SupabaseClient,
  buildingId: string,
  now: Date
): Promise<DaySlots[]> {
  const nowIso = now.toISOString();

  const { data: certs } = await supabase
    .from("shower_certifications")
    .select("shower_id, showers:shower_id (status)")
    .eq("building_id", buildingId)
    .eq("status", "certified")
    .gt("expires_at", nowIso);

  const showerIds = (certs ?? [])
    .filter((c) => {
      const s = Array.isArray(c.showers) ? c.showers[0] : c.showers;
      return (s as { status: string } | null)?.status === "approved";
    })
    .map((c) => c.shower_id as string);

  if (showerIds.length === 0) return [];

  const lastDate = addDaysUTC(now, TOUR_DAYS_AHEAD);
  const [{ data: availability }, { data: existing }] = await Promise.all([
    supabase
      .from("shower_availability")
      .select("shower_id, day_of_week, start_time, end_time")
      .in("shower_id", showerIds),
    supabase
      .from("showing_leads")
      .select("preferred_date, preferred_time")
      .eq("building_id", buildingId)
      .in("status", ["open", "claimed", "in_progress"])
      .gte("preferred_date", nowIso.slice(0, 10))
      .lte("preferred_date", lastDate),
  ]);

  return computeSlots({
    windows: (availability ?? []).map((a) => ({
      showerId: a.shower_id as string,
      dayOfWeek: a.day_of_week as number,
      startTime: a.start_time as string,
      endTime: a.end_time as string,
    })),
    bookings: (existing ?? []).map((b) => ({
      date: b.preferred_date as string,
      time: b.preferred_time as string,
    })),
    now,
  });
}
