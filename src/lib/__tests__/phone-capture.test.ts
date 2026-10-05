import { describe, it, expect } from "vitest";
import { extractPhone, formatPhone, stripQuotedHistory } from "@/lib/email/phone-capture";

describe("extractPhone", () => {
  it.each([
    ["My number is 305-555-0142", "+13055550142"],
    ["(786) 555 0142", "+17865550142"],
    ["786.555.0142 thanks", "+17865550142"],
    ["7865550142", "+17865550142"],
    ["1 786 555 0142", "+17865550142"],
    ["+1 (305) 555-0142", "+13055550142"],
    ["Text me at +57 300 123 4567", "+573001234567"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("reads %s", (text, expected) => {
    expect(extractPhone(text)).toBe(expected);
  });

  it.each([
    ["My budget is $3,200 a month"],
    ["Move-in 12/01/2026"],
    ["Order #305555014200"],
    ["Call me at 555-0142"], // seven digits, no area code
    ["123-456-7890"], // area code cannot start with 1
    ["0000000000"],
    ["57 300 123 4567"], // foreign without a +: too ambiguous
    [""],
  ])("finds no number in %s", (text) => {
    expect(extractPhone(text)).toBeNull();
  });

  it("never picks up Stacy's own line", () => {
    expect(extractPhone("Call Stacy at (305) 952-1558 or me at 786-555-0142")).toBe("+17865550142");
  });

  it("takes the first number when there are several", () => {
    expect(extractPhone("Cell 786-555-0142, office 305-555-0199")).toBe("+17865550142");
  });
});

describe("stripQuotedHistory", () => {
  it("drops the quoted original and keeps the signature, where numbers live", () => {
    const text =
      "Sounds good!\n\n-- \nJillian Hughson\n786-555-0142\n\nOn Mon, Oct 5, 2026 at 9:00 AM Downtown 6 <downtown6miami@staycio.com> wrote:\n> What's your phone number?";
    const own = stripQuotedHistory(text);
    expect(own).toContain("786-555-0142");
    expect(own).not.toContain("What's your phone number?");
    expect(extractPhone(own)).toBe("+17865550142");
  });

  it("handles Spanish and Outlook quote headers and > lines", () => {
    expect(stripQuotedHistory("Hola\n\nEl lun, 5 oct 2026 a las 9:00, Downtown 6 escribió:\n> x")).toBe("Hola\n");
    expect(stripQuotedHistory("Yes\n\nFrom: Downtown 6\nSent: Monday\n305-555-0199")).toBe("Yes\n");
    expect(stripQuotedHistory("ok\n> 305-555-0199")).toBe("ok");
  });

  it("falls back to the html body", () => {
    expect(stripQuotedHistory("", "<div>Call 786-555-0142</div>")).toContain("786-555-0142");
  });
});

describe("formatPhone", () => {
  it("formats US numbers and leaves others in E.164", () => {
    expect(formatPhone("+13055550142")).toBe("(305) 555-0142");
    expect(formatPhone("+573001234567")).toBe("+573001234567");
  });
});
