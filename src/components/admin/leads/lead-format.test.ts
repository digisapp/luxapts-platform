import { describe, expect, it } from "vitest";
import {
  ageLabel,
  avatarTone,
  bedsLabel,
  budgetLabel,
  dayGroup,
  durationLabel,
  initials,
  moveInLabel,
  sourceLabel,
  statusMeta,
} from "./lead-format";

const NOW = new Date("2026-10-05T18:00:00").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

describe("ageLabel", () => {
  it("reads the first week as an age", () => {
    expect(ageLabel(ago(20_000), NOW)).toBe("Just now");
    expect(ageLabel(ago(18 * 60_000), NOW)).toBe("18m ago");
    expect(ageLabel(ago(4 * H), NOW)).toBe("4h ago");
    expect(ageLabel(ago(30 * H), NOW)).toBe("1d ago");
    expect(ageLabel(ago(6 * 24 * H), NOW)).toBe("6d ago");
  });
  it("falls back to a date after a week, with the year only when it differs", () => {
    expect(ageLabel(new Date("2026-09-23T12:00:00").toISOString(), NOW)).toBe("Sep 23");
    expect(ageLabel(new Date("2025-12-30T12:00:00").toISOString(), NOW)).toBe("Dec 30, 2025");
  });
});

describe("durationLabel", () => {
  it("is compact", () => {
    expect(durationLabel(ago(10 * 60_000), NOW)).toBe("under an hour");
    expect(durationLabel(ago(5 * H), NOW)).toBe("5h");
    expect(durationLabel(ago(6.5 * 24 * H), NOW)).toBe("6d");
  });
});

describe("dayGroup", () => {
  it("buckets by calendar day in local time", () => {
    expect(dayGroup(new Date("2026-10-05T00:30:00").toISOString(), NOW)).toBe("Today");
    expect(dayGroup(new Date("2026-10-04T23:59:00").toISOString(), NOW)).toBe("Yesterday");
    expect(dayGroup(new Date("2026-09-29T09:00:00").toISOString(), NOW)).toBe("This week");
    expect(dayGroup(new Date("2026-09-28T23:00:00").toISOString(), NOW)).toBe("Earlier");
  });
});

describe("labels", () => {
  it("formats budget ranges", () => {
    expect(budgetLabel(2800, 3600)).toBe("$2,800–$3,600");
    expect(budgetLabel(null, 3000)).toBe("Up to $3,000");
    expect(budgetLabel(4000, null)).toBe("$4,000+");
    expect(budgetLabel(null, null)).toBeNull();
  });
  it("formats beds, with 0 as a studio", () => {
    expect(bedsLabel(0)).toBe("Studio");
    expect(bedsLabel(2)).toBe("2 bed");
    expect(bedsLabel(null)).toBeNull();
  });
  it("formats move-in dates without shifting the day", () => {
    const now = new Date("2026-10-05T12:00:00Z");
    expect(moveInLabel("2026-12-03", now)).toBe("Move-in Dec 3");
    expect(moveInLabel("2027-02-01", now)).toBe("Move-in Feb 1, 2027");
    expect(moveInLabel(null, now)).toBeNull();
  });
  it("names the microsite building", () => {
    expect(sourceLabel("microsite", "downtown6miami.com")).toBe("Downtown 6");
    expect(sourceLabel("microsite", "unknown-site.com")).toBe("unknown-site.com");
    expect(sourceLabel("web_form", null)).toBe("Web form");
    expect(sourceLabel("voice")).toBe("Phone call");
  });
  it("falls back to New styling for an unknown status", () => {
    expect(statusMeta("bogus").label).toBe("New");
  });
});

describe("initials and avatar tone", () => {
  it("takes first and last word, ignoring '&' and punctuation", () => {
    expect(initials("Greg James Sohl", null)).toBe("GS");
    expect(initials("Noa & Kay Scholer", null)).toBe("NS");
    expect(initials("Klaudia", null)).toBe("K");
    expect(initials("Viviana Perez Calderon..", null)).toBe("VC");
    expect(initials(null, "ocb@example.com")).toBe("O");
    expect(initials(null, null)).toBe("?");
  });
  it("is stable for the same seed", () => {
    expect(avatarTone("a@b.com")).toBe(avatarTone("a@b.com"));
  });
});
