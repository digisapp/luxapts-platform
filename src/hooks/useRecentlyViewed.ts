"use client";

import { useCallback } from "react";
import { createLocalStore, useLocalStore } from "@/lib/local-store";

export interface RecentlyViewedItem {
  id: string;
  type: "building" | "unit";
  name: string;
  address: string;
  neighborhood?: string;
  image?: string;
  price?: number;
  beds?: number;
  baths?: number;
  viewedAt: number;
}

const STORAGE_KEY = "staycio_recently_viewed";
const MAX_ITEMS = 10;

// Shared store: the building page and the RecentlyViewed sidebar previously
// held independent copies and overwrote each other's localStorage writes.
const recentlyViewedStore = createLocalStore<RecentlyViewedItem[]>(
  STORAGE_KEY,
  [],
  (parsed) => {
    // Filter out items older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return parsed.filter((item) => item.viewedAt > thirtyDaysAgo);
  }
);

export function useRecentlyViewed() {
  const { value: items, isLoaded } = useLocalStore(recentlyViewedStore);

  const addItem = useCallback((item: Omit<RecentlyViewedItem, "viewedAt">) => {
    recentlyViewedStore.set((prev) => {
      // Remove existing item with same ID
      const filtered = prev.filter((i) => i.id !== item.id);
      // Add new item at the beginning
      const newItems = [{ ...item, viewedAt: Date.now() }, ...filtered];
      // Limit to MAX_ITEMS
      return newItems.slice(0, MAX_ITEMS);
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    recentlyViewedStore.set((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    recentlyViewedStore.set(() => []);
  }, []);

  return {
    items,
    addItem,
    removeItem,
    clearAll,
    isLoaded,
  };
}
