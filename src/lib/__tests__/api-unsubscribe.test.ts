import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  unsubscribeToken,
  verifyUnsubscribeToken,
  unsubscribeUrl,
  unsubscribeFooterHtml,
} from "@/lib/email/unsubscribe";

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
