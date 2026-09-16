import { searchDocuments } from "@/lib/xai/collections";
import { isValidUUID } from "@/lib/utils";
import { internalHeaders } from "@/lib/rate-limit";
import { cachedSearch, type SearchResponse } from "@/lib/search/cache";
import { searchRequestSchema } from "@/lib/validations";
import { normalizeCitySlug } from "@/lib/constants/cities";
import { getFirstRelation } from "@/lib/db-helpers";

// Per-request state passed through a single chat turn so tool usage can be
// bounded (e.g. at most one lead created per conversation turn).
export interface ToolContext {
  leadsCreated: number;
  /** Conversation this turn belongs to, so a created lead links to its transcript. */
  sessionKey?: string | null;
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

/** Compact, image-light projection of a search page for the model. */
function compactSearchResults(res: SearchResponse) {
  return {
    city: res.city,
    captured_at_max: res.captured_at_max,
    result_count: res.results.length,
    results: res.results.map((r) => {
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
        pet_policy: b.pet_policy ?? null,
        parking_policy: b.parking_policy ?? null,
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
  const facts = Array.isArray(b.facts) ? b.facts.map((f) => pick(f, ["key", "value"])) : [];
  const floorplans = Array.isArray(b.floorplans)
    ? b.floorplans.map((f) => pick(f, ["id", "name", "beds", "baths", "sqft", "sqft_min", "sqft_max"]))
    : [];
  const units = Array.isArray(b.units) ? b.units : [];
  const buildingId = typeof b.id === "string" ? b.id : null;

  return {
    building: {
      ...pick(b, [
        "id", "name", "address_1", "zip", "year_built", "stories",
        "pet_policy", "parking_policy", "deposit_policy",
        "leasing_phone", "leasing_email", "website_url", "price_range",
      ]),
      description: truncate(b.description, MAX_DESCRIPTION_CHARS),
      city: city ? pick(city, ["name", "slug", "state"]) : null,
      neighborhood: neighborhood ? pick(neighborhood, ["name", "slug"]) : null,
      amenities,
      facts,
      floorplans,
      available_units_count: units.length,
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
        const parsed = searchRequestSchema.safeParse({
          ...args,
          city_slug: normalizeCitySlug(args.city_slug),
          limit: clampSearchLimit(args.limit),
        });
        if (!parsed.success) {
          return { error: parsed.error.issues[0]?.message || "Invalid search parameters" };
        }
        return compactSearchResults(await cachedSearch(parsed.data));
      }

      case "compare_buildings":
        response = await fetch(`${baseUrl}/api/compare`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(args),
        });
        break;

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
          return {
            ...results,
            results: (results.results ?? []).filter(
              (r) => normalizeCitySlug(r.metadata?.city) === citySlug
            ),
          };
        }
        return results;
      }

      case "create_lead": {
        // Prevent a prompt-injected turn from mass-creating leads/emails.
        if (ctx && ctx.leadsCreated >= MAX_LEADS_PER_REQUEST) {
          return { error: "A lead has already been created for this conversation." };
        }
        // leads.contactable CHECK requires an email or a phone — tell the
        // model to ask rather than letting the insert fail opaquely.
        const email = typeof args.email === "string" ? args.email.trim() : "";
        const phone = typeof args.phone === "string" ? args.phone.trim() : "";
        if (!email && !phone) {
          return {
            error:
              "A lead needs an email address or a phone number. Ask the user for one, then call create_lead again.",
          };
        }
        response = await fetch(`${baseUrl}/api/leads`, {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            ...args,
            email: email || undefined,
            phone: phone || undefined,
            // Always attributed to chat: letting the model pick "web_form"
            // mis-attributed leads and triggered the renter tour-confirmation
            // email path.
            source: "chat",
            city_slug: normalizeCitySlug(args.city_slug),
          }),
        });
        if (ctx && response.ok) {
          ctx.leadsCreated++;
          // Tie the conversation to the lead it produced so the Chat Log can
          // show which sessions actually converted.
          if (ctx.sessionKey) {
            try {
              const created = (await response.clone().json()) as { lead_id?: string };
              if (created?.lead_id) {
                const { linkSessionToLead } = await import("@/lib/chat/session-log");
                await linkSessionToLead(ctx.sessionKey, created.lead_id);
              }
            } catch (err) {
              console.error("Linking chat session to lead failed:", err);
            }
          }
        }
        break;
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }

    if (!response.ok) {
      // Don't echo raw upstream error bodies back to the model/user.
      const errorText = await response.text();
      console.error(`Tool ${name} upstream error ${response.status}:`, errorText);
      return { error: `The ${name} request could not be completed.` };
    }

    return await response.json();
  } catch (error) {
    console.error(`Tool execution error (${name}):`, error);
    return { error: `Failed to execute ${name}` };
  }
}
