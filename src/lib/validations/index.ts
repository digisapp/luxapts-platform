import { z } from "zod";

// ---- Shared primitives ----

const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(320, "Email too long")
  .optional();

const phoneSchema = z
  .string()
  .regex(/^[+]?[\d\s\-().]{7,20}$/, "Invalid phone number format")
  .optional();

const uuidSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Invalid UUID format"
  );

const citySlugSchema = z
  .string()
  .min(1, "City slug is required")
  .max(100)
  .regex(/^[a-z0-9-]+$/, "Invalid city slug format");

// ---- Lead creation ----

export const createLeadSchema = z.object({
  source: z.enum(["web_form", "chat", "voice"], {
    message: "Source must be web_form, chat, or voice",
  }),
  city_slug: citySlugSchema,
  name: z.string().max(200, "Name too long").optional(),
  email: emailSchema,
  phone: phoneSchema,
  budget_min: z.number().min(0).max(1_000_000).optional(),
  budget_max: z.number().min(0).max(1_000_000).optional(),
  beds: z.number().int().min(0).max(10).optional(),
  move_in_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .optional(),
  tour_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format")
    .optional(),
  tour_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Time must be HH:MM format")
    .optional(),
  notes: z.string().max(5000, "Notes too long").optional(),
  targets: z
    .array(
      z.object({
        building_id: uuidSchema.optional(),
        unit_id: uuidSchema.optional(),
        rank: z.number().int().min(1).max(100).optional(),
      })
    )
    .max(20)
    .optional(),
  conversation_summary: z.string().max(10000).optional(),
})
  // leads carries a CHECK (user_email is not null or user_phone is not null);
  // without this refine an email-less, phone-less lead reached Postgres and
  // came back as an opaque 500 instead of a 400 the caller can act on.
  .refine((d) => Boolean(d.email || d.phone), {
    message: "Email or phone is required",
    path: ["email"],
  });

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

// ---- Microsite lead capture ----

export const MICROSITE_DOMAINS = [
  "namdartowers.com",
  "downtown6miami.com",
  "jadebrickell.com",
  "sentralbrickell.com",
  "perrinbrickell.com",
  "midtown5apartments.com",
  // Added 2026-09-16 — second wave of building microsites.
  "2600biscaynemiami.com",
  "jemmiamiapartments.com",
  "kenectmiamiapartments.com",
  "3333biscaynemiami.com",
  "biscayne18.com",
  "urban22edgewater.com",
  "downtown5miami.com",
  "panoramatowerbrickell.com",
  "maizonbrickell.com",
  "muzemet.com",
  "remitheriver.com",
  "artplazaapartments.com",
  "miamiworldtowerapartments.com",
] as const;

export const micrositeLeadSchema = z.object({
  domain: z.enum(MICROSITE_DOMAINS, { message: "Unknown microsite domain" }),
  building: z.string().min(1, "Building is required").max(200),
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email address").max(320),
  // Every form now marks this required, so real submissions always carry it.
  // Kept optional server-side on purpose: a visitor with a cached copy of the
  // old page would otherwise 400 and lose a lead outright. Flip to required
  // once caches have turned over.
  phone: z.string().min(7, "Phone number looks too short").max(40).optional(),
  unit_type: z.string().max(100).optional(),
  move_in: z.string().max(100).optional(),
  intent: z.string().max(100).optional(),
  bedrooms: z.string().max(100).optional(),
  stay_type: z.string().max(100).optional(),
  // Honeypot — real users never fill this; bots do. Deliberately permissive:
  // rejecting here would 400 the bot and tell it the field is a trap. The route
  // accepts the request and returns success without storing anything instead.
  website: z.string().max(500).optional(),
});

export type MicrositeLeadInput = z.infer<typeof micrositeLeadSchema>;

