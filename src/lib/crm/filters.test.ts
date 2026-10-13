import { describe, expect, it } from "vitest";
import {
  applyContactFilters,
  leaseMonths,
  applyContactSort,
  arrayLiteral,
  BUILTIN_LISTS,
  filtersFromParams,
  filtersToParams,
  NO_AGENT,
  searchTokens,
} from "./filters";

const ACTIVE = ["eq", "is_active", true];

/**
 * Records every builder call instead of querying. `calls` leaves out the
 * "in the book" filter every list ends with (tested on its own below);
 * `all` keeps it.
 */
function recorder() {
  const all: unknown[][] = [];
  const calls: unknown[][] = [];
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, method: string) =>
        (...args: unknown[]) => {
          const call = [method, ...args];
          all.push(call);
          if (JSON.stringify(call) !== JSON.stringify(ACTIVE)) calls.push(call);
          return proxy;
        },
    }
  );
  return { proxy, all, calls };
}

const NOW = new Date("2026-10-12T15:00:00Z");
const TODAY = "2026-10-12";

describe("searchTokens", () => {
  it("treats a phone-looking query as one digits token", () => {
    expect(searchTokens("(212) 555-0123")).toEqual(["2125550123"]);
    expect(searchTokens("+1 646 555")).toEqual(["1646555"]);
  });

  it("splits words and strips LIKE wildcards", () => {
    expect(searchTokens("  Dana  Mercer%_ ")).toEqual(["dana", "mercer"]);
    expect(searchTokens("")).toEqual([]);
  });
});

describe("filtersFromParams", () => {
  it("round-trips through a query string", () => {
    const filters = {
      q: "ann",
      stages: ["Lead", "Setup Showing"],
      tag: "12 Sample Street #4F",
      agent: NO_AGENT,
      touch: "never" as const,
      due: true,
    };
    const params = filtersToParams(filters);
    expect(filtersFromParams(params)).toEqual(filters);
  });

  it("drops invalid values instead of failing", () => {
    const params = new URLSearchParams("touch=sometimes&reach=phone&added=7&q=");
    expect(filtersFromParams(params)).toEqual({ reach: "phone" });
  });
});

describe("applyContactFilters", () => {
  it("builds the never-contacted list", () => {
    const { proxy, calls } = recorder();
    applyContactFilters(proxy, { touch: "never" }, TODAY, NOW);
    expect(calls).toEqual([
      ["eq", "contacted", false],
      ["eq", "do_not_contact", false],
    ]);
  });

  it("treats contacted-without-a-date as stale", () => {
    const { proxy, calls } = recorder();
    applyContactFilters(proxy, { touch: "stale90" }, TODAY, NOW);
    expect(calls).toContainEqual(["or", "last_contacted_at.is.null,last_contacted_at.lt.2026-07-14T15:00:00Z"]);
  });

  it("quotes tags for the array filter and handles several stages", () => {
    const { proxy, calls } = recorder();
    applyContactFilters(proxy, { tag: 'A "B"', stages: ["Lead", "Closed"], due: true, added: "30" }, TODAY, NOW);
    expect(calls).toEqual([
      ["in", "stage", ["Lead", "Closed"]],
      ["contains", "tags", '{"A \\"B\\""}'],
      ["lte", "next_task_on", TODAY],
      ["gte", "added_at", "2026-09-12T00:00:00Z"],
    ]);
  });

  it("ends every sort with id so list order is total", () => {
    const { proxy, calls } = recorder();
    applyContactSort(proxy, "name");
    expect(calls.at(-1)).toEqual(["order", "id", { ascending: true }]);
  });

  it("only uses filters the schema accepts in its built-in lists", () => {
    for (const list of BUILTIN_LISTS) {
      const params = filtersToParams(list.filters);
      expect(filtersFromParams(params)).toEqual(list.filters);
    }
  });
});

