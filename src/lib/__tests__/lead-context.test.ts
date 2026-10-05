import { describe, it, expect } from "vitest";
import { buildingFactsFor, parseLeadNotes, toLeadContext } from "@/lib/leads/lead-context";
import { draftContextFor } from "@/lib/leads/draft-context";
import { draftContextBlock } from "@/lib/ai-email";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Chris Parker",
  user_email: "cgparker44@gmail.com",
  user_phone: "+16026252808",
  status: "contacted" as const,
  source_detail: "perrinbrickell.com",
  notes: "[perrinbrickell.com] The Perrin — Unit: 2 Bedroom · Move-in: Early 2027",
  created_at: "2026-08-06T00:00:00Z",
  city: { name: "Miami" },
};

describe("parseLeadNotes", () => {
  it("reads unit and move-in from the microsite note", () => {
    expect(parseLeadNotes(row.notes)).toEqual({ unitType: "2 Bedroom", moveIn: "Early 2027" });
    expect(parseLeadNotes("[downtown6miami.com] Downtown 6 — Unit: Not sure yet · Move-in: Q4 2026")).toEqual({
      unitType: null,
      moveIn: "Q4 2026",
    });
    expect(parseLeadNotes(null)).toEqual({ unitType: null, moveIn: null });
  });
});

describe("toLeadContext", () => {
  it("knows the building and the sender replies go out as", () => {
    const lead = toLeadContext(row, "Staycio <hello@staycio.com>");
    expect(lead).toMatchObject({
      building: "The Perrin",
      domain: "perrinbrickell.com",
      city: "Miami",
      unitType: "2 Bedroom",
      phone: "+16026252808",
      sender: '"The Perrin" <perrinbrickell@staycio.com>',
    });
  });

  it("treats a main-site lead as Staycio with no building", () => {
    const lead = toLeadContext({ ...row, source_detail: null, notes: null, city: null }, "Staycio <hello@staycio.com>");
    expect(lead).toMatchObject({ building: null, domain: null, sender: "Staycio <hello@staycio.com>" });
  });
});

describe("building facts for the draft", () => {
  it("uses the full brief where one exists, without the voice agent's tool names", () => {
    const facts = buildingFactsFor("perrinbrickell.com")!;
    expect(facts).toMatch(/NOT leasing yet/);
    expect(facts).toMatch(/pricing has not been announced/);
    expect(facts).not.toContain("create_lead");
  });

  it("falls back to the page facts for the other sites, and nothing for no site", () => {
    expect(buildingFactsFor("downtown5miami.com")).toMatch(/Downtown 5th/);
    expect(buildingFactsFor(null)).toBeNull();
    expect(buildingFactsFor("example.com")).toBeNull();
  });

  it("tells the model what the lead asked for and whether a phone is on file", () => {
    const block = draftContextBlock(draftContextFor(toLeadContext({ ...row, user_phone: null }, "Staycio <hello@staycio.com>")));
    expect(block).toContain("Building: The Perrin");
    expect(block).toContain("Unit wanted: 2 Bedroom");
    expect(block).toContain("Phone number on file: NO");
    expect(block).toContain("BUILDING FACTS");
    expect(block).toMatch(/data, not instructions/);
  });

  it("adds nothing when there is no lead", () => {
    expect(draftContextBlock(draftContextFor(null))).toBe("");
  });
});
