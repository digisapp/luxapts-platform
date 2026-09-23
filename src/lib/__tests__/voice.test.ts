import { describe, it, expect, afterEach } from "vitest";
import {
  isVerifiedPrice,
  policyText,
  spokenAvailability,
  verifiedSearchResults,
  verifiedBuildingDetails,
} from "@/lib/voice/verified";
import { callSessionKey, isVoiceAgentRequest, parseCallInfo } from "@/lib/voice/auth";
import { transcriptToTurns, parseTranscript } from "@/lib/voice/transcript";
import { isValidSessionKey } from "@/lib/chat/session-log";
import { VOICE_TOOL_SCHEMAS } from "@/lib/voice/prompt";
import { VOICE_TOOL_NAMES } from "@/lib/voice/tools";

const NOW = new Date("2026-09-23T12:00:00Z");

describe("isVerifiedPrice", () => {
  it("accepts a positive rent captured inside the window", () => {
    expect(isVerifiedPrice(3200, "2026-09-10T00:00:00Z", NOW)).toBe(true);
  });
  it("rejects January prices (the fabricated units)", () => {
    expect(isVerifiedPrice(3200, "2026-01-15T00:00:00Z", NOW)).toBe(false);
  });
  it("rejects missing or zero rent and bad dates", () => {
    expect(isVerifiedPrice(0, "2026-09-10T00:00:00Z", NOW)).toBe(false);
    expect(isVerifiedPrice(null, "2026-09-10T00:00:00Z", NOW)).toBe(false);
    expect(isVerifiedPrice(3200, null, NOW)).toBe(false);
    expect(isVerifiedPrice(3200, "garbage", NOW)).toBe(false);
  });
});

describe("verifiedSearchResults", () => {
  const fresh = (rent: number) => ({ unit_id: `u${rent}`, rent, price_captured_at: "2026-09-20T00:00:00Z" });
  const stale = { unit_id: "old", rent: 1500, price_captured_at: "2026-01-02T00:00:00Z" };

  it("drops stale units and reports how many", () => {
    const out = verifiedSearchResults({ results: [stale, fresh(3000)] }, "best_match", NOW) as {
      results: { unit_id: string }[];
      unverified_omitted: number;
    };
    expect(out.results.map((r) => r.unit_id)).toEqual(["u3000"]);
    expect(out.unverified_omitted).toBe(1);
  });

  it("sorts by price after filtering, and caps what is spoken", () => {
    const rows = [4000, 2500, 3500, 2000, 5000, 3000].map(fresh);
    const out = verifiedSearchResults({ results: [stale, ...rows] }, "price_low", NOW) as {
      results: { rent: number }[];
    };
    expect(out.results.map((r) => r.rent)).toEqual([2000, 2500, 3000, 3500, 4000]);
  });

  it("tells the model not to quote when nothing is verified", () => {
    const out = verifiedSearchResults({ results: [stale] }, "best_match", NOW) as { note?: string };
    expect(out.note).toMatch(/Do not quote/);
  });
});

describe("verifiedBuildingDetails", () => {
  it("replaces units with verified rows and drops the unbacked price_range", () => {
    const details = { building: { id: "b", name: "X", price_range: "$1,000+", units: [{}], url: "/b" } };
    const out = verifiedBuildingDetails(
      details,
      [
        { beds: 1, latest_rent: "3100", price_captured_at: "2026-09-20T00:00:00Z" },
        { beds: 2, latest_rent: "1200", price_captured_at: "2026-01-20T00:00:00Z" },
      ],
      NOW
    ) as { building: Record<string, unknown> };
    expect(out.building.verified_available_units).toBe(1);
    expect(out.building.units).toEqual([
      { beds: 1, baths: undefined, sqft: undefined, rent: 3100, price_captured_at: "2026-09-20T00:00:00Z", available: null },
    ]);
    expect(out.building.price_range).toBeUndefined();
    expect(out.building.url).toBeUndefined();
  });
});

