import { NextResponse } from "next/server";
import { startSimliSession, getSimliTranscript } from "@/lib/simli/client";

export async function POST() {
  try {
    // Check if Simli is configured
    if (!process.env.SIMLI_API_KEY) {
      return NextResponse.json(
        { error: "Simli is not configured" },
        { status: 503 }
      );
    }

    // Check if xAI is configured (required for LLM)
    if (!process.env.XAI_API_KEY) {
      return NextResponse.json(
        { error: "xAI is not configured" },
        { status: 503 }
      );
    }

    const session = await startSimliSession();

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
    return NextResponse.json(
      { error: "Session ID required" },
      { status: 400 }
    );
  }

  try {
    const transcript = await getSimliTranscript(sessionId);
    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("Transcript error:", error);
    return NextResponse.json(
      { error: "Failed to get transcript" },
      { status: 500 }
    );
  }
}
