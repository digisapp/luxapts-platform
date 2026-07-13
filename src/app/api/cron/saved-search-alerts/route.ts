import { NextResponse } from "next/server";

// Iterates all alert-enabled searches and sends emails (default serverless timeout kills it mid-run, stranding jobs in "running")
export const maxDuration = 300;
import { createAdminClient } from "@/lib/supabase/server";
import { getResendClient, getFromEmail } from "@/lib/resend/client";

/**
 * GET /api/cron/saved-search-alerts
 *
 * Called by Vercel Cron (recommended: nightly at 8am local).
 * For every saved search with email_alerts=true:
 *   1. Runs a lightweight query to find matching available units
 *   2. Emails the user a digest of the top 5 results
 *
 * Add to vercel.json:
 * { "crons": [{ "path": "/api/cron/saved-search-alerts", "schedule": "0 13 * * *" }] }
 */
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Fetch all active saved searches with email alerts enabled
  const { data: savedSearches, error: searchesError } = await supabase
    .from("user_saved_searches")
    .select("id, user_id, name, query_params")
    .eq("email_alerts", true);

  if (searchesError) {
    console.error("Saved search fetch error:", searchesError);
    return NextResponse.json({ error: "Failed to fetch saved searches" }, { status: 500 });
  }

  if (!savedSearches || savedSearches.length === 0) {
    return NextResponse.json({ message: "No active email alerts", alerts_sent: 0 });
  }

  // 2. Group searches by user to batch per-user emails
  const byUser = new Map<string, typeof savedSearches>();
  for (const s of savedSearches) {
    const existing = byUser.get(s.user_id) || [];
    existing.push(s);
    byUser.set(s.user_id, existing);
  }

  const userIds = [...byUser.keys()];

  // 3. Fetch user emails from auth.users via admin API
  const userEmailMap = new Map<string, string>();
  const userNameMap = new Map<string, string>();

  // Fetch in batches of 50 to avoid large payloads
  const BATCH = 50;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const chunk = userIds.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (uid) => {
        try {
          const { data } = await supabase.auth.admin.getUserById(uid);
          if (data.user?.email) {
            userEmailMap.set(uid, data.user.email);
            userNameMap.set(uid, data.user.user_metadata?.full_name || data.user.email.split("@")[0]);
          }
        } catch {
          // Skip users we can't resolve
        }
      })
    );
  }

  // 4. For each user, run their searches and send a digest email
  const resend = getResendClient();
  const fromEmail = getFromEmail();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  let alertsSent = 0;
  let alertsFailed = 0;

  for (const [userId, searches] of byUser) {
    const email = userEmailMap.get(userId);
    if (!email) continue;

    const name = userNameMap.get(userId) || "there";

    // Run each search and collect results
    const searchSections: string[] = [];

    for (const savedSearch of searches) {
      const params = savedSearch.query_params as Record<string, unknown>;
      const citySlug = params.city_slug as string | undefined;
      if (!citySlug) continue;

      // Resolve city
      const { data: city } = await supabase
        .from("cities")
        .select("id, name")
        .eq("slug", citySlug)
        .single();

      if (!city) continue;

      // Quick unit availability query matching the saved search params
      let unitsQuery = supabase
        .from("units")
        .select(`
          id, beds, baths, sqft, available_on,
          buildings:building_id (id, name, address_1,
            neighborhoods:neighborhood_id (name)
          )
        `)
        .eq("is_available", true)
        .limit(5);

      // Apply bed/bath filters if present
      if (typeof params.beds_min === "number") unitsQuery = unitsQuery.gte("beds", params.beds_min);
      if (typeof params.beds_max === "number") unitsQuery = unitsQuery.lte("beds", params.beds_max);

      // Filter to buildings in this city
      const { data: buildingsInCity } = await supabase
        .from("buildings")
        .select("id")
        .eq("city_id", city.id)
        .eq("status", "active");

      const buildingIds = (buildingsInCity || []).map((b) => b.id);
      if (buildingIds.length === 0) continue;

      unitsQuery = unitsQuery.in("building_id", buildingIds);

      const { data: units } = await unitsQuery;
      if (!units || units.length === 0) continue;

      // Fetch latest prices for these units
      const unitIds = units.map((u) => u.id);
      const { data: prices } = await supabase
        .from("unit_price_snapshots")
        .select("unit_id, rent")
        .in("unit_id", unitIds)
        .order("captured_at", { ascending: false });

      const priceByUnit: Record<string, number> = {};
      for (const p of prices || []) {
        if (!priceByUnit[p.unit_id]) priceByUnit[p.unit_id] = p.rent;
      }

      // Build HTML rows for this search
      const rows = units
        .filter((u) => priceByUnit[u.id])
        .map((u) => {
          const building = Array.isArray(u.buildings) ? u.buildings[0] : u.buildings;
          const neighborhood = building
            ? Array.isArray(building.neighborhoods)
              ? building.neighborhoods[0]
              : building.neighborhoods
            : null;
          const rent = priceByUnit[u.id];
          const bedsLabel = u.beds === 0 ? "Studio" : `${u.beds}BR`;
          const available = u.available_on
            ? new Date(u.available_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : "Now";

          return `
            <tr>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0;">
                <strong>${building?.name || "Unknown"}</strong>
                ${neighborhood?.name ? `<br><span style="color:#666;font-size:12px;">${neighborhood.name}</span>` : ""}
              </td>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; white-space: nowrap;">${bedsLabel}${u.baths ? ` / ${u.baths}BA` : ""}</td>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; white-space: nowrap; font-weight: bold;">$${rent.toLocaleString()}/mo</td>
              <td style="padding: 12px 8px; border-bottom: 1px solid #f0f0f0; white-space: nowrap; color: #666; font-size: 12px;">Avail. ${available}</td>
            </tr>
          `;
        })
        .join("");

      if (!rows) continue;

      const searchUrl = `${appUrl}/search?city=${encodeURIComponent(citySlug)}${
        params.beds_min != null ? `&beds_min=${params.beds_min}` : ""
      }${params.beds_max != null ? `&beds_max=${params.beds_max}` : ""}${
        params.budget_max != null ? `&budget_max=${params.budget_max}` : ""
      }`;

      searchSections.push(`
        <div style="margin-bottom: 32px;">
          <h3 style="margin: 0 0 4px; font-size: 16px; color: #1a1a1a;">${savedSearch.name}</h3>
          <p style="margin: 0 0 12px; color: #666; font-size: 13px;">${city.name}</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f8f8f8;">
                <th style="padding: 8px; text-align: left; font-weight: 600;">Building</th>
                <th style="padding: 8px; text-align: left; font-weight: 600;">Size</th>
                <th style="padding: 8px; text-align: left; font-weight: 600;">Rent</th>
                <th style="padding: 8px; text-align: left; font-weight: 600;">Available</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="margin: 12px 0 0;">
            <a href="${searchUrl}"
               style="color: #1a1a1a; font-size: 13px; text-decoration: underline;">
              View all results →
            </a>
          </p>
        </div>
      `);
    }

    if (searchSections.length === 0) continue;

    const manageUrl = `${appUrl}/favorites`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
        <h2 style="margin: 0 0 4px; font-size: 22px;">Your Daily Apartment Digest</h2>
        <p style="margin: 0 0 28px; color: #666;">Hi ${name}, here's what's available for your saved searches today.</p>
        ${searchSections.join('<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />')}
        <p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; color: #999; font-size: 12px;">
          You're receiving this because you enabled email alerts for saved searches.
          <a href="${manageUrl}" style="color: #999;">Manage alerts</a>
        </p>
      </div>
    `;

    try {
      await resend.emails.send({
        from: fromEmail,
        to: [email],
        subject: `Your Staycio Apartment Digest — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
        html,
      });
      alertsSent++;
    } catch (err) {
      console.error(`Failed to send alert to ${email}:`, err);
      alertsFailed++;
    }
  }

  return NextResponse.json({
    message: "Saved search alerts processed",
    users_with_alerts: byUser.size,
    alerts_sent: alertsSent,
    alerts_failed: alertsFailed,
  });
}
