import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny in-memory stand-in for the two Upstash calls the lock uses.
const store = new Map<string, string>();
const fakeRedis = {
  set: vi.fn(async (key: string, value: string, opts: { nx?: boolean }) => {
    if (opts.nx && store.has(key)) return null;
    store.set(key, value);
    return "OK";
  }),
  eval: vi.fn(async (_script: string, keys: string[], args: string[]) => {
    if (store.get(keys[0]) === args[0]) {
      store.delete(keys[0]);
      return 1;
    }
    return 0;
  }),
};
let redisAvailable = true;

vi.mock("@/lib/rate-limit", () => ({
  getRedis: () => (redisAvailable ? fakeRedis : null),
}));

import { withSessionLock } from "@/lib/session-lock";

beforeEach(() => {
  store.clear();
  redisAvailable = true;
  fakeRedis.set.mockClear();
  fakeRedis.eval.mockClear();
});

describe("withSessionLock", () => {
  it("runs two writers for one conversation one after the other", async () => {
    const order: string[] = [];
    let leadId: string | null = null;
    // Each writer creates a lead only when none exists yet — the race the
    // lock closes for a phone call's parallel create_lead + book_tour.
    const writer = (name: string) => async () => {
      order.push(`${name}:start`);
      const existing = leadId;
      await new Promise((r) => setTimeout(r, 20));
      if (!existing) leadId = `lead-from-${name}`;
      order.push(`${name}:end`);
      return existing ? "updated" : "created";
    };

    const results = await Promise.all([
      withSessionLock("lead:s1", writer("a"), { pollMs: 5 }),
      withSessionLock("lead:s1", writer("b"), { pollMs: 5 }),
    ]);

    expect(results.sort()).toEqual(["created", "updated"]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
    expect(store.size).toBe(0);
  });

  it("does not make different conversations wait for each other", async () => {
    const started: string[] = [];
    const slow = (name: string) => async () => {
      started.push(name);
      await new Promise((r) => setTimeout(r, 20));
    };
    await Promise.all([
      withSessionLock("lead:s1", slow("a"), { pollMs: 5 }),
      withSessionLock("lead:s2", slow("b"), { pollMs: 5 }),
    ]);
    expect(fakeRedis.set).toHaveBeenCalledTimes(2);
    expect(started).toEqual(["a", "b"]);
  });

  it("writes without a lock when Redis isn't configured", async () => {
    redisAvailable = false;
    await expect(withSessionLock("lead:s1", async () => "ok")).resolves.toBe("ok");
    expect(fakeRedis.set).not.toHaveBeenCalled();
  });

  it("writes anyway once the wait runs out, and never releases a lock it doesn't hold", async () => {
    store.set("staycio:lock:lead:s1", "someone-else");
    await expect(
      withSessionLock("lead:s1", async () => "ok", { waitMs: 30, pollMs: 5 })
    ).resolves.toBe("ok");
    expect(fakeRedis.eval).not.toHaveBeenCalled();
    expect(store.get("staycio:lock:lead:s1")).toBe("someone-else");
  });

  it("releases the lock when the write throws", async () => {
    await expect(
      withSessionLock("lead:s1", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(store.size).toBe(0);
  });
});
