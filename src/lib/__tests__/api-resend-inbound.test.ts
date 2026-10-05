/**
 * Resend inbound webhook (/api/webhooks/resend).
 *
 * Guards: signature is verified before anything is trusted; mail for other
 * projects' domains on the same Resend account is acknowledged and dropped;
 * our mail is fetched in full, the thread tag and sender name are parsed, and
 * it is stored; delivery events update the outbound row's status.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const verify = vi.fn();
vi.mock("svix", () => ({ Webhook: class { verify = verify; } }));

const receivingGet = vi.fn();
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ emails: { receiving: { get: receivingGet } } }),
  getFromEmail: () => "Staycio <hello@staycio.com>",
}));

const storeInboundEmail = vi.fn();
const updateDeliveryStatus = vi.fn();
const updateAiFields = vi.fn();
const senderForLead = vi.fn();
const captureLeadPhone = vi.fn();
const getLeadContext = vi.fn();
vi.mock("@/lib/email/admin-inbox", () => ({
  getAdminInboxService: () => ({ storeInboundEmail, updateDeliveryStatus, updateAiFields, senderForLead, captureLeadPhone, getLeadContext }),
}));

const sendInboxAlert = vi.fn();
vi.mock("@/lib/email/inbox-notify", () => ({ sendInboxAlert }));

const classify = vi.fn();
const sendAutoReply = vi.fn();
vi.mock("@/lib/ai-email", () => ({ classifyAndDraftReply: classify, sendAutoReply }));

// after() needs a request scope in Next; run the callback inline here.
vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: (fn: () => Promise<void>) => fn() };
});

process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
process.env.RESEND_API_KEY = "re_test";
process.env.REPLY_TO_EMAIL = "replies@inbound.staycio.com";
delete process.env.XAI_API_KEY;

const { POST } = await import("@/app/api/webhooks/resend/route");

const T = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function post(payload: unknown) {
  return POST(
    new Request("https://staycio.com/api/webhooks/resend", {
      method: "POST",
      headers: { "svix-id": "m", "svix-timestamp": "1", "svix-signature": "v1,x", "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
  );
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    verify.mockReset();
    receivingGet.mockReset();
    storeInboundEmail.mockReset();
    senderForLead.mockReset();
    senderForLead.mockResolvedValue({ from: "Staycio <hello@staycio.com>", email: "hello@staycio.com", name: "Staycio" });
    sendInboxAlert.mockReset();
    sendInboxAlert.mockResolvedValue({ sent: true });
    captureLeadPhone.mockReset();
    captureLeadPhone.mockImplementation(async (_leadId: string, phone: string | null) => phone);
    getLeadContext.mockReset();
    getLeadContext.mockImplementation(async (leadId: string | null) =>
      leadId
        ? { id: leadId, name: "Jillian Hughson", email: "jillian@example.com", phone: null, status: "contacted", domain: "downtown6miami.com", building: "Downtown 6", city: "Miami", unitType: "2 Bedroom", moveIn: "Q4 2026", sender: '"Downtown 6" <downtown6miami@staycio.com>', createdAt: "2026-08-06T00:00:00Z" }
        : null
    );
    updateDeliveryStatus.mockReset();
    classify.mockReset();
    sendAutoReply.mockReset();
    verify.mockImplementation((raw: string) => JSON.parse(raw));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a bad signature before touching anything", async () => {
    verify.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await post({ type: "email.received", data: { email_id: "r1" } });
    expect(res.status).toBe(401);
    expect(receivingGet).not.toHaveBeenCalled();
    expect(storeInboundEmail).not.toHaveBeenCalled();
  });

  it("drops mail for another project's domain without fetching it", async () => {
    const res = await post({ type: "email.received", data: { email_id: "r2", from: "a@b.com", to: ["inbox@inbound.digis.cc"] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, ignored: "not our domain" });
    expect(receivingGet).not.toHaveBeenCalled();
    expect(storeInboundEmail).not.toHaveBeenCalled();
  });

  it("fetches the full message, parses thread tag + sender name, and stores ours", async () => {
    receivingGet.mockResolvedValue({
      data: {
        id: "r3",
        from: "jane@example.com",
        to: [`replies+${T}@inbound.staycio.com`],
        cc: [],
        received_for: [`replies+${T}@inbound.staycio.com`],
        reply_to: null,
        subject: "Re: Your tour at Downtown 6",
        text: "Thanks!",
        html: "<p>Thanks!</p>",
        message_id: "<m3@example.com>",
        headers: { From: '"Jane Doe" <jane@example.com>', "In-Reply-To": "<ours@staycio.com>", "Message-ID": "<m3@example.com>" },
        attachments: [{ id: "att1", filename: "id.png", content_type: "image/png", size: 1234 }],
      },
      error: null,
    });
    storeInboundEmail.mockResolvedValue({ id: "e3", is_spam: false, thread_id: T, headers: { "message-id": "<m3@example.com>" }, lead_id: null });

    const res = await post({ type: "email.received", data: { email_id: "r3", from: "jane@example.com", to: [`replies+${T}@inbound.staycio.com`] } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, stored: true });
    expect(receivingGet).toHaveBeenCalledWith("r3");
    expect(storeInboundEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "jane@example.com",
        fromName: "Jane Doe",
        to: `replies+${T}@inbound.staycio.com`,
        subject: "Re: Your tour at Downtown 6",
        text: "Thanks!",
        html: "<p>Thanks!</p>",
        messageId: "<m3@example.com>",
        inReplyToHeader: "<ours@staycio.com>",
        threadIdHint: T,
        resendEmailId: "r3",
        attachments: [{ id: "att1", filename: "id.png", contentType: "image/png", size: 1234 }],
      })
    );
    // The owner is alerted for every stored message, AI or not.
    await vi.waitFor(() =>
      expect(sendInboxAlert).toHaveBeenCalledWith(
        expect.objectContaining({ id: "e3", from: "jane@example.com", fromName: "Jane Doe", text: "Thanks!", autoReplied: false, building: null })
      )
    );
    // No XAI_API_KEY → no classification attempted.
    expect(classify).not.toHaveBeenCalled();
  });

  it("saves a phone number a lead sends in reply, and tells the owner", async () => {
    receivingGet.mockResolvedValue({
      data: {
        id: "r9",
        from: "jillian@example.com",
        to: [`replies+${T}@inbound.staycio.com`],
        cc: [],
        received_for: [`replies+${T}@inbound.staycio.com`],
        reply_to: null,
        subject: "Re: Downtown 6 Miami — 2 Bedroom Availability",
        text: "Hi Stacy, move-in around January. My cell is (786) 555-0142.\n\nOn Mon, Oct 5, 2026 at 9:00 AM Downtown 6 <downtown6miami@staycio.com> wrote:\n> What's your phone number? I can text you.",
        html: "",
        message_id: "<m9@example.com>",
        headers: { From: "Jillian <jillian@example.com>", "Message-ID": "<m9@example.com>" },
        attachments: [],
      },
      error: null,
    });
    storeInboundEmail.mockResolvedValue({ id: "e9", is_spam: false, thread_id: T, headers: {}, lead_id: "lead-9" });

    const res = await post({ type: "email.received", data: { email_id: "r9", from: "jillian@example.com", to: [`replies+${T}@inbound.staycio.com`] } });
    expect(res.status).toBe(200);
    expect(captureLeadPhone).toHaveBeenCalledWith("lead-9", "+17865550142");
    // after() work is not awaited by the route; wait for it to finish.
    await vi.waitFor(() =>
      expect(sendInboxAlert).toHaveBeenCalledWith(expect.objectContaining({ id: "e9", phoneSaved: "+17865550142", building: "Downtown 6" }))
    );
  });

  it("answers 502 when the body fetch fails so Resend retries", async () => {
    receivingGet.mockResolvedValue({ data: null, error: { message: "rate limited" } });
    const res = await post({ type: "email.received", data: { email_id: "r4", to: ["replies@inbound.staycio.com"] } });
    expect(res.status).toBe(502);
    expect(storeInboundEmail).not.toHaveBeenCalled();
  });

  it("maps delivery events onto the outbound row", async () => {
    await post({ type: "email.delivered", data: { email_id: "out1" } });
    await post({ type: "email.bounced", data: { email_id: "out2" } });
    await post({ type: "email.failed", data: { email_id: "out3" } });
    await post({ type: "email.complained", data: { email_id: "out4" } });
    expect(updateDeliveryStatus.mock.calls).toEqual([
      ["out1", "delivered"],
      ["out2", "bounced"],
      ["out3", "failed"],
      ["out4", "failed"],
    ]);
  });

  it("acknowledges unknown events without side effects", async () => {
    const res = await post({ type: "email.opened", data: { email_id: "x" } });
    expect(res.status).toBe(200);
    expect(updateDeliveryStatus).not.toHaveBeenCalled();
  });
});
