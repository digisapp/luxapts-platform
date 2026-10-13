import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import {
  displayName,
  formatPhone,
  normalizeEmail,
  normalizePhone,
  parseTags,
  parseWholeNumber,
  realEmailsFirst,
  splitName,
  titleCase,
} from "./normalize";
import { addDays, dueLabel, nyDateKey } from "./dates";

describe("parseCsv", () => {
  it("keeps quoted newlines, commas and escaped quotes inside one field", () => {
    const text = '﻿Name,Texts\r\n"Ann, B","line one\r\nline ""two"""\r\nCal,\n';
    expect(parseCsv(text)).toEqual([
      ["Name", "Texts"],
      ["Ann, B", 'line one\r\nline "two"'],
      ["Cal", ""],
    ]);
  });

  it("skips blank lines and handles a missing trailing newline", () => {
    expect(parseCsv("a,b\n\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("normalizePhone", () => {
  it("normalizes the formats in the Follow Up Boss export", () => {
    expect(normalizePhone("(215) 776-8894")).toBe("+12157768894");
    expect(normalizePhone("14792003626")).toBe("+14792003626");
    expect(normalizePhone("1(212)555-0123")).toBe("+12125550123");
    expect(normalizePhone("'+447700900123")).toBe("+447700900123");
    expect(normalizePhone("0044 7700 900123")).toBe("+447700900123");
  });

  it("rejects things that are not phone numbers", () => {
    expect(normalizePhone("Extracted")).toBeNull();
    expect(normalizePhone("ext 12")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("formats US numbers for display and leaves others as stored", () => {
    expect(formatPhone("+12125550123")).toBe("(212) 555-0123");
    expect(formatPhone("+447700900123")).toBe("+447700900123");
  });
});

describe("value cleaning", () => {
  it("lowercases valid emails and drops invalid ones", () => {
    expect(normalizeEmail("  Ann@Gmail.com ")).toBe("ann@gmail.com");
    expect(normalizeEmail("not an email")).toBeNull();
  });

  it("reads prices and counts loosely", () => {
    expect(parseWholeNumber("$5,395")).toBe(5395);
    expect(parseWholeNumber("5000/mo")).toBe(5000);
    expect(parseWholeNumber("4254.60")).toBe(4255);
    expect(parseWholeNumber("12", 0, 10)).toBeNull();
    expect(parseWholeNumber("n/a")).toBeNull();
  });

  it("splits tags and names", () => {
    expect(parseTags("12 Sample Street #4F, 14 Sample Street #3, 12 Sample Street #4F")).toEqual([
      "12 Sample Street #4F",
      "14 Sample Street #3",
    ]);
    expect(splitName("Mary Ann van Dyke")).toEqual({ first: "Mary", last: "Ann van Dyke" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: null });
  });

  it("falls back to email, then phone, for a display name", () => {
    expect(displayName({ first_name: null, last_name: null, emails: ["a@b.co"], phones: [] })).toBe("a@b.co");
    expect(displayName({ first_name: null, last_name: null, emails: [], phones: ["+12125550123"] })).toBe(
      "(212) 555-0123"
    );
  });
});

describe("relay emails and title case", () => {
  it("puts listing-site relays after real addresses", () => {
    expect(realEmailsFirst(["rh-ann-1@renthop-mail.com", "ann@gmail.com", "x@email.rent.com"])).toEqual([
      "ann@gmail.com",
      "rh-ann-1@renthop-mail.com",
      "x@email.rent.com",
    ]);
  });

  it("title-cases neighborhood names", () => {
    expect(titleCase("HELL'S KITCHEN")).toBe("Hell's Kitchen");
    expect(titleCase("FULTON/SEAPORT")).toBe("Fulton/Seaport");
    expect(titleCase("BEDFORD-STUYVESANT")).toBe("Bedford-Stuyvesant");
  });
});

describe("follow-up dates", () => {
  it("uses the New York calendar day", () => {
    // 02:30 UTC on Oct 13 is still Oct 12 in New York.
    expect(nyDateKey(new Date("2026-10-13T02:30:00Z"))).toBe("2026-10-12");
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("labels due dates relative to today", () => {
    expect(dueLabel("2026-10-09", "2026-10-12")).toBe("Overdue 3d");
    expect(dueLabel("2026-10-12", "2026-10-12")).toBe("Today");
    expect(dueLabel("2026-10-13", "2026-10-12")).toBe("Tomorrow");
    expect(dueLabel("2026-10-15", "2026-10-12")).toBe("Thu");
    expect(dueLabel("2026-11-20", "2026-10-12")).toBe("Nov 20");
    expect(dueLabel("2027-01-04", "2026-10-12")).toBe("Jan 4, 2027");
  });
});
