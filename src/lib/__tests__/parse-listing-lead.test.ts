/**
 * Apartments.com lead emails → lead fields (parse-listing-lead.ts).
 *
 * A complete email parses fully from either part; a missing phone is just
 * missing; an inquiry the parser can't read is still returned, flagged for
 * review with the raw email; the site's account mail is not a lead.
 */
import { describe, expect, it } from "vitest";
import {
  detectListingSite,
  listingLeadNotes,
  parseListingLeadEmail,
  toIsoDate,
} from "@/lib/email/parse-listing-lead";
import { APARTMENTS_COM_LEAD, APARTMENTS_COM_WELCOME } from "./fixtures/apartments-com-lead";

const FULL = {
  source: "apartments.com",
  sourceLabel: "Apartments.com",
  name: "Jordan Rivera",
  email: "jordan.rivera@example.com",
  phone: "(305) 555-0142",
  message: "Hi! I'm interested in a 2 bedroom with a balcony.\n\nIs parking included, and do you allow a small dog?",
  propertyName: "Bayline Residences",
  propertyAddress: "1600 NE 1st Ave, Miami, FL 33132",
  unit: "B2 - 2 Bed / 2 Bath",
  beds: 2,
  moveIn: "11/15/2026",
  moveInDate: "2026-11-15",
  needsReview: false,
  reviewReasons: [],
};

describe("parseListingLeadEmail", () => {
  it("reads every field of a complete Apartments.com lead email", () => {
    expect(parseListingLeadEmail(APARTMENTS_COM_LEAD)).toMatchObject(FULL);
  });

  it("reads the same lead from the HTML alone", () => {
    expect(parseListingLeadEmail({ ...APARTMENTS_COM_LEAD, text: "" })).toMatchObject(FULL);
  });

  it("finds the renter's address in the body when Reply-To is the site's relay", () => {
    const lead = parseListingLeadEmail({
      ...APARTMENTS_COM_LEAD,
      replyTo: "lead-8841@reply.email.apartments.com",
    });
    expect(lead?.email).toBe("jordan.rivera@example.com");
    expect(lead?.needsReview).toBe(false);
  });

  it("leaves the phone empty, and the lead complete, when the renter gave none", () => {
    const noPhone = {
      ...APARTMENTS_COM_LEAD,
      text: APARTMENTS_COM_LEAD.text!.replace("Phone: (305) 555-0142\n", ""),
      html: APARTMENTS_COM_LEAD.html!.replace(/<tr><td[^>]*>Phone<\/td>.*?<\/tr>/, ""),
    };
    const lead = parseListingLeadEmail(noPhone);
    expect(lead).toMatchObject({ ...FULL, phone: null });
    expect(lead?.needsReview).toBe(false);
  });

  it("flags an inquiry it can't read for review and keeps the raw subject and body", () => {
    const unreadable = {
      from: "noreply@email.apartments.com",
      fromName: "Apartments.com",
      replyTo: "lead-8841@reply.email.apartments.com",
      subject: "New Apartments.com Lead for Bayline Residences",
      text: "A renter contacted you about Bayline Residences.\nSign in to the Apartments.com Network to see who it is.",
      html: "",
    };
    const lead = parseListingLeadEmail(unreadable);
    expect(lead).toMatchObject({
      email: null,
      phone: null,
      name: null,
      propertyName: "Bayline Residences",
      needsReview: true,
      reviewReasons: ["no renter email or phone number found in the email"],
      subject: unreadable.subject,
      rawBody: unreadable.text,
    });

    const notes = listingLeadNotes(lead!);
    expect(notes).toMatch(/^Needs review: no renter email or phone number found in the email\./);
    expect(notes).toContain(`Subject: ${unreadable.subject}`);
    expect(notes).toContain(unreadable.text);
  });

  it("leaves the site's account mail as an ordinary inbox email", () => {
    expect(parseListingLeadEmail(APARTMENTS_COM_WELCOME)).toBeNull();
    expect(parseListingLeadEmail({ ...APARTMENTS_COM_LEAD, subject: "Your Apartments.com invoice for October" , replyTo: null })).toBeNull();
  });

  it("ignores mail from anyone but a listing site", () => {
    expect(parseListingLeadEmail({ ...APARTMENTS_COM_LEAD, from: "jordan.rivera@example.com" })).toBeNull();
    // Look-alike domains are not the site.
    expect(detectListingSite("leads@apartments.com.evil.test")).toBeNull();
    expect(detectListingSite("leads@notapartments.com")).toBeNull();
    expect(detectListingSite("leads@costar.com")?.source).toBe("apartments.com");
    expect(detectListingSite("Apartments.com <noreply@email.apartments.com>")?.source).toBe("apartments.com");
  });
});

describe("listingLeadNotes", () => {
  it("summarises a complete lead in the Unit:/Move-in: form lead-context reads", () => {
    expect(listingLeadNotes(parseListingLeadEmail(APARTMENTS_COM_LEAD)!)).toBe(
      "Apartments.com · Bayline Residences, 1600 NE 1st Ave, Miami, FL 33132\n" +
        "Unit: B2 - 2 Bed / 2 Bath · Move-in: 11/15/2026\n" +
        `Message: ${FULL.message}`
    );
  });
});

describe("toIsoDate", () => {
  it("reads full dates and refuses anything vaguer", () => {
    expect(toIsoDate("11/15/2026")).toBe("2026-11-15");
    expect(toIsoDate("2026-11-15")).toBe("2026-11-15");
    expect(toIsoDate("Nov 15, 2026")).toBe("2026-11-15");
    expect(toIsoDate("Sunday, November 15th 2026")).toBe("2026-11-15");
    expect(toIsoDate("2/30/2026")).toBeNull();
    expect(toIsoDate("ASAP")).toBeNull();
    expect(toIsoDate("December 2026")).toBeNull();
  });
});
