import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractAddress,
  getLeadNotificationRecipients,
  getReplyToAddress,
  recordInternalLeadAlert,
} from "@/lib/email/recipients";

/** Minimal supabase stub capturing what was inserted into `emails`. */
function fakeSupabase(onInsert?: (row: Record<string, unknown>) => { error: unknown }) {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ __table: table, ...row });
        return onInsert ? onInsert(row) : { error: null };
      },
    }),
  };
  return { client: client as never, inserts };
}

describe("email recipients", () => {
  const originalNotify = process.env.LEAD_NOTIFY_EMAIL;
  const originalReplyTo = process.env.REPLY_TO_EMAIL;

  beforeEach(() => {
    delete process.env.LEAD_NOTIFY_EMAIL;
    delete process.env.REPLY_TO_EMAIL;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalNotify === undefined) delete process.env.LEAD_NOTIFY_EMAIL;
    else process.env.LEAD_NOTIFY_EMAIL = originalNotify;
    if (originalReplyTo === undefined) delete process.env.REPLY_TO_EMAIL;
    else process.env.REPLY_TO_EMAIL = originalReplyTo;
    vi.restoreAllMocks();
  });

  it("extracts a bare address from a display-name form", () => {
    expect(extractAddress("Staycio <hello@staycio.com>")).toBe("hello@staycio.com");
    expect(extractAddress("  ops@staycio.com ")).toBe("ops@staycio.com");
  });

  it("reads LEAD_NOTIFY_EMAIL, splitting and deduping", () => {
    process.env.LEAD_NOTIFY_EMAIL = "a@x.com, Ops <b@x.com>; a@x.com not-an-email";
    expect(getLeadNotificationRecipients()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("returns no recipients when unset, and does not fall back to an admin's personal address", () => {
    expect(getLeadNotificationRecipients()).toEqual([]);
    // Unset is the normal, intended state: alerts go to the admin inbox.
    expect(console.error).not.toHaveBeenCalled();
  });

  it("defaults reply-to to the inbound domain so replies thread into the inbox", () => {
    expect(getReplyToAddress()).toBe("replies@inbound.staycio.com");
  });

  it("lets REPLY_TO_EMAIL override the default once a real mailbox exists", () => {
    process.env.REPLY_TO_EMAIL = "Staycio <hello@staycio.com>";
    expect(getReplyToAddress()).toBe("hello@staycio.com");
    process.env.REPLY_TO_EMAIL = "garbage";
    expect(getReplyToAddress()).toBe("replies@inbound.staycio.com");
  });
});

describe("recordInternalLeadAlert", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const alert = {
    leadId: "lead-1",
    name: "Jordan",
    email: "jordan@example.com",
    phone: null,
    subject: "New Microsite Lead: Jordan · Downtown 6",
    html: "<p>lead</p>",
    sourceLabel: "microsite (downtown6miami.com)",
  };

  it("writes the alert into the admin inbox as an inbound message", async () => {
    const { client, inserts } = fakeSupabase();
    await recordInternalLeadAlert(client, alert);

    expect(inserts).toHaveLength(1);
    const row = inserts[0];
    expect(row.__table).toBe("emails");
    expect(row.direction).toBe("inbound");
    expect(row.status).toBe("received");
    expect(row.lead_id).toBe("lead-1");
    expect(row.from_email).toBe("jordan@example.com");
    expect(row.reply_to).toBe("jordan@example.com");
    expect(row.subject).toContain("Downtown 6");
  });

  it("still records an alert for a lead that gave no email address", async () => {
    const { client, inserts } = fakeSupabase();
    await recordInternalLeadAlert(client, { ...alert, email: null });
    expect(inserts[0].from_email).toBe("leads@staycio.com");
    expect(inserts[0].reply_to).toBeNull();
  });

  it("never throws, so a failed alert cannot fail the lead capture", async () => {
    const { client } = fakeSupabase(() => ({ error: { message: "boom" } }));
    await expect(recordInternalLeadAlert(client, alert)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();

    const thrower = {
      from: () => {
        throw new Error("connection lost");
      },
    } as never;
    await expect(recordInternalLeadAlert(thrower, alert)).resolves.toBeUndefined();
  });
});
