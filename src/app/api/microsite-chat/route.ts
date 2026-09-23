import { after, NextResponse } from "next/server";
import type OpenAI from "openai";
import { createXAIClient } from "@/lib/xai/client";
import { createAdminClient } from "@/lib/supabase/server";
import { corsHeaders, isAllowedOrigin } from "@/lib/microsite-cors";
import { MICROSITE_DOMAINS, type MicrositeDomain } from "@/lib/validations";
import { MICROSITE_BUILDINGS } from "@/lib/microsites";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidSessionKey, logChatTurn, type LoggedToolCall } from "@/lib/chat/session-log";
import { executeVoiceTool, isVoiceToolName, type LeadChannel } from "@/lib/voice/tools";
import {
  micrositeChatInstructions,
  STACY_MAIN_LINE,
  todayInMiami,
  VOICE_TOOL_SCHEMAS,
} from "@/lib/voice/prompt";

// POST /api/microsite-chat — Stacy in the chat bubble on a microsite.
// Body: { domain, session_id, messages: [{ role: "user" | "assistant", content }] }
// Returns { reply }. Same tools and verified-pricing rules as the phone line;
// leads land as source=microsite with the domain, like the page's own form.

const MAX_MESSAGES = 16;
const MAX_CHARS = 1000;
const MAX_TOOL_ROUNDS = 4;

const TOOLS: OpenAI.ChatCompletionTool[] = VOICE_TOOL_SCHEMAS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const messages = raw
    .slice(-MAX_MESSAGES)
    .filter(
      (m): m is ChatMessage =>
        Boolean(m) &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  return messages.length && messages[messages.length - 1].role === "user" ? messages : null;
}

/** The request must come from the domain it claims to be. */
function originMatches(req: Request, domain: string): boolean {
  const host = (() => {
    try {
      return new URL(req.headers.get("origin") || "").hostname;
    } catch {
      return "";
    }
  })();
  return host === domain || host === `www.${domain}` || host === `${domain.replace(/\./g, "")}.vercel.app`;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req);
  const fail = (error: string, status: number) =>
    NextResponse.json({ error }, { status, headers: cors });

  if (!isAllowedOrigin(req)) return fail("Forbidden", 403);
  const limit = rateLimit(`microsite-chat:${getClientIp(req)}`, RATE_LIMITS.chat);
  if (!limit.success) return fail("Too many messages. Give it a minute.", 429);

  let body: { domain?: unknown; session_id?: unknown; messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON", 400);
  }

  const domain = body.domain;
  if (typeof domain !== "string" || !MICROSITE_DOMAINS.includes(domain as MicrositeDomain)) {
    return fail("Unknown site", 400);
  }
  if (!originMatches(req, domain)) return fail("Forbidden", 403);
  if (!isValidSessionKey(body.session_id)) return fail("Invalid session", 400);
  const history = parseMessages(body.messages);
  if (!history) return fail("Invalid messages", 400);

  const sessionKey = `ms_${body.session_id}`.slice(0, 128);
  const building = MICROSITE_BUILDINGS[domain] ?? null;
  const channel: LeadChannel = {
    sessionKey,
    defaultPhone: null,
    source: "chat",
    finalSource: "microsite",
    sourceDetail: domain,
    note: `Stacy chat on ${domain}.`,
  };

  const supabase = createAdminClient();
  // The session must exist before a lead can link to it (and the one-lead
  // guard reads it). 23505 = already created by an earlier message.
  const { error: sessionError } = await supabase.from("chat_sessions").insert({
    session_key: sessionKey,
    surface: "chat",
    city_slug: "miami",
    last_message_at: new Date().toISOString(),
    messages_count: 0,
    tool_calls_count: 0,
    error_count: 0,
    empty_results_count: 0,
  });
  if (sessionError && sessionError.code !== "23505") {
    console.error("Microsite chat session create failed:", sessionError);
  }

  const baseUrl = new URL(req.url).origin;
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: micrositeChatInstructions({
        today: todayInMiami(new Date()),
        building,
        phoneNumber: STACY_MAIN_LINE.display,
      }),
    },
    ...history,
  ];
  const toolLog: LoggedToolCall[] = [];
  let reply = "";

  try {
    const client = createXAIClient();
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const allowTools = round < MAX_TOOL_ROUNDS;
      const completion = await client.chat.completions.create({
        model: "grok-4.3",
        messages,
        ...(allowTools ? { tools: TOOLS, tool_choice: "auto" as const } : {}),
        max_tokens: 600,
      });
      const message = completion.choices[0]?.message;
      const calls = (message?.tool_calls ?? []).filter((c) => c.type === "function");
      if (!calls.length) {
        reply = message?.content?.trim() ?? "";
        break;
      }

      messages.push({ role: "assistant", content: message?.content ?? null, tool_calls: calls });
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // fall through with empty args; the tool reports what's missing
        }
        const result = isVoiceToolName(call.function.name)
          ? await executeVoiceTool(call.function.name, args, channel, baseUrl)
          : { error: "Unknown tool" };
        const error = (result as { error?: string } | null)?.error ?? null;
        const count = (result as { result_count?: number } | null)?.result_count;
        toolLog.push({
          name: call.function.name,
          args,
          error,
          resultCount: typeof count === "number" ? count : null,
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
  } catch (err) {
    console.error("Microsite chat failed:", err);
    reply = "";
  }

  const failed = !reply;
  if (failed) {
    reply = `Sorry, I hit a snag. You can call me at ${STACY_MAIN_LINE.display}, or leave your details in the form on this page.`;
  }

  after(() =>
    logChatTurn({
      sessionKey,
      surface: "chat",
      citySlug: "miami",
      userMessage: `[${domain}] ${history[history.length - 1].content}`,
      assistantMessage: reply,
      toolCalls: toolLog,
      error: failed ? "microsite chat produced no reply" : null,
    })
  );

  return NextResponse.json({ reply }, { status: 200, headers: cors });
}
