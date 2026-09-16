import { describe, it, expect } from "vitest";
import { senderIdentityFor } from "@/lib/microsites";

/**
 * Mirrors the token substitution in the bulk-email route. One draft goes to
 * many people, so a bad greeting is a bad greeting 60 times over.
 */
function fill(template: string, lead: { name: string | null }, building: string): string {
  const first = (lead.name ?? "").trim().split(/\s+/)[0] || "there";
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, first)
    .replace(/\{\{\s*building\s*\}\}/gi, building);
}

describe("bulk email personalisation", () => {
  const B = "Downtown 6";

  it("uses the first name only", () => {
    expect(fill("Hi {{name}}", { name: "María González" }, B)).toBe("Hi María");
    expect(fill("Hi {{name}}", { name: "Jordan" }, B)).toBe("Hi Jordan");
  });

  it("falls back to 'there' when the name is missing or blank", () => {
    expect(fill("Hi {{name}}", { name: null }, B)).toBe("Hi there");
    expect(fill("Hi {{name}}", { name: "   " }, B)).toBe("Hi there");
  });

  it("substitutes the building the lead signed up on", () => {
    expect(fill("about {{building}}", { name: "A" }, B)).toBe("about Downtown 6");
  });

  it("is tolerant of spacing and case in tokens", () => {
    expect(fill("{{ name }} / {{NAME}} / {{ Building }}", { name: "Sam Lee" }, B)).toBe(
      "Sam / Sam / Downtown 6"
    );
  });

  it("replaces every occurrence, not just the first", () => {
    expect(fill("{{name}} {{name}} {{name}}", { name: "Kim" }, B)).toBe("Kim Kim Kim");
  });

  it("leaves a message with no tokens untouched", () => {
    const plain = "Pricing is out. Reply if you want a unit held.";
    expect(fill(plain, { name: "Kim" }, B)).toBe(plain);
  });

  // Each recipient is addressed alone, from the building they know.
  it("pairs each lead with its own building sender", () => {
    const fallback = "Staycio <hello@staycio.com>";
    expect(senderIdentityFor("downtown6miami.com", fallback).from).toBe(
      '"Downtown 6" <downtown6miami@staycio.com>'
    );
    expect(senderIdentityFor("perrinbrickell.com", fallback).from).toBe(
      '"The Perrin" <perrinbrickell@staycio.com>'
    );
    expect(senderIdentityFor(null, fallback).from).toBe(fallback);
  });
});
