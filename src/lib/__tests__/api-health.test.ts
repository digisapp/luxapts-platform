/** GET /api/health — what an external uptime monitor watches. */
import { describe, it, expect, vi, beforeEach } from "vitest";

let dbError: { message: string } | null = null;
vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ limit: async () => ({ error: dbError }) }) }),
  }),
}));

const { GET } = await import("@/app/api/health/route");

beforeEach(() => {
  dbError = null;
});

describe("GET /api/health", () => {
  it("is 200 when the database answers, and never cached", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "ok", database: "ok" });
  });

  it("is 503 when the database doesn't", async () => {
    dbError = { message: "connection refused" };
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "down", database: "unreachable" });
  });
});
