/**
 * Auto-reply loop guards: no automatic answer to robots, lists or our own
 * domain, whatever the classifier says.
 */
import { describe, it, expect } from "vitest";
import { autoReplySuppressionReason } from "@/lib/ai-email";

describe("autoReplySuppressionReason", () => {
  it("allows a normal human sender", () => {
    expect(autoReplySuppressionReason({ from: "jane@example.com", headers: { "message-id": "<x>" } })).toBeNull();
  });
  it("suppresses our own domain and automated local parts", () => {
    expect(autoReplySuppressionReason({ from: "hello@staycio.com" })).toMatch(/own domain/);
    expect(autoReplySuppressionReason({ from: "replies@inbound.staycio.com" })).toMatch(/own domain/);
    expect(autoReplySuppressionReason({ from: "no-reply@bank.com" })).toMatch(/automated/);
    expect(autoReplySuppressionReason({ from: "MAILER-DAEMON@mx.example" })).toMatch(/automated/);
    expect(autoReplySuppressionReason({ from: "" })).toBe("no sender address");
  });
  it("suppresses RFC 3834 / list / out-of-office headers, case-insensitively", () => {
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { "Auto-Submitted": "auto-replied" } })).toMatch(/Auto-Submitted/);
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { "auto-submitted": "no" } })).toBeNull();
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { Precedence: "bulk" } })).toMatch(/Precedence/);
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { "List-Unsubscribe": "<mailto:x>" } })).toMatch(/list/);
    expect(autoReplySuppressionReason({ from: "a@b.com", headers: { "X-Autoreply": ["yes"] } })).toMatch(/automated/);
  });
});
