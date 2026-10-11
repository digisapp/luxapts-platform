/**
 * Stacy's leads, on every channel: one lead per conversation, later tool
 * calls add to it (a tour booked after the contact details were saved used to
 * be refused silently), malformed optional fields are dropped instead of
 * losing the lead, and /api/leads' own 4xx message reaches the model.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFakeDb, fakeClient, type FakeDb } from "./fake-supabase";

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
vi.mock("@/lib/supabase/server", () => ({ createAdminClient: () => fakeClient(h.db) }));

const bridge = vi.hoisted(() => vi.fn());
vi.mock("@/lib/leads/bridge", () => ({ bridgeLeadToShowing: bridge }));

const slots = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tours/slots", () => ({ getBuildingTourSlots: slots }));

import { createLeadSchema } from "@/lib/validations";
import {
  mergeNotes,
  normalizeTourTime,
  prepareLeadInput,
  updateSessionLead,
} from "@/lib/xai/session-lead";
import { executeTool, type ToolContext } from "@/lib/xai/tool-executor";
import { executeVoiceTool, phoneChannel, toolOutcome, type LeadChannel } from "@/lib/voice/tools";

const BUILDING = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";
const SESSION = "sess_abcdefgh12345";

let fetchMock: ReturnType<typeof vi.fn>;
let postedLeads: Record<string, unknown>[];

beforeEach(() => {
  h.db = createFakeDb({
    chat_sessions: [{ id: "cs1", session_key: SESSION, lead_id: null }],
    leads: [],
    lead_targets: [],
    lead_events: [],
    buildings: [{ id: BUILDING, name: "Perrin Brickell", status: "active", cities: { slug: "miami" } }],
  });
  bridge.mockReset();
  bridge.mockResolvedValue("showing-1");
  slots.mockReset();
  slots.mockResolvedValue([]);
  postedLeads = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/api/leads")) {
      const body = JSON.parse(String(init?.body));
      postedLeads.push(body);
      const id = postedLeads.length === 1 ? LEAD : `lead-${postedLeads.length}`;
      h.db.tables.leads.push({ id, name: body.name ?? null, user_email: body.email ?? null, user_phone: body.phone ?? null, notes: body.notes ?? null });
      return new Response(JSON.stringify({ lead_id: id, status: "new" }), { status: 201 });
    }
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("normalizeTourTime", () => {
  it("turns spoken and 12-hour times into HH:MM", () => {
    expect(normalizeTourTime("2:00 PM")).toBe("14:00");
    expect(normalizeTourTime("2pm")).toBe("14:00");
    expect(normalizeTourTime("10:30 a.m.")).toBe("10:30");
    expect(normalizeTourTime("12 am")).toBe("00:00");
    expect(normalizeTourTime("noon")).toBe("12:00");
    expect(normalizeTourTime("14:00:00")).toBe("14:00");
    expect(normalizeTourTime("9:30")).toBe("09:30");
  });
  it("rejects what isn't a clock time rather than guessing", () => {
    expect(normalizeTourTime("14")).toBeNull();
    expect(normalizeTourTime("25:00")).toBeNull();
    expect(normalizeTourTime("13pm")).toBeNull();
    expect(normalizeTourTime("afternoon")).toBeNull();
    expect(normalizeTourTime(undefined)).toBeNull();
  });
});

describe("prepareLeadInput", () => {
  const isNew = { source: "chat" as const, isNew: true };

  it("drops a bad email when a good phone carries the lead", () => {
    const out = prepareLeadInput({ city_slug: "miami", email: "jane@", phone: "305-555-1234" }, isNew);
    expect(out).toMatchObject({ data: { phone: "305-555-1234" }, dropped: ["email"] });
    expect("data" in out && out.data.email).toBeFalsy();
  });

  it("asks again when the only contact given is invalid", () => {
    const out = prepareLeadInput({ city_slug: "miami", email: "jane@" }, isNew);
    expect(out).toEqual({ error: expect.stringMatching(/email they gave doesn't look valid/) });
    expect(prepareLeadInput({ city_slug: "miami" }, isNew)).toEqual({
      error: expect.stringMatching(/needs an email address or a phone number/),
    });
  });

  it("normalizes or drops malformed optional fields instead of failing the lead", () => {
    const out = prepareLeadInput(
      {
        city_slug: "Miami",
        name: "Jane",
        email: "jane@example.com",
        tour_time: "2:00 PM",
        tour_date: "next friday",
        move_in_date: "2026-11-01T00:00:00Z",
        budget_max: "$3,500",
        beds: 1.5,
        targets: [{ building_id: "not-a-uuid" }, { building_id: BUILDING, rank: 1 }],
      },
      isNew
    );
    expect("data" in out).toBe(true);
    if (!("data" in out)) return;
    expect(out.data).toMatchObject({
      city_slug: "miami",
      tour_time: "14:00",
      move_in_date: "2026-11-01",
      budget_max: 3500,
      targets: [{ building_id: BUILDING, rank: 1 }],
    });
    expect(out.data.tour_date).toBeUndefined();
    expect(out.dropped.sort()).toEqual(["beds", "tour_date"]);
    // What comes out is exactly what /api/leads accepts.
    expect(createLeadSchema.safeParse(out.data).success).toBe(true);
  });

  it("rejects an unknown city for a new lead, and the microsite channel forces Miami", () => {
    expect(prepareLeadInput({ city_slug: "atlantis", phone: "3055551234" }, isNew)).toEqual({
      error: expect.stringMatching(/Unknown city_slug "atlantis"/),
    });
    const forced = prepareLeadInput({ city_slug: "atlantis", phone: "3055551234" }, { ...isNew, citySlug: "miami" });
    expect("data" in forced && forced.data.city_slug).toBe("miami");
  });

  it("uses caller ID for a new lead only, and needs no contact to add to one", () => {
    const fresh = prepareLeadInput({ city_slug: "miami" }, { ...isNew, defaultPhone: "+13055551234" });
    expect("data" in fresh && fresh.data.phone).toBe("+13055551234");
    const update = prepareLeadInput(
      { beds: 2 },
      { source: "voice", isNew: false, defaultPhone: "+13055551234" }
    );
    expect(update).toEqual({ data: expect.objectContaining({ beds: 2 }), dropped: [] });
    expect("data" in update && update.data.phone).toBeUndefined();
  });
});

describe("mergeNotes", () => {
  it("appends only new lines and reports nothing new as null", () => {
    expect(mergeNotes("Phone call from +1305.", "Wants 2 beds\nPhone call from +1305.")).toBe(
      "Phone call from +1305.\nWants 2 beds"
    );
    expect(mergeNotes("Phone call from +1305.", "Phone call from +1305.")).toBeNull();
    expect(mergeNotes(null, "First note")).toBe("First note");
  });
});

describe("updateSessionLead", () => {
  it("writes the tour, adds the building, logs it and posts the showing", async () => {
    h.db.tables.leads.push({ id: LEAD, name: "Jane", user_email: null, user_phone: "+13055551234", notes: "Stacy chat." });
    const out = await updateSessionLead(LEAD, {
      source: "chat",
      city_slug: "miami",
      tour_date: "2026-10-15",
      tour_time: "14:00",
      notes: "Stacy chat.\nWants a pool",
      targets: [{ building_id: BUILDING, rank: 1 }],
    });
    expect(out).toEqual({
      lead_id: LEAD,
      updated: true,
      fields: ["tour_date", "tour_time", "notes"],
      bridged: true,
    });
    expect(h.db.tables.leads[0]).toMatchObject({ tour_date: "2026-10-15", tour_time: "14:00", notes: "Stacy chat.\nWants a pool" });
    expect(h.db.tables.lead_targets).toEqual([expect.objectContaining({ lead_id: LEAD, building_id: BUILDING, rank: 1 })]);
    expect(h.db.tables.lead_events[0]).toMatchObject({ type: "lead_updated", lead_id: LEAD });
    expect(bridge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      leadId: LEAD,
      buildingId: BUILDING,
      name: "Jane",
      phone: "+13055551234",
      tourDate: "2026-10-15",
      tourTime: "14:00",
    }));
  });

  it("returns null for a lead that no longer exists, so the caller creates one", async () => {
    expect(await updateSessionLead(LEAD, { source: "chat", city_slug: "miami", beds: 1 })).toBeNull();
  });
});

describe("executeTool create_lead", () => {
  const ctx = (extra: Partial<ToolContext> = {}): ToolContext => ({ leadsCreated: 0, sessionKey: SESSION, ...extra });

  it("creates the first lead with sanitized fields and links the session", async () => {
    const out = await executeTool(
      "create_lead",
      { city_slug: "nyc", name: "Jane", email: "bad@", phone: "3055551234", tour_time: "3pm", source: "web_form" },
      "https://app.test",
      ctx()
    );
    expect(out).toMatchObject({ lead_id: LEAD, dropped_fields: ["email"] });
    expect(postedLeads).toEqual([
      expect.objectContaining({ source: "chat", city_slug: "new-york", phone: "3055551234", tour_time: "15:00" }),
    ]);
    expect(postedLeads[0].email).toBeUndefined();
    expect(h.db.tables.chat_sessions[0].lead_id).toBe(LEAD);
  });

  it("serializes parallel calls in one turn: one lead, the second call updates it", async () => {
    const c = ctx();
    const [a, b] = await Promise.all([
      executeTool("create_lead", { city_slug: "miami", name: "Jane", phone: "3055551234" }, "https://app.test", c),
      executeTool("create_lead", { city_slug: "miami", name: "Jane", phone: "3055551234", beds: 2 }, "https://app.test", c),
    ]);
    expect(postedLeads).toHaveLength(1);
    expect(a).toMatchObject({ lead_id: LEAD });
    expect(b).toMatchObject({ lead_id: LEAD, updated: true });
    expect(h.db.tables.leads[0].beds).toBe(2);
  });

  it("adds to the session's existing lead on a later turn instead of creating another", async () => {
    h.db.tables.chat_sessions[0].lead_id = LEAD;
    h.db.tables.leads.push({ id: LEAD, name: "Jane", user_email: null, user_phone: "3055551234", notes: null });
    const out = await executeTool(
      "create_lead",
      { city_slug: "miami", phone: "786-555-0000", move_in_date: "2026-12-01" },
      "https://app.test",
      ctx()
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ lead_id: LEAD, updated: true });
    expect(h.db.tables.leads[0]).toMatchObject({ user_phone: "786-555-0000", move_in_date: "2026-12-01" });
  });

  it("passes the route's 4xx message back so the model can correct itself", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "City not found" }), { status: 404 }));
    const out = await executeTool("create_lead", { city_slug: "miami", phone: "3055551234" }, "https://app.test", ctx());
    expect(out).toEqual({ error: "The create_lead request was rejected: City not found" });
  });

  it("keeps 5xx bodies out of the model's context", async () => {
    fetchMock.mockResolvedValueOnce(new Response("stack trace with secrets", { status: 500 }));
    const out = await executeTool("create_lead", { city_slug: "miami", phone: "3055551234" }, "https://app.test", ctx());
    expect(out).toEqual({ error: "The create_lead request could not be completed." });
  });
});

describe("voice/microsite book_tour", () => {
  const channel = (): LeadChannel => ({
    ...phoneChannel({ id: "call-1", caller: "+13055551234", dialed: "+13059521558" }),
    sessionKey: SESSION,
  });
  const tour = { building_name: "Perrin Brickell", building_id: BUILDING, tour_date: "2026-10-15", tour_time: "2:00 PM", name: "Jane" };

  it("books a tour after details were already saved, updating that lead", async () => {
    h.db.tables.chat_sessions[0].lead_id = LEAD;
    h.db.tables.leads.push({ id: LEAD, name: "Jane", user_email: null, user_phone: "+13055551234", notes: "Phone call from +13055551234 to +13059521558." });
    slots.mockResolvedValue([{ date: "2026-10-15", slots: [{ time: "14:00", available: 1 }] }]);

    const out = await executeVoiceTool("book_tour", tour, channel(), "https://app.test");
    expect(out).toMatchObject({ booked: true, confirmed: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(h.db.tables.leads[0]).toMatchObject({ tour_date: "2026-10-15", tour_time: "14:00" });
    expect(bridge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ buildingId: BUILDING, tourDate: "2026-10-15" }));
  });

  it("doesn't claim a confirmed booking when the showing wasn't posted", async () => {
    h.db.tables.chat_sessions[0].lead_id = LEAD;
    h.db.tables.leads.push({ id: LEAD, name: "Jane", user_email: null, user_phone: "+13055551234", notes: null });
    slots.mockResolvedValue([{ date: "2026-10-15", slots: [{ time: "14:00", available: 1 }] }]);
    bridge.mockResolvedValue(null); // already posted for an earlier time
    const out = await executeVoiceTool("book_tour", tour, channel(), "https://app.test");
    expect(out).toMatchObject({ booked: true, confirmed: false });
  });

  it("says plainly that the tour was NOT booked when saving fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Invalid phone number format" }), { status: 400 }));
    const out = await executeVoiceTool("book_tour", tour, channel(), "https://app.test");
    expect(out).toEqual({
      booked: false,
      error: expect.stringMatching(/^The tour was NOT booked\. The create_lead request was rejected: Invalid phone number format/),
    });
  });

  it("creates the lead with caller ID on a first booking and tags its source", async () => {
    const out = await executeVoiceTool("book_tour", tour, channel(), "https://app.test");
    expect(out).toMatchObject({ booked: true, confirmed: false });
    expect(postedLeads[0]).toMatchObject({ source: "voice", phone: "+13055551234", tour_time: "14:00", city_slug: "miami" });
    expect(h.db.updates.some((u) => u.table === "leads" && u.values.source_detail === "phone:+13059521558")).toBe(true);
  });
});

describe("toolOutcome", () => {
  it("reports counts, find_building matches and errors", () => {
    expect(toolOutcome("search_listings", { result_count: 0 })).toEqual({ resultCount: 0, error: null });
    expect(toolOutcome("find_building", { matches: [], note: "No building" })).toEqual({ resultCount: 0, error: null });
    expect(toolOutcome("find_building", { matches: [{}], staycio_sites: [{}] })).toEqual({ resultCount: 2, error: null });
    expect(toolOutcome("book_tour", { error: "That time isn't open." })).toEqual({ resultCount: null, error: "That time isn't open." });
    expect(toolOutcome("get_tour_slots", null)).toEqual({ resultCount: null, error: null });
  });
});
