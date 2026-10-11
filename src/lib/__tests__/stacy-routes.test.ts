/**
 * Stacy's routes, with the model, database and tools mocked (no xAI calls):
 * - /api/chat/stream takes a building slug and separates rounds' text;
 * - /api/microsite-chat bounds every model call and forces an answer in time;
 * - /api/voice/tools counts failed and empty tool calls for Needs review;
 * - /api/compare prices from verified units only;
 * - /api/parse-query resolves "today" in Miami and takes a city context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeDb, fakeClient, type FakeDb } from "./fake-supabase";

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  create: null as unknown as (params: Record<string, unknown>, opts?: Record<string, unknown>) => unknown,
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: (fn: () => unknown) => fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => fakeClient(h.db) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/rate-limit")>();
  return { ...mod, rateLimit: async () => ({ success: true, resetTime: 0 }) };
});
vi.mock("@/lib/xai/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/xai/client")>();
  return {
    ...mod,
    createXAIClient: () => ({ chat: { completions: { create: (p: Record<string, unknown>, o?: Record<string, unknown>) => h.create(p, o) } } }),
  };
});

const sessionLog = vi.hoisted(() => ({ ensureChatSession: vi.fn(), logChatTurn: vi.fn(), recordToolHealth: vi.fn() }));
vi.mock("@/lib/chat/session-log", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/chat/session-log")>();
  return { ...mod, ...sessionLog };
});

const resolveChatBuilding = vi.hoisted(() => vi.fn());
vi.mock("@/lib/chat/building-context", () => ({ resolveChatBuilding }));

const executeTool = vi.hoisted(() => vi.fn());
vi.mock("@/lib/xai/tool-executor", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/xai/tool-executor")>();
  return { ...mod, executeTool };
});

const executeVoiceTool = vi.hoisted(() => vi.fn());
vi.mock("@/lib/voice/tools", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/voice/tools")>();
  return { ...mod, executeVoiceTool };
});

vi.mock("@/lib/microsite-cors", () => ({
  corsHeaders: () => ({}),
  isAllowedOrigin: () => true,
  originMatches: () => true,
}));

const fetchAvailableUnitPrices = vi.hoisted(() => vi.fn());
vi.mock("@/lib/search/fetch-enrichments", () => ({ fetchAvailableUnitPrices }));

vi.mock("@/lib/search/neighborhood-resolver", () => ({
  getNeighborhoodCatalog: async () => [],
  resolveNeighborhoods: () => ({ slugs: [], city_slug: null }),
}));

const { POST: streamPOST } = await import("@/app/api/chat/stream/route");
const { POST: micrositePOST } = await import("@/app/api/microsite-chat/route");
const { POST: voiceToolsPOST } = await import("@/app/api/voice/tools/route");
const { POST: comparePOST } = await import("@/app/api/compare/route");
const { POST: parsePOST } = await import("@/app/api/parse-query/route");

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const json = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

async function* chunks(parts: Record<string, unknown>[]) {
  for (const delta of parts) yield { choices: [{ delta }] };
}

beforeEach(() => {
  h.db = createFakeDb({ chat_sessions: [] });
  for (const fn of Object.values(sessionLog)) fn.mockReset();
  resolveChatBuilding.mockReset();
  executeTool.mockReset();
  executeVoiceTool.mockReset();
  fetchAvailableUnitPrices.mockReset();
  process.env.XAI_API_KEY = "test-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/chat/stream", () => {
  it("accepts a building slug, gives the model that building, and separates rounds", async () => {
    resolveChatBuilding.mockResolvedValue({ id: UUID, name: "Perrin Brickell" });
    executeTool.mockResolvedValue({ result_count: 2 });
    const seen: Record<string, unknown>[] = [];
    let round = 0;
    h.create = (params) => {
      seen.push(params);
      round++;
      return round === 1
        ? chunks([
            { content: "Let me check." },
            { tool_calls: [{ index: 0, id: "t1", function: { name: "search_listings", arguments: "{}" } }] },
          ])
        : chunks([{ content: "Here are two." }]);
    };

    const res = await streamPOST(
      json("https://staycio.com/api/chat/stream", {
        messages: [{ role: "user", content: "2 beds here?" }],
        building_id: "perrin-brickell",
        session_key: "abcdefgh12345678",
      })
    );
    expect(res.status).toBe(200);
    const events = (await res.text())
      .split("\n\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)) as { type: string; content?: string });
    const text = events.filter((e) => e.type === "content").map((e) => e.content).join("");
    expect(text).toBe("Let me check.\n\nHere are two.");
    expect(events.some((e) => e.type === "status")).toBe(true);

    expect(resolveChatBuilding).toHaveBeenCalledWith("perrin-brickell");
    const system = (seen[0].messages as { content: string }[])[0].content;
    expect(system).toContain(`User is viewing Perrin Brickell (building ID: ${UUID})`);
    // The session exists before any tool can link a lead to it.
    expect(sessionLog.ensureChatSession).toHaveBeenCalledWith(
      expect.objectContaining({ sessionKey: "abcdefgh12345678", firstQuestion: "2 beds here?" })
    );
    expect(sessionLog.logChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ buildingId: UUID, assistantMessage: "Let me check.\n\nHere are two." })
    );
  });

  it("answers without building context when the slug is unknown", async () => {
    resolveChatBuilding.mockResolvedValue(null);
    let system = "";
    h.create = (params) => {
      system = (params.messages as { content: string }[])[0].content;
      return chunks([{ content: "Sure." }]);
    };
    const res = await streamPOST(
      json("https://staycio.com/api/chat/stream", { messages: [{ role: "user", content: "hi" }], building_id: "gone-building" })
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(system).not.toContain("User is viewing");
  });
});

describe("POST /api/microsite-chat", () => {
  const body = { domain: "perrinbrickell.com", session_id: "abcdefgh1234", messages: [{ role: "user", content: "Any 2 beds?" }] };
  const req = () => json("https://staycio.com/api/microsite-chat", body, { origin: "https://perrinbrickell.com" });

  it("bounds every model call and forces a final answer once ~40s have gone", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T15:00:00Z"));
    executeVoiceTool.mockResolvedValue({ result_count: 0 });
    const calls: { tools: boolean; opts?: Record<string, unknown> }[] = [];
    h.create = async (params, opts) => {
      calls.push({ tools: Boolean(params.tools), opts });
      vi.setSystemTime(new Date(Date.now() + 21_000));
      return params.tools
        ? { choices: [{ message: { content: null, tool_calls: [{ id: `c${calls.length}`, type: "function", function: { name: "search_listings", arguments: "{}" } }] } }] }
        : { choices: [{ message: { content: "Nothing verified right now. Want the team to send options?" } }] };
    };

    const res = await micrositePOST(req());
    expect(await res.json()).toEqual({ reply: "Nothing verified right now. Want the team to send options?" });
    expect(calls.map((c) => c.tools)).toEqual([true, true, false]);
    expect(calls.map((c) => c.opts)).toEqual([
      { timeout: 20_000, maxRetries: 0 },
      { timeout: 20_000, maxRetries: 0 },
      { timeout: 8_000, maxRetries: 0 },
    ]);
    expect(sessionLog.logChatTurn).toHaveBeenCalledWith(expect.objectContaining({ error: null }));
  });

  it("replies with the fallback and still stores the turn when a call times out", async () => {
    h.create = async () => {
      throw new Error("Request timed out.");
    };
    const res = await micrositePOST(req());
    expect((await res.json()).reply).toMatch(/hit a snag/);
    expect(sessionLog.logChatTurn).toHaveBeenCalledWith(expect.objectContaining({ error: "microsite chat produced no reply" }));
  });

  it("forces Miami as the lead city on this channel", async () => {
    h.create = async (params) =>
      params.tools && !executeVoiceTool.mock.calls.length
        ? { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "create_lead", arguments: '{"city_slug":"brickell","name":"Jane","phone":"3055551234"}' } }] } }] }
        : { choices: [{ message: { content: "Saved!" } }] };
    executeVoiceTool.mockResolvedValue({ saved: true });
    await micrositePOST(req());
    expect(executeVoiceTool.mock.calls[0][2]).toMatchObject({ citySlug: "miami", sourceDetail: "perrinbrickell.com" });
  });
});

describe("POST /api/voice/tools", () => {
  const call = { id: "call-_+13055551234_Ab9x", caller: "+13055551234", dialed: "+13059521558" };
  beforeEach(() => {
    process.env.VOICE_AGENT_SECRET = "voice-secret";
  });
  const post = (name: string) =>
    voiceToolsPOST(
      json("https://staycio.com/api/voice/tools", { name, args: {}, call }, { authorization: "Bearer voice-secret" })
    );

  it("counts an empty search or an error against the call's session", async () => {
    executeVoiceTool.mockResolvedValueOnce({ result_count: 0, results: [] });
    await post("search_listings");
    executeVoiceTool.mockResolvedValueOnce({ error: "Couldn't tell which building." });
    await post("get_building_details");
    expect(sessionLog.recordToolHealth.mock.calls).toEqual([
      ["voice_call-_13055551234_Ab9x", { resultCount: 0, error: null }],
      ["voice_call-_13055551234_Ab9x", { resultCount: null, error: "Couldn't tell which building." }],
    ]);
  });

  it("records nothing for a call that found results", async () => {
    executeVoiceTool.mockResolvedValueOnce({ result_count: 3, results: [{}, {}, {}] });
    const res = await post("search_listings");
    expect(await res.json()).toEqual({ result: { result_count: 3, results: [{}, {}, {}] } });
    expect(sessionLog.recordToolHealth).not.toHaveBeenCalled();
  });
});

describe("POST /api/compare", () => {
  it("computes price stats from verified units only", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
    h.db = createFakeDb({
      buildings: [
        { id: UUID, name: "A", pet_policy: null, parking_policy: null },
        { id: UUID_B, name: "B", pet_policy: null, parking_policy: null },
      ],
      building_amenities: [],
    });
    fetchAvailableUnitPrices.mockImplementation(async (_s: unknown, [id]: string[]) =>
      id === UUID
        ? [
            { id: "u1", building_id: UUID, beds: 1, latest_rent: 3000, price_captured_at: "2026-10-05T00:00:00Z" },
            { id: "u2", building_id: UUID, beds: 1, latest_rent: 1200, price_captured_at: "2026-01-10T00:00:00Z" },
            { id: "u3", building_id: UUID, beds: 1, latest_rent: 9000, price_captured_at: "2026-02-07T00:00:00Z" },
          ]
        : [{ id: "u4", building_id: UUID_B, beds: 2, latest_rent: 1500, price_captured_at: "2026-01-10T00:00:00Z" }]
    );
    const res = await comparePOST(json("https://staycio.com/api/compare", { building_a_id: UUID, building_b_id: UUID_B }));
    const out = await res.json();
    expect(out.building_a.price_stats.by_beds).toEqual({ "1": { min: 3000, median: 3000, max: 3000 } });
    expect(out.building_a.price_captured_at_max).toBe("2026-10-05T00:00:00Z");
    expect(out.building_b.price_stats.by_beds).toEqual({});
    expect(out.building_b.price_captured_at_max).toBeNull();
  });
});

describe("POST /api/parse-query", () => {
  let prompts: { system: string; user: string };
  beforeEach(() => {
    h.create = async (params) => {
      const msgs = params.messages as { content: string }[];
      prompts = { system: msgs[0].content, user: msgs[1].content };
      return { choices: [{ message: { content: '{"move_in_date":"2026-10-11"}' } }] };
    };
  });

  it("resolves today in Miami, not UTC, after 8 PM Eastern", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T01:30:00Z"));
    const res = await parsePOST(json("https://staycio.com/api/parse-query", { query: "2 bed ASAP" }));
    expect(prompts.system).toContain("today is 2026-10-11");
    expect((await res.json()).filters.move_in_date).toBe("2026-10-11");
  });

  it("takes the page's city as context and ignores anything that isn't a city", async () => {
    await parsePOST(json("https://staycio.com/api/parse-query", { query: "downtown 1 bed", city_slug: "Miami" }));
    expect(prompts.user).toContain("current city context: miami");
    await parsePOST(json("https://staycio.com/api/parse-query", { query: "downtown 1 bed", city_slug: "atlantis" }));
    expect(prompts.user).not.toContain("current city context");
  });
});
