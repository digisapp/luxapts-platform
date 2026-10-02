import { describe, it, expect } from "vitest";
import { micrositeInquiryEmail, micrositeInquirySubject } from "@/lib/email/templates";

const base = { name: "Nathan Example", buildingName: "Downtown 6", city: "Miami", moveIn: "December", unitType: "1 Bedroom" };

describe("micrositeInquirySubject", () => {
  it("names the building, city and unit type", () => {
    expect(micrositeInquirySubject("Downtown 6", "Miami", "1 Bedroom")).toBe("Downtown 6 Miami \u2014 1 Bedroom Availability");
  });
  it("does not repeat a city already in the name", () => {
    expect(micrositeInquirySubject("Kenect Miami", "Miami", "Studio")).toBe("Kenect Miami \u2014 Studio Availability");
    expect(micrositeInquirySubject("JEM Miami Worldcenter", "Miami", null)).toBe("JEM Miami Worldcenter \u2014 Availability");
  });
  it("drops the unit type when the form said not sure", () => {
    expect(micrositeInquirySubject("The Perrin", "Miami", "Not sure yet")).toBe("The Perrin Miami \u2014 Availability");
  });
});

describe("micrositeInquiryEmail", () => {
  it("is Stacy's short personal note, with a text part", () => {
    const { html, text } = micrositeInquiryEmail(base);
    expect(text).toBe(
      "Hi Nathan,\n\n" +
        "Thanks for your interest in Downtown 6 Miami! I saw that you\u2019re looking for a 1-bedroom apartment in December.\n\n" +
        "Do you have an ideal move-in date?\n\n" +
        "Once I know your timing, I can send you the available 1-bedroom options, pricing, and floor plans. If you\u2019re in Miami, I\u2019d also be happy to schedule a private tour and show you the available units in person.\n\n" +
        "Just let me know what works best for you.\n\n" +
        "Best,\nStacy\n"
    );
    expect(html).toContain("Hi Nathan,");
    expect(html).toContain("Best,<br>Stacy");
    expect(html).not.toMatch(/<img\b|<table\b/);
    expect(html).not.toMatch(/waitlist|unsubscribe|Staycio/i);
  });

  it("reads the same whether or not the building is leasing yet", () => {
    const a = micrositeInquiryEmail(base).text;
    const b = micrositeInquiryEmail({ ...base, buildingName: "Midtown 5" }).text;
    expect(b).toBe(a.replace(/Downtown 6/g, "Midtown 5"));
  });

  it("phrases the unit type and timing from the form's values", () => {
    expect(micrositeInquiryEmail({ ...base, unitType: "Studio", moveIn: "Q4 2026" }).text).toContain(
      "looking for a studio apartment in Q4 2026."
    );
    expect(micrositeInquiryEmail({ ...base, unitType: "2 Bedroom", moveIn: "As soon as possible" }).text).toContain(
      "looking for a 2-bedroom apartment as soon as possible."
    );
    expect(micrositeInquiryEmail({ ...base, unitType: "3 Bedroom", moveIn: "Next 30 days" }).text).toContain(
      "looking for a 3-bedroom apartment in the next 30 days."
    );
    expect(micrositeInquiryEmail({ ...base, moveIn: "Early 2027" }).text).toContain("in early 2027.");
    expect(micrositeInquiryEmail({ ...base, unitType: "Not sure yet", moveIn: "Flexible" }).text).toContain(
      "looking for an apartment.\n"
    );
    expect(micrositeInquiryEmail({ ...base, unitType: null, moveIn: null }).text).toContain("the available options, pricing");
    expect(micrositeInquiryEmail({ ...base, unitType: "Studio" }).text).toContain("the available studio options");
  });

  it("does not repeat the city when the building name has it", () => {
    expect(micrositeInquiryEmail({ ...base, buildingName: "Kenect Miami" }).text).toContain("interest in Kenect Miami!");
  });

  it("escapes user-supplied text in the html", () => {
    const { html } = micrositeInquiryEmail({ ...base, name: "<img src=x onerror=\"alert(1)\">", unitType: "<b>2BR</b>" });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>2BR</b>");
  });
});
