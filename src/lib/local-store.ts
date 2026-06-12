"use client";

import { useSyncExternalStore } from "react";

/**
 * Module-level localStorage-backed store shared across all hook instances.
 *
 * Why: per-instance useState + localStorage effects meant every consumer had
 * its own stale copy — CompareBar (mounted in the root layout) never saw
 * CompareButton clicks, and two FavoriteButtons on one page clobbered each
 * other's writes. A single store with subscribe/notify fixes both, and a
 * `storage` listener keeps tabs in sync.
 */

export interface LocalStoreState<T> {
  value: T;
  isLoaded: boolean;
}

export interface LocalStore<T> {
  getSnapshot: () => LocalStoreState<T>;
  getServerSnapshot: () => LocalStoreState<T>;
  subscribe: (listener: () => void) => () => void;
  /** Read-modify-write against the CURRENT store state (never a stale copy). */
  set: (updater: (prev: T) => T) => void;
  /** Current value without subscribing (for imperative code). */
  get: () => T;
}

export function createLocalStore<T>(
  storageKey: string,
  fallback: T,
  sanitize?: (parsed: T) => T
): LocalStore<T> {
  let state: LocalStoreState<T> = { value: fallback, isLoaded: false };
  const serverSnapshot: LocalStoreState<T> = { value: fallback, isLoaded: false };
  const listeners = new Set<() => void>();
  let storageListenerAttached = false;

  function emit() {
    listeners.forEach((l) => l());
  }

  function readFromStorage(): T {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        return sanitize ? sanitize(parsed) : parsed;
      }
    } catch (e) {
      console.error(`Error loading ${storageKey}:`, e);
    }
    return fallback;
  }

  function load() {
    if (state.isLoaded || typeof window === "undefined") return;
    state = { value: readFromStorage(), isLoaded: true };
    emit();
  }

  function persist(value: T) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) {
      console.error(`Error saving ${storageKey}:`, e);
    }
  }

  return {
    getSnapshot: () => state,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!storageListenerAttached && typeof window !== "undefined") {
        storageListenerAttached = true;
        window.addEventListener("storage", (e) => {
          if (e.key === storageKey) {
            state = { value: readFromStorage(), isLoaded: true };
            emit();
          }
        });
      }
      // Defer the initial localStorage read past hydration so server HTML
      // (rendered with the empty fallback) matches the first client render.
      if (!state.isLoaded) {
        queueMicrotask(load);
      }
      return () => {
        listeners.delete(listener);
      };
    },
    set(updater: (prev: T) => T) {
      if (!state.isLoaded && typeof window !== "undefined") {
        state = { value: readFromStorage(), isLoaded: true };
      }
      const next = updater(state.value);
      state = { value: next, isLoaded: true };
      persist(next);
      emit();
    },
    get() {
      return state.value;
    },
  };
}

export function useLocalStore<T>(store: LocalStore<T>): LocalStoreState<T> {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
}