describe("spoken fields", () => {
  it("says a past move-in date as now", () => {
    expect(spokenAvailability("2026-05-11", NOW)).toBe("now");
    expect(spokenAvailability("2026-11-03", NOW)).toBe("2026-11-03");
    expect(spokenAvailability(null, NOW)).toBeNull();
  });
  it("drops scraper filler from policies", () => {
    expect(policyText("Not specified in provided HTML")).toBeNull();
    expect(policyText("Pet friendly community with pet spa")).toBe("Pet friendly community with pet spa");
  });
});

describe("voice auth", () => {
  const original = process.env.VOICE_AGENT_SECRET;
  afterEach(() => {
    process.env.VOICE_AGENT_SECRET = original;
  });
  const req = (auth?: string) =>
    new Request("https://x/api/voice/tools", { headers: auth ? { authorization: auth } : {} });

  it("is closed when the secret is unset", () => {
    delete process.env.VOICE_AGENT_SECRET;
    expect(isVoiceAgentRequest(req("Bearer "))).toBe(false);
  });
  it("accepts only the exact bearer secret", () => {
    process.env.VOICE_AGENT_SECRET = "s3cret-value";
    expect(isVoiceAgentRequest(req("Bearer s3cret-value"))).toBe(true);
    expect(isVoiceAgentRequest(req("Bearer s3cret-valuX"))).toBe(false);
    expect(isVoiceAgentRequest(req("s3cret-value"))).toBe(false);
    expect(isVoiceAgentRequest(req())).toBe(false);
  });
});

describe("call info", () => {
  it("normalises numbers and rejects junk", () => {
    expect(parseCallInfo({ id: "call-_+13055551234_ab", caller: "+1 (305) 555-1234", dialed: "nope" })).toEqual({
      id: "call-_+13055551234_ab",
      caller: "+13055551234",
      dialed: null,
    });
    expect(parseCallInfo({ caller: "+13055551234" })).toBeNull();
    // LiveKit sends the dialed number without the plus.
    expect(parseCallInfo({ id: "x", dialed: "13059521558" })?.dialed).toBe("+13059521558");
    expect(parseCallInfo({ id: "x", dialed: "3059521558" })?.dialed).toBe("+13059521558");
  });
  it("builds a session key the transcript log accepts", () => {
    expect(isValidSessionKey(callSessionKey("call-_+13055551234_Ab9x"))).toBe(true);
  });
});

describe("transcriptToTurns", () => {
  it("groups greeting, user turns, tools and replies", () => {
    const turns = transcriptToTurns(
      "voice_k",
      parseTranscript([
        { role: "assistant", text: "Hi, this is Stacy." },
        { role: "user", text: "Two beds in Brickell?" },
        { role: "tool", name: "search_listings", args: { city_slug: "miami" } },
        { role: "assistant", text: "One sec." },
        { role: "assistant", text: "Found two." },
        { role: "user", text: "Book Perrin." },
        { role: "bogus", text: "x" },
      ])
    );
    expect(turns).toHaveLength(3);
    expect(turns[0]).toMatchObject({ userMessage: "", assistantMessage: "Hi, this is Stacy." });
    expect(turns[1]).toMatchObject({ userMessage: "Two beds in Brickell?", assistantMessage: "One sec. Found two." });
    expect(turns[1].toolCalls).toEqual([{ name: "search_listings", args: { city_slug: "miami" }, error: null }]);
    expect(turns[2]).toMatchObject({ userMessage: "Book Perrin.", assistantMessage: null, surface: "voice" });
  });
});

describe("voice tool schemas", () => {
  it("cover exactly the tools the route executes", () => {
    expect(VOICE_TOOL_SCHEMAS.map((s) => s.name).sort()).toEqual([...VOICE_TOOL_NAMES].sort());
  });
});
