import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-helpers";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

// Travel times from search-result buildings to a commute destination via the
// Mapbox Matrix API (driving/walking/cycling — Mapbox has no transit matrix).

const commuteSchema = z.object({
  destination: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  mode: z.enum(["driving", "walking", "cycling"]),
  points: z
    .array(
      z.object({
        id: z.string().uuid(),
        lng: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
      })
    )
    .min(1)
    .max(200),
});

// Matrix API allows 25 coordinates per request: 24 sources + 1 destination
const BATCH_SIZE = 24;

export async function POST(req: Request) {
  const clientIp = getClientIp(req);
  const rateLimitResult = rateLimit(`commute:${clientIp}`, RATE_LIMITS.api);
  if (!rateLimitResult.success) {
    return apiError("Too many requests", 429);
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return apiError("Commute service not configured", 503);
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = commuteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message || "Invalid request");
  }

  const { destination, mode, points } = parsed.data;

  // Dedupe identical coordinates (many units share a building)
  const uniquePoints = [...new Map(points.map((p) => [p.id, p])).values()];

  const durations: Record<string, number> = {};

  try {
    for (let i = 0; i < uniquePoints.length; i += BATCH_SIZE) {
      const batch = uniquePoints.slice(i, i + BATCH_SIZE);
      const coords = [
        ...batch.map((p) => `${p.lng},${p.lat}`),
        `${destination.lng},${destination.lat}`,
      ].join(";");
      const destIndex = batch.length;

      const url =
        `https://api.mapbox.com/directions-matrix/v1/mapbox/${mode}/${coords}` +
        `?sources=${batch.map((_, idx) => idx).join(";")}` +
        `&destinations=${destIndex}` +
        `&annotations=duration&access_token=${token}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.error(`Matrix API error ${res.status}:`, await res.text());
        continue;
      }

      const data = (await res.json()) as { durations?: (number | null)[][] };
      batch.forEach((p, idx) => {
        const seconds = data.durations?.[idx]?.[0];
        if (typeof seconds === "number") {
          durations[p.id] = Math.round(seconds / 60); // minutes
        }
      });
    }

    return NextResponse.json({ mode, durations });
  } catch (error) {
    console.error("Commute matrix error:", error);
    return apiError("Failed to compute commute times", 500);
  }
}
