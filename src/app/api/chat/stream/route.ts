import { createXAIClient, AI_TOOLS, SYSTEM_PROMPT } from "@/lib/xai/client";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { executeTool, type ToolContext } from "@/lib/xai/tool-executor";
import { chatRequestSchema } from "@/lib/validations";
import type OpenAI from "openai";

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
        try {
          // First API call - non-streaming to handle tools first
          let response = await client.chat.completions.create({
            model: "grok-4.3",
            messages,
            tools: AI_TOOLS,
            tool_choice: "auto",
            max_tokens: 2048,
          });

          let assistantMessage = response.choices[0].message;

          // Handle tool calls first (non-streamed)
          const MAX_TOOL_ITERATIONS = 5;
          let toolIterations = 0;
          const toolCtx: ToolContext = { leadsCreated: 0 };
          while (assistantMessage.tool_calls?.length && toolIterations < MAX_TOOL_ITERATIONS) {
            toolIterations++;

            // Send a status update
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "status", content: "Searching..." })}\n\n`)
            );

            messages.push(assistantMessage);

            // Execute each tool call
            for (const toolCall of assistantMessage.tool_calls) {
              if (toolCall.type === "function") {
                const args = JSON.parse(toolCall.function.arguments);
                const result = await executeTool(toolCall.function.name, args, baseUrl, toolCtx);

                messages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(result),
                });
              }
            }

            // Get next response
            response = await client.chat.completions.create({
              model: "grok-4.3",
              messages,
              tools: AI_TOOLS,
              tool_choice: "auto",
              max_tokens: 2048,
            });

            assistantMessage = response.choices[0].message;
          }

          // Now stream the final response
          if (assistantMessage.content) {
            // If we already have content from non-streaming call, stream it word by word
            const words = assistantMessage.content.split(/(\s+)/);
            for (const word of words) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "content", content: word })}\n\n`)
              );
              // Small delay for natural feel
              await new Promise((r) => setTimeout(r, 20));
            }
          } else {
            // Make a streaming call for the final response
            const streamResponse = await client.chat.completions.create({
              model: "grok-4.3",
              messages,
              stream: true,
              max_tokens: 2048,
            });

            for await (const chunk of streamResponse) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "content", content })}\n\n`)
                );
              }
            }
          }

          // Send done signal
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: "Failed to process message" })}\n\n`
            )
          );
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
