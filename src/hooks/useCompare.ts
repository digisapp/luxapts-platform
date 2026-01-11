"use client";

import { useState, useEffect, useCallback } from "react";

export interface CompareBuilding {
  id: string;
  name: string;
  address?: string;
  neighborhood?: string;
  image?: string;
}

const STORAGE_KEY = "luxapts_compare";
const MAX_COMPARE = 3;

export function useCompare() {
  const [buildings, setBuildings] = useState<CompareBuilding[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setBuildings(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Error loading compare list:", e);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when buildings change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildings));
      } catch (e) {
        console.error("Error saving compare list:", e);
      }
    }
  }, [buildings, isLoaded]);

  const addBuilding = useCallback((building: CompareBuilding) => {
    setBuildings((prev) => {
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
    setBuildings((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const toggleBuilding = useCallback((building: CompareBuilding) => {
    setBuildings((prev) => {
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
    setBuildings([]);
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
