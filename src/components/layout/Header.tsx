"use client";

import Link from "next/link";
import { Menu, X, Heart } from "lucide-react";
import { useState } from "react";
import { useFavorites } from "@/hooks/useFavorites";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { count: favoritesCount } = useFavorites();

  return (
    <header className="fixed top-0 z-50 w-full">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-lg font-medium tracking-tight text-white group-hover:opacity-70 transition-opacity">
            LuxApts
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/search"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Search
          </Link>
          <Link
            href="/cities"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Cities
          </Link>
          <Link
            href="/favorites"
            className="relative text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
          >
            <Heart className="h-4 w-4" />
            Saved
            {favoritesCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
                {favoritesCount > 9 ? "9+" : favoritesCount}
              </span>
            )}
          </Link>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/auth/login"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/search"
            className="text-sm px-4 py-2 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
          >
            Get Started
          </Link>
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
              href="/search"
              className="py-3 text-lg text-zinc-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Search
            </Link>
            <Link
              href="/cities"
              className="py-3 text-lg text-zinc-400 hover:text-white transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Cities
            </Link>
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
              <Link
                href="/auth/login"
                className="block py-3 text-lg text-zinc-400 hover:text-white transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/search"
                className="mt-4 block text-center py-3 rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
