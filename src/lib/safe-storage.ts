// Web Storage throws (SecurityError) when the browser blocks site data, e.g.
// Chrome's "Block all cookies". Code in the root layout that touched storage
// directly took down every page for those visitors, so read and write through
// these instead: a blocked store behaves like an empty one.

type StorageKind = "local" | "session";

function store(kind: StorageKind): Storage {
  return kind === "local" ? window.localStorage : window.sessionStorage;
}

export function storageGet(kind: StorageKind, key: string): string | null {
  try {
    return store(kind).getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(kind: StorageKind, key: string, value: string): void {
  try {
    store(kind).setItem(key, value);
  } catch {}
}
