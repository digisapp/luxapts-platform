import { searchDocuments } from "@/lib/xai/collections";
import { isValidUUID } from "@/lib/utils";
import { internalHeaders } from "@/lib/rate-limit";
import { cachedSearch, type SearchResponse } from "@/lib/search/cache";
import { searchRequestSchema } from "@/lib/validations";
import { normalizeCitySlug } from "@/lib/constants/cities";
import { getFirstRelation } from "@/lib/db-helpers";
import { isVerifiedPrice } from "@/lib/verified-pricing";
import { policyText, withPolicyText } from "@/lib/policy-text";
import { prepareLeadInput, sessionLeadId, updateSessionLead } from "@/lib/xai/session-lead";
import { withSessionLock } from "@/lib/session-lock";

// Per-request state passed through a single chat turn so tool usage can be
// bounded (e.g. at most one lead created per conversation turn).
export interface ToolContext {
  leadsCreated: number;
  /** Conversation this turn belongs to, so a created lead links to its transcript. */
  sessionKey?: string | null;
  /** Surface the lead came from. Phone calls pass "voice"; everything else is chat. */
  leadSource?: "chat" | "voice";
  /** Contact number for a new lead when the person gives none (caller ID). */
  defaultPhone?: string | null;
  /** Forces the lead's city whatever the model says (microsite chat is Miami-only). */
  citySlug?: string | null;
  /** The conversation's lead, once this request has created or found it. */
  leadId?: string | null;
  /** Tail of this request's lead writes; see serializeLeadWrites. */
  leadQueue?: Promise<unknown>;
}

const MAX_LEADS_PER_REQUEST = 1;
const MAX_KNOWLEDGE_QUERY_LENGTH = 500;

// The tool schema advertises "default 10"; the search cache defaulted to 50
// and every result carried its full image array (or the building's whole
// gallery, duplicated per unit), which blew up the model's context.
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;
const MAX_DETAIL_UNITS = 25;
const MAX_DESCRIPTION_CHARS = 1200;

function clampSearchLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(Math.max(Math.round(n), 1), MAX_SEARCH_LIMIT);
}

interface EmbeddedBuilding {
  id?: string;
  name?: string;
  address_1?: string;
  zip?: string | null;
  pet_policy?: string | null;
  parking_policy?: string | null;
  neighborhoods?: { slug?: string; name?: string } | { slug?: string; name?: string }[] | null;
}

interface EmbeddedPricing {
  rent?: number | null;
  net_effective_rent?: number | null;
  lease_term_months?: number | null;
  captured_at?: string | null;
}

const NOTHING_VERIFIED =
  "No units with recently verified pricing match. Do not quote prices or availability from memory; " +
  "say so, and offer to have the team send current options (create_lead).";

/**
 * Compact, image-light projection of a search page for the model. Only units
 * with a verified price (see verified-pricing.ts) are returned: the model
 * repeats whatever it is given as a promise to a real renter.
 */
function compactSearchResults(res: SearchResponse, limit: number) {
  const verified = res.results.filter((r) => {
    const p = (r.pricing ?? null) as EmbeddedPricing | null;
    return isVerifiedPrice(p?.rent, p?.captured_at);
  });
  return {
    city: res.city,
    captured_at_max: res.captured_at_max,
    result_count: Math.min(verified.length, limit),
    unverified_omitted: res.results.length - verified.length,
    ...(verified.length === 0 ? { note: NOTHING_VERIFIED } : {}),
    results: verified.slice(0, limit).map((r) => {
      const b = (r.building ?? {}) as EmbeddedBuilding;
      const p = (r.pricing ?? null) as EmbeddedPricing | null;
      const image = (r.images?.[0] ?? null) as { url?: string } | null;
      const neighborhood = getFirstRelation(b.neighborhoods);
      return {
        unit_id: r.unit.id,
        building_id: b.id ?? null,
        building_name: b.name ?? null,
        address: b.address_1 ?? null,
        neighborhood: neighborhood?.name ?? null,
        neighborhood_slug: neighborhood?.slug ?? null,
        unit_number: r.unit.unit_number,
        beds: r.unit.beds,
        baths: r.unit.baths,
        sqft: r.unit.sqft,
        rent: p?.rent ?? null,
        net_effective_rent: p?.net_effective_rent ?? null,
        lease_term_months: p?.lease_term_months ?? null,
        price_captured_at: p?.captured_at ?? null,
        available_on: r.unit.available_on,
        pet_policy: policyText(b.pet_policy),
        parking_policy: policyText(b.parking_policy),
        image_url: image?.url ?? null,
        url: b.id ? `/buildings/${b.id}/units/${r.unit.id}` : null,
      };
    }),
  };
}

