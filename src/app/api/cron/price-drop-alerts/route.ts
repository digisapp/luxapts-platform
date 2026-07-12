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

  // 1. Latest snapshot per unit captured inside the window
  const { data: recentSnaps, error: snapsError } = await supabase
    .from("unit_price_snapshots")
    .select("unit_id, rent, captured_at")
    .gte("captured_at", windowStart)
    .order("captured_at", { ascending: false });

  if (snapsError) {
    console.error("Price snapshot fetch error:", snapsError);
    return NextResponse.json({ error: "Failed to fetch snapshots" }, { status: 500 });
  }

  const latestByUnit = new Map<string, { rent: number; captured_at: string }>();
  for (const s of recentSnaps || []) {
    if (!latestByUnit.has(s.unit_id)) {
      latestByUnit.set(s.unit_id, { rent: s.rent, captured_at: s.captured_at });
    }
  }

  if (latestByUnit.size === 0) {
    return NextResponse.json({ message: "No new snapshots in window", emails_sent: 0 });
  }

  // 2. Prior snapshot per unit (latest one older than the window)
  const unitIds = [...latestByUnit.keys()];
  const { data: priorSnaps } = await supabase
    .from("unit_price_snapshots")
    .select("unit_id, rent, captured_at")
    .in("unit_id", unitIds)
    .lt("captured_at", windowStart)
    .order("captured_at", { ascending: false });

  const priorByUnit = new Map<string, number>();
  for (const s of priorSnaps || []) {
    if (!priorByUnit.has(s.unit_id)) priorByUnit.set(s.unit_id, s.rent);
  }

  // 3. Compute drops on still-available units
  const droppedUnitIds = unitIds.filter((id) => {
    const prior = priorByUnit.get(id);
    const latest = latestByUnit.get(id);
    return prior !== undefined && latest !== undefined && latest.rent < prior;
  });

  if (droppedUnitIds.length === 0) {
    return NextResponse.json({ message: "No price drops found", emails_sent: 0 });
  }

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
