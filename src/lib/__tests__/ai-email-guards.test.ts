/**
 * Auto-reply loop guards: no automatic answer to robots, lists or our own
 * domain, whatever the classifier says.
 */
import { describe, it, expect } from "vitest";
import { autoReplySuppressionReason } from "@/lib/ai-email";

const PASS = { "Authentication-Results": "amazonses.com; spf=pass smtp.mailfrom=example.com; dkim=pass header.i=@example.com; dmarc=pass header.from=example.com" };

describe("autoReplySuppressionReason", () => {
  it("allows a normal human sender whose address passed DMARC", () => {
    expect(autoReplySuppressionReason({ from: "jane@example.com", headers: { "message-id": "<x>", ...PASS } })).toBeNull();
  });
  it("never answers a sender whose From address is not proven", () => {
    // A reply to a forged From lands on a third party.
    expect(autoReplySuppressionReason({ from: "jane@example.com", headers: { "message-id": "<x>" } })).toMatch(/not authenticated/);
    expect(autoReplySuppressionReason({ from: "jane@example.com", headers: { "Authentication-Results": "amazonses.com; spf=pass; dmarc=none" } })).toMatch(/not authenticated/);
    expect(autoReplySuppressionReason({ from: "jane@example.com", headers: { "Authentication-Results": "amazonses.com; dkim=pass; dmarc=fail" } })).toMatch(/not authenticated/);
    // A pass the sender wrote themselves does not count, nor two folded headers.
    expect(autoReplySuppressionReason({ from: "jane@example.com", headers: { "Authentication-Results": "mx.attacker.test; dmarc=pass" } })).toMatch(/not authenticated/);
    expect(autoReplySuppressionReason({ from: "jane@example.com", headers: { "Authentication-Results": `${PASS["Authentication-Results"]} amazonses.com; dmarc=fail` } })).toMatch(/not authenticated/);
  });
  it("suppresses our own domain and automated local parts", () => {
    expect(autoReplySuppressionReason({ from: "hello@staycio.com" })).toMatch(/own domain/);
    expect(autoReplySuppressionReason({ from: "replies@inbound.staycio.com" })).toMatch(/own domain/);
    expect(autoReplySuppressionReason({ from: "no-reply@bank.com" })).toMatch(/automated/);
    expect(autoReplySuppressionReason({ from: "MAILER-DAEMON@mx.example" })).toMatch(/automated/);
    expect(autoReplySuppressionReason({ from: "" })).toBe("no sender address");
  });
  it("suppresses RFC 3834 / list / out-of-office headers, case-insensitively", () => {
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { ...PASS, "Auto-Submitted": "auto-replied" } })).toMatch(/Auto-Submitted/);
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { ...PASS, "auto-submitted": "no" } })).toBeNull();
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { ...PASS, Precedence: "bulk" } })).toMatch(/Precedence/);
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { ...PASS, "List-Unsubscribe": "<mailto:x>" } })).toMatch(/list/);
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { ...PASS, "X-Autoreply": ["yes"] } })).toMatch(/automated/);
  });
});
