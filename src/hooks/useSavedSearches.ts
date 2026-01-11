"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";

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

export function useSavedSearches() {
  const { user } = useAuth();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncedRef = useRef(false);

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

  // Sync with database when user logs in
  useEffect(() => {
    if (!user || syncedRef.current) return;

    const syncSearches = async () => {
      setIsSyncing(true);
      try {
        const response = await fetch("/api/saved-searches");
        if (response.ok) {
          const { searches: dbSearches } = await response.json();

          // Merge local searches to database
          const localSearches = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as SavedSearch[];
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dbItems: SavedSearch[] = dbSearches.map((s: any) => ({
            id: s.id,
            name: s.name,
            filters: s.query_params || {},
            emailAlerts: s.email_alerts,
            createdAt: new Date(s.created_at).getTime(),
            lastUsedAt: new Date(s.updated_at || s.created_at).getTime(),
          }));

          // Merge: prioritize DB items, add local items not in DB
          const mergedSearches = [...dbItems];
          for (const localSearch of localSearches) {
            if (!dbItems.some((db) => db.name === localSearch.name)) {
              mergedSearches.push(localSearch);
            }
          }

          setSearches(mergedSearches.slice(0, MAX_SEARCHES));
          syncedRef.current = true;
        }
      } catch (e) {
        console.error("Error syncing saved searches:", e);
      } finally {
        setIsSyncing(false);
      }
    };

    syncSearches();
  }, [user]);

  // Reset sync flag when user logs out
  useEffect(() => {
    if (!user) {
      syncedRef.current = false;
    }
  }, [user]);

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

      setSearches((prev) => {
        const updated = [newSearch, ...prev].slice(0, MAX_SEARCHES);
        return updated;
      });

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
            setSearches((prev) =>
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
    setSearches((prev) => prev.filter((s) => s.id !== id));

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
    setSearches((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, lastUsedAt: Date.now() } : s
      )
    );
  }, []);

  const toggleEmailAlerts = useCallback(async (id: string, enabled: boolean) => {
    setSearches((prev) =>
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
    setSearches([]);
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
