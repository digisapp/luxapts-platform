import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { checkShowerAuth } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { timeToMinutes } from "@/lib/tours/slots";

// GET/PUT /api/shower/availability — a shower's recurring weekly windows.
// PUT replaces the full set (the schedule editor always saves whole-week).

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, { message: "Time must be HH:MM" });

const windowSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: timeSchema,
  end_time: timeSchema,
});

const putSchema = z.object({
  windows: z.array(windowSchema).max(28, { message: "Too many windows" }),
});

export async function GET() {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("shower_availability")
      .select("id, day_of_week, start_time, end_time")
      .eq("shower_id", auth.showerId)
      .order("day_of_week")
      .order("start_time");

    if (error) {
      console.error("Availability fetch error:", error);
      return apiError("Failed to load availability", 500);
    }

    return apiSuccess({ windows: data ?? [] });
  } catch (error) {
    console.error("Availability GET error:", error);
    return apiError("Internal server error", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await checkShowerAuth();
    if (!auth.isShower) {
      return apiError(auth.error, auth.status);
    }

    const body = await req.json().catch(() => null);
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message || "Invalid request");
    }

    const seen = new Set<string>();
    for (const w of parsed.data.windows) {
      const start = timeToMinutes(w.start_time);
      const end = timeToMinutes(w.end_time);
      if (start === null || end === null || end <= start) {
        return apiError("Each window must end after it starts");
      }
      const key = `${w.day_of_week}|${w.start_time}`;
      if (seen.has(key)) {
        return apiError("Duplicate window for the same day and start time");
      }
      seen.add(key);
    }

    const adminClient = createAdminClient();

    // Replace-all: delete then insert. Not transactional through PostgREST,
    // but the only writer is the shower themselves saving their own schedule.
    const { error: deleteError } = await adminClient
      .from("shower_availability")
      .delete()
      .eq("shower_id", auth.showerId);

    if (deleteError) {
      console.error("Availability delete error:", deleteError);
      return apiError("Failed to save availability", 500);
    }

    if (parsed.data.windows.length > 0) {
      const { error: insertError } = await adminClient
        .from("shower_availability")
        .insert(
          parsed.data.windows.map((w) => ({
            shower_id: auth.showerId,
            day_of_week: w.day_of_week,
            start_time: w.start_time,
            end_time: w.end_time,
          }))
        );

      if (insertError) {
        console.error("Availability insert error:", insertError);
        return apiError("Failed to save availability", 500);
      }
    }

    return apiSuccess({ saved: parsed.data.windows.length });
  } catch (error) {
    console.error("Availability PUT error:", error);
    return apiError("Internal server error", 500);
  }
}
