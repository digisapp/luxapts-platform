"use client";

import { useState, useEffect, useCallback } from "react";

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

const STORAGE_KEY = "luxapts_recently_viewed";
const MAX_ITEMS = 10;

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as RecentlyViewedItem[];
        // Filter out items older than 30 days
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const filtered = parsed.filter((item) => item.viewedAt > thirtyDaysAgo);
        setItems(filtered);
      }
    } catch (e) {
      console.error("Error loading recently viewed:", e);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when items change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (e) {
        console.error("Error saving recently viewed:", e);
      }
    }
  }, [items, isLoaded]);

  const addItem = useCallback((item: Omit<RecentlyViewedItem, "viewedAt">) => {
    setItems((prev) => {
      // Remove existing item with same ID
      const filtered = prev.filter((i) => i.id !== item.id);
      // Add new item at the beginning
      const newItems = [{ ...item, viewedAt: Date.now() }, ...filtered];
      // Limit to MAX_ITEMS
      return newItems.slice(0, MAX_ITEMS);
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  return {
    items,
    addItem,
    removeItem,
    clearAll,
    isLoaded,
  };
}
