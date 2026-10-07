import { describe, it, expect } from "vitest";
import {
  firstNameOf,
  micrositeFollowUpEmail,
  micrositeInquiryEmail,
  micrositeInquirySubject,
  normalizeMoveIn,
  normalizeUnitType,
} from "@/lib/email/templates";

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

describe("browser-translated form values", () => {
  it("maps translated unit labels back to the form's English options", () => {
    expect(normalizeUnitType("2 habitaciones")).toBe("2 Bedroom");
    expect(normalizeUnitType("1 dormitorio")).toBe("1 Bedroom");
    expect(normalizeUnitType("3 quartos")).toBe("3 Bedroom");
    expect(normalizeUnitType("Estudio")).toBe("Studio");
    expect(normalizeUnitType("1 Bedroom")).toBe("1 Bedroom");
    expect(normalizeUnitType("No estoy seguro todavía")).toBeNull();
    expect(normalizeUnitType("Not sure yet")).toBeNull();
  });

  it("drops a move-in value that is not one of the English options", () => {
    expect(normalizeMoveIn("Q4 2026")).toBe("Q4 2026");
    expect(normalizeMoveIn("Next 30 days")).toBe("Next 30 days");
    expect(normalizeMoveIn("Cuarto trimestre de 2026")).toBeNull();
    expect(normalizeMoveIn("Flexible")).toBeNull();
  });

  it("no longer puts Spanish into the English subject (the Perrin case)", () => {
    expect(micrositeInquirySubject("The Perrin", "Miami", "2 habitaciones")).toBe("The Perrin Miami \u2014 2 Bedroom Availability");
    expect(micrositeInquiryEmail({ ...base, unitType: "2 habitaciones", moveIn: "Cuarto trimestre de 2026" }).text).toContain(
      "looking for a 2-bedroom apartment.\n"
    );
  });
});

describe("firstNameOf", () => {
  it("greets by first name, recapitalising only all-lowercase names", () => {
    expect(firstNameOf("jillian hughson")).toBe("Jillian");
    expect(firstNameOf("DeShawn Smith")).toBe("DeShawn");
    expect(firstNameOf("ROBERT CABRERA")).toBe("Robert");
    expect(firstNameOf("TJ Peterson")).toBe("TJ");
    expect(firstNameOf("Noa & Kay Scholer")).toBe("Noa & Kay");
    expect(firstNameOf("Barbie")).toBe("Barbie");
    expect(firstNameOf("")).toBeNull();
    expect(firstNameOf("someone@gmail.com")).toBeNull();
  });
});

describe("micrositeFollowUpEmail", () => {
  it("is the owner's note: inquiry, move-in date, tour, phone number, signed Stacy", () => {
    const { text, html } = micrositeFollowUpEmail({ name: "jillian hughson", buildingName: "Downtown 6", city: "Miami", unitType: "2 Bedroom" });
    expect(text).toBe(
      "Hi Jillian,\n\n" +
        "We received your inquiry about a 2-bedroom at Downtown 6 Miami. When are you looking to move in?\n\n" +
        "I can send you the available options and schedule an in-person tour once we find a unit that works for you.\n\n" +
        "What\u2019s the best phone number to reach you? I can also text you the options directly.\n\n" +
        "Best,\nStacy\n"
    );
    expect(html).toContain("background:#ffffff");
    expect(html).not.toMatch(/<img|<table|unsubscribe/i);
  });

  it("reads naturally without a unit type or a usable name", () => {
    const studio = micrositeFollowUpEmail({ name: "Ana", buildingName: "The Perrin", city: "Miami", unitType: "Studio" }).text;
    expect(studio).toContain("about a studio at The Perrin Miami.");
    const unsure = micrositeFollowUpEmail({ name: "", buildingName: "Namdar Towers", city: "Miami", unitType: "Not sure yet" }).text;
    expect(unsure.startsWith("Hi there,\n\nWe received your inquiry about Namdar Towers Miami.")).toBe(true);
  });

  it("escapes the lead's name in the html", () => {
    const { html } = micrositeFollowUpEmail({ name: "<b>x</b>", buildingName: "Downtown 6", city: "Miami" });
    expect(html).not.toContain("<b>x</b>");
  });

  it("offers to text the number they left instead of asking for one", () => {
    const { text } = micrositeFollowUpEmail({ name: "Trumaine E", buildingName: "The Perrin", city: "Miami", unitType: "1 Bedroom", phone: "(786) 315-6324" });
    expect(text).toContain("I can also text you the options at (786) 315-6324 if that\u2019s easier.");
    expect(text).not.toContain("best phone number");
  });
});