export const micrositeAnalyticsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("pageview"),
    domain: z.enum(MICROSITE_DOMAINS, { message: "Unknown microsite domain" }),
    session_id: z.string().min(6).max(64),
    path: z.string().max(500),
    referrer: z.string().max(1000).nullish(),
  }),
  z.object({
    type: z.literal("event"),
    domain: z.enum(MICROSITE_DOMAINS, { message: "Unknown microsite domain" }),
    session_id: z.string().min(6).max(64),
    path: z.string().max(500),
    event_name: z.enum([
      "form_start",
      "form_submit",
      "cta_click",
      "staycio_click",
      "scroll_depth",
      "time_on_page",
    ]),
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export type MicrositeAnalyticsInput = z.infer<typeof micrositeAnalyticsSchema>;

// ---- First-party analytics (/api/analytics/track) ----
// `data` used to be destructured straight off an unvalidated body, so any
// payload without it (or with a non-object) threw a TypeError → 500.

const sessionIdSchema = z.string().min(6).max(128);

export const analyticsTrackSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("page_view"),
    session_id: sessionIdSchema,
    data: z.object({
      path: z.string().min(1).max(500),
      referrer: z.string().max(1000).nullish(),
      duration_ms: z.number().int().min(0).max(86_400_000).nullish(),
      city_slug: z.string().max(100).nullish(),
    }),
  }),
  z.object({
    type: z.literal("building_view"),
    session_id: sessionIdSchema,
    data: z.object({
      building_id: uuidSchema,
      source: z.string().max(100).nullish(),
      time_on_page_ms: z.number().int().min(0).max(86_400_000).nullish(),
      scrolled_to_bottom: z.boolean().nullish(),
      viewed_gallery: z.boolean().nullish(),
      clicked_contact: z.boolean().nullish(),
      clicked_schedule_tour: z.boolean().nullish(),
    }),
  }),
  z.object({
    type: z.literal("event"),
    session_id: sessionIdSchema,
    data: z.object({
      event_name: z.string().min(1).max(100),
      event_category: z.string().max(100).nullish(),
      properties: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  z.object({
    type: z.literal("session"),
    session_id: sessionIdSchema,
    data: z
      .object({
        landing_page: z.string().max(500).nullish(),
        utm_source: z.string().max(200).nullish(),
        utm_medium: z.string().max(200).nullish(),
        utm_campaign: z.string().max(200).nullish(),
      })
      .default({}),
  }),
]);

export type AnalyticsTrackInput = z.infer<typeof analyticsTrackSchema>;

// ---- Chat ----

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(10000, "Message too long"),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1, "At least one message is required")
    .max(50, "Too many messages. Maximum 50 allowed."),
  city_slug: citySlugSchema.optional(),
  building_id: uuidSchema.optional(),
  // Client-generated, stable for one conversation, so a multi-turn chat is
  // stored as one transcript rather than one row per request.
  session_key: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,128}$/, "Invalid session key")
    .optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

// ---- Search ----

export const searchRequestSchema = z.object({
  city_slug: citySlugSchema,
  neighborhood_slugs: z.array(z.string().max(100)).max(20).optional(),
  beds_min: z.number().int().min(0).max(10).optional(),
  beds_max: z.number().int().min(0).max(10).optional(),
  baths_min: z.number().min(0).max(10).optional(),
  budget_min: z.number().min(0).max(1_000_000).optional(),
  budget_max: z.number().min(0).max(1_000_000).optional(),
  amenities_any: z.array(z.string().max(100)).max(50).optional(),
  amenities_all: z.array(z.string().max(100)).max(50).optional(),
  pet_friendly: z.boolean().optional(),
  parking_required: z.boolean().optional(),
  move_in_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z
    .enum(["best_match", "price_low", "price_high", "newest", "sqft_high"])
    .optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type SearchRequestInput = z.infer<typeof searchRequestSchema>;

// ---- Favorites batch ----

export const batchFavoritesSchema = z.object({
  favorites: z
    .array(
      z.object({
        building_id: uuidSchema.optional(),
        unit_id: uuidSchema.optional(),
      })
    )
    .min(1)
    .max(50, "Maximum 50 favorites per batch"),
});

export type BatchFavoritesInput = z.infer<typeof batchFavoritesSchema>;

// ---- Semantic search ----

export const semanticSearchSchema = z.object({
  query: z.string().min(1, "Search query is required").max(500, "Query too long"),
  city_slug: citySlugSchema.optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export type SemanticSearchInput = z.infer<typeof semanticSearchSchema>;
