import { createXAIClient, AI_TOOLS, SYSTEM_PROMPT } from "@/lib/xai/client";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { executeTool, type ToolContext } from "@/lib/xai/tool-executor";
import { chatRequestSchema } from "@/lib/validations";
import type OpenAI from "openai";

// Tool-call fragments accumulated from streamed deltas.
interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export async function POST(req: Request) {
  try {
    // Rate limiting
    const clientIp = getClientIp(req);
    const rateLimitResult = rateLimit(`chat:${clientIp}`, RATE_LIMITS.chat);

    if (!rateLimitResult.success) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please wait a moment." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
          },
        }
      );
    }

    const rawBody = await req.json();

    // Validate with the same schema as /api/chat — city_slug and building_id
    // are interpolated into the system prompt, so they must be constrained.
    const parsedBody = chatRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({ error: parsedBody.error.issues[0]?.message || "Invalid request" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const body = parsedBody.data;

    const totalLength = body.messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
    if (totalLength > 50000) {
      return new Response(
        JSON.stringify({ error: "Message content too large." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!process.env.XAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = createXAIClient();
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    // Build context-aware system prompt
    let systemPrompt = SYSTEM_PROMPT;
    if (body.city_slug) {
      systemPrompt += `\n\nUser is browsing apartments in ${body.city_slug}. Default to this city for searches.`;
    }
    if (body.building_id) {
      systemPrompt += `\n\nUser is viewing building ID: ${body.building_id}. They may have questions about this specific building.`;
    }

    // Format messages for the API
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...body.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Create a readable stream for the response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: { type: string; content?: string }) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          const MAX_TOOL_ITERATIONS = 5;
          const toolCtx: ToolContext = { leadsCreated: 0 };

          // Each pass streams a completion; text deltas are forwarded to the
          // client as they arrive. If the model finishes with tool calls, we
          // execute them, append the results, and stream the next completion.
          // After MAX_TOOL_ITERATIONS tool rounds, one final pass runs without
          // tools so the model must answer in text.
          for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
            const allowTools = iteration < MAX_TOOL_ITERATIONS;
            const completion = await client.chat.completions.create({
              model: "grok-4.3",
              messages,
              ...(allowTools ? { tools: AI_TOOLS, tool_choice: "auto" as const } : {}),
              max_tokens: 2048,
              stream: true,
            });

            let content = "";
            const partialToolCalls: AccumulatedToolCall[] = [];

            for await (const chunk of completion) {
              const delta = chunk.choices[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                content += delta.content;
                send({ type: "content", content: delta.content });
              }

              for (const tc of delta.tool_calls ?? []) {
                const acc = (partialToolCalls[tc.index] ??= { id: "", name: "", arguments: "" });
                if (tc.id) acc.id = tc.id;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) acc.arguments += tc.function.arguments;
              }
            }

            const toolCalls = partialToolCalls.filter((tc) => tc?.id && tc.name);
            if (toolCalls.length === 0) break;

            // Send a status update
            send({ type: "status", content: "Searching..." });

            messages.push({
              role: "assistant",
              content: content || null,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });

            // Execute all tool calls in parallel, preserving the
            // result-to-tool_call_id mapping.
            const toolResults = await Promise.all(
              toolCalls.map(async (tc) => {
                let result: unknown;
                try {
                  const args = JSON.parse(tc.arguments || "{}");
                  result = await executeTool(tc.name, args, baseUrl, toolCtx);
                } catch {
                  result = { error: `Invalid arguments for ${tc.name}` };
                }
                return { tool_call_id: tc.id, result };
              })
            );

            for (const { tool_call_id, result } of toolResults) {
              messages.push({
                role: "tool",
                tool_call_id,
                content: JSON.stringify(result),
              });
            }
          }

          // Send done signal
          send({ type: "done" });
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          send({ type: "error", content: "Failed to process message" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat stream error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat message" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