type Row = Record<string, unknown>;

function pick(row: unknown, keys: string[]): Row {
  const out: Row = {};
  if (!row || typeof row !== "object") return out;
  const source = row as Row;
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function truncate(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// Facts about rent, availability and promotions go stale with the market, and
// every such building_facts row dates from the January scrape ("3 months
// free..."). They reach the model only while the row's own updated_at is
// inside the verified-pricing window.
const PERISHABLE_FACT_KEY = /rent|price|special|concession|promo|availab/i;

export function currentFacts(facts: unknown, now: Date = new Date()): Row[] {
  if (!Array.isArray(facts)) return [];
  return facts
    .filter((f) => {
      const row = (f && typeof f === "object" ? f : {}) as Row;
      // isVerifiedPrice with a stand-in rent is the freshness check alone.
      return !PERISHABLE_FACT_KEY.test(String(row.key ?? "")) || isVerifiedPrice(1, row.updated_at, now);
    })
    .map((f) => pick(f, ["key", "value"]));
}

// The knowledge documents (scripts/upload-to-collection.ts) were written with
// the rent range and move-in specials of the day they were ingested. Labelled
// lines go whole; elsewhere only the sentence quoting a price or promotion.
const PRICE_LINE =
  /^\s*(?:#+\s*pricing\b|(?:rent(?:s|al)?\s*range|price\s*range|pricing|rents?|prices?|move-in\s*specials?|specials?|concessions?|available\s*units)\s*:)/i;
const PRICE_SENTENCE =
  /\$\s?\d|\b\d+\s*(?:months?|weeks?)\s+free\b|\bmove-in\s+specials?\b|\bconcessions?\b|\bfree\s+rent\b/i;
const PRICE_METADATA = new Set(["min_rent", "max_rent"]);

export function stripUnverifiedPricing(text: string): string {
  return text
    .split("\n")
    .filter((line) => !PRICE_LINE.test(line))
    .map((line) => {
      if (!PRICE_SENTENCE.test(line)) return line;
      const kept = line.split(/(?<=[.!?])\s+/).filter((s) => !PRICE_SENTENCE.test(s));
      return kept.length ? kept.join(" ") : null;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Every string in a knowledge search result, stripped; ingest-time rent metadata dropped. */
export function withoutUnverifiedPricing(value: unknown): unknown {
  if (typeof value === "string") return stripUnverifiedPricing(value);
  if (Array.isArray(value)) return value.map(withoutUnverifiedPricing);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !PRICE_METADATA.has(key))
        .map(([key, v]) => [key, withoutUnverifiedPricing(v)])
    );
  }
  return value;
}

/**
 * What a failed internal call tells the model. Our routes' 4xx messages are
 * validation feedback it can act on ("Date must be YYYY-MM-DD format"); a 5xx
 * body stays in the logs.
 */
async function upstreamError(name: string, response: Response): Promise<string> {
  const errorText = await response.text().catch(() => "");
  console.error(`Tool ${name} upstream error ${response.status}:`, errorText);
  if (response.status >= 400 && response.status < 500) {
    try {
      const message = (JSON.parse(errorText) as { error?: unknown }).error;
      if (typeof message === "string" && message.trim()) {
        return `The ${name} request was rejected: ${message.trim().slice(0, 200)}`;
      }
    } catch {
      // Not our JSON error shape
    }
  }
  return `The ${name} request could not be completed.`;
}

/**
 * Tool calls in one round run in parallel, so two create_lead calls both saw
 * "no lead yet" and created two. Lead writes in one request run one at a time
 * instead, and the second updates the lead the first created. Across requests
 * (a phone call's tools arrive as separate HTTP calls) the conversation's
 * session lock does the same.
 */
function serializeLeadWrites<T>(ctx: ToolContext | undefined, write: () => Promise<T>): Promise<T> {
  if (!ctx) return write();
  const sessionKey = ctx.sessionKey;
  const locked = sessionKey ? () => withSessionLock(`lead:${sessionKey}`, write) : write;
  const run = (ctx.leadQueue ?? Promise.resolve()).then(locked);
  ctx.leadQueue = run.catch(() => undefined);
  return run;
}

function droppedNote(dropped: string[]) {
  return dropped.length
    ? {
        dropped_fields: dropped,
        note: `Saved without ${dropped.join(", ")}: not in a valid format. Don't tell them those were saved; ask again if they matter.`,
      }
    : {};
}

/**
 * create_lead for every channel: the conversation's first call creates the
 * lead through /api/leads; any later one (more details, a tour) is added to
 * that same lead instead of being refused or creating a duplicate.
 */
async function createOrUpdateLead(args: Row, baseUrl: string, ctx?: ToolContext): Promise<unknown> {
  const source = ctx?.leadSource ?? "chat";

  const existingId = ctx?.leadId ?? (await sessionLeadId(ctx?.sessionKey));
  if (existingId) {
    const prepared = prepareLeadInput(args, { source, citySlug: ctx?.citySlug, isNew: false });
    if ("error" in prepared) return { error: prepared.error };
    const updated = await updateSessionLead(existingId, prepared.data);
    if (updated && "error" in updated) return updated;
    if (updated) {
      if (ctx) ctx.leadId = updated.lead_id;
      return {
        ...updated,
        message: "Added to the request already saved for this conversation; it's one lead, so don't save it again.",
        ...droppedNote(prepared.dropped),
      };
    }
    // The lead was deleted since; start a new one.
  }

  // Prevent a prompt-injected turn from mass-creating leads/emails.
  if (ctx && ctx.leadsCreated >= MAX_LEADS_PER_REQUEST) {
    return { error: "A lead has already been created for this conversation." };
  }
  const prepared = prepareLeadInput(args, {
    source,
    citySlug: ctx?.citySlug,
    defaultPhone: ctx?.defaultPhone,
    isNew: true,
  });
  if ("error" in prepared) return { error: prepared.error };

  if (ctx) ctx.leadsCreated++;
  const response = await fetch(`${baseUrl}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...internalHeaders() },
    // source is set by the caller, never the model: letting the model pick
    // "web_form" mis-attributed leads and triggered the renter
    // tour-confirmation email path.
    body: JSON.stringify(prepared.data),
  });
  if (!response.ok) {
    if (ctx) ctx.leadsCreated--;
    return { error: await upstreamError("create_lead", response) };
  }

  const created = (await response.json()) as { lead_id?: string };
  if (created?.lead_id) {
    if (ctx) ctx.leadId = created.lead_id;
    // Tie the conversation to the lead it produced so the Chat Log can show
    // which sessions actually converted (and later calls update this lead).
    if (ctx?.sessionKey) {
      try {
        const { linkSessionToLead } = await import("@/lib/chat/session-log");
        await linkSessionToLead(ctx.sessionKey, created.lead_id);
      } catch (err) {
        console.error("Linking chat session to lead failed:", err);
      }
    }
  }
  return { ...created, ...droppedNote(prepared.dropped) };
}

/**
 * Trim the /api/buildings/[id] payload (every column, every unit with every
 * column, image-heavy relations) down to what the assistant needs.
 */
function compactBuildingDetails(payload: unknown): unknown {
  const b = (payload as { building?: Row } | null)?.building;
  if (!b || typeof b !== "object") return payload;

  const city = getFirstRelation(b.cities as Row | Row[] | null | undefined);
  const neighborhood = getFirstRelation(b.neighborhoods as Row | Row[] | null | undefined);
  const amenities = Array.isArray(b.amenities)
    ? b.amenities
        .map((a) => (a && typeof a === "object" ? (a as Row).name : null))
        .filter((n): n is string => typeof n === "string")
    : [];
  const facts = currentFacts(b.facts);
  const floorplans = Array.isArray(b.floorplans)
    ? b.floorplans.map((f) => pick(f, ["id", "name", "beds", "baths", "sqft", "sqft_min", "sqft_max"]))
    : [];
  // Verified units only; the building's price_range is recomputed from them
  // because the route's range includes stale captures.
  const units = (Array.isArray(b.units) ? b.units : []).filter((u) => {
    const latest = (u as Row).latest_price as { rent?: number; captured_at?: string } | null | undefined;
    return isVerifiedPrice(latest?.rent, latest?.captured_at);
  });
  const rents = units
    .map((u) => ((u as Row).latest_price as { rent?: number } | null)?.rent)
    .filter((r): r is number => typeof r === "number");
  const buildingId = typeof b.id === "string" ? b.id : null;

  return {
    building: {
      ...withPolicyText(pick(b, [
        "id", "name", "address_1", "zip", "year_built", "stories",
        "pet_policy", "parking_policy", "deposit_policy",
        "leasing_phone", "leasing_email", "website_url",
      ])),
      price_range: rents.length ? { min: Math.min(...rents), max: Math.max(...rents) } : null,
      description: truncate(b.description, MAX_DESCRIPTION_CHARS),
      city: city ? pick(city, ["name", "slug", "state"]) : null,
      neighborhood: neighborhood ? pick(neighborhood, ["name", "slug"]) : null,
      amenities,
      facts,
      floorplans,
      available_units_count: units.length,
      ...(units.length === 0
        ? {
            note:
              "No recently verified pricing for this building. Describe it, but don't quote rents " +
              "or say units are available; offer a tour request or a follow-up instead.",
          }
        : {}),
      units: units.slice(0, MAX_DETAIL_UNITS).map((u) => {
        const unit = pick(u, ["id", "unit_number", "beds", "baths", "sqft", "available_on"]);
        const latest = (u as Row).latest_price as { rent?: number; captured_at?: string } | null | undefined;
        return {
          ...unit,
          rent: latest?.rent ?? null,
          price_captured_at: latest?.captured_at ?? null,
          url: buildingId && typeof unit.id === "string" ? `/buildings/${buildingId}/units/${unit.id}` : null,
        };
      }),
      url: buildingId ? `/buildings/${buildingId}` : null,
    },
  };
}

// Shared tool executor for AI chat endpoints
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  baseUrl: string,
  ctx?: ToolContext
): Promise<unknown> {
  try {
    let response: Response;
    const jsonHeaders = { "Content-Type": "application/json", ...internalHeaders() };

    switch (name) {
      case "search_listings": {
        // Call the cached search directly instead of self-fetching /api/search —
        // avoids an extra function invocation + network hop. Validated with the
        // same schema the route uses. The model routinely writes "NYC"/"LA";
        // map shorthand onto the real database slugs before validating.
        // Fetch a full page and trim after filtering, so unverified rows
        // don't eat the model's requested count.
        const limit = clampSearchLimit(args.limit);
        const parsed = searchRequestSchema.safeParse({
          ...args,
          city_slug: normalizeCitySlug(args.city_slug),
          limit: MAX_SEARCH_LIMIT,
        });
        if (!parsed.success) {
          return { error: parsed.error.issues[0]?.message || "Invalid search parameters" };
        }
        return compactSearchResults(await cachedSearch(parsed.data), limit);
      }

      case "compare_buildings": {
        response = await fetch(`${baseUrl}/api/compare`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(args),
        });
        if (!response.ok) break;
        // Price stats come from verified units only (/api/compare); a side
        // with none has nothing to quote.
        const compared = (await response.json()) as Row;
        for (const side of ["building_a", "building_b"]) {
          const b = compared[side] as Row | undefined;
          if (b && !isVerifiedPrice(1, b.price_captured_at_max)) {
            delete b.price_stats;
            b.pricing_note = "No recently verified pricing; don't quote rents for this building.";
          }
        }
        return compared;
      }

      case "get_building_details":
        if (typeof args.building_id !== "string" || !isValidUUID(args.building_id)) {
          return { error: "Invalid building_id" };
        }
        response = await fetch(`${baseUrl}/api/buildings/${args.building_id}`, {
          method: "GET",
          headers: internalHeaders(),
        });
        if (!response.ok) break;
        return compactBuildingDetails(await response.json());

      case "search_knowledge": {
        const collectionId = process.env.XAI_COLLECTION_ID;
        if (!collectionId) {
          return { message: "Knowledge base not configured. Use search_listings for structured search instead." };
        }
        if (typeof args.query !== "string" || !args.query.trim()) {
          return { error: "Invalid query" };
        }
        const query = args.query.slice(0, MAX_KNOWLEDGE_QUERY_LENGTH);
        const results = await searchDocuments(query, [collectionId], "hybrid");
        // The schema advertises city_slug but the collection search has no
        // server-side filter; documents are ingested with a `city` metadata
        // field (scripts/upload-to-collection.ts), so filter on it here.
        const citySlug = normalizeCitySlug(args.city_slug);
        if (citySlug) {
          return withoutUnverifiedPricing({
            ...results,
            results: (results.results ?? []).filter(
              (r) => normalizeCitySlug(r.metadata?.city) === citySlug
            ),
          });
        }
        return withoutUnverifiedPricing(results);
      }

      case "create_lead":
        return await serializeLeadWrites(ctx, () => createOrUpdateLead(args, baseUrl, ctx));

      default:
        return { error: `Unknown tool: ${name}` };
    }

    if (!response.ok) {
      // Raw upstream bodies stay in the logs; only our 4xx messages go back.
      return { error: await upstreamError(name, response) };
    }

    return await response.json();
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return { error: `Failed to execute ${name}` };
  }
}
