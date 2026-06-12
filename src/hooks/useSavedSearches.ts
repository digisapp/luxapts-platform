"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createLocalStore, useLocalStore } from "@/lib/local-store";

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
  emailAlerts?: boolean;
  createdAt: number;
  lastUsedAt: number;
}

const STORAGE_KEY = "luxapts_saved_searches";
const MAX_SEARCHES = 10;

const savedSearchesStore = createLocalStore<SavedSearch[]>(STORAGE_KEY, []);

// DB sync must run once per logged-in user across all hook instances
let syncedUserId: string | null = null;
let syncInFlight = false;

export function useSavedSearches() {
  const { user } = useAuth();
  const { value: searches, isLoaded } = useLocalStore(savedSearchesStore);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sync with database when user logs in
  useEffect(() => {
    if (!user) {
      syncedUserId = null;
      return;
    }
    if (syncedUserId === user.id || syncInFlight) return;
    syncInFlight = true;

    const syncSearches = async () => {
      setIsSyncing(true);
      try {
        const response = await fetch("/api/saved-searches");
        if (response.ok) {
          const { searches: dbSearches } = await response.json();

          // Merge local searches to database
          const localSearches = savedSearchesStore.get();
          for (const search of localSearches) {
            const exists = dbSearches.some((s: { name: string }) => s.name === search.name);
            if (!exists) {
              await fetch("/api/saved-searches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: search.name,
                  query_params: search.filters,
                  email_alerts: search.emailAlerts ?? false,
                }),
              });
            }
          }

          // Convert database searches to local format
          interface SavedSearchRecord {
            id: string;
            name: string;
            query_params?: SavedSearch["filters"];
            email_alerts?: boolean;
            created_at: string;
            updated_at?: string;
          }
          const dbItems: SavedSearch[] = dbSearches.map((s: SavedSearchRecord) => ({
            id: s.id,
            name: s.name,
            filters: s.query_params || {},
            emailAlerts: s.email_alerts,
            createdAt: new Date(s.created_at).getTime(),
            lastUsedAt: new Date(s.updated_at || s.created_at).getTime(),
          }));

          // Merge: prioritize DB items, add local items not in DB
          savedSearchesStore.set((current) => {
            const merged = [...dbItems];
            for (const localSearch of current) {
              if (!dbItems.some((db) => db.name === localSearch.name)) {
                merged.push(localSearch);
              }
            }
            return merged.slice(0, MAX_SEARCHES);
          });
          syncedUserId = user.id;
        }
      } catch (e) {
        console.error("Error syncing saved searches:", e);
      } finally {
        syncInFlight = false;
        setIsSyncing(false);
      }
    };

    syncSearches();
  }, [user]);

  const saveSearch = useCallback(
    async (name: string, filters: SavedSearch["filters"], resultCount?: number, emailAlerts?: boolean) => {
      const id = `search_${Date.now()}`;
      const newSearch: SavedSearch = {
        id,
        name,
        filters,
        resultCount,
        emailAlerts: emailAlerts ?? false,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      savedSearchesStore.set((prev) => [newSearch, ...prev].slice(0, MAX_SEARCHES));

      // Sync to database if logged in
      if (user) {
        try {
          const response = await fetch("/api/saved-searches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name,
              query_params: filters,
              email_alerts: emailAlerts ?? false,
            }),
          });
          if (response.ok) {
            const { search } = await response.json();
            // Update local ID with database ID
            savedSearchesStore.set((prev) =>
              prev.map((s) => (s.id === id ? { ...s, id: search.id } : s))
            );
            return search.id;
          }
        } catch (e) {
          console.error("Error saving search to DB:", e);
        }
      }

      return id;
    },
    [user]
  );

  const removeSearch = useCallback(async (id: string) => {
    savedSearchesStore.set((prev) => prev.filter((s) => s.id !== id));

    // Sync to database if logged in
    if (user && !id.startsWith("search_")) {
      try {
        await fetch(`/api/saved-searches?id=${id}`, { method: "DELETE" });
      } catch (e) {
        console.error("Error removing search from DB:", e);
      }
    }
  }, [user]);

  const updateLastUsed = useCallback((id: string) => {
    savedSearchesStore.set((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, lastUsedAt: Date.now() } : s
      )
    );
  }, []);

  const toggleEmailAlerts = useCallback(async (id: string, enabled: boolean) => {
    savedSearchesStore.set((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, emailAlerts: enabled } : s
      )
    );

    // Sync to database if logged in
    if (user && !id.startsWith("search_")) {
      try {
        await fetch("/api/saved-searches", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, email_alerts: enabled }),
        });
      } catch (e) {
        console.error("Error updating email alerts:", e);
      }
    }
  }, [user]);

  const clearAll = useCallback(() => {
    savedSearchesStore.set(() => []);
  }, []);

  return {
    searches,
    saveSearch,
    removeSearch,
    updateLastUsed,
    toggleEmailAlerts,
    clearAll,
    isLoaded,
    isSyncing,
    count: searches.length,
  };
}
