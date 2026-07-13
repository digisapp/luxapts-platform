import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { startSimliSession, getSimliTranscript } from "@/lib/simli/client";
import { STAYCIO_ASSISTANT_CONFIG } from "@/lib/simli/types";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    // Avatar sessions are expensive (Simli + ElevenLabs + Grok) — rate limit hard
    const clientIp = getClientIp(req);
    const rateLimitResult = rateLimit(`simli:${clientIp}`, { limit: 5, windowMs: 60 * 1000 });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429 }
      );
    }

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

    let systemPrompt = STAYCIO_ASSISTANT_CONFIG.systemPrompt;
    let firstMessage = STAYCIO_ASSISTANT_CONFIG.firstMessage;

    const supabase = createAdminClient();

    // Ground the prompt in the live city catalog instead of a hardcoded list
    const { data: allCities } = await supabase
      .from("cities")
      .select("name")
      .order("name");
    if (allCities && allCities.length > 0) {
      systemPrompt += `\n\nAvailable cities: ${allCities.map((c) => c.name).join(", ")}.`;
    }

    // Augment the system prompt with building/city context if provided
    if (context.building_id || context.city_slug) {
      const contextLines: string[] = [];

      if (context.building_id) {
        const [buildingRes, factsRes] = await Promise.all([
          supabase
            .from("buildings")
            .select(`
              name, address_1, description, pet_policy, parking_policy,
              deposit_policy, leasing_phone, leasing_email, website_url,
              year_built, stories,
              cities:city_id (name),
              neighborhoods:neighborhood_id (name)
            `)
            .eq("id", context.building_id)
            .single(),
          supabase
            .from("building_facts")
            .select("key, value")
            .eq("building_id", context.building_id),
        ]);

        const building = buildingRes.data;
        const facts = factsRes.data || [];

        if (building) {
          const city = Array.isArray(building.cities) ? building.cities[0] : building.cities;
          const hood = Array.isArray(building.neighborhoods) ? building.neighborhoods[0] : building.neighborhoods;

          contextLines.push(
            `\n\n## Current Building Context`,
            `The user is viewing: **${building.name}**`,
            building.address_1 ? `Address: ${building.address_1}${city ? `, ${(city as { name: string }).name}` : ""}` : "",
            hood ? `Neighborhood: ${(hood as { name: string }).name}` : "",
            building.description ? `Description: ${building.description}` : "",
            building.year_built ? `Year built: ${building.year_built}` : "",
            building.stories ? `Stories: ${building.stories}` : "",
            building.pet_policy ? `Pet policy: ${building.pet_policy}` : "",
            building.parking_policy ? `Parking: ${building.parking_policy}` : "",
            building.deposit_policy ? `Deposit: ${building.deposit_policy}` : "",
            building.leasing_phone ? `Leasing phone: ${building.leasing_phone}` : "",
            building.leasing_email ? `Leasing email: ${building.leasing_email}` : "",
          );

          // Inject building facts (admin-curated data for grounding)
          if (facts.length > 0) {
            contextLines.push(`\n### Building Facts (verified data)`);
            for (const f of facts) {
              contextLines.push(`- ${f.key}: ${f.value}`);
            }
          }

          contextLines.push(
            `\nWhen the conversation starts, acknowledge you can see they're looking at ${building.name} and offer to help them learn more about it or find similar options.`
          );

          firstMessage = `Hey! I'm Lexi, your Staycio expert. I can see you're checking out ${building.name} — great choice! Would you like to know more about it, or are you comparing a few options?`;
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
          firstMessage = `Hey! I'm Lexi, your Staycio expert. Looking for a place in ${city.name}? I know the market well — what's most important to you in your next apartment?`;
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
      { error: "Failed to start avatar session" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const clientIp = getClientIp(req);
  const rateLimitResult = rateLimit(`simli-transcript:${clientIp}`, RATE_LIMITS.api);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

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
