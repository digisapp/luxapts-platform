"use client";

import Link from "next/link";
import Image from "next/image";
import { useFavorites } from "@/hooks/useFavorites";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Bookmark,
  Building2,
  MapPin,
  Bed,
  Bath,
  Trash2,
  Search,
  ArrowRight,
} from "lucide-react";
import { formatPrice } from "@/lib/utils";

export default function FavoritesPage() {
  const { items: favorites, removeItem: removeFavorite, clearAll: clearFavorites, isLoaded: favoritesLoaded } = useFavorites();
  const { searches, removeSearch, clearAll: clearSearches, isLoaded: searchesLoaded } = useSavedSearches();

  const buildSearchUrl = (filters: typeof searches[0]["filters"]) => {
    const params = new URLSearchParams();
    if (filters.city) params.set("city", filters.city);
    if (filters.bedsMin !== undefined) params.set("beds_min", filters.bedsMin.toString());
    if (filters.bedsMax !== undefined) params.set("beds_max", filters.bedsMax.toString());
    if (filters.budgetMin !== undefined) params.set("budget_min", filters.budgetMin.toString());
    if (filters.budgetMax !== undefined) params.set("budget_max", filters.budgetMax.toString());
    return `/search?${params.toString()}`;
  };

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/30">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-8">Saved Items</h1>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Favorites Section */}
            <div>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="h-5 w-5 text-red-500" />
                      Favorite Buildings ({favorites.length})
                    </CardTitle>
                    {favorites.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={clearFavorites}
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!favoritesLoaded ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex gap-3 animate-pulse">
                          <div className="w-20 h-20 rounded-lg bg-muted" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-muted rounded w-3/4" />
                            <div className="h-3 bg-muted rounded w-1/2" />
                            <div className="h-3 bg-muted rounded w-1/4" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : favorites.length === 0 ? (
                    <div className="text-center py-8">
                      <Heart className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground mb-4">
                        No favorites yet. Start exploring and save buildings you love!
                      </p>
                      <Link href="/search">
                        <Button>
                          <Search className="mr-2 h-4 w-4" />
                          Browse Apartments
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {favorites.map((item) => (
                        <div
                          key={item.id}
                          className="flex gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                        >
                          <Link
                            href={`/buildings/${item.id}`}
                            className="relative w-20 h-20 rounded-lg overflow-hidden bg-muted flex-shrink-0"
                          >
                            {item.image ? (
                              <Image
                                src={item.image}
                                alt={item.name}
                                fill
                                className="object-cover"
                                sizes="80px"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Building2 className="h-8 w-8 text-muted-foreground/30" />
                              </div>
                            )}
                          </Link>
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/buildings/${item.id}`}
                              className="font-medium hover:text-primary transition-colors block truncate"
                            >
                              {item.name}
                            </Link>
                            {item.neighborhood && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {item.neighborhood}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              {item.price && (
                                <span className="text-sm font-medium">
                                  {formatPrice(item.price)}/mo
                                </span>
                              )}
                              {item.beds !== undefined && (
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                                  <Bed className="h-3 w-3" />
                                  {item.beds === 0 ? "Studio" : `${item.beds} bed`}
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-red-500"
                            onClick={() => removeFavorite(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Saved Searches Section */}
            <div>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Bookmark className="h-5 w-5 text-primary" />
                      Saved Searches ({searches.length})
                    </CardTitle>
                    {searches.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={clearSearches}
                      >
                        Clear all
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!searchesLoaded ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="p-3 rounded-lg border animate-pulse">
                          <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                          <div className="h-3 bg-muted rounded w-3/4" />
                        </div>
                      ))}
                    </div>
                  ) : searches.length === 0 ? (
                    <div className="text-center py-8">
                      <Bookmark className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                      <p className="text-muted-foreground mb-4">
                        No saved searches. Save your search criteria to quickly find matching apartments.
                      </p>
                      <Link href="/search">
                        <Button>
                          <Search className="mr-2 h-4 w-4" />
                          Start Searching
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {searches.map((search) => (
                        <div
                          key={search.id}
                          className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{search.name}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {search.filters.city && (
                                <Badge variant="secondary" className="text-xs">
                                  {search.filters.city}
                                </Badge>
                              )}
                              {search.filters.bedsMin !== undefined && (
                                <Badge variant="secondary" className="text-xs">
                                  {search.filters.bedsMin === 0
                                    ? "Studio"
                                    : `${search.filters.bedsMin}+ bed`}
                                </Badge>
                              )}
                              {search.filters.budgetMax && (
                                <Badge variant="secondary" className="text-xs">
                                  Under ${search.filters.budgetMax.toLocaleString()}
                                </Badge>
                              )}
                            </div>
                            {search.resultCount !== undefined && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {search.resultCount} results when saved
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Link href={buildSearchUrl(search.filters)}>
                              <Button size="sm" variant="outline" className="gap-1">
                                Run
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={() => removeSearch(search.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
