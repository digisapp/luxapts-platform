import { after } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-helpers";
import { recordToolHealth } from "@/lib/chat/session-log";
import { isVoiceAgentRequest, parseCallInfo } from "@/lib/voice/auth";
import { executeVoiceTool, isVoiceToolName, phoneChannel, toolOutcome } from "@/lib/voice/tools";

// POST /api/voice/tools — the LiveKit phone agent runs one of Stacy's tools.
// Body: { name, args, call: { id, caller, dialed } }. Bearer VOICE_AGENT_SECRET.
export async function POST(req: Request) {
  if (!isVoiceAgentRequest(req)) return apiError("Unauthorized", 401);

  let body: { name?: unknown; args?: unknown; call?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON");
  }

  if (!isVoiceToolName(body.name)) return apiError("Unknown tool");
  const call = parseCallInfo(body.call);
  if (!call) return apiError("Missing call");
  const args =
    body.args && typeof body.args === "object" && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {};

  const channel = phoneChannel(call);
  const result = await executeVoiceTool(body.name, args, channel,
    // Tool calls carry CRON_SECRET: use the configured app URL, not the request host
    process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  );

  // The agent posts the transcript at hang-up without tool outcomes, so the
  // call's errors and empty searches are counted here, where they're known.
  const outcome = toolOutcome(body.name, result);
  if (outcome.error || outcome.resultCount === 0) {
    after(() => recordToolHealth(channel.sessionKey, outcome));
  }
  return apiSuccess({ result });
}
