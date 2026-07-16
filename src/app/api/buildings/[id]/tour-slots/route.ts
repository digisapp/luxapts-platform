import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getBuildingTourSlots } from "@/lib/tours/slots";

// GET /api/buildings/[id]/tour-slots — real bookable tour slots for the next
// week, backed by certified showers' availability calendars. Public: powers
// the instant-booking picker in ScheduleTourModal. `instant: false` means the
// modal should fall back to the request-a-tour form.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(req);
    const limit = rateLimit(`tour-slots:${ip}`, RATE_LIMITS.api);
    if (!limit.success) {
      return apiError("Too many requests", 429);
    }

    const { id } = await params;
    if (!isValidUUID(id)) {
      return apiError("Invalid building ID");
    }

    const supabase = createAdminClient();
    const days = await getBuildingTourSlots(supabase, id, new Date());

    return apiSuccess({ instant: days.length > 0, days });
  } catch (error) {
    console.error("Tour slots error:", error);
    return apiError("Internal server error", 500);
  }
}
