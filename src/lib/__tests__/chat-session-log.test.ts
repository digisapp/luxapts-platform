import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * The writer must never break a chat response, so these cover the failure
 * paths as much as the happy one.
 */

const state: {
  sessions: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  updates: Record<string, unknown>[];
  failInsertOn?: string;
  existingSession?: Record<string, unknown> | null;
} = { sessions: [], messages: [], updates: [], existingSession: null };

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const api: Record<string, unknown> = {
        select: () => api,
        eq: () => api,
        order: () => api,
        maybeSingle: async () =>
          table === "chat_sessions" ? { data: state.existingSession ?? null } : { data: null },
        single: async () => ({ data: { id: "session-1" }, error: null }),
        insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
          if (state.failInsertOn === table) {
            return {
              select: () => ({ single: async () => ({ data: null, error: { message: "boom" } }) }),
              then: undefined,
              error: { message: "boom" },
            } as never;
          }
          const list = Array.isArray(rows) ? rows : [rows];
          if (table === "chat_sessions") state.sessions.push(...list);
          if (table === "chat_messages") state.messages.push(...list);
          const result = {
            select: () => ({ single: async () => ({ data: { id: "session-1" }, error: null }) }),
          };
          // insert() is awaited directly for chat_messages
          return Object.assign(Promise.resolve({ error: null }), result) as never;
        },
        update(values: Record<string, unknown>) {
          state.updates.push(values);
          return { eq: async () => ({ error: null }) };
        },
      };
      if (table === "chat_messages") {
        api.select = () => ({ eq: async () => ({ count: state.messages.length }) });
      }
      return api;
    },
  }),
}));

import { logChatTurn, isValidSessionKey, linkSessionToLead } from "@/lib/chat/session-log";

beforeEach(() => {
  state.sessions = [];
  state.messages = [];
  state.updates = [];
  state.existingSession = null;
  state.failInsertOn = undefined;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("isValidSessionKey", () => {
  it("accepts url-safe keys of a sane length", () => {
    expect(isValidSessionKey("a".repeat(32))).toBe(true);
    expect(isValidSessionKey("abc-123_XYZ890")).toBe(true);
  });

  it("rejects anything that could be injected or is too short", () => {
    expect(isValidSessionKey("short")).toBe(false);
    expect(isValidSessionKey("has spaces here")).toBe(false);
    expect(isValidSessionKey("semi;colon;value")).toBe(false);
    expect(isValidSessionKey("a".repeat(200))).toBe(false);
    expect(isValidSessionKey(undefined)).toBe(false);
    expect(isValidSessionKey(12345678)).toBe(false);
  });
});

describe("logChatTurn", () => {
  const key = "abcd1234efgh5678";

  it("creates a session and stores the turn in order", async () => {
    await logChatTurn({
      sessionKey: key,
      userMessage: "2 bed in Brickell under 3000",
      assistantMessage: "Here are two options.",
      toolCalls: [{ name: "search_listings", args: { city_slug: "miami" }, resultCount: 2 }],
    });

    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].first_question).toBe("2 bed in Brickell under 3000");
    expect(state.messages.map((m) => m.role)).toEqual(["user", "tool", "assistant"]);
    expect(state.messages.map((m) => m.seq)).toEqual([0, 1, 2]);
    expect(state.messages[1].tool_name).toBe("search_listings");
    expect(state.messages[1].result_count).toBe(2);
  });

  it("counts a zero-result search as an empty-results signal", async () => {
    await logChatTurn({
      sessionKey: key,
      userMessage: "anything in Boston",
      assistantMessage: "I could not find anything.",
      toolCalls: [{ name: "search_listings", resultCount: 0 }],
    });
    expect(state.updates[0].empty_results_count).toBe(1);
    expect(state.updates[0].error_count).toBe(0);
  });

  it("counts tool and turn errors so failures are findable", async () => {
    await logChatTurn({
      sessionKey: key,
      userMessage: "find me something",
      toolCalls: [{ name: "search_listings", error: "upstream timeout" }],
      error: "stream failed",
    });
    expect(state.updates[0].error_count).toBe(2);
  });

  it("ignores an invalid session key rather than writing a junk row", async () => {
    await logChatTurn({ sessionKey: "bad key", userMessage: "hi" });
    expect(state.sessions).toHaveLength(0);
    expect(state.messages).toHaveLength(0);
  });

  it("appends after existing messages instead of renumbering them", async () => {
    state.existingSession = {
      id: "session-1",
      messages_count: 2,
      tool_calls_count: 0,
      error_count: 0,
      empty_results_count: 0,
    };
    state.messages = [{ seq: 0 }, { seq: 1 }];
    await logChatTurn({ sessionKey: key, userMessage: "follow up", assistantMessage: "sure" });
    const added = state.messages.slice(2);
    expect(added.map((m) => m.seq)).toEqual([2, 3]);
  });

  it("never throws when the database is unavailable", async () => {
    state.failInsertOn = "chat_sessions";
    await expect(
      logChatTurn({ sessionKey: key, userMessage: "hi" })
    ).resolves.toBeUndefined();
  });
});

describe("linkSessionToLead", () => {
  it("marks the session resolved and attaches the lead", async () => {
    await linkSessionToLead("abcd1234efgh5678", "lead-9");
    expect(state.updates[0]).toMatchObject({ lead_id: "lead-9", resolved: true });
  });

  it("ignores an invalid key", async () => {
    await linkSessionToLead("nope", "lead-9");
    expect(state.updates).toHaveLength(0);
  });
});
