import { describe, expect, it } from "vitest";
import {
  agentKeysFrom,
  contactKind,
  FLORIDA_TAG,
  guessMapping,
  neighborhoodFromDescription,
  parseDateValue,
  rowToContact,
} from "./import-map";
import { findMatch, mergeContact, newContact } from "./merge";

// The real export's headers (a subset) in their real order.
const HEADERS = [
  "Date Added", "Name", "First Name", "Last Name", "Stage", "Lead Source", "Assigned To",
  "Last Assigned", "Is Contacted", "Listing Price", "Tags", "Email 1", "Email 1 - Type",
  "Email 2", "Phone 1", "Phone 1 - Type", "Phone 2", "Relationship 1 Email 1",
  "Property Address", "Property City", "Property State", "Property Price", "Property Beds",
  "Message", "Notes", "Calls", "Texts", "Background", "ID", "Month", "Property Link", "Room Type",
  "Description",
];

function row(values: Record<string, string>): string[] {
  return HEADERS.map((h) => values[h] ?? "");
}

describe("guessMapping", () => {
  const m = guessMapping(HEADERS);
  const col = (h: string) => HEADERS.indexOf(h);

  it("maps the Follow Up Boss columns", () => {
    expect(m.fields.emails).toEqual([col("Email 1"), col("Email 2")]);
    expect(m.fields.phones).toEqual([col("Phone 1"), col("Phone 2")]);
    expect(m.fields.external_id).toEqual([col("ID")]);
    expect(m.fields.source).toEqual([col("Lead Source")]);
    // Property Price is preferred over Listing Price.
    expect(m.fields.price).toEqual([col("Property Price"), col("Listing Price")]);
    expect(m.fields.move_in).toEqual([col("Month")]);
  });

  it("keeps type columns, relationships and unknowns as extra fields", () => {
    for (const h of ["Email 1 - Type", "Phone 1 - Type", "Relationship 1 Email 1", "Last Assigned", "Room Type"]) {
      expect(m.extra).toContain(col(h));
    }
    expect(m.extra).not.toContain(col("Email 1"));
  });
});

describe("rowToContact", () => {
  const mapping = guessMapping(HEADERS);
  const base = {
    "Date Added": "2024-09-10",
    Name: "Dana Whitfield",
    "First Name": "Dana",
    "Last Name": "Whitfield",
    Stage: "Lead",
    "Lead Source": "StreetEasy",
    "Assigned To": "Alex Rivera",
    "Is Contacted": "Yes",
    "Email 1": "Dana@Example.com",
    "Email 1 - Type": "home",
    "Phone 1": "(646) 555-0101",
    "Property Address": "100 Example St #5F",
    "Property City": "Manhattan",
    "Property State": "NY",
    "Property Price": "5400",
    "Property Beds": "1",
    Message: "Message: Is there a video?",
    Texts:
      "Alex Rivera texted Dana Whitfield on 9/10/2024 1:00pm\nHi Dana!\n\nDana Whitfield texted Alex Rivera on 9/10/2024 1:05pm\nHi",
    Notes: "wants laundry\n-Alex Rivera 09/11/2024",
    ID: "2723",
  };
  const agents = agentKeysFrom([row(base)], mapping);

  it("builds the contact, its inquiry and its history", () => {
    const c = rowToContact(row(base), mapping, agents)!;
    expect(c).toMatchObject({
      external_id: "2723",
      first_name: "Dana",
      emails: ["dana@example.com"],
      phones: ["+16465550101"],
      source: "StreetEasy",
      price: 5400,
      beds: 1,
      contacted: true,
      last_contacted_at: "2024-09-10T17:00:00.000Z",
      last_inbound_at: "2024-09-10T17:05:00.000Z",
      extra: { "Email 1 - Type": "home" },
    });
    expect(c.activities.map((a) => [a.kind, a.direction])).toEqual([
      ["inquiry", "inbound"],
      ["text", "outbound"],
      ["text", "inbound"],
      ["note", null],
    ]);
    expect(c.activities[0]).toMatchObject({ body: "Is there a video?", import_key: "inquiry:original" });
    expect(c.tags).toEqual([]);
  });

  it("gives every history entry a stable import key", () => {
    const a = rowToContact(row(base), mapping, agents)!;
    const b = rowToContact(row(base), mapping, agents)!;
    expect(a.activities.map((x) => x.import_key)).toEqual(b.activities.map((x) => x.import_key));
    expect(new Set(a.activities.map((x) => x.import_key)).size).toBe(a.activities.length);
  });

  it("reads the neighborhood from the description and keeps the description", () => {
    const c = rowToContact(row({ ...base, Description: "CONDO IN TRIBECA | Renter's Preferred Tour: In Person" }), mapping, agents)!;
    expect(c.neighborhood).toBe("Tribeca");
    expect(c.extra.Description).toBe("CONDO IN TRIBECA | Renter's Preferred Tour: In Person");
    expect(neighborhoodFromDescription("COOP IN HELL'S KITCHEN")).toBe("Hell's Kitchen");
    expect(neighborhoodFromDescription("Hi, is this available?")).toBeNull();
  });

  it("makes a real email the primary one when the first is a relay", () => {
    const c = rowToContact(
      row({ ...base, "Email 1": "rh-dana-1@renthop-mail.com", "Email 2": "dana@gmail.com" }),
      mapping,
      agents
    )!;
    expect(c.emails).toEqual(["dana@gmail.com", "rh-dana-1@renthop-mail.com"]);
  });

  it("keeps the old agent as history, not ownership", () => {
    const c = rowToContact(row(base), mapping, agents)!;
    expect(c.previous_agent).toBe("Alex Rivera");
    expect(c.kind).toBe("renter");
    expect(c.do_not_contact).toBe(false);
  });

  it("moves tags naming the old agents out of the tag list, keeping them", () => {
    const c = rowToContact(row({ ...base, Tags: "Alex Rivera, VIP, Brooklyn" }), mapping, agents)!;
    expect(c.tags).toEqual(["VIP", "Brooklyn"]);
    expect(c.extra["Agent tags"]).toBe("Alex Rivera");
  });

  it("honors FUB's Unsubscribed tag as do-not-contact", () => {
    expect(rowToContact(row({ ...base, Tags: "Unsubscribed" }), mapping, agents)!.do_not_contact).toBe(true);
  });

  it("tells renters, buyers and brokers apart", () => {
    expect(contactKind({ tags: [], emails: ["a@gmail.com"], price: 5400 })).toBe("renter");
    expect(contactKind({ tags: [], emails: ["a@gmail.com"], price: 1_315_000 })).toBe("buyer");
    expect(contactKind({ tags: [], emails: ["a@gmail.com"], price: null, dealStage: "Buyers - Closed" })).toBe("buyer");
    expect(contactKind({ tags: ["Agent Inquiry"], emails: ["a@gmail.com"], price: 5400 })).toBe("broker");
    // A broker asking about a sale listing is still a broker.
    expect(contactKind({ tags: [], emails: ["agent@compass.com"], price: 1_200_000 })).toBe("broker");
    expect(rowToContact(row({ ...base, "Property Price": "1315000" }), mapping, agents)!.kind).toBe("buyer");
  });

  it("tags Florida inquiries and ignores FUB's <unspecified> source", () => {
    const c = rowToContact(
      row({ ...base, "Property State": "FL", "Property City": "Miami", "Lead Source": "<unspecified>", Tags: "VIP" }),
      mapping,
      agents
    )!;
    expect(c.tags).toEqual(["VIP", FLORIDA_TAG]);
    expect(c.source).toBeNull();
  });

  it("splits the full name when first and last are blank, and skips empty rows", () => {
    const c = rowToContact(row({ Name: "Morgan M", "Email 1": "m@x.co" }), mapping, agents)!;
    expect([c.first_name, c.last_name]).toEqual(["Morgan", "M"]);
    expect(c.stage).toBe("Lead");
    expect(rowToContact(row({ Stage: "Lead" }), mapping, agents)).toBeNull();
  });

  it("parses both date styles at noon New York time", () => {
    expect(parseDateValue("2023-03-06")).toBe("2023-03-06T17:00:00.000Z");
    expect(parseDateValue("7/4/2024")).toBe("2024-07-04T16:00:00.000Z");
    expect(parseDateValue("July 2019")).toBeNull();
  });
});

