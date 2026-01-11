"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

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
  const { user } = useAuth();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncedRef = useRef(false);

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

  // Sync with database when user logs in
  useEffect(() => {
    if (!user || syncedRef.current) return;

    const syncFavorites = async () => {
      setIsSyncing(true);
      try {
        // Fetch existing favorites from database
        const response = await fetch("/api/favorites");
        if (response.ok) {
          const { favorites } = await response.json();

          // Merge local favorites to database
          const localItems = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as FavoriteItem[];
          for (const item of localItems) {
            const exists = favorites.some((f: { building_id?: string; unit_id?: string }) =>
              f.building_id === item.id || f.unit_id === item.id
            );
            if (!exists) {
              await fetch("/api/favorites", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  building_id: item.type === "building" ? item.id : undefined,
                  unit_id: item.type === "unit" ? item.id : undefined,
                }),
              });
            }
          }

          // Merge database favorites to local state
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dbItems: FavoriteItem[] = favorites.map((f: any) => {
            const building = f.buildings;
            return {
              id: f.building_id || f.unit_id,
              type: f.building_id ? "building" : "unit",
              name: building?.name || "Unknown",
              address: building?.address_1 || "",
              neighborhood: Array.isArray(building?.neighborhoods)
                ? building.neighborhoods[0]?.name
                : building?.neighborhoods?.name,
              citySlug: Array.isArray(building?.cities)
                ? building.cities[0]?.slug
                : building?.cities?.slug,
              addedAt: new Date(f.created_at).getTime(),
            };
          });

          // Merge: keep all from DB, add local items not in DB
          const mergedItems = [...dbItems];
          for (const localItem of localItems) {
            if (!dbItems.some((db) => db.id === localItem.id)) {
              mergedItems.push(localItem);
            }
          }

          setItems(mergedItems);
          syncedRef.current = true;
        }
      } catch (e) {
        console.error("Error syncing favorites:", e);
      } finally {
        setIsSyncing(false);
      }
    };

    syncFavorites();
  }, [user]);

  // Reset sync flag when user logs out
  useEffect(() => {
    if (!user) {
      syncedRef.current = false;
    }
  }, [user]);

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

  const addItem = useCallback(async (item: Omit<FavoriteItem, "addedAt">) => {
    // Check if already exists
    const exists = items.some((i) => i.id === item.id);
    if (exists) return;

    const newItem = { ...item, addedAt: Date.now() };
    setItems((prev) => [newItem, ...prev]);

    // Sync to database if logged in
    if (user) {
      try {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            building_id: item.type === "building" ? item.id : undefined,
            unit_id: item.type === "unit" ? item.id : undefined,
          }),
        });
      } catch (e) {
        console.error("Error adding favorite to DB:", e);
      }
    }
  }, [items, user]);

  const removeItem = useCallback(async (id: string) => {
    const item = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((item) => item.id !== id));

    // Sync to database if logged in
    if (user && item) {
      try {
        const param = item.type === "building" ? `building_id=${id}` : `unit_id=${id}`;
        await fetch(`/api/favorites?${param}`, { method: "DELETE" });
      } catch (e) {
        console.error("Error removing favorite from DB:", e);
      }
    }
  }, [items, user]);

  const toggleItem = useCallback(async (item: Omit<FavoriteItem, "addedAt">) => {
    const exists = items.some((i) => i.id === item.id);
    if (exists) {
      await removeItem(item.id);
    } else {
      await addItem(item);
    }
  }, [items, addItem, removeItem]);

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
    isSyncing,
    count: items.length,
  };
}
