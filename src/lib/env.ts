// Environment variable validation and access

export const env = {
  // Supabase (required)
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,

  // xAI (optional - only needed for chat/AI features)
  XAI_API_KEY: process.env.XAI_API_KEY || "",
  XAI_BASE_URL: process.env.XAI_BASE_URL || "https://api.x.ai/v1",

  // Resend (optional - only needed for email features)
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  FROM_EMAIL: process.env.FROM_EMAIL || "LuxApts <hello@luxapts.co>",

  // Cron (optional - only needed for scheduled jobs)
  CRON_SECRET: process.env.CRON_SECRET || "",

  // Mapbox (optional - only needed for map features)
  MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "",

  // App
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
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
}

/**
 * Check if xAI is configured
 */
export function isXAIConfigured(): boolean {
  return !!process.env.XAI_API_KEY;
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
