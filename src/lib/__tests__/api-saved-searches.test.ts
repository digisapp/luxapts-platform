/**
 * DELETE /api/saved-searches. The route writes with the service-role client,
 * which bypasses RLS, so the session user's id is the only thing scoping a
 * delete — including "Clear all" (?all=true), which also has to reach the
 * database or the alert cron keeps mailing the cleared searches.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = "11111111-1111-4111-8111-111111111111";
const SEARCH = "22222222-2222-4222-8222-222222222222";

let sessionUser: { id: string } | null = null;
let deleteError: { message: string } | null = null;
const queries: { table: string; calls: [string, unknown[]][] }[] = [];

function builder(table: string) {
  const calls: [string, unknown[]][] = [];
  queries.push({ table, calls });
  const b: object = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve({ data: null, error: deleteError });
        }
        return (...args: unknown[]) => {
          calls.push([String(prop), args]);
          return b;
        };
      },
    }
  );
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

const { DELETE } = await import("@/app/api/saved-searches/route");

function del(query: string) {
  return DELETE(new Request(`https://staycio.com/api/saved-searches${query}`, { method: "DELETE" }));
}

describe("DELETE /api/saved-searches", () => {
  beforeEach(() => {
    sessionUser = { id: USER };
    deleteError = null;
    queries.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("clears every saved search of the signed-in user, and only theirs", async () => {
    const res = await del("?all=true");
    expect(res.status).toBe(200);
    expect(queries).toEqual([
      { table: "user_saved_searches", calls: [["delete", []], ["eq", ["user_id", USER]]] },
    ]);
  });

  it("ignores an id passed alongside all=true (still scoped to the user)", async () => {
    await del(`?all=true&id=${SEARCH}`);
    expect(queries[0].calls).toEqual([["delete", []], ["eq", ["user_id", USER]]]);
  });

  it("refuses a signed-out clear without touching the table", async () => {
    sessionUser = null;
    const res = await del("?all=true");
    expect(res.status).toBe(401);
    expect(queries).toEqual([]);
  });

  it("reports a failed clear", async () => {
    deleteError = { message: "boom" };
    const res = await del("?all=true");
    expect(res.status).toBe(500);
  });

  it("still deletes a single search by id, scoped to the user", async () => {
    const res = await del(`?id=${SEARCH}`);
    expect(res.status).toBe(200);
    expect(queries[0].calls).toEqual([["delete", []], ["eq", ["id", SEARCH]], ["eq", ["user_id", USER]]]);
  });

  it("requires a valid id when not clearing all", async () => {
    expect((await del("?all=1")).status).toBe(400);
    expect((await del("?id=nope")).status).toBe(400);
    expect(queries).toEqual([]);
  });
});
