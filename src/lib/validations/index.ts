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
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

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
