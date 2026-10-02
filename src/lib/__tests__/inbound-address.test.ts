/**
 * Admin inbox addressing: per-thread Reply-To plus-addresses, the parsing of
 * Resend inbound recipients back into a thread id, and the "is this mail
 * ours?" filter that keeps other projects' domains (same Resend account) out.
 */
import { afterEach, describe, it, expect } from "vitest";
import {
  decodeEncodedWords,
  findOurRecipient,
  getAdminFrom,
  getAdminFromAddress,
  getInboundAddress,
  getInboundDomain,
  isOurInboundAddress,
  isValidEmail,
  parseEmailAddress,
  parseThreadIdFromAddresses,
  pickInboundRecipient,
  senderDisplayName,
  threadReplyAddress,
} from "@/lib/email/inbound-address";

const INBOX = "replies@inbound.staycio.com";
const T = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("parseEmailAddress", () => {
  it("handles bare, angle-bracketed, named and quoted forms", () => {
    expect(parseEmailAddress("Renter@Example.com")).toEqual({ name: null, email: "renter@example.com" });
    expect(parseEmailAddress("<renter@example.com>")).toEqual({ name: null, email: "renter@example.com" });
    expect(parseEmailAddress("Jane Doe <renter@example.com>")).toEqual({ name: "Jane Doe", email: "renter@example.com" });
    expect(parseEmailAddress('"Doe, Jane" <renter@example.com>')).toEqual({ name: "Doe, Jane", email: "renter@example.com" });
    expect(parseEmailAddress(undefined)).toEqual({ name: null, email: "" });
  });
  it("decodes RFC 2047 names", () => {
    expect(parseEmailAddress("=?UTF-8?B?Sm9zw6k=?= <jose@example.com>")).toEqual({ name: "José", email: "jose@example.com" });
    expect(parseEmailAddress("=?utf-8?Q?Mar=C3=ADa_L=C3=B3pez?= <maria@example.com>").name).toBe("María López");
  });
});

describe("decodeEncodedWords", () => {
  it("leaves plain text alone and joins adjacent encoded words", () => {
    expect(decodeEncodedWords("Plain Name")).toBe("Plain Name");
    expect(decodeEncodedWords("=?UTF-8?B?Sm9z?= =?UTF-8?B?w6k=?=")).toBe("José");
  });
  it("keeps an undecodable word as-is", () => {
    expect(decodeEncodedWords("=?NOPE-9?B?Sm9z?=")).toBe("=?NOPE-9?B?Sm9z?=");
  });
});

describe("senderDisplayName", () => {
  it("prefers the raw From header name, then the bare from, else null", () => {
    expect(senderDisplayName('"Jane Doe" <jane@example.com>', "jane@example.com")).toBe("Jane Doe");
    expect(senderDisplayName(undefined, "Jane <jane@example.com>")).toBe("Jane");
    expect(senderDisplayName(undefined, "jane@example.com")).toBeNull();
    expect(senderDisplayName("<jane@example.com>", "jane@example.com")).toBeNull();
  });
  it("strips header-breaking characters", () => {
    expect(senderDisplayName('"Jane\r\nDoe" <x@y.com>', "x@y.com")).toBe("Jane Doe");
  });
});

describe("threadReplyAddress", () => {
  it("tags the local part with the thread id", () => {
    expect(threadReplyAddress(T, INBOX)).toBe(`replies+${T}@inbound.staycio.com`);
  });
  it("refuses to tag with a non-uuid (never emits an odd address)", () => {
    expect(threadReplyAddress("not-a-uuid", INBOX)).toBe(INBOX);
  });
  it("round-trips through the parser", () => {
    expect(parseThreadIdFromAddresses([threadReplyAddress(T, INBOX)], INBOX)).toBe(T);
  });
  it("works on the apex too (hello+<id>@staycio.com)", () => {
    const apex = "hello@staycio.com";
    expect(threadReplyAddress(T, apex)).toBe(`hello+${T}@staycio.com`);
    expect(parseThreadIdFromAddresses([`hello+${T}@staycio.com`], apex)).toBe(T);
  });
});

describe("parseThreadIdFromAddresses", () => {
  it("finds the tag in any recipient, case-insensitively, in named form too", () => {
    expect(parseThreadIdFromAddresses(["someone@else.com", `Staycio <REPLIES+${T.toUpperCase()}@Inbound.Staycio.com>`], INBOX)).toBe(T);
  });
  it("ignores other domains, other local parts and non-uuid tags", () => {
    expect(parseThreadIdFromAddresses([`replies+${T}@evil.com`], INBOX)).toBeNull();
    expect(parseThreadIdFromAddresses([`hello+${T}@inbound.staycio.com`], INBOX)).toBeNull();
    expect(parseThreadIdFromAddresses(["replies+hello@inbound.staycio.com"], INBOX)).toBeNull();
    expect(parseThreadIdFromAddresses(["replies@inbound.staycio.com", null, undefined], INBOX)).toBeNull();
    expect(parseThreadIdFromAddresses([], INBOX)).toBeNull();
  });
});

