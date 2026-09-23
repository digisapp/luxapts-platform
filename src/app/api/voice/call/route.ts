import { apiError, apiSuccess } from "@/lib/api-helpers";
import { createAdminClient } from "@/lib/supabase/server";
import { logChatTurn } from "@/lib/chat/session-log";
import { parseTranscript, transcriptToTurns } from "@/lib/voice/transcript";
import { callSessionKey, isVoiceAgentRequest, parseCallInfo } from "@/lib/voice/auth";
import { buildingForNumber, todayInMiami, VOICE_TOOL_SCHEMAS, voiceInstructions } from "@/lib/voice/prompt";

// POST /api/voice/call — call lifecycle for the LiveKit phone agent.
//
//   { event: "start", call }             -> { instructions, tools }
//   { event: "end", call, transcript }   -> stores the call at /admin/conversations
//
// Bearer VOICE_AGENT_SECRET.

export async function POST(req: Request) {
  if (!isVoiceAgentRequest(req)) return apiError("Unauthorized", 401);

  let body: { event?: unknown; call?: unknown; transcript?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON");
  }

  const call = parseCallInfo(body.call);
  if (!call) return apiError("Missing call");
  const sessionKey = callSessionKey(call.id);
  const supabase = createAdminClient();

  if (body.event === "start") {
    // Create the session up front: a lead booked mid-call links to it, and the
    // one-lead-per-call guard reads it.
    const { error } = await supabase.from("chat_sessions").insert({
      session_key: sessionKey,
      surface: "voice",
      last_message_at: new Date().toISOString(),
      messages_count: 0,
      tool_calls_count: 0,
      error_count: 0,
      empty_results_count: 0,
    });
    if (error && error.code !== "23505") console.error("Voice session create failed:", error);

    const building = buildingForNumber(call.dialed);
    return apiSuccess({
      instructions: voiceInstructions({ today: todayInMiami(new Date()), building }),
      tools: VOICE_TOOL_SCHEMAS,
      greeting: building
        ? `Hi, this is Stacy with Staycio. Are you calling about ${building}?`
        : "Hi, this is Stacy with Staycio. What kind of place are you looking for?",
    });
  }

  if (body.event === "end") {
    const turns = transcriptToTurns(sessionKey, parseTranscript(body.transcript));
    // Sequential: each turn appends after the rows already stored.
    for (const turn of turns) await logChatTurn(turn);

    const firstQuestion = turns.find((t) => t.userMessage.trim())?.userMessage.trim();
    if (firstQuestion) {
      await supabase
        .from("chat_sessions")
        .update({ first_question: firstQuestion.slice(0, 500) })
        .eq("session_key", sessionKey)
        .is("first_question", null);
    }
    return apiSuccess({ stored: turns.length });
  }

  return apiError("Unknown event");
}
