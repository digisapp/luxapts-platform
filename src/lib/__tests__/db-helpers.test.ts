import { describe, it, expect, vi } from "vitest";
import { fetchAllRows, getFirstRelation, aggregateByProperty } from "../db-helpers";

describe("fetchAllRows", () => {
  const makeRows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

  it("returns a single short page without fetching more", async () => {
    const queryPage = vi.fn().mockResolvedValue({ data: makeRows(3), error: null });
    const rows = await fetchAllRows(queryPage, { pageSize: 10 });
    expect(rows).toHaveLength(3);
    expect(queryPage).toHaveBeenCalledTimes(1);
    expect(queryPage).toHaveBeenCalledWith(0, 9);
  });

  it("pages through full pages until a short page", async () => {
    const queryPage = vi
      .fn()
      .mockResolvedValueOnce({ data: makeRows(10), error: null })
      .mockResolvedValueOnce({ data: makeRows(10), error: null })
      .mockResolvedValueOnce({ data: makeRows(4), error: null });
    const rows = await fetchAllRows(queryPage, { pageSize: 10 });
    expect(rows).toHaveLength(24);
    expect(queryPage).toHaveBeenCalledTimes(3);
    expect(queryPage).toHaveBeenNthCalledWith(2, 10, 19);
    expect(queryPage).toHaveBeenNthCalledWith(3, 20, 29);
  });

  it("stops when a page is exactly empty", async () => {
    const queryPage = vi
      .fn()
      .mockResolvedValueOnce({ data: makeRows(10), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const rows = await fetchAllRows(queryPage, { pageSize: 10 });
    expect(rows).toHaveLength(10);
    expect(queryPage).toHaveBeenCalledTimes(2);
  });

  it("stops on error but keeps rows already fetched", async () => {
    const queryPage = vi
      .fn()
      .mockResolvedValueOnce({ data: makeRows(10), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("boom") });
    const rows = await fetchAllRows(queryPage, { pageSize: 10 });
    expect(rows).toHaveLength(10);
  });

  it("respects maxPages as a runaway guard", async () => {
    const queryPage = vi.fn().mockResolvedValue({ data: makeRows(10), error: null });
    const rows = await fetchAllRows(queryPage, { pageSize: 10, maxPages: 3 });
    expect(rows).toHaveLength(30);
    expect(queryPage).toHaveBeenCalledTimes(3);
  });
});

describe("getFirstRelation", () => {
  it("returns null for null/undefined", () => {
    expect(getFirstRelation(null)).toBeNull();
    expect(getFirstRelation(undefined)).toBeNull();
  });

  it("returns the object itself for a single relation", () => {
    expect(getFirstRelation({ a: 1 })).toEqual({ a: 1 });
  });

  it("returns the first element for an array relation", () => {
    expect(getFirstRelation([{ a: 1 }, { a: 2 }])).toEqual({ a: 1 });
    expect(getFirstRelation([])).toBeNull();
  });
});

describe("aggregateByProperty", () => {
  it("counts values and ranks them", () => {
    const items = [{ k: "a" }, { k: "b" }, { k: "a" }, { k: null }];
    const { counts, topIds } = aggregateByProperty(items, (i) => i.k);
    expect(counts).toEqual({ a: 2, b: 1 });
    expect(topIds).toEqual(["a", "b"]);
  });

  it("applies the limit to topIds", () => {
    const items = [{ k: "a" }, { k: "a" }, { k: "b" }, { k: "c" }];
    const { topIds } = aggregateByProperty(items, (i) => i.k, 1);
    expect(topIds).toEqual(["a"]);
  });
});
