import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

// This endpoint should be called by a cron job (e.g., Vercel Cron, GitHub Actions)
// to send email alerts for new listings matching saved searches

// Type for the nested building data from Supabase join
interface UnitBuilding {
  id: string;
  name: string;
  address_1: string;
  neighborhoods: { name: string; slug: string } | { name: string; slug: string }[] | null;
  cities: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

export async function GET(req: Request) {
  try {
    // Verify cron secret (for security)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "Email not configured" }, { status: 500 });
    }

    const supabase = createAdminClient();
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromEmail = process.env.FROM_EMAIL || "LuxApts <hello@luxapts.co>";

    // Get all saved searches with email alerts enabled
    const { data: searches, error: searchError } = await supabase
      .from("user_saved_searches")
      .select(`
        id,
        user_id,
        name,
        query_params,
        updated_at
      `)
      .eq("email_alerts", true);

    if (searchError) {
      console.error("Error fetching saved searches:", searchError);
      return NextResponse.json({ error: searchError.message }, { status: 500 });
    }

    if (!searches || searches.length === 0) {
      return NextResponse.json({ message: "No saved searches with alerts" });
    }

    // Get user emails
    const userIds = [...new Set(searches.map((s) => s.user_id))];
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error("Error fetching users:", usersError);
      return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
    }

    const userEmailMap: Record<string, { email: string; name: string }> = {};
    for (const user of users.users) {
      if (userIds.includes(user.id) && user.email) {
        userEmailMap[user.id] = {
          email: user.email,
          name: user.user_metadata?.full_name || user.email.split("@")[0],
        };
      }
    }

    // Get new units added in the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data: newUnits, error: unitsError } = await supabase
      .from("units")
      .select(`
        id,
        beds,
        baths,
        sqft,
        available_on,
        is_available,
        building_id,
        buildings:building_id (
          id,
          name,
          address_1,
          neighborhoods:neighborhood_id (name, slug),
          cities:city_id (name, slug)
        )
      `)
      .eq("is_available", true)
      .gte("created_at", yesterday.toISOString());

    if (unitsError) {
      console.error("Error fetching new units:", unitsError);
      return NextResponse.json({ error: unitsError.message }, { status: 500 });
    }

    // Get prices for new units
    const unitIds = newUnits?.map((u) => u.id) || [];
    const unitPrices: Record<string, number> = {};

    if (unitIds.length) {
      const { data: prices } = await supabase
        .from("unit_price_snapshots")
        .select("unit_id, rent")
        .in("unit_id", unitIds)
        .order("captured_at", { ascending: false });

      for (const p of prices || []) {
        if (!unitPrices[p.unit_id]) {
          unitPrices[p.unit_id] = p.rent;
        }
      }
    }

    let emailsSent = 0;

    // Process each saved search
    for (const search of searches) {
      const userInfo = userEmailMap[search.user_id];
      if (!userInfo) continue;

      const params = search.query_params as {
        city?: string;
        neighborhood?: string;
        minPrice?: number;
        maxPrice?: number;
        beds?: number;
        minBeds?: number;
        maxBeds?: number;
      };

      // Filter units matching the search criteria
      const matchingUnits = (newUnits || []).filter((unit) => {
        // Supabase returns joined relations as arrays
        const buildingsArr = unit.buildings as unknown as UnitBuilding[] | null;
        const building = buildingsArr?.[0];
        if (!building) return false;

        const city = Array.isArray(building.cities) ? building.cities[0] : building.cities;
        const neighborhood = Array.isArray(building.neighborhoods) ? building.neighborhoods[0] : building.neighborhoods;

        // City filter
        if (params.city && city?.slug !== params.city) {
          return false;
        }

        // Neighborhood filter
        if (params.neighborhood && neighborhood?.slug !== params.neighborhood) {
          return false;
        }

        // Price filter
        const price = unitPrices[unit.id];
        if (price) {
          if (params.minPrice && price < params.minPrice) return false;
          if (params.maxPrice && price > params.maxPrice) return false;
        }

        // Beds filter
        if (params.beds !== undefined && unit.beds !== params.beds) return false;
        if (params.minBeds !== undefined && unit.beds < params.minBeds) return false;
        if (params.maxBeds !== undefined && unit.beds > params.maxBeds) return false;

        return true;
      });

      if (matchingUnits.length === 0) continue;

      // Build email content
      const listingsHtml = matchingUnits.slice(0, 5).map((unit) => {
        const buildingsArr = unit.buildings as unknown as UnitBuilding[];
        const building = buildingsArr[0];
        const price = unitPrices[unit.id];
        const city = Array.isArray(building.cities) ? building.cities[0] : building.cities;

        return `
          <div style="border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px;">
              <a href="https://luxapts.co/buildings/${building.id}" style="color: #1a1a1a; text-decoration: none;">
                ${building.name}
              </a>
            </h3>
            <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
              ${building.address_1}${city ? `, ${city.name}` : ""}
            </p>
            <p style="margin: 0; font-size: 14px;">
              <strong>${price ? `$${price.toLocaleString()}/mo` : "Contact for price"}</strong>
              ${unit.beds !== null ? ` | ${unit.beds === 0 ? "Studio" : `${unit.beds} bed`}` : ""}
              ${unit.baths ? ` | ${unit.baths} bath` : ""}
              ${unit.sqft ? ` | ${unit.sqft.toLocaleString()} sqft` : ""}
            </p>
          </div>
        `;
      }).join("");

      const moreText = matchingUnits.length > 5
        ? `<p style="color: #666; font-size: 14px;">...and ${matchingUnits.length - 5} more listings</p>`
        : "";

      // Send email
      try {
        await resend.emails.send({
          from: fromEmail,
          to: [userInfo.email],
          subject: `${matchingUnits.length} new listing${matchingUnits.length > 1 ? "s" : ""} matching "${search.name}"`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #1a1a1a 0%, #333 100%); padding: 24px; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; color: white; font-size: 24px;">LuxApts</h1>
              </div>

              <div style="padding: 24px; background: #fff;">
                <p style="font-size: 16px; color: #1a1a1a;">Hi ${userInfo.name},</p>

                <p style="font-size: 16px; color: #1a1a1a;">
                  We found <strong>${matchingUnits.length} new listing${matchingUnits.length > 1 ? "s" : ""}</strong>
                  matching your saved search "<strong>${search.name}</strong>":
                </p>

                <div style="margin: 24px 0;">
                  ${listingsHtml}
                  ${moreText}
                </div>

                <a href="https://luxapts.co/favorites"
                   style="display: inline-block; background: #1a1a1a; color: white; padding: 12px 24px;
                          border-radius: 8px; text-decoration: none; font-weight: 500;">
                  View All Matches
                </a>

                <p style="margin-top: 24px; font-size: 12px; color: #999;">
                  You're receiving this email because you enabled alerts for your saved search.
                  <a href="https://luxapts.co/favorites" style="color: #666;">Manage your alerts</a>
                </p>
              </div>
            </div>
          `,
        });
        emailsSent++;
      } catch (emailError) {
        console.error(`Failed to send email to ${userInfo.email}:`, emailError);
      }
    }

    return NextResponse.json({
      message: "Email alerts processed",
      searches_checked: searches.length,
      emails_sent: emailsSent,
    });
  } catch (error) {
    console.error("Email alerts cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
