import { apiError, apiSuccess } from "@/lib/api-helpers";
import { isVoiceAgentRequest, parseCallInfo } from "@/lib/voice/auth";
import { executeVoiceTool, isVoiceToolName } from "@/lib/voice/tools";

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

  const result = await executeVoiceTool(body.name, args, call, new URL(req.url).origin);
  return apiSuccess({ result });
}
