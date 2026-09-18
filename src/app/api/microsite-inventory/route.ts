import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { corsHeaders, isAllowedOrigin } from "@/lib/microsite-cors";
import { MICROSITE_DOMAINS, type MicrositeDomain } from "@/lib/validations";
import {
  MICROSITE_CATALOG_SLUG,
  INVENTORY_MAX_AGE_DAYS,
} from "@/lib/microsite-inventory";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Live availability for an operating-building microsite.
 *
 * The microsites are static HTML with no build step, so anything baked into the
 * page at generate time goes stale silently. This route lets the availability
 * pages state a real, current number instead — and, just as importantly, say
 * nothing at all when the data is too old to stand behind.
 *
 * Always 200. A page that cannot get inventory must degrade to its pre-strip
 * appearance, never to an error message, so every "no data" case answers
 * { available: null } rather than a 4xx.
 */

// No route-segment caching on purpose. Route Handlers are uncached by default
// and this one must stay that way: the response varies by both the `domain`
// query and the request Origin, so a shared cache entry could hand one
// building's inventory to another building's page. What callers get instead is
// an HTTP Cache-Control header, applied per response below — that caches in the
// visitor's browser and at the CDN edge, where the URL is part of the key.

type InventoryResponse = {
  available: number | null;
  rentMin?: number;
  rentMax?: number;
  beds?: number[];
  asOf?: string;
};

const noData = (cors: Record<string, string>) =>
  NextResponse.json({ available: null } satisfies InventoryResponse, {
    status: 200,
    headers: { ...cors, "Cache-Control": "public, max-age=300" },
  });

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function GET(req: Request) {
  const cors = corsHeaders(req);
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = rateLimit(`microsite-inventory:${getClientIp(req)}`, RATE_LIMITS.api);
  if (!rl.success) return noData(cors);

  const domain = new URL(req.url).searchParams.get("domain") ?? "";
  if (!MICROSITE_DOMAINS.includes(domain as MicrositeDomain)) return noData(cors);

  const slug = MICROSITE_CATALOG_SLUG[domain as MicrositeDomain];
  if (!slug) return noData(cors);

  try {
    const supabase = createAdminClient();

    const building = await supabase
      .from("buildings")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (building.error || !building.data) return noData(cors);

    const units = await supabase
      .from("units_with_latest_price")
      .select("beds, latest_rent, price_captured_at")
      .eq("building_id", building.data.id)
      .eq("is_available", true);
    if (units.error || !units.data?.length) return noData(cors);

    const cutoff = Date.now() - INVENTORY_MAX_AGE_DAYS * 86_400_000;
    const fresh = units.data.filter(
      (u) =>
        Number(u.latest_rent) > 0 &&
        u.price_captured_at &&
        new Date(u.price_captured_at).getTime() >= cutoff
    );
    if (!fresh.length) return noData(cors);

    const rents = fresh.map((u) => Number(u.latest_rent));
    const asOf = fresh
      .map((u) => u.price_captured_at as string)
      .sort()
      .at(-1)!;

    return NextResponse.json(
      {
        available: fresh.length,
        rentMin: Math.min(...rents),
        rentMax: Math.max(...rents),
        beds: [...new Set(fresh.map((u) => Number(u.beds)))].sort((a, b) => a - b),
        asOf: asOf.slice(0, 10),
      } satisfies InventoryResponse,
      { status: 200, headers: { ...cors, "Cache-Control": "public, max-age=900" } }
    );
  } catch (error) {
    console.error("Microsite inventory error:", error);
    return noData(cors);
  }
}
