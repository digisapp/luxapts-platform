/**
 * Web chat plumbing: building pages send a slug, history stays inside the
 * API's limits, the session row exists before a lead links to it, tool
 * failures count toward Needs review, and "today" is Miami's.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeDb, fakeClient, type FakeDb } from "./fake-supabase";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, throws: false }));
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => {
    if (h.throws) throw new Error("no db");
    return fakeClient(h.db);
  },
}));

import { chatRequestSchema, micrositeAnalyticsSchema } from "@/lib/validations";
import { resolveChatBuilding } from "@/lib/chat/building-context";
import { historyForApi, MAX_HISTORY_CHARS, MAX_MESSAGE_CHARS } from "@/lib/chat/history";
import { ensureChatSession, recordToolHealth } from "@/lib/chat/session-log";
import { miamiToday, startOfMiamiDay } from "@/lib/chat/miami-time";
import { spokenAvailability } from "@/lib/voice/verified";

const UUID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  h.throws = false;
  h.db = createFakeDb({
    buildings: [
      { id: UUID, slug: "perrin-brickell", name: "Perrin\nBrickell", status: "active" },
      { id: "22222222-2222-4222-8222-222222222222", slug: "old-seed", name: "Seed", status: "inactive" },
    ],
    chat_sessions: [],
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("chatRequestSchema building_id", () => {
  const base = { messages: [{ role: "user", content: "hi" }] };
  it("accepts the slug building pages now send, and old UUIDs", () => {
    expect(chatRequestSchema.safeParse({ ...base, building_id: "perrin-brickell" }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ ...base, building_id: UUID }).success).toBe(true);
  });
  it("still rejects anything that isn't a slug or UUID", () => {
    for (const bad of ["../admin", "a b", "x".repeat(121), "perrin;drop"]) {
      expect(chatRequestSchema.safeParse({ ...base, building_id: bad }).success).toBe(false);
    }
  });
});

describe("resolveChatBuilding", () => {
  it("resolves a slug or a UUID to the active row", async () => {
    expect(await resolveChatBuilding("perrin-brickell")).toEqual({ id: UUID, name: "Perrin Brickell" });
    expect(await resolveChatBuilding("Perrin-Brickell")).toEqual({ id: UUID, name: "Perrin Brickell" });
    expect(await resolveChatBuilding(UUID)).toEqual({ id: UUID, name: "Perrin Brickell" });
  });
  it("gives no context, never an error, for unknown, inactive or unreadable", async () => {
    expect(await resolveChatBuilding("no-such-building")).toBeNull();
    expect(await resolveChatBuilding("old-seed")).toBeNull();
    expect(await resolveChatBuilding(undefined)).toBeNull();
    h.throws = true;
    expect(await resolveChatBuilding("perrin-brickell")).toBeNull();
  });
});

describe("historyForApi", () => {
  it("never re-sends error bubbles or rejected messages", () => {
    const out = historyForApi([
      { role: "user", content: "x".repeat(20) },
      { role: "assistant", content: "answer" },
      { role: "user", content: "too long", excluded: true },
      { role: "assistant", content: "Message too long", excluded: true },
      { role: "user", content: "next" },
    ]);
    expect(out.map((m) => m.content)).toEqual(["x".repeat(20), "answer", "next"]);
    expect(out[0]).not.toHaveProperty("excluded");
  });
  it("stays inside the per-message and total limits, dropping the oldest", () => {
    const long = (n: number) => ({ role: "assistant" as const, content: "y".repeat(n) });
    const out = historyForApi([long(30_000), long(15_000), long(15_000), long(MAX_MESSAGE_CHARS + 5), { role: "user", content: "q" }]);
    expect(out.every((m) => m.content.length <= MAX_MESSAGE_CHARS)).toBe(true);
    expect(out.reduce((s, m) => s + m.content.length, 0)).toBeLessThanOrEqual(MAX_HISTORY_CHARS);
    expect(out[out.length - 1].content).toBe("q");
  });
});

describe("ensureChatSession", () => {
  it("creates the row up front with the opening question", async () => {
    await ensureChatSession({ sessionKey: "abcdefgh1234", surface: "chat", firstQuestion: "2 beds?" });
    expect(h.db.tables.chat_sessions).toEqual([
      expect.objectContaining({ session_key: "abcdefgh1234", surface: "chat", first_question: "2 beds?", messages_count: 0 }),
    ]);
  });
  it("treats an existing row as normal and ignores bad keys", async () => {
    h.db.insertError.chat_sessions = { code: "23505" };
    await ensureChatSession({ sessionKey: "abcdefgh1234" });
    await ensureChatSession({ sessionKey: "bad key" });
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("recordToolHealth", () => {
  it("counts an error or an empty result against the session", async () => {
    h.db.tables.chat_sessions.push({ id: "s1", session_key: "voice_call1abc", error_count: 0, empty_results_count: 2 });
    await recordToolHealth("voice_call1abc", { resultCount: 0, error: null });
    await recordToolHealth("voice_call1abc", { resultCount: null, error: "lookup failed" });
    await recordToolHealth("voice_call1abc", { resultCount: 3, error: null });
    expect(h.db.tables.chat_sessions[0]).toMatchObject({ error_count: 1, empty_results_count: 3 });
  });
});

describe("Miami today", () => {
  // 9:30 PM in Miami on Oct 11 is already Oct 12 in UTC.
  const evening = new Date("2026-10-12T01:30:00Z");

  it("keeps the Miami date after 8 PM Eastern", () => {
    expect(miamiToday(evening)).toBe("2026-10-11");
    expect(startOfMiamiDay(evening).toISOString()).toBe("2026-10-11T04:00:00.000Z");
    // Standard time, after the November switch.
    expect(startOfMiamiDay(new Date("2026-11-20T03:00:00Z")).toISOString()).toBe("2026-11-19T05:00:00.000Z");
  });
  it("doesn't call tomorrow's unit available now on an evening call", () => {
    expect(spokenAvailability("2026-10-12", evening)).toBe("2026-10-12");
    expect(spokenAvailability("2026-10-11", evening)).toBe("now");
  });
});

describe("microsite analytics", () => {
  it("accepts the live-availability strip's inventory_shown event", () => {
    const r = micrositeAnalyticsSchema.safeParse({
      type: "event",
      domain: "perrinbrickell.com",
      session_id: "abc123xyz",
      path: "/",
      event_name: "inventory_shown",
      properties: { available: 3 },
    });
    expect(r.success).toBe(true);
  });
});
