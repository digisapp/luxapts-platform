// Simli AI Avatar types

export interface SimliConfig {
  apiKey: string;
  faceId: string;
  handleSilence?: boolean;
  maxSessionLength?: number;
  maxIdleTime?: number;
}

export interface SimliSessionConfig {
  faceId: string;
  systemPrompt: string;
  firstMessage?: string;
  voiceId?: string;
  ttsProvider?: "elevenlabs" | "cartesia";
  language?: string;
  maxSessionLength?: number;
  maxIdleTime?: number;
  llmConfig?: {
    model: string;
    baseURL: string;
    apiKey: string;
  };
}

export interface SimliSession {
  sessionId: string;
  roomUrl?: string;
  token?: string;
}

export interface SimliMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Available Simli face IDs for avatars
export const SIMLI_FACES = {
  // Female avatars
  FEMALE_PROFESSIONAL: "tmp9i8bbq7c", // Default professional female
  FEMALE_FRIENDLY: "5514e24d-6086-46a3-ace4-6a7264e5cb7c",
  // Add more as available from Simli dashboard
} as const;

// LuxApts AI Assistant configuration
export const LUXAPTS_ASSISTANT_CONFIG: Omit<SimliSessionConfig, "faceId"> = {
  systemPrompt: `You are Lexi, the friendly LuxApts AI assistant. You help people find their perfect luxury apartment.

Your personality:
- Warm, helpful, and knowledgeable about luxury real estate
- Enthusiastic about helping people find their dream home
- Professional but approachable, like a trusted friend in real estate

Your capabilities:
- Search for apartments by location, price, bedrooms, and amenities
- Explain building amenities and neighborhood features
- Compare different buildings and units
- Answer questions about the rental process
- Provide insights about Miami and NYC luxury rental markets

Available cities: Miami, New York City (Manhattan, Brooklyn)
Available amenities: Pool, Gym, Rooftop, Doorman, Concierge, Pet-friendly, Washer/Dryer, Balcony, and many more.

When users ask about apartments:
1. Ask clarifying questions about their needs (budget, location, must-have amenities)
2. Suggest relevant options based on their criteria
3. Highlight unique features of buildings they might like

Keep responses conversational and concise - you're talking, not writing an essay. Use natural speech patterns.`,

  firstMessage: "Hey! I'm Lexi, your LuxApts apartment expert. Whether you're looking for a cozy studio or a luxury penthouse, I'm here to help you find your perfect place. What kind of apartment are you searching for?",

  language: "en",
  maxSessionLength: 600, // 10 minutes
  maxIdleTime: 120, // 2 minutes
};
