"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createLocalStore, useLocalStore } from "@/lib/local-store";

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

const STORAGE_KEY = "staycio_favorites";

// Shared store: all FavoriteButtons, the Header badge, and the favorites
// page see the same list and never clobber each other's writes.
const favoritesStore = createLocalStore<FavoriteItem[]>(STORAGE_KEY, []);

// DB sync must run once per logged-in user across ALL hook instances —
// previously every FavoriteButton on a results page fired its own sync.
let syncedUserId: string | null = null;
let syncInFlight = false;

export function useFavorites() {
  const { user } = useAuth();
  const { value: items, isLoaded } = useLocalStore(favoritesStore);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sync with database when user logs in
  useEffect(() => {
    if (!user) {
      syncedUserId = null;
      return;
    }
    if (syncedUserId === user.id || syncInFlight) return;
    syncInFlight = true;

    const syncFavorites = async () => {
      setIsSyncing(true);
      try {
        // Fetch existing favorites from database
        const response = await fetch("/api/favorites");
        if (response.ok) {
          const { favorites } = await response.json();

          // Batch sync local favorites to database (single request instead of N)
          const localItems = favoritesStore.get();
          const newItems = localItems.filter(
            (item) =>
              !favorites.some((f: { building_id?: string; unit_id?: string }) =>
                f.building_id === item.id || f.unit_id === item.id
              )
          );
          if (newItems.length > 0) {
            await fetch("/api/favorites/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                favorites: newItems.map((item) => ({
                  building_id: item.type === "building" ? item.id : undefined,
                  unit_id: item.type === "unit" ? item.id : undefined,
                })),
              }),
            });
          }

          // Merge database favorites to local state
          interface FavoriteRecord {
            building_id?: string;
            unit_id?: string;
            created_at: string;
            buildings?: {
              name?: string;
              address_1?: string;
              neighborhoods?: { name: string } | { name: string }[];
              cities?: { slug: string } | { slug: string }[];
            };
          }
          const dbItems: FavoriteItem[] = favorites.map((f: FavoriteRecord) => {
            const building = f.buildings;
            return {
              id: f.building_id || f.unit_id || "",
              type: (f.building_id ? "building" : "unit") as "building" | "unit",
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
          favoritesStore.set((current) => {
            const merged = [...dbItems];
            for (const localItem of current) {
              if (!dbItems.some((db) => db.id === localItem.id)) {
                merged.push(localItem);
              }
            }
            return merged;
          });
          syncedUserId = user.id;
        }
      } catch (e) {
        console.error("Error syncing favorites:", e);
      } finally {
        syncInFlight = false;
        setIsSyncing(false);
      }
    };

    syncFavorites();
  }, [user]);

  const addItem = useCallback(async (item: Omit<FavoriteItem, "addedAt">) => {
    if (favoritesStore.get().some((i) => i.id === item.id)) return;

    const newItem = { ...item, addedAt: Date.now() };
    favoritesStore.set((prev) =>
      prev.some((i) => i.id === item.id) ? prev : [newItem, ...prev]
    );

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
  }, [user]);

  const removeItem = useCallback(async (id: string) => {
    const item = favoritesStore.get().find((i) => i.id === id);
    favoritesStore.set((prev) => prev.filter((i) => i.id !== id));

    // Sync to database if logged in
    if (user && item) {
      try {
        const param = item.type === "building" ? `building_id=${id}` : `unit_id=${id}`;
        await fetch(`/api/favorites?${param}`, { method: "DELETE" });
      } catch (e) {
        console.error("Error removing favorite from DB:", e);
      }
    }
  }, [user]);

  const toggleItem = useCallback(async (item: Omit<FavoriteItem, "addedAt">) => {
    const exists = favoritesStore.get().some((i) => i.id === item.id);
    if (exists) {
      await removeItem(item.id);
    } else {
      await addItem(item);
    }
  }, [addItem, removeItem]);

  const isFavorite = useCallback(
    (id: string) => items.some((item) => item.id === id),
    [items]
  );

  const clearAll = useCallback(() => {
    favoritesStore.set(() => []);
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