describe("findMatch / mergeContact", () => {
  const mapping = guessMapping(HEADERS);
  const agents = new Set<string>();
  const make = (v: Record<string, string>) => rowToContact(row(v), mapping, agents)!;
  const ann = newContact("11111111-1111-4111-8111-111111111111", make({ "First Name": "Ann", "Email 1": "ann@x.co", "Phone 1": "2125550100", ID: "1" }), "b1");

  it("matches the same Follow Up Boss ID first", () => {
    expect(findMatch(make({ "First Name": "Annie", ID: "1" }), [ann])).toBe(ann);
  });

  it("never merges two different Follow Up Boss IDs", () => {
    expect(findMatch(make({ "First Name": "Ann", "Email 1": "ann@x.co", ID: "2" }), [ann])).toBeNull();
  });

  it("matches a shared email or phone only when first names agree", () => {
    expect(findMatch(make({ "First Name": "Ann", "Email 1": "ann@x.co" }), [ann])).toBe(ann);
    expect(findMatch(make({ "First Name": "Bob", "Email 1": "ann@x.co" }), [ann])).toBeNull();
    expect(findMatch(make({ "First Name": "Ann", "Phone 1": "(212) 555-0100" }), [ann])).toBe(ann);
  });

  it("keeps a couple sharing a phone apart when their emails differ", () => {
    expect(findMatch(make({ "First Name": "Ann", "Phone 1": "2125550100", "Email 1": "other@x.co" }), [ann])).toBeNull();
  });

  it("merges without overwriting what the book already has", () => {
    const existing = { ...ann, stage: "Setup Showing", source: "RentHop" };
    const merged = mergeContact(
      existing,
      make({ "First Name": "Ann", Stage: "Closed", "Lead Source": "Zillow", "Email 1": "ann2@x.co", Tags: "VIP" })
    );
    expect(merged).toMatchObject({
      id: ann.id,
      stage: "Setup Showing",
      source: "RentHop",
      emails: ["ann@x.co", "ann2@x.co"],
      tags: ["VIP"],
    });
  });

  it("lets an import move a contact off the default stage", () => {
    expect(mergeContact(ann, make({ "First Name": "Ann", Stage: "Closed" })).stage).toBe("Closed");
  });

  it("compares stored and imported timestamps as instants", () => {
    const stored = { ...ann, last_contacted_at: "2024-09-10T17:00:00+00:00" };
    const merged = mergeContact(stored, { ...make({ "First Name": "Ann" }), last_contacted_at: "2024-09-10T16:59:00.000Z" });
    expect(merged.last_contacted_at).toBe("2024-09-10T17:00:00+00:00");
  });
});
