import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  unsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
  unsubscribeFooterHtml,
} from "@/lib/email/unsubscribe";

// The route's one write: leads.update({ unsubscribed_at }).eq(id).is(null).
const leadUpdate = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (values: unknown) => ({
        eq: (_col: string, id: string) => ({
          is: () => {
            leadUpdate(values, id);
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  }),
}));

const LEAD_A = "11111111-1111-4111-8111-111111111111";
const LEAD_B = "22222222-2222-4222-8222-222222222222";

const originalSecret = process.env.CRON_SECRET;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

describe("unsubscribe link signing", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://staycio.com/";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("produces a stable hex token per lead", () => {
    const token = unsubscribeToken(LEAD_A);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(unsubscribeToken(LEAD_A)).toBe(token);
  });

  it("verifies its own token", () => {
    expect(verifyUnsubscribeToken(LEAD_A, unsubscribeToken(LEAD_A)!)).toBe(true);
  });

  it("rejects another lead's token (no walking the link)", () => {
    expect(verifyUnsubscribeToken(LEAD_B, unsubscribeToken(LEAD_A)!)).toBe(false);
  });

  it("rejects empty, truncated and tampered tokens without throwing", () => {
    const token = unsubscribeToken(LEAD_A)!;
    expect(verifyUnsubscribeToken(LEAD_A, "")).toBe(false);
    expect(verifyUnsubscribeToken(LEAD_A, token.slice(0, 32))).toBe(false);
    expect(verifyUnsubscribeToken(LEAD_A, `${token.slice(0, 63)}0`)).toBe(
      token.endsWith("0")
    );
  });

  it("rejects a token minted under a different secret", () => {
    const token = unsubscribeToken(LEAD_A)!;
    process.env.CRON_SECRET = "a-different-secret";
    expect(verifyUnsubscribeToken(LEAD_A, token)).toBe(false);
  });

  it("returns null and an empty footer when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(unsubscribeToken(LEAD_A)).toBeNull();
    expect(unsubscribeUrl(LEAD_A)).toBeNull();
    expect(unsubscribeFooterHtml(LEAD_A)).toBe("");
    expect(verifyUnsubscribeToken(LEAD_A, "deadbeef")).toBe(false);
  });

  it("builds an absolute link with no double slash and embeds it in the footer", () => {
    const url = unsubscribeUrl(LEAD_A)!;
    expect(url.startsWith("https://staycio.com/api/email/unsubscribe?")).toBe(true);
    expect(url).toContain(`lead=${LEAD_A}`);
    expect(url).toContain(`t=${unsubscribeToken(LEAD_A)}`);
    expect(unsubscribeFooterHtml(LEAD_A)).toContain(url);
    expect(unsubscribeFooterHtml(LEAD_A)).toContain("Unsubscribe");
  });
});

describe("/api/email/unsubscribe", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret";
    leadUpdate.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  const url = (lead: string, token: string) => `https://staycio.com/api/email/unsubscribe?lead=${lead}&t=${token}`;

  it("GET only asks: a link scanner opening it unsubscribes no one", async () => {
    const { GET } = await import("@/app/api/email/unsubscribe/route");
    const token = unsubscribeToken(LEAD_A)!;
    const res = await GET(new NextRequest(url(LEAD_A, token)));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('method="post"');
    expect(html).toContain(`action="/api/email/unsubscribe?lead=${LEAD_A}&amp;t=${token}"`);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("POST unsubscribes, from the button or an RFC 8058 one-click client", async () => {
    const { POST } = await import("@/app/api/email/unsubscribe/route");
    const res = await POST(
      new NextRequest(url(LEAD_A, unsubscribeToken(LEAD_A)!), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("unsubscribed");
    expect(leadUpdate).toHaveBeenCalledWith({ unsubscribed_at: expect.any(String) }, LEAD_A);
  });

  it("refuses a forged or another lead's token on both", async () => {
    const { GET, POST } = await import("@/app/api/email/unsubscribe/route");
    const wrong = url(LEAD_B, unsubscribeToken(LEAD_A)!);
    expect((await GET(new NextRequest(wrong))).status).toBe(400);
    expect((await POST(new NextRequest(wrong, { method: "POST" }))).status).toBe(400);
    expect(leadUpdate).not.toHaveBeenCalled();
  });
});
