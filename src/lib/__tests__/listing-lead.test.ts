/**
 * Listing-site inquiries → leads (leads/listing-lead.ts), against an
 * in-memory Supabase: a new lead is linked to its inbox email and alerted
 * like any form lead; the same renter + property within 30 days is added to
 * the existing lead; an unreadable or unverified email is still a lead,
 * flagged needs_review.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeDb, fakeClient, type FakeDb } from "./fake-supabase";
import { APARTMENTS_COM_LEAD } from "./fixtures/apartments-com-lead";

const send = vi.hoisted(() => vi.fn());
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { send } }),
  getFromEmail: () => "Staycio <hello@staycio.com>",
}));
const autoAssignAgent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/leads/routing", () => ({ autoAssignAgent }));

import { parseListingLeadEmail } from "@/lib/email/parse-listing-lead";
import { createListingLead } from "@/lib/leads/listing-lead";

const DAY = 86_400_000;
const lead = parseListingLeadEmail(APARTMENTS_COM_LEAD)!;

let db: FakeDb;
const client = () => fakeClient(db) as unknown as SupabaseClient;
const leadsInserted = () => db.inserts.filter((i) => i.table === "leads").flatMap((i) => i.rows);
const events = () => db.inserts.filter((i) => i.table === "lead_events").flatMap((i) => i.rows);

beforeEach(() => {
  db = createFakeDb({
    leads: [],
    lead_events: [],
    lead_targets: [],
    emails: [
      { id: "email-1", lead_id: null },
      { id: "email-2", lead_id: null },
    ],
    buildings: [{ id: "bldg-1", name: "Bayline Residences", city_id: "city-mia" }],
    cities: [{ id: "city-mia", name: "Miami", slug: "miami" }],
  });
  send.mockReset();
  send.mockResolvedValue({ data: { id: "sent-1" }, error: null });
  autoAssignAgent.mockReset();
  autoAssignAgent.mockResolvedValue(null);
  process.env.RESEND_API_KEY = "re_test";
  process.env.LEAD_NOTIFY_EMAIL = "owner@example.com";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("createListingLead", () => {
  it("creates the lead, links the inbox email, and sends the usual new-lead alert", async () => {
    const res = await createListingLead(client(), { lead, emailId: "email-1", senderVerified: true });

    expect(res).toEqual({ leadId: expect.any(String), created: true });
    expect(leadsInserted()).toEqual([
      expect.objectContaining({
        id: res!.leadId,
        source: "apartments.com",
        source_detail: "Bayline Residences",
        city_id: "city-mia",
        name: "Jordan Rivera",
        user_email: "jordan.rivera@example.com",
        user_phone: "(305) 555-0142",
        beds: 2,
        move_in_date: "2026-11-15",
        status: "new",
        needs_review: false,
      }),
    ]);
    expect(db.tables.emails.find((e) => e.id === "email-1")?.lead_id).toBe(res!.leadId);
    expect(db.tables.lead_targets).toEqual([expect.objectContaining({ lead_id: res!.leadId, building_id: "bldg-1" })]);
    expect(events()).toContainEqual(
      expect.objectContaining({ type: "lead_created", payload: expect.objectContaining({ email_id: "email-1" }) })
    );

    // The "New lead" row in /admin/email, as for every other lead...
    expect(db.tables.emails).toContainEqual(
      expect.objectContaining({ lead_id: res!.leadId, metadata: expect.objectContaining({ kind: "lead_alert" }) })
    );
    // ...and the push to LEAD_NOTIFY_EMAIL.
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["owner@example.com"],
        replyTo: "jordan.rivera@example.com",
        subject: "New Apartments.com Lead: Jordan Rivera · Bayline Residences",
      })
    );
    expect(autoAssignAgent).toHaveBeenCalledWith(expect.anything(), res!.leadId, "city-mia");
  });

  it("adds a repeat inquiry (same renter, same property, within 30 days) to the existing lead", async () => {
    db.tables.leads.push({
      id: "lead-old",
      source: "apartments.com",
      source_detail: "Bayline Residences",
      user_email: "jordan.rivera@example.com",
      name: "Jordan Rivera",
      user_phone: null,
      move_in_date: null,
      beds: null,
      created_at: new Date(Date.now() - 3 * DAY).toISOString(),
    });

    const res = await createListingLead(client(), { lead, emailId: "email-2", senderVerified: true });

    expect(res).toEqual({ leadId: "lead-old", created: false });
    expect(leadsInserted()).toEqual([]);
    expect(db.tables.emails.find((e) => e.id === "email-2")?.lead_id).toBe("lead-old");
    expect(events()).toEqual([
      expect.objectContaining({
        lead_id: "lead-old",
        type: "note_added",
        payload: expect.objectContaining({
          note: expect.stringMatching(/^Asked again on Apartments\.com: Unit: B2 - 2 Bed \/ 2 Bath · Move-in: 11\/15\/2026 · Hi!/),
          email_id: "email-2",
        }),
      }),
    ]);
    // Fills what the lead was missing; never overwrites.
    expect(db.tables.leads[0]).toMatchObject({ user_phone: "(305) 555-0142", move_in_date: "2026-11-15", beds: 2, name: "Jordan Rivera" });
    // Not a new lead, so no new-lead alert.
    expect(send).not.toHaveBeenCalled();
  });

  it("makes a new lead when the earlier one is over 30 days old", async () => {
    db.tables.leads.push({
      id: "lead-old",
      source: "apartments.com",
      source_detail: "Bayline Residences",
      user_email: "jordan.rivera@example.com",
      created_at: new Date(Date.now() - 31 * DAY).toISOString(),
    });
    const res = await createListingLead(client(), { lead, emailId: "email-2", senderVerified: true });
    expect(res?.created).toBe(true);
    expect(leadsInserted()).toHaveLength(1);
  });

  it("stores an unreadable inquiry as a lead flagged needs_review, with the raw email", async () => {
    const unreadable = parseListingLeadEmail({
      from: "noreply@email.apartments.com",
      subject: "New Apartments.com Lead for Bayline Residences",
      text: "A renter contacted you about Bayline Residences.\nSign in to see who it is.",
    })!;

    const res = await createListingLead(client(), { lead: unreadable, emailId: "email-1", senderVerified: true });

    expect(res?.created).toBe(true);
    const [row] = leadsInserted();
    expect(row).toMatchObject({ needs_review: true, user_email: null, user_phone: null, source: "apartments.com" });
    expect(row.notes).toMatch(/^Needs review: no renter email or phone number found in the email\./);
    expect(row.notes).toContain("Subject: New Apartments.com Lead for Bayline Residences");
    expect(row.notes).toContain("A renter contacted you about Bayline Residences.\nSign in to see who it is.");
    expect(db.tables.emails.find((e) => e.id === "email-1")?.lead_id).toBe(res!.leadId);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringMatching(/^Needs review: New Apartments\.com Lead/) })
    );
  });

  it("never merges mail that failed DMARC into an existing lead (From is forgeable)", async () => {
    db.tables.leads.push({
      id: "lead-old",
      source: "apartments.com",
      source_detail: "Bayline Residences",
      user_email: "jordan.rivera@example.com",
      user_phone: null,
      created_at: new Date(Date.now() - DAY).toISOString(),
    });

    const res = await createListingLead(client(), { lead, emailId: "email-2", senderVerified: false });

    expect(res?.created).toBe(true);
    expect(db.tables.leads.find((l) => l.id === "lead-old")?.user_phone).toBeNull();
    const [row] = leadsInserted();
    expect(row.needs_review).toBe(true);
    expect(row.notes).toMatch(/^Needs review: the sender did not pass DMARC/);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ replyTo: undefined }));
  });

  it("returns null without throwing when the insert fails (migration 038 not applied)", async () => {
    db.insertError.leads = { code: "23514", message: 'violates check constraint "leads_source_check"' };
    await expect(createListingLead(client(), { lead, emailId: "email-1", senderVerified: true })).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
