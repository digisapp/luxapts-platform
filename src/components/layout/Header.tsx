"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, X, Heart, LogOut, Settings, LayoutDashboard, Search, Building2, MapPin, GitCompare, MessageCircle, Phone, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { useState, useRef, useEffect } from "react";
import { useFavorites } from "@/hooks/useFavorites";
import { StaycioMark } from "@/components/brand/StaycioMark";
import { useAuth } from "@/contexts/AuthContext";
import { openChat } from "@/lib/chat/open-chat";
import { STACY_MAIN_LINE } from "@/lib/constants/stacy";

// Staff roles each have their own portal, but nothing in the UI linked to
// them, so an admin had to type /admin by hand. Cosmetic only: every portal
// route re-checks the role on the server.
// Phones reach these from the menu; the bottom tab bar only has four slots.
const BROWSE_LINKS = [
  { href: "/search", label: "Search apartments", icon: Search },
  { href: "/cities", label: "Cities", icon: Building2 },
  { href: "/neighborhoods", label: "Neighborhoods", icon: MapPin },
  { href: "/compare", label: "Compare buildings", icon: GitCompare },
] as const;

const menuRow =
  "flex min-h-12 items-center gap-3 py-3 text-lg text-zinc-300 hover:text-white transition-colors";

const PORTAL_BY_ROLE: Record<string, { href: string; label: string }> = {
  admin: { href: "/admin", label: "Admin Dashboard" },
  agent: { href: "/agent", label: "Agent Portal" },
  partner: { href: "/partner", label: "Partner Portal" },
  shower: { href: "/shower", label: "Shower Portal" },
};

export function Header() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const { count: favoritesCount } = useFavorites();
  const { user, loading, role, signOut } = useAuth();

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

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
    router.push("/");
    router.refresh();
  };

  const userInitial = user?.user_metadata?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || "U";
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <header className="fixed top-0 z-50 w-full safe-area-pt">
      {/* Glass background with subtle gradient */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-xl border-b border-white/[0.05]" />
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <StaycioMark className="h-7 w-auto text-white group-hover:opacity-70 transition-opacity" />
          <span className="text-lg font-medium tracking-tight text-white group-hover:opacity-70 transition-opacity">
            Staycio
          </span>
        </Link>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-4">
          {/* Saved button */}
          <Link
            href="/favorites"
            aria-label="Favorites"
            className="relative p-2 text-white/60 hover:text-white transition-colors"
          >
            <Heart className="h-5 w-5" />
            {favoritesCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-white text-black text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center shadow-lg">
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
                  {role && PORTAL_BY_ROLE[role] && (
                    <Link
                      href={PORTAL_BY_ROLE[role].href}
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/[0.06] transition-colors border-b border-white/10"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      {PORTAL_BY_ROLE[role].label}
                    </Link>
                  )}
                  <Link
                    href="/favorites"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Heart className="h-4 w-4" />
                    Saved Listings
                  </Link>
                  <Link
                    href="/account"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
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
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors -mr-2"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-menu"
        >
          {mobileMenuOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
          <span className="sr-only">Toggle menu</span>
        </button>
      </div>

      {/* Mobile Menu — portaled to <body> so it stacks above the floating chat
          bubble (the header's own z-50 stacking context capped it below). */}
      {mobileMenuOpen &&
        createPortal(
          <div
            id="mobile-menu"
            className="md:hidden fixed inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top,0px))] z-[60] overflow-y-auto overscroll-contain bg-black"
          >
            <nav className="flex flex-col px-6 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
              {BROWSE_LINKS.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={menuRow} onClick={() => setMobileMenuOpen(false)}>
                  <Icon className="h-5 w-5 text-zinc-500" />
                  <span className="flex-1">{label}</span>
                  <ChevronRight className="h-4 w-4 text-zinc-600" />
                </Link>
              ))}
              <Link href="/favorites" className={menuRow} onClick={() => setMobileMenuOpen(false)}>
                <Heart className="h-5 w-5 text-zinc-500" />
                <span className="flex-1">Saved</span>
                {favoritesCount > 0 && (
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {favoritesCount}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </Link>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openChat();
                  }}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-zinc-700 text-white hover:bg-white/[0.06] transition-colors"
                >
                  <MessageCircle className="h-4 w-4" />
                  Ask Stacy
                </button>
                <a
                  href={`tel:${STACY_MAIN_LINE.e164}`}
                  className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-zinc-700 text-white hover:bg-white/[0.06] transition-colors"
                  aria-label={`Call Stacy at ${STACY_MAIN_LINE.display}`}
                >
                  <Phone className="h-4 w-4" />
                  Call Stacy
                </a>
              </div>

              <div className="mt-8 pt-6 border-t border-zinc-800">
                {user ? (
                  <>
                    <div className="flex items-center gap-3 py-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-white font-medium">
                        {userInitial}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white font-medium truncate">{userName}</p>
                        <p className="text-sm text-zinc-400 truncate">{user.email}</p>
                      </div>
                    </div>
                    {role && PORTAL_BY_ROLE[role] && (
                      <Link
                        href={PORTAL_BY_ROLE[role].href}
                        className={menuRow}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <LayoutDashboard className="h-5 w-5 text-zinc-500" />
                        {PORTAL_BY_ROLE[role].label}
                      </Link>
                    )}
                    <Link href="/account" className={menuRow} onClick={() => setMobileMenuOpen(false)}>
                      <Settings className="h-5 w-5 text-zinc-500" />
                      Account Settings
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setMobileMenuOpen(false);
                      }}
                      className={`${menuRow} w-full`}
                    >
                      <LogOut className="h-5 w-5 text-zinc-500" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Link
                      href="/auth/login"
                      className="flex min-h-12 items-center justify-center rounded-full border border-zinc-700 text-white hover:bg-white/[0.06] transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/auth/signup"
                      className="flex min-h-12 items-center justify-center rounded-full bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Sign up
                    </Link>
                  </div>
                )}
              </div>

              <Link
                href="/about"
                className="mt-8 text-sm text-zinc-500 hover:text-white transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                About Staycio
              </Link>
            </nav>
          </div>,
          document.body
        )}
    </header>
  );
}
