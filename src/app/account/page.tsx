"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useFavorites, type FavoriteItem } from "@/hooks/useFavorites";
import { useSavedSearches } from "@/hooks/useSavedSearches";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Mail,
  Phone,
  Lock,
  Heart,
  Bookmark,
  Bell,
  BellOff,
  Trash2,
  CheckCircle2,
  Loader2,
  LogOut,
  ExternalLink,
  Search,
  Building2,
} from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

export default function AccountPage() {
  const { user, loading, signOut, resetPassword } = useAuth();
  const router = useRouter();

  const { items: favorites, removeItem: removeFavorite } = useFavorites();
  const { searches, removeSearch, toggleEmailAlerts } = useSavedSearches();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Profile edit state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Password reset state
  const [resetSent, setResetSent] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  // Load profile
  useEffect(() => {
    if (!user) return;
    fetch("/api/account")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setFullName(data.full_name || "");
        setPhone(data.phone || "");
        setLoadingProfile(false);
      })
      .catch(() => setLoadingProfile(false));
  }, [user]);

  // Clear "Saved" timeout on unmount
  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError("");
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() || undefined, phone: phone.trim() || null }),
      });
      if (res.ok) {
        setProfile((p) => p ? { ...p, full_name: fullName.trim() || null, phone: phone.trim() || null } : p);
        setProfileSaved(true);
        if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
        savedTimeoutRef.current = setTimeout(() => setProfileSaved(false), 2500);
      } else {
        const data = await res.json().catch(() => null);
        setProfileError(data?.error || "Failed to save");
      }
    } catch {
      setProfileError("Failed to save");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setResetting(true);
    setResetError(null);
    const { error } = await resetPassword(user.email);
    setResetting(false);
    if (error) {
      setResetError(error.message || "Failed to send reset link");
      return;
    }
    setResetSent(true);
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const buildSearchUrl = (filters: (typeof searches)[0]["filters"]) => {
    const params = new URLSearchParams();
    if (filters.city) params.set("city", filters.city);
    if (filters.bedsMin !== undefined) params.set("beds_min", filters.bedsMin.toString());
    if (filters.bedsMax !== undefined) params.set("beds_max", filters.bedsMax.toString());
    if (filters.budgetMin !== undefined) params.set("budget_min", filters.budgetMin.toString());
    if (filters.budgetMax !== undefined) params.set("budget_max", filters.budgetMax.toString());
    return `/search?${params.toString()}`;
  };

  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/20">
        <div className="container mx-auto px-4 pt-20 pb-20 md:pt-24 max-w-4xl">
          {/* Page title */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Account</h1>
              <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>

          <div className="space-y-6">
            {/* Profile */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingProfile ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="fullName">Name</Label>
                        <Input
                          id="fullName"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Your name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone">Phone</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="(555) 555-5555"
                            className="pl-8"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Email</Label>
                      <div className="flex items-center gap-2 h-10 px-3 rounded-md border bg-muted/30 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        {user.email}
                      </div>
                    </div>

                    {profile?.role && profile.role !== "renter" && (
                      <div>
                        <Label>Role</Label>
                        <div className="mt-1.5">
                          <Badge variant="outline" className="capitalize">{profile.role}</Badge>
                        </div>
                      </div>
                    )}

                    {profileError && <p className="text-sm text-red-500">{profileError}</p>}

                    <div className="flex items-center gap-3 pt-1">
                      <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm">
                        {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                        Save changes
                      </Button>
                      {profileSaved && (
                        <span className="flex items-center gap-1.5 text-sm text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Saved
                        </span>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Security */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">Password</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      We&apos;ll send a reset link to {user.email}
                    </p>
                  </div>
                  {resetSent ? (
                    <span className="flex items-center gap-1.5 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Reset link sent
                    </span>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePasswordReset}
                        disabled={resetting}
                      >
                        {resetting && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
                        Send reset link
                      </Button>
                      {resetError && (
                        <span className="text-xs text-red-600">{resetError}</span>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Saved Searches */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bookmark className="h-4 w-4 text-muted-foreground" />
                  Saved Searches
                  {searches.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{searches.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {searches.length === 0 ? (
                  <div className="text-center py-6">
                    <Search className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">No saved searches yet</p>
                    <Link href="/search">
                      <Button variant="outline" size="sm">Start searching</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y">
                    {searches.map((search) => (
                      <div key={search.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{search.name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {search.filters.city && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{search.filters.city}</Badge>
                            )}
                            {(search.filters.bedsMin !== undefined || search.filters.bedsMax !== undefined) && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                {search.filters.bedsMin === 0 ? "Studio" : `${search.filters.bedsMin ?? ""}${search.filters.bedsMax ? `–${search.filters.bedsMax}` : "+"} bed`}
                              </Badge>
                            )}
                            {search.filters.budgetMax && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                                up to {formatPrice(search.filters.budgetMax)}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => toggleEmailAlerts(search.id, !search.emailAlerts)}
                            title={search.emailAlerts ? "Disable email alerts" : "Enable email alerts"}
                            className={`p-1.5 rounded-md transition-colors ${search.emailAlerts ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {search.emailAlerts ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                          </button>
                          <Link href={buildSearchUrl(search.filters)}>
                            <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          </Link>
                          <button
                            onClick={() => removeSearch(search.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Favorites */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Heart className="h-4 w-4 text-muted-foreground" />
                  Favorite Buildings
                  {favorites.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{favorites.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {favorites.length === 0 ? (
                  <div className="text-center py-6">
                    <Building2 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">No favorites yet</p>
                    <Link href="/search">
                      <Button variant="outline" size="sm">Browse buildings</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y">
                    {favorites.map((fav: FavoriteItem) => (
                      <div key={fav.id} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{fav.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {fav.address}
                            {fav.neighborhood && ` · ${fav.neighborhood}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {fav.type === "building" && (
                            <Link href={`/buildings/${fav.id}`}>
                              <button className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            </Link>
                          )}
                          <button
                            onClick={() => removeFavorite(fav.id)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="border-red-500/20">
              <CardHeader>
                <CardTitle className="text-base text-red-600 dark:text-red-400">Sign Out</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Sign out from all your devices.
                  </p>
                  <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2 border-red-500/30 text-red-600 hover:bg-red-500/5 hover:text-red-600">
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
