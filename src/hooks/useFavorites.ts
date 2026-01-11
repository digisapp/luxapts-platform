"use client";

import { useState, useEffect, useCallback } from "react";

export interface FavoriteItem {
  id: string;
  type: "building" | "unit";
  name: string;
  address: string;
  neighborhood?: string;
  citySlug?: string;
  image?: string;
  price?: number;
  beds?: number;
  baths?: number;
  addedAt: number;
}

const STORAGE_KEY = "luxapts_favorites";

export function useFavorites() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FavoriteItem[];
        setItems(parsed);
      }
    } catch (e) {
      console.error("Error loading favorites:", e);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when items change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      } catch (e) {
        console.error("Error saving favorites:", e);
      }
    }
  }, [items, isLoaded]);

  const addItem = useCallback((item: Omit<FavoriteItem, "addedAt">) => {
    setItems((prev) => {
      // Check if already exists
      if (prev.some((i) => i.id === item.id)) {
        return prev;
      }
      return [{ ...item, addedAt: Date.now() }, ...prev];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toggleItem = useCallback((item: Omit<FavoriteItem, "addedAt">) => {
    setItems((prev) => {
      const exists = prev.some((i) => i.id === item.id);
      if (exists) {
        return prev.filter((i) => i.id !== item.id);
      }
      return [{ ...item, addedAt: Date.now() }, ...prev];
    });
  }, []);

  const isFavorite = useCallback(
    (id: string) => items.some((item) => item.id === id),
    [items]
  );

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  return {
    items,
    addItem,
    removeItem,
    toggleItem,
    isFavorite,
    clearAll,
    isLoaded,
    count: items.length,
  };
}
