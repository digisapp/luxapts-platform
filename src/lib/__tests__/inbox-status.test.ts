/**
 * Inbox readiness check: turns Resend's domain/webhook state plus env into
 * a ready flag and an ordered list of blockers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const domainsList = vi.fn();
const domainsGet = vi.fn();
const webhooksList = vi.fn();
vi.mock("@/lib/resend/client", () => ({
  getResendClient: () => ({ domains: { list: domainsList, get: domainsGet }, webhooks: { list: webhooksList } }),
  getFromEmail: () => "Staycio <hello@staycio.com>",
}));

const { getInboxStatus, _resetInboxStatusCache, CANONICAL_WEBHOOK_URL } = await import("@/lib/email/inbox-status");

const saved = { ...process.env };

const domain = { id: "d1", name: "inbound.staycio.com", status: "verified", region: "us-east-1", capabilities: { sending: "enabled", receiving: "enabled" } };
const records = [
  { record: "DKIM", type: "TXT", name: "resend._domainkey.inbound", value: "p=abc", status: "verified" },
  { record: "SPF", type: "MX", name: "send.inbound", value: "feedback-smtp.us-east-1.amazonses.com", status: "verified", priority: 10 },
  { record: "Receiving", type: "MX", name: "inbound.staycio.com", value: "inbound-smtp.us-east-1.amazonaws.com", status: "verified", priority: 10 },
];
const hook = { id: "w1", endpoint: CANONICAL_WEBHOOK_URL, status: "enabled", events: ["email.received", "email.delivered", "email.bounced"] };

describe("getInboxStatus", () => {
  beforeEach(() => {
    _resetInboxStatusCache();
    process.env.RESEND_API_KEY = "re_x";
    process.env.RESEND_WEBHOOK_SECRET = "whsec_x";
    process.env.XAI_API_KEY = "xai_x";
    delete process.env.REPLY_TO_EMAIL;
    domainsList.mockResolvedValue({ data: { data: [domain, { ...domain, id: "other", name: "inbound.digis.cc" }] }, error: null });
    domainsGet.mockResolvedValue({ data: { ...domain, records }, error: null });
    webhooksList.mockResolvedValue({ data: { data: [{ ...hook, id: "w0", endpoint: "https://www.digis.cc/api/resend/inbound" }, hook] }, error: null });
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("is ready when the domain receives, the webhook is canonical and the secret is set", async () => {
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(true);
    expect(s.problems).toEqual([]);
    expect(s.inboundDomain).toBe("inbound.staycio.com");
    expect(s.webhook.endpoint).toBe(CANONICAL_WEBHOOK_URL);
    expect(s.domain.records.find((r) => r.record === "Receiving")?.host).toBe("inbound");
    expect(domainsGet).toHaveBeenCalledWith("d1");
  });

  it("lists blockers in fix order and synthesises the receiving MX when Resend omits it", async () => {
    domainsGet.mockResolvedValue({ data: { ...domain, status: "pending", capabilities: { sending: "enabled", receiving: "disabled" }, records: records.slice(0, 2) }, error: null });
    webhooksList.mockResolvedValue({ data: { data: [{ ...hook, endpoint: "https://www.staycio.com/api/webhooks/resend", status: "disabled", events: ["email.delivered"] }] }, error: null });
    delete process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.XAI_API_KEY;

    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(false);
    expect(s.problems.map((p) => p.split(" ")[0])).toEqual(["inbound.staycio.com", "Receiving", "Resend", "The", "The", "RESEND_WEBHOOK_SECRET", "XAI_API_KEY"]);
    const mx = s.domain.records.find((r) => r.record === "Receiving");
    expect(mx).toMatchObject({ type: "MX", host: "inbound", value: "inbound-smtp.us-east-1.amazonaws.com", priority: 10, status: "missing" });
    expect(s.webhook.canonical).toBe(false);
  });

  it("reports a missing domain / webhook / api key", async () => {
    domainsList.mockResolvedValue({ data: { data: [] }, error: null });
    webhooksList.mockResolvedValue({ data: { data: [] }, error: null });
    const s = await getInboxStatus({ fresh: true });
    expect(s.domain.found).toBe(false);
    expect(s.webhook.found).toBe(false);
    expect(s.problems[0]).toMatch(/Add inbound.staycio.com as a domain/);
    expect(s.problems[1]).toMatch(/No Resend webhook points at/);

    delete process.env.RESEND_API_KEY;
    const noKey = await getInboxStatus({ fresh: true });
    expect(noKey.problems).toEqual(["RESEND_API_KEY is not set, so nothing can be sent or received."]);
  });

  it("surfaces a Resend API failure instead of claiming readiness", async () => {
    domainsList.mockResolvedValue({ data: null, error: { message: "unauthorized" } });
    const s = await getInboxStatus({ fresh: true });
    expect(s.ready).toBe(false);
    expect(s.error).toBe("Resend domains: unauthorized");
  });
});
