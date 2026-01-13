import { NextResponse } from "next/server";
import { createXAIClient, AI_TOOLS, SYSTEM_PROMPT } from "@/lib/xai/client";
import { rateLimit, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import type OpenAI from "openai";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  messages: ChatMessage[];
  city_slug?: string;
  building_id?: string;
}

// Execute tool calls by making internal API requests
async function executeTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string
): Promise<unknown> {
  try {
    let response: Response;

    switch (name) {
      case "search_listings":
        response = await fetch(`${baseUrl}/api/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        break;

      case "compare_buildings":
        response = await fetch(`${baseUrl}/api/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        break;

      case "get_building_details":
        response = await fetch(`${baseUrl}/api/buildings/${args.building_id}`, {
          method: "GET",
        });
        break;

      case "create_lead":
        response = await fetch(`${baseUrl}/api/leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        break;

      default:
        return { error: `Unknown tool: ${name}` };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { error: `API error: ${errorText}` };
    }

    return await response.json();
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return { error: `Failed to execute ${name}` };
  }
}

export async function POST(req: Request) {
  try {
    // Rate limiting
    const clientIp = getClientIp(req);
    const rateLimitResult = rateLimit(`chat:${clientIp}`, RATE_LIMITS.chat);

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
          },
        }
      );
    }

    const body = (await req.json()) as ChatBody;

    if (!body.messages?.length) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      );
    }

    // Check if xAI is configured
    if (!process.env.XAI_API_KEY) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const client = createXAIClient();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

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

    // First API call
    let response = await client.chat.completions.create({
      model: "grok-3",
      messages,
      tools: AI_TOOLS,
      tool_choice: "auto",
    });

    let assistantMessage = response.choices[0].message;

    // Handle tool calls (loop for multiple calls)
    while (assistantMessage.tool_calls?.length) {
      const toolResults: OpenAI.ChatCompletionMessageParam[] = [];

      // Add assistant message with tool calls
      messages.push(assistantMessage);

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        // Handle both function tool calls and custom tool calls
        if (toolCall.type === "function") {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeTool(toolCall.function.name, args, baseUrl);

          toolResults.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }

      // Add tool results
      messages.push(...toolResults);

      // Get next response
      response = await client.chat.completions.create({
        model: "grok-3",
        messages,
        tools: AI_TOOLS,
        tool_choice: "auto",
      });

      assistantMessage = response.choices[0].message;
    }

    // Return the final text response
    return NextResponse.json({
      message: assistantMessage.content || "I couldn't generate a response.",
      usage: response.usage,
    });
  } catch (error) {
    console.error("Chat error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process chat message", details: errorMessage },
      { status: 500 }
    );
  }
}
