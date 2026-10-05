import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildInboxAlert,
  getInboxAlertRecipients,
  inboxAlertSkipReason,
  messageSnippet,
  INBOX_ALERT_HEADER,
} from "@/lib/email/inbox-notify";

const saved = { ...process.env };
beforeEach(() => {
  process.env.LEAD_NOTIFY_EMAIL = "owner@example.com";
  delete process.env.INBOX_NOTIFY_EMAIL;
  process.env.NEXT_PUBLIC_APP_URL = "https://staycio.com";
});
afterEach(() => {
  process.env = { ...saved };
});

describe("getInboxAlertRecipients", () => {
  it("defaults to the lead-alert mailbox", () => {
    expect(getInboxAlertRecipients()).toEqual(["owner@example.com"]);
  });

  it("lets INBOX_NOTIFY_EMAIL override, with several addresses", () => {
    process.env.INBOX_NOTIFY_EMAIL = "A@Example.com, b@example.com";
    expect(getInboxAlertRecipients()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("never alerts one of our own receiving addresses (the inbox would alert itself)", () => {
    process.env.INBOX_NOTIFY_EMAIL = "hello@staycio.com, replies@inbound.staycio.com, owner@example.com";
    expect(getInboxAlertRecipients()).toEqual(["owner@example.com"]);
  });
});

describe("inboxAlertSkipReason", () => {
  const recipients = ["owner@example.com"];

  it("alerts for a renter's message", () => {
    expect(inboxAlertSkipReason({ from: "jane@gmail.com", recipients })).toBeNull();
  });

  it("stays quiet with nobody to alert", () => {
    expect(inboxAlertSkipReason({ from: "jane@gmail.com", recipients: [] })).toMatch(/no alert recipient/);
  });

  it("stays quiet for our own mail, the owner's own mail, and returning alerts", () => {
    expect(inboxAlertSkipReason({ from: "hello@staycio.com", recipients })).toMatch(/own domain/);
    expect(inboxAlertSkipReason({ from: "Owner <owner@example.com>", recipients })).toMatch(/alert recipient/);
    expect(
      inboxAlertSkipReason({ from: "jane@gmail.com", recipients, headers: { [INBOX_ALERT_HEADER.toLowerCase()]: "1" } })
    ).toMatch(/itself an inbox alert/);
  });
});

describe("messageSnippet", () => {
  it("keeps the sender's words and drops the quoted original and the signature", () => {
    const text =
      "Hi Stacy,\n\nDecember 1 works. Budget is $3,000.\n\nOn Sun, Oct 4, 2026 at 3:30 PM Downtown 6 <downtown6miami@staycio.com> wrote:\n> Do you have an ideal move-in date?\n\n-- \nJane Doe\nCOO";
    expect(messageSnippet(text, null)).toBe("Hi Stacy,\n\nDecember 1 works. Budget is $3,000.");
  });

  it("drops > quoted lines and an Outlook header block", () => {
    expect(messageSnippet("Sounds good\n> earlier line\n> another", null)).toBe("Sounds good");
    expect(messageSnippet("Yes please\n\nFrom: Stacy\nSent: Monday\nTo: Jane", null)).toBe("Yes please");
  });

  it("falls back to the html body and truncates long messages", () => {
    expect(messageSnippet("", "<div>Hello <b>there</b></div>")).toBe("Hello there");
    const long = messageSnippet("x".repeat(900), null);
    expect(long.length).toBe(601);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("buildInboxAlert", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    from: "jane@gmail.com",
    fromName: "Jane Doe",
    to: "replies@inbound.staycio.com",
    subject: "Re: Downtown 6 Miami — 1 Bedroom Availability",
    text: "December 1 works. Budget is $3,000.",
  };

  it("leads with the message so the lock screen previews the actual words", () => {
    const alert = buildInboxAlert(base);
    expect(alert.subject).toBe("Jane Doe: Re: Downtown 6 Miami — 1 Bedroom Availability");
    expect(alert.text.startsWith("December 1 works. Budget is $3,000.")).toBe(true);
    expect(alert.text).toContain("Jane Doe <jane@gmail.com>, to replies@inbound.staycio.com");
  });

  it("links straight to the conversation", () => {
    const alert = buildInboxAlert(base);
    expect(alert.link).toBe("https://staycio.com/admin/email?email=11111111-1111-4111-8111-111111111111");
    expect(alert.html).toContain(`href="${alert.link}"`);
    expect(alert.text).toContain(`Open it: ${alert.link}`);
  });

  it("says whether Stacy already answered, and carries her summary and the building", () => {
    const waiting = buildInboxAlert({ ...base, summary: "Jane gave a Dec 1 move-in and $3k budget.", building: "Downtown 6" });
    expect(waiting.text).toContain("Waiting for your reply.");
    expect(waiting.text).toContain("Stacy's read: Jane gave a Dec 1 move-in and $3k budget.");
    expect(waiting.text).toContain("· Downtown 6, to");
    expect(buildInboxAlert({ ...base, autoReplied: true }).text).toContain("Stacy already replied.");
  });

  it("says when a phone number was saved, with text and call links", () => {
    const alert = buildInboxAlert({ ...base, phoneSaved: "+17865550142" });
    expect(alert.text).toContain("Phone number saved to the lead: (786) 555-0142");
    expect(alert.html).toContain('href="sms:+17865550142"');
    expect(alert.html).toContain('href="tel:+17865550142"');
    expect(buildInboxAlert(base).text).not.toContain("Phone number saved");
  });

  it("warns that replying to the alert does not reach the sender", () => {
    expect(buildInboxAlert(base).text).toContain("Replying to this alert does not reach Jane.");
    expect(buildInboxAlert({ ...base, fromName: null }).text).toContain("does not reach them.");
  });

  it("escapes the sender's text in the html", () => {
    const alert = buildInboxAlert({ ...base, text: '<img src=x onerror="alert(1)">', fromName: "<b>J</b>" });
    expect(alert.html).not.toContain("<img src=x");
    expect(alert.html).not.toContain("<b>J</b>");
  });
});
