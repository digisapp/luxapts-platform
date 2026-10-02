import { describe, it, expect } from "vitest";
import { micrositeInquiryEmail, micrositeInquirySubject } from "@/lib/email/templates";
import { MICROSITE_BUILDINGS, micrositeEmailFacts } from "@/lib/microsites";

const base = {
  name: "Nathan Example",
  email: "nathan@example.com",
  buildingName: "Downtown 6",
  city: "Miami",
  citySlug: "miami",
  domain: "downtown6miami.com",
  moveIn: "December 2026",
  unitType: "1 Bedroom",
};

describe("micrositeInquiryEmail", () => {
  it("promises active follow-up rather than a wait", () => {
    const html = micrositeInquiryEmail(base);
    expect(html).toContain("Inquiry received");
    expect(html).toContain("Thanks, Nathan. We&rsquo;re on it.");
    expect(html).toContain("A member of our team will be in touch soon by email with pricing and availability for Downtown 6.");
    expect(html).not.toMatch(/waitlist/i);
  });

  it("promises a text or call, and echoes the number, when a phone was given", () => {
    const html = micrositeInquiryEmail({ ...base, phone: "+1 305 555 0100" });
    expect(html).toContain("will be in touch soon by text or a quick call");
    expect(html).toContain("nathan@example.com<br>+1 305 555 0100");
  });

  it("names the building and its address, nothing more", () => {
    const html = micrositeInquiryEmail({ ...base, facts: micrositeEmailFacts(base.domain) });
    expect(html).toContain("46 NE 6th Street &middot; Downtown Miami");
    // Status, size and developer stay out: the person just read them on the site.
    expect(html).not.toContain("Leasing late 2026");
    expect(html).not.toContain("824");
    expect(html).not.toContain("Melo Group");
  });

  it("uses the same copy for a building that is already leasing", () => {
    const html = micrositeInquiryEmail({
      ...base,
      buildingName: "Midtown 5",
      domain: "midtown5apartments.com",
      facts: micrositeEmailFacts("midtown5apartments.com"),
    });
    expect(html).toContain("pricing and availability for Midtown 5");
    expect(html).toContain("3201 NE 1st Avenue &middot; Midtown Miami");
  });

  it("still renders without facts for an unknown domain", () => {
    const html = micrositeInquiryEmail({ ...base, facts: null });
    expect(html).toContain("Downtown 6</p>");
    expect(html).toContain(">Miami</p>");
  });

  it("carries a working unsubscribe link and no outer footer", () => {
    const url = "https://staycio.com/api/email/unsubscribe?lead=abc&t=def";
    const html = micrositeInquiryEmail({ ...base, unsubscribeUrl: url });
    // Attribute values are HTML-escaped, so the & in the query string becomes &amp;.
    expect(html.split(url.replace("&", "&amp;")).length - 1).toBe(1);
    expect(html).not.toContain("Manage preferences");
    expect(html).not.toContain("Independent apartment search");
  });

  it("falls back to reply-to-remove when no link can be signed", () => {
    const html = micrositeInquiryEmail({ ...base, unsubscribeUrl: null });
    expect(html).toContain("rather not hear from us");
    expect(html).not.toContain("Unsubscribe");
  });

  it("has a text-only header: no images, no emoji", () => {
    const html = micrositeInquiryEmail(base);
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toContain("🏢");
    expect(html).toContain(">Staycio</a>");
  });

  it("keeps the fine print to one line", () => {
    const html = micrositeInquiryEmail({ ...base, unsubscribeUrl: "https://staycio.com/u" });
    expect(html).toContain("You&rsquo;re receiving this because you inquired about Downtown 6 at downtown6miami.com.");
    expect(html).not.toContain("independent");
  });

  it("escapes user-supplied text", () => {
    const html = micrositeInquiryEmail({
      ...base,
      name: '<img src=x onerror="alert(1)">',
      unitType: "<b>2BR</b>",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>2BR</b>");
    expect(html).toContain("&lt;b&gt;2BR&lt;/b&gt;");
  });

  it("subject carries the city unless the name already does, and matches the preheader", () => {
    expect(micrositeInquirySubject("Downtown 6", "Miami")).toBe("We received your inquiry about Downtown 6 Miami");
    expect(micrositeInquirySubject("Kenect Miami", "Miami")).toBe("We received your inquiry about Kenect Miami");
    expect(micrositeInquirySubject("JEM Miami Worldcenter", "Miami")).toBe("We received your inquiry about JEM Miami Worldcenter");
    expect(micrositeInquirySubject("Jade Brickell", "Miami")).toBe("We received your inquiry about Jade Brickell Miami");
    expect(micrositeInquirySubject("Downtown 6", null)).toBe("We received your inquiry about Downtown 6");
    expect(micrositeInquiryEmail(base)).toContain("We received your inquiry about Downtown 6 Miami");
  });
});

describe("micrositeEmailFacts", () => {
  it.each(Object.keys(MICROSITE_BUILDINGS))("%s has building facts for its confirmation email", (domain) => {
    const facts = micrositeEmailFacts(domain);
    expect(facts, `${domain}: add it to HAND_BUILT_EMAIL_FACTS or regenerate`).toBeTruthy();
    expect(facts!.neighborhood.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown domain", () => {
    expect(micrositeEmailFacts("example.com")).toBeNull();
    expect(micrositeEmailFacts(null)).toBeNull();
  });
});
