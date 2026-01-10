import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import type { CreateLeadRequest, CreateLeadResponse } from "@/types/database";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CreateLeadRequest;

    // Validate required fields
    if (!body.source || !body.city_slug) {
      return NextResponse.json(
        { error: "source and city_slug are required" },
        { status: 400 }
      );
    }

    // Validate source
    if (!["web_form", "chat", "voice"].includes(body.source)) {
      return NextResponse.json(
        { error: "Invalid source. Must be web_form, chat, or voice" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Resolve city
    const cityRes = await supabase
      .from("cities")
      .select("id, slug, name")
      .eq("slug", body.city_slug)
      .single();

    if (cityRes.error || !cityRes.data) {
      return NextResponse.json({ error: "City not found" }, { status: 404 });
    }

    // Create lead
    const leadInsert = await supabase
      .from("leads")
      .insert({
        source: body.source,
        city_id: cityRes.data.id,
        name: body.name || null,
        user_email: body.email || null,
        user_phone: body.phone || null,
        budget_min: body.budget_min || null,
        budget_max: body.budget_max || null,
        beds: body.beds || null,
        move_in_date: body.move_in_date || null,
        notes: body.notes || null,
        status: "new",
      })
      .select("id, status, created_at")
      .single();

    if (leadInsert.error) {
      console.error("Lead insert error:", leadInsert.error);
      return NextResponse.json(
        { error: "Failed to create lead" },
        { status: 500 }
      );
    }

    const leadId = leadInsert.data.id;

    // Insert lead targets if provided
    if (body.targets?.length) {
      const targetRows = body.targets.map((t) => ({
        lead_id: leadId,
        building_id: t.building_id || null,
        unit_id: t.unit_id || null,
        rank: t.rank || null,
      }));

      await supabase.from("lead_targets").insert(targetRows);
    }

    // Log conversation summary if provided
    if (body.conversation_summary) {
      await supabase.from("lead_events").insert({
        lead_id: leadId,
        type: "conversation_summary",
        payload: { summary: body.conversation_summary },
      });
    }

    // Log lead creation event
    await supabase.from("lead_events").insert({
      lead_id: leadId,
      type: "lead_created",
      payload: {
        source: body.source,
        city: cityRes.data.name,
      },
    });

    // Send notification email (only if Resend is configured)
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const fromEmail = process.env.FROM_EMAIL || "LuxApts <hello@luxapts.co>";
        const toEmail = fromEmail.includes("<")
          ? fromEmail.split("<")[1].replace(">", "")
          : fromEmail;

        await resend.emails.send({
          from: fromEmail,
          to: [toEmail],
          subject: `New LuxApts Lead (${cityRes.data.name})`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1a1a1a;">New Lead Received</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
                <p><strong>City:</strong> ${cityRes.data.name}</p>
                <p><strong>Source:</strong> ${body.source}</p>
                <p><strong>Name:</strong> ${body.name || "Not provided"}</p>
                <p><strong>Email:</strong> ${body.email || "Not provided"}</p>
                <p><strong>Phone:</strong> ${body.phone || "Not provided"}</p>
                <p><strong>Budget:</strong> $${body.budget_min || "?"} - $${body.budget_max || "?"}</p>
                <p><strong>Beds:</strong> ${body.beds || "Not specified"}</p>
                <p><strong>Move-in:</strong> ${body.move_in_date || "Not specified"}</p>
                ${body.notes ? `<p><strong>Notes:</strong> ${body.notes}</p>` : ""}
              </div>
              <p style="margin-top: 20px; color: #666;">
                <strong>Lead ID:</strong> ${leadId}
              </p>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Email notification failed:", emailError);
        // Don't fail the request if email fails
      }
    }

    const response: CreateLeadResponse = {
      lead_id: leadId,
      status: leadInsert.data.status,
      assigned_agent_user_id: null, // Auto-routing can be added later
      next_steps: ["agent_outreach", "schedule_tour"],
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Create lead error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to list leads (admin only via RLS)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const supabase = createAdminClient();

    let query = supabase
      .from("leads")
      .select(`
        id, created_at, status, name, user_email, user_phone,
        budget_min, budget_max, beds, move_in_date, source, notes,
        cities:city_id (name, slug)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      leads: data,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    console.error("List leads error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
