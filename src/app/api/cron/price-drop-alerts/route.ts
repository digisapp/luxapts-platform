import { NextResponse } from "next/server";

// Scans a day of price snapshots and emails favoriters — needs the full window
export const maxDuration = 300;
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, getFromEmail } from "@/lib/resend/client";
import { priceDropAlertEmail } from "@/lib/email/templates";

/**
 * GET /api/cron/price-drop-alerts
 *
 * Called by Vercel Cron daily. Finds units whose latest price snapshot
 * (captured in the last 24h) is lower than the prior snapshot, then emails
 * every user who favorited the unit or its building.
 */

const LOOKBACK_HOURS = 24;
const MAX_EMAILS_PER_RUN = 200;

interface Drop {
  unitId: string;
  buildingId: string;
  unitLabel: string;
  oldRent: number;
  newRent: number;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const windowStart = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // 1+2. Server-side window comparison. The old client-side version fetched
  // the whole snapshot table ordered desc and silently truncated at
  // PostgREST's 1000-row cap — drops past row 1000 never alerted.
  const { data: dropRows, error: dropsError } = await supabase.rpc("get_recent_price_drops", {
    p_since: windowStart,
  });

  if (dropsError) {
    console.error("Price drop RPC error:", dropsError);
    return NextResponse.json({ error: "Failed to fetch price drops" }, { status: 500 });
  }

  if (!dropRows || dropRows.length === 0) {
    return NextResponse.json({ message: "No price drops found", emails_sent: 0 });
  }

  const priorByUnit = new Map<string, number>();
  const latestByUnit = new Map<string, { rent: number; captured_at: string }>();
  for (const r of dropRows as Array<{ unit_id: string; old_rent: number; new_rent: number; captured_at: string }>) {
    priorByUnit.set(r.unit_id, Number(r.old_rent));
    latestByUnit.set(r.unit_id, { rent: Number(r.new_rent), captured_at: r.captured_at });
  }
  const droppedUnitIds = [...latestByUnit.keys()];

  const { data: units } = await supabase
    .from("units")
    .select("id, beds, unit_number, is_available, building_id, buildings:building_id (id, name, status, neighborhoods:neighborhood_id (name))")
    .in("id", droppedUnitIds)
    .eq("is_available", true);

  const drops: Drop[] = [];
  const buildingMeta = new Map<string, { name: string; neighborhood: string | null }>();

  for (const u of units || []) {
    const building = Array.isArray(u.buildings) ? u.buildings[0] : u.buildings;
    if (!building || building.status !== "active") continue;
    const hood = Array.isArray(building.neighborhoods)
      ? building.neighborhoods[0]
      : building.neighborhoods;
    const bedsLabel = u.beds === 0 ? "Studio" : `${u.beds}BR`;

    buildingMeta.set(building.id, {
      name: building.name,
      neighborhood: (hood as { name: string } | null)?.name ?? null,
    });
    drops.push({
      unitId: u.id,
      buildingId: building.id,
      unitLabel: `${bedsLabel}${u.unit_number ? ` · Unit ${u.unit_number}` : ""}`,
      oldRent: priorByUnit.get(u.id)!,
      newRent: latestByUnit.get(u.id)!.rent,
    });
  }

  if (drops.length === 0) {
    return NextResponse.json({ message: "No drops on active available units", emails_sent: 0 });
  }

  // 4. Find favoriters of the dropped units or their buildings
  const dropBuildingIds = [...new Set(drops.map((d) => d.buildingId))];
  const dropUnitIds = drops.map((d) => d.unitId);

  const [{ data: buildingFavs }, { data: unitFavs }] = await Promise.all([
    supabase.from("user_favorites").select("user_id, building_id").in("building_id", dropBuildingIds),
    supabase.from("user_favorites").select("user_id, unit_id").in("unit_id", dropUnitIds),
  ]);

  const unitToBuilding = new Map(drops.map((d) => [d.unitId, d.buildingId]));

  // user -> set of building ids they should hear about
  const userBuildings = new Map<string, Set<string>>();
  for (const f of buildingFavs || []) {
    if (!f.building_id) continue;
    (userBuildings.get(f.user_id) ?? userBuildings.set(f.user_id, new Set()).get(f.user_id)!).add(f.building_id);
  }
  for (const f of unitFavs || []) {
    const bId = f.unit_id ? unitToBuilding.get(f.unit_id) : undefined;
    if (!bId) continue;
    (userBuildings.get(f.user_id) ?? userBuildings.set(f.user_id, new Set()).get(f.user_id)!).add(bId);
  }

  if (userBuildings.size === 0) {
    return NextResponse.json({
      message: "Price drops found but no favoriters to notify",
      drops: drops.length,
      emails_sent: 0,
    });
  }

  // 5. Send one email per (user, building)
  const resend = getResendClient();
  const fromEmail = getFromEmail();
  let sent = 0;
  let failed = 0;

  for (const [userId, buildingIds] of userBuildings) {
    if (sent >= MAX_EMAILS_PER_RUN) break;

    let email: string | undefined;
    let name: string | undefined;
    try {
      const { data } = await supabase.auth.admin.getUserById(userId);
      email = data.user?.email;
      name = (data.user?.user_metadata?.full_name as string | undefined) || undefined;
    } catch {
      continue;
    }
    if (!email) continue;

    for (const buildingId of buildingIds) {
      if (sent >= MAX_EMAILS_PER_RUN) break;
      const meta = buildingMeta.get(buildingId);
      const buildingDrops = drops.filter((d) => d.buildingId === buildingId);
      if (!meta || buildingDrops.length === 0) continue;

      try {
        await resend.emails.send({
          from: fromEmail,
          to: [email],
          subject: `Price drop at ${meta.name}`,
          html: priceDropAlertEmail({
            name,
            buildingName: meta.name,
            buildingId,
            neighborhood: meta.neighborhood,
            drops: buildingDrops.map((d) => ({
              unitLabel: d.unitLabel,
              oldRent: d.oldRent,
              newRent: d.newRent,
            })),
          }),
        });
        sent++;
      } catch (err) {
        console.error(`Price drop email failed for ${email}:`, err);
        failed++;
      }
    }
  }

  return NextResponse.json({
    message: "Price drop alerts processed",
    drops: drops.length,
    buildings: dropBuildingIds.length,
    users_notified: userBuildings.size,
    emails_sent: sent,
    emails_failed: failed,
  });
}
