"use client";

import { useState, useEffect, useCallback } from "react";

export interface SavedSearch {
  id: string;
  name: string;
  filters: {
    city?: string;
    neighborhood?: string;
    bedsMin?: number;
    bedsMax?: number;
    budgetMin?: number;
    budgetMax?: number;
    petFriendly?: boolean;
  };
  resultCount?: number;
  createdAt: number;
  lastUsedAt: number;
}

const STORAGE_KEY = "luxapts_saved_searches";
const MAX_SEARCHES = 10;

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SavedSearch[];
        setSearches(parsed);
      }
    } catch (e) {
      console.error("Error loading saved searches:", e);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when searches change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
      } catch (e) {
        console.error("Error saving searches:", e);
      }
    }
  }, [searches, isLoaded]);

  const saveSearch = useCallback(
    (name: string, filters: SavedSearch["filters"], resultCount?: number) => {
      const id = `search_${Date.now()}`;
      const newSearch: SavedSearch = {
        id,
        name,
        filters,
        resultCount,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      setSearches((prev) => {
        const updated = [newSearch, ...prev].slice(0, MAX_SEARCHES);
        return updated;
      });

      return id;
    },
    []
  );

  const removeSearch = useCallback((id: string) => {
    setSearches((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateLastUsed = useCallback((id: string) => {
    setSearches((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, lastUsedAt: Date.now() } : s
      )
    );
  }, []);

  const clearAll = useCallback(() => {
    setSearches([]);
  }, []);

  return {
    searches,
    saveSearch,
    removeSearch,
    updateLastUsed,
    clearAll,
    isLoaded,
    count: searches.length,
  };
}