describe("categories", () => {
  it("splits replies into hot and warm at six months", () => {
    const hot = recorder();
    applyContactFilters(hot.proxy, { touch: "hot" }, TODAY, NOW);
    expect(hot.calls).toEqual([["gte", "last_inbound_at", "2026-04-15T15:00:00Z"]]);
    const warm = recorder();
    applyContactFilters(warm.proxy, { touch: "warm" }, TODAY, NOW);
    expect(warm.calls).toEqual([["lt", "last_inbound_at", "2026-04-15T15:00:00Z"]]);
  });

  it("finds leases coming up by the month they first inquired, wrapping the year", () => {
    expect(leaseMonths("2026-10-12")).toEqual([10, 11, 12]);
    expect(leaseMonths("2026-11-30")).toEqual([11, 12, 1]);
    const { proxy, calls } = recorder();
    applyContactFilters(proxy, { lease: "soon" }, TODAY, NOW);
    expect(calls).toEqual([
      ["in", "cycle_month", [10, 11, 12]],
      ["lte", "added_at", "2025-12-16T00:00:00Z"],
      ["eq", "do_not_contact", false],
    ]);
  });

  it("archives three years of silence, and nests two OR groups in one", () => {
    const archive = recorder();
    applyContactFilters(archive.proxy, { scope: "archive" }, TODAY, NOW);
    expect(archive.calls).toEqual([
      ["is", "last_inbound_at", null],
      ["lt", "added_at", "2023-10-13T00:00:00Z"],
    ]);
    const both = recorder();
    applyContactFilters(both.proxy, { touch: "stale90", scope: "active" }, TODAY, NOW);
    expect(both.calls.filter((c) => c[0] === "or")).toEqual([
      [
        "or",
        "and(or(last_contacted_at.is.null,last_contacted_at.lt.2026-07-14T15:00:00Z),or(last_inbound_at.not.is.null,added_at.gte.2023-10-13T00:00:00Z,added_at.is.null))",
      ],
    ]);
  });

  it("filters budget bands, 3+ beds, neighborhood and real email", () => {
    const { proxy, calls } = recorder();
    applyContactFilters(proxy, { budget: "45to6", beds: "3", hood: "Tribeca", reach: "email" }, TODAY, NOW);
    expect(calls).toEqual([
      ["eq", "neighborhood", "Tribeca"],
      ["gte", "price", 4500],
      ["lt", "price", 6000],
      ["gte", "beds", 3],
      ["eq", "has_real_email", true],
    ]);
  });

  it("keeps sale prices out of the top rent band", () => {
    const { proxy, calls } = recorder();
    applyContactFilters(proxy, { budget: "8plus" }, TODAY, NOW);
    expect(calls).toEqual([
      ["gte", "price", 8000],
      ["lt", "price", 50000],
    ]);
  });

  it("finds replies still waiting on an answer, and filters by type", () => {
    const waiting = recorder();
    applyContactFilters(waiting.proxy, { touch: "awaiting" }, TODAY, NOW);
    expect(waiting.calls).toEqual([
      ["eq", "awaiting_reply", true],
      ["gte", "last_inbound_at", "2026-04-15T15:00:00Z"],
      ["eq", "do_not_contact", false],
    ]);
    const people = recorder();
    applyContactFilters(people.proxy, { kind: "people", agent: NO_AGENT }, TODAY, NOW);
    expect(people.calls).toEqual([
      ["is", "previous_agent", null],
      ["neq", "kind", "broker"],
    ]);
  });

  it("keeps brokers out of every calling list", () => {
    for (const key of ["hot", "warm", "never", "cold"]) {
      expect(BUILTIN_LISTS.find((l) => l.key === key)?.filters.kind).toBe("people");
    }
    expect(BUILTIN_LISTS.find((l) => l.key === "lease")?.filters.kind).toBe("renter");
  });
});

describe("deleted and merged contacts", () => {
  it("leaves them out of every list", () => {
    const { proxy, all } = recorder();
    applyContactFilters(proxy, { touch: "hot" }, TODAY, NOW);
    expect(all.at(-1)).toEqual(ACTIVE);
  });

  it("shows only deleted (not merged) ones in Recently deleted", () => {
    const { proxy, all } = recorder();
    applyContactFilters(proxy, { scope: "deleted" }, TODAY, NOW);
    expect(all).toEqual([
      ["not", "deleted_at", "is", null],
      ["is", "merged_into", null],
    ]);
  });
});

describe("arrayLiteral", () => {
  it("escapes backslashes and quotes", () => {
    expect(arrayLiteral("a\\b")).toBe('{"a\\\\b"}');
  });
});
