import { describe, expect, it } from "vitest";
import { parseCalls, parseNotes, parseTexts } from "./fub-history";
import { nameKey } from "./normalize";

const agents = new Set(["Alex Rivera", "Jordan Lee"].map(nameKey));

describe("parseTexts", () => {
  const cell = [
    "Alex Rivera texted Dana Whitfield on 7/16/2023 11:44am",
    "Hey Dana, I got your inquiry for 100 Example St #5f. Are you able to view today?",
    "",
    "Dana Whitfield texted Alex Rivera on 7/16/2023 11:45am",
    "Yes we can come today.",
    "",
    "Around 2pm would be best",
    "",
    "Jordan Lee texted Dana Whitfield on 1/12/2025 12:05am",
    "Happy New Year!",
  ].join("\r\n");

  it("splits a conversation into messages with direction and New York time", () => {
    const texts = parseTexts(cell, "Dana Whitfield", agents);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toMatchObject({
      kind: "text",
      direction: "outbound",
      actor: "Alex Rivera",
      occurred_at: "2023-07-16T15:44:00.000Z", // 11:44 EDT
    });
    expect(texts[1]).toMatchObject({
      direction: "inbound",
      body: "Yes we can come today.\n\nAround 2pm would be best",
    });
    // 12:05am is just after midnight; January is EST.
    expect(texts[2].occurred_at).toBe("2025-01-12T05:05:00.000Z");
  });

  it("uses the agent list when the contact was renamed since", () => {
    const texts = parseTexts(cell, "Dana W. (renamed)", agents);
    expect(texts.map((t) => t.direction)).toEqual(["outbound", "inbound", "outbound"]);
  });

  it("keeps a body line that merely mentions texting", () => {
    const texts = parseTexts(
      "Ann B texted Alex Rivera on 3/1/2024 9:00am\nJust texted my boss on vacation",
      "Ann B",
      agents
    );
    expect(texts).toHaveLength(1);
    expect(texts[0].body).toBe("Just texted my boss on vacation");
  });
});

describe("parseCalls", () => {
  it("reads durations, outcomes and typed notes", () => {
    const calls = parseCalls(
      [
        "Jordan Lee called Sam O on 6/3/2026 6:32pm (5 min 4 sec)",
        "budget- 6,200",
        "",
        "Jordan Lee called Sam O on 6/5/2026 11:55am (no answer)",
        "",
        "Sam O called Jordan Lee on 6/5/2026 11:59am (12 sec)",
        "",
        "Jordan Lee called Sam O on 6/6/2026 10:00am",
        "Bad Number",
      ].join("\n"),
      "Sam O",
      agents
    );
    expect(calls.map((c) => [c.direction, c.outcome, c.meta.duration_sec ?? null, c.body])).toEqual([
      ["outbound", "talked", 304, "budget- 6,200"],
      ["outbound", "no_answer", null, null],
      ["inbound", null, 12, null],
      ["outbound", "bad_number", null, null],
    ]);
  });
});

describe("parseNotes", () => {
  it("splits notes on their signature lines", () => {
    const notes = parseNotes(
      "April 30th\n$5,500\nno pets\n-Chris Park 03/27/2025\nWaiting on 200 Main\n-Taylor Reed 04/24/2025\nleftover"
    );
    expect(notes).toEqual([
      expect.objectContaining({ actor: "Chris Park", body: "April 30th\n$5,500\nno pets", occurred_at: "2025-03-27T16:00:00.000Z" }),
      expect.objectContaining({ actor: "Taylor Reed", body: "Waiting on 200 Main" }),
      expect.objectContaining({ actor: null, body: "leftover", occurred_at: null }),
    ]);
  });
});
