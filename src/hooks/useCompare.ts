"use client";

import { useCallback } from "react";
import { createLocalStore, useLocalStore } from "@/lib/local-store";

export interface CompareBuilding {
  id: string;
  name: string;
  address?: string;
  neighborhood?: string;
  image?: string;
}

const STORAGE_KEY = "luxapts_compare";
const MAX_COMPARE = 3;

// Shared across all hook instances — CompareButton clicks update the
// CompareBar in the root layout immediately.
const compareStore = createLocalStore<CompareBuilding[]>(STORAGE_KEY, []);

export function useCompare() {
  const { value: buildings, isLoaded } = useLocalStore(compareStore);

  const addBuilding = useCallback((building: CompareBuilding) => {
    compareStore.set((prev) => {
      if (prev.some((b) => b.id === building.id)) {
        return prev;
      }
      if (prev.length >= MAX_COMPARE) {
        // Replace the oldest one
        return [...prev.slice(1), building];
      }
      return [...prev, building];
    });
  }, []);

  const removeBuilding = useCallback((id: string) => {
    compareStore.set((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const toggleBuilding = useCallback((building: CompareBuilding) => {
    compareStore.set((prev) => {
      const exists = prev.some((b) => b.id === building.id);
      if (exists) {
        return prev.filter((b) => b.id !== building.id);
      }
      if (prev.length >= MAX_COMPARE) {
        return [...prev.slice(1), building];
      }
      return [...prev, building];
    });
  }, []);

  const isInCompare = useCallback(
    (id: string) => buildings.some((b) => b.id === id),
    [buildings]
  );

  const clearAll = useCallback(() => {
    compareStore.set(() => []);
  }, []);

  return {
    buildings,
    addBuilding,
    removeBuilding,
    toggleBuilding,
    isInCompare,
    clearAll,
    isLoaded,
    count: buildings.length,
    canCompare: buildings.length >= 2,
    isFull: buildings.length >= MAX_COMPARE,
  };
}
