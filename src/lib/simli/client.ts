// Simli API client for server-side operations

import { SimliSessionConfig, SimliSession, LUXAPTS_ASSISTANT_CONFIG, SIMLI_FACES } from "./types";

const SIMLI_API_BASE = "https://api.simli.ai";

interface SimliTokenResponse {
  token: string;
}

interface SimliStartResponse {
  session_id: string;
  room_url?: string;
}

export async function createSimliToken(): Promise<string> {
  const response = await fetch(`${SIMLI_API_BASE}/auto/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.SIMLI_API_KEY || "",
    },
    body: JSON.stringify({
      ttsAPIKey: process.env.ELEVENLABS_API_KEY,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Simli token: ${error}`);
  }

  const data: SimliTokenResponse = await response.json();
  return data.token;
}

export async function startSimliSession(
  config?: Partial<SimliSessionConfig>
): Promise<SimliSession> {
  const sessionConfig = {
    ...LUXAPTS_ASSISTANT_CONFIG,
    ...config,
    faceId: config?.faceId || SIMLI_FACES.FEMALE_PROFESSIONAL,
  };

  // Use xAI as the LLM backend (OpenAI-compatible API)
  const llmConfig = {
    model: "grok-3",
    baseURL: "https://api.x.ai/v1",
    llmAPIKey: process.env.XAI_API_KEY || "",
  };

  const response = await fetch(`${SIMLI_API_BASE}/auto/start/configurable`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": process.env.SIMLI_API_KEY || "",
    },
    body: JSON.stringify({
      faceId: sessionConfig.faceId,
      systemPrompt: sessionConfig.systemPrompt,
      firstMessage: sessionConfig.firstMessage,
      ttsProvider: sessionConfig.ttsProvider || "elevenlabs",
      language: sessionConfig.language || "en",
      maxSessionLength: sessionConfig.maxSessionLength || 600,
      maxIdleTime: sessionConfig.maxIdleTime || 120,
      customLLMConfig: llmConfig,
      createTranscript: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to start Simli session: ${error}`);
  }

  const data: SimliStartResponse = await response.json();

  return {
    sessionId: data.session_id,
    roomUrl: data.room_url,
  };
}

export async function getSimliTranscript(sessionId: string): Promise<unknown[]> {
  const response = await fetch(`${SIMLI_API_BASE}/auto/transcript/${sessionId}`, {
    headers: {
      "X-API-Key": process.env.SIMLI_API_KEY || "",
    },
  });

  if (!response.ok) {
    return [];
  }

  return response.json();
}
