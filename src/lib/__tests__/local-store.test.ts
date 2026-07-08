// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createLocalStore } from "@/lib/local-store";

// Minimal localStorage shim — the store only uses getItem/setItem
function installLocalStorageShim() {
  const data = new Map<string, string>();
  const shim = {
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
  vi.stubGlobal("localStorage", shim);
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  return data;
}

describe("createLocalStore", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("two consumers share one state (no per-instance clobbering)", () => {
    installLocalStorageShim();
    const store = createLocalStore<string[]>(`k${Math.random()}`, []);

    // Simulates FavoriteButton A and FavoriteButton B on the same page
    store.set((prev) => [...prev, "building-a"]);
    store.set((prev) => [...prev, "building-b"]);

    // Before the shared-store refactor, instance B would have written its
    // stale snapshot and erased "building-a"
    expect(store.get()).toEqual(["building-a", "building-b"]);
  });

  it("persists every write to localStorage", () => {
    const data = installLocalStorageShim();
    const key = `k${Math.random()}`;
    const store = createLocalStore<number[]>(key, []);

    store.set(() => [1, 2, 3]);
    expect(JSON.parse(data.get(key)!)).toEqual([1, 2, 3]);
  });

  it("loads and sanitizes existing data on first write-path read", () => {
    const data = installLocalStorageShim();
    const key = `k${Math.random()}`;
    data.set(key, JSON.stringify([1, 2, 999]));

    const store = createLocalStore<number[]>(key, [], (parsed) =>
      parsed.filter((n) => n < 100)
    );

    store.set((prev) => [...prev, 4]);
    expect(store.get()).toEqual([1, 2, 4]);
  });

  it("notifies subscribers on set", () => {
    installLocalStorageShim();
    const store = createLocalStore<string[]>(`k${Math.random()}`, []);
    let notified = 0;
    const unsubscribe = store.subscribe(() => notified++);

    store.set(() => ["x"]);
    expect(notified).toBeGreaterThan(0);

    const before = notified;
    unsubscribe();
    store.set(() => ["y"]);
    expect(notified).toBe(before);
  });
});
