import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { startSimliSession, getSimliTranscript } from "@/lib/simli/client";
import { LUXAPTS_ASSISTANT_CONFIG } from "@/lib/simli/types";

export async function POST(req: Request) {
  try {
    if (!process.env.SIMLI_API_KEY) {
      return NextResponse.json({ error: "Simli is not configured" }, { status: 503 });
    }
    if (!process.env.XAI_API_KEY) {
      return NextResponse.json({ error: "xAI is not configured" }, { status: 503 });
    }

    // Optional context: city_slug and/or building_id
    let context: { city_slug?: string; building_id?: string } = {};
    try {
      const body = await req.json();
      context = body || {};
    } catch {
      // No body is fine
    }

    let systemPrompt = LUXAPTS_ASSISTANT_CONFIG.systemPrompt;
    let firstMessage = LUXAPTS_ASSISTANT_CONFIG.firstMessage;

    // Augment the system prompt with building/city context if provided
    if (context.building_id || context.city_slug) {
      const supabase = createAdminClient();
      const contextLines: string[] = [];

      if (context.building_id) {
        const { data: building } = await supabase
          .from("buildings")
          .select(`
            name, address_1, description, pet_policy, parking_policy,
            leasing_phone, leasing_email, website_url,
            cities:city_id (name),
            neighborhoods:neighborhood_id (name)
          `)
          .eq("id", context.building_id)
          .single();

        if (building) {
          const city = Array.isArray(building.cities) ? building.cities[0] : building.cities;
          const hood = Array.isArray(building.neighborhoods) ? building.neighborhoods[0] : building.neighborhoods;

          contextLines.push(
            `\n\n## Current Building Context`,
            `The user is viewing: **${building.name}**`,
            building.address_1 ? `Address: ${building.address_1}${city ? `, ${(city as { name: string }).name}` : ""}` : "",
            hood ? `Neighborhood: ${(hood as { name: string }).name}` : "",
            building.description ? `Description: ${building.description}` : "",
            building.pet_policy ? `Pet policy: ${building.pet_policy}` : "",
            building.parking_policy ? `Parking: ${building.parking_policy}` : "",
            building.leasing_phone ? `Leasing phone: ${building.leasing_phone}` : "",
            building.leasing_email ? `Leasing email: ${building.leasing_email}` : "",
            `\nWhen the conversation starts, acknowledge you can see they're looking at ${building.name} and offer to help them learn more about it or find similar options.`
          );

          firstMessage = `Hey! I'm Lexi, your LuxApts expert. I can see you're checking out ${building.name} — great choice! Would you like to know more about it, or are you comparing a few options?`;
        }
      } else if (context.city_slug) {
        const { data: city } = await supabase
          .from("cities")
          .select("name")
          .eq("slug", context.city_slug)
          .single();

        if (city) {
          contextLines.push(
            `\n\n## Current City Context`,
            `The user is browsing apartments in **${city.name}**. Focus your suggestions on this city.`
          );
          firstMessage = `Hey! I'm Lexi, your LuxApts expert. Looking for a place in ${city.name}? I know the market well — what's most important to you in your next apartment?`;
        }
      }

      if (contextLines.length > 0) {
        systemPrompt = systemPrompt + contextLines.filter(Boolean).join("\n");
      }
    }

    const session = await startSimliSession({ systemPrompt, firstMessage });

    return NextResponse.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        roomUrl: session.roomUrl,
      },
    });
  } catch (error) {
    console.error("Simli session error:", error);
    return NextResponse.json(
      { error: "Failed to start avatar session", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Session ID required" }, { status: 400 });
  }

  try {
    const transcript = await getSimliTranscript(sessionId);
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Transcript error:", error);
    return NextResponse.json({ error: "Failed to get transcript" }, { status: 500 });
  }
}
