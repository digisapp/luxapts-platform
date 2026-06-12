// Environment variable validation and access

export const env = {
  // Supabase (required)
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,

  // xAI (optional - only needed for chat/AI features)
  XAI_API_KEY: process.env.XAI_API_KEY || "",
  XAI_BASE_URL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
  XAI_MANAGEMENT_API_KEY: process.env.XAI_MANAGEMENT_API_KEY || "",
  XAI_COLLECTION_ID: process.env.XAI_COLLECTION_ID || "",

  // Resend (optional - only needed for email features)
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET || "",
  FROM_EMAIL: process.env.FROM_EMAIL || "LuxApts <hello@luxapts.co>",

  // Simli avatar + ElevenLabs voice (optional, server-side only)
  SIMLI_API_KEY: process.env.SIMLI_API_KEY || "",
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",

  // Cron (optional - only needed for scheduled jobs)
  CRON_SECRET: process.env.CRON_SECRET || "",

  // Mapbox (optional - only needed for map features)
  MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "",

  // App
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
} as const;

/**
 * Assert that required environment variables are set
 * Call this at app startup to fail fast if config is missing
 */
export function assertEnv() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  // Validate URL format
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${supabaseUrl}`);
  }

  // Warn about missing APP_URL in production
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_APP_URL && !process.env.VERCEL_URL) {
    console.warn("[env] NEXT_PUBLIC_APP_URL not set in production — internal API calls may fail");
  }

  // Warn about optional missing vars in development
  if (process.env.NODE_ENV === "development") {
    const optional = [
      { key: "XAI_API_KEY", feature: "AI chat" },
      { key: "XAI_COLLECTION_ID", feature: "Semantic search (RAG)" },
      { key: "RESEND_API_KEY", feature: "Email notifications" },
      { key: "RESEND_WEBHOOK_SECRET", feature: "Inbound email webhook (fails closed without it)" },
      { key: "NEXT_PUBLIC_MAPBOX_TOKEN", feature: "Map display" },
      { key: "SIMLI_API_KEY", feature: "Simli avatar" },
      { key: "ELEVENLABS_API_KEY", feature: "Simli avatar voice" },
      { key: "CRON_SECRET", feature: "Cron job authentication" },
    ];

    for (const { key, feature } of optional) {
      if (!process.env[key]) {
        console.warn(`[env] ${key} not set — ${feature} will be disabled`);
      }
    }
  }
}

/**
 * Check if xAI is configured
 */
export function isXAIConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
}

/**
 * Check if xAI Collections (RAG) is configured
 */
export function isCollectionsConfigured(): boolean {
  return !!process.env.XAI_API_KEY && !!process.env.XAI_COLLECTION_ID;
}

/**
 * Check if Resend is configured
 */
export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Check if running on server
 */
export function isServer(): boolean {
  return typeof window === "undefined";
}
