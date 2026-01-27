"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X, Heart, User, LogOut, Settings } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useFavorites } from "@/hooks/useFavorites";
import { useAuth } from "@/contexts/AuthContext";

export function Header() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { count: favoritesCount } = useFavorites();
  const { user, loading, signOut } = useAuth();

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const userInitial = user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U";
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <header className="fixed top-0 z-50 w-full">
      {/* Glass background with subtle gradient */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl border-b border-white/[0.05]" />
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-lg font-medium tracking-tight text-white group-hover:opacity-70 transition-opacity">
            LuxApts
          </span>
        </Link>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-4">
          {/* Saved button */}
          <Link
            href="/favorites"
            className="relative p-2 text-white/60 hover:text-white transition-colors"
          >
            <Heart className="h-5 w-5" />
            {favoritesCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/30">
                {favoritesCount > 9 ? "9+" : favoritesCount}
              </span>
            )}
          </Link>

          {loading ? (
            <div className="w-8 h-8 rounded-full bg-zinc-800 animate-pulse" />
          ) : user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setUserMenuOpen(false);
                }}
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-white text-sm font-medium">
                  {userInitial}
                </div>
              </button>
              {userMenuOpen && (
                <div
                  role="menu"
                  aria-label="User menu"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setUserMenuOpen(false);
                  }}
                  className="absolute right-0 mt-2 w-56 rounded-xl bg-black/80 backdrop-blur-2xl border border-white/10 shadow-2xl shadow-black/50 py-1 animate-in fade-in-0 zoom-in-95"
                >
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-sm font-medium text-white truncate">{userName}</p>
                    <p className="text-xs text-white/50 truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/favorites"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Heart className="h-4 w-4" />
                    Saved Listings
                  </Link>
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Settings className="h-4 w-4" />
                    Account Settings
                  </Link>
                  <button
                    role="menuitem"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="text-sm text-white/60 hover:text-white transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/auth/signup"
                className="text-sm px-5 py-2.5 rounded-full bg-white text-black font-medium hover:bg-white/90 hover:shadow-lg hover:shadow-white/20 transition-all"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-zinc-400 hover:text-white transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
          <span className="sr-only">Toggle menu</span>
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-black/95 backdrop-blur-xl">
          <nav className="flex flex-col gap-1 px-6 py-8">
            <Link
              href="/favorites"
              className="py-3 text-lg text-zinc-400 hover:text-white transition-colors flex items-center gap-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Heart className="h-5 w-5" />
              Saved
              {favoritesCount > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {favoritesCount}
                </span>
              )}
            </Link>
            <div className="mt-8 pt-8 border-t border-zinc-800">
              {user ? (
                <>
                  <div className="flex items-center gap-3 py-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-white font-medium">
                      {userInitial}
                    </div>
                    <div>
                      <p className="text-white font-medium">{userName}</p>
                      <p className="text-sm text-zinc-400">{user.email}</p>
                    </div>
                  </div>
                  <Link
                    href="/account"
                    className="flex items-center gap-2 py-3 text-lg text-zinc-400 hover:text-white transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Settings className="h-5 w-5" />
                    Account Settings
                  </Link>
                  <button
                    onClick={() => {
                      handleSignOut();
                      setMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-2 py-3 text-lg text-zinc-400 hover:text-white transition-colors w-full"
                  >
                    <LogOut className="h-5 w-5" />
                    Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/auth/login"
                    className="block py-3 text-lg text-zinc-400 hover:text-white transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="mt-4 block text-center py-3 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