describe("our-domain filter (account-wide Resend webhooks)", () => {
  it("accepts the inbound domain, the apex and any staycio.com subdomain", () => {
    expect(isOurInboundAddress("replies@inbound.staycio.com", INBOX)).toBe(true);
    expect(isOurInboundAddress(`Staycio <replies+${T}@inbound.staycio.com>`, INBOX)).toBe(true);
    expect(isOurInboundAddress("hello@staycio.com", INBOX)).toBe(true);
    expect(isOurInboundAddress("downtown6miami@staycio.com", INBOX)).toBe(true);
    expect(isOurInboundAddress("anything@mail.staycio.com", INBOX)).toBe(true);
  });
  it("rejects other projects on the same Resend account and look-alikes", () => {
    expect(isOurInboundAddress("inbox@inbound.digis.cc", INBOX)).toBe(false);
    expect(isOurInboundAddress("support@digis.cc", INBOX)).toBe(false);
    expect(isOurInboundAddress("info@mayells.com", INBOX)).toBe(false);
    expect(isOurInboundAddress("x@notstaycio.com", INBOX)).toBe(false);
    expect(isOurInboundAddress("x@staycio.com.evil.com", INBOX)).toBe(false);
    expect(isOurInboundAddress("", INBOX)).toBe(false);
    expect(isOurInboundAddress(null, INBOX)).toBe(false);
  });
  it("findOurRecipient returns the first of ours (bare, lowercased) or null", () => {
    expect(findOurRecipient(["info@mayells.com", "Staycio <Hello@Staycio.com>"], INBOX)).toBe("hello@staycio.com");
    expect(findOurRecipient(["inbox@inbound.digis.cc", "x@mayells.com"], INBOX)).toBeNull();
    expect(findOurRecipient([], INBOX)).toBeNull();
  });
});

describe("pickInboundRecipient", () => {
  it("prefers our domain over other recipients and never returns a non-address", () => {
    expect(pickInboundRecipient(["friend@gmail.com", `replies+${T}@inbound.staycio.com`], INBOX)).toBe(`replies+${T}@inbound.staycio.com`);
    expect(pickInboundRecipient(["Friend <friend@gmail.com>"], INBOX)).toBe("friend@gmail.com");
    expect(pickInboundRecipient([], INBOX)).toBe(INBOX);
  });
});

describe("sender identity + env", () => {
  const saved = { from: process.env.FROM_EMAIL, addr: process.env.REPLY_TO_EMAIL };
  afterEach(() => {
    if (saved.from === undefined) delete process.env.FROM_EMAIL;
    else process.env.FROM_EMAIL = saved.from;
    if (saved.addr === undefined) delete process.env.REPLY_TO_EMAIL;
    else process.env.REPLY_TO_EMAIL = saved.addr;
  });
  it("defaults to Staycio <hello@staycio.com>", () => {
    delete process.env.FROM_EMAIL;
    expect(getAdminFrom()).toBe("Staycio <hello@staycio.com>");
    expect(getAdminFromAddress()).toBe("hello@staycio.com");
  });
  it("honours FROM_EMAIL in bare or named form, ignores junk", () => {
    process.env.FROM_EMAIL = "Team <team@staycio.com>";
    expect(getAdminFrom()).toBe("Team <team@staycio.com>");
    process.env.FROM_EMAIL = "team@staycio.com";
    expect(getAdminFrom()).toBe("Staycio <team@staycio.com>");
    process.env.FROM_EMAIL = "not-an-address";
    expect(getAdminFromAddress()).toBe("hello@staycio.com");
  });
  it("getInboundAddress / getInboundDomain follow REPLY_TO_EMAIL", () => {
    process.env.REPLY_TO_EMAIL = '"Staycio <hello@staycio.com>"';
    expect(getInboundAddress()).toBe("hello@staycio.com");
    expect(getInboundDomain()).toBe("staycio.com");
    process.env.REPLY_TO_EMAIL = "garbage";
    expect(getInboundAddress()).toBe(INBOX);
    delete process.env.REPLY_TO_EMAIL;
    expect(getInboundDomain()).toBe("inbound.staycio.com");
  });
  it("isValidEmail", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("<a@b.co>")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
