"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Users,
  LayoutDashboard,
  Settings,
  FileText,
  Upload,
  RefreshCw,
  LogOut,
  Mail,
  MessageCircle,
  BarChart3,
  UserCheck,
  MapPin,
  Award,
  SlidersHorizontal,
  Globe,
  HandCoins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/leads", label: "Leads", icon: Users, exact: false },
  { href: "/admin/buildings", label: "Buildings", icon: Building2, exact: false },
  { href: "/admin/incentives", label: "Broker Incentives", icon: HandCoins, exact: false },
  { href: "/admin/data-quality", label: "Data Quality", icon: BarChart3, exact: false },
  { href: "/admin/microsites", label: "Microsites", icon: Globe, exact: false },
  { href: "/admin/agents", label: "Agents", icon: FileText, exact: false },
  { href: "/admin/showers", label: "Showers", icon: UserCheck, exact: false },
  { href: "/admin/showing-leads", label: "Showing Leads", icon: MapPin, exact: false },
  { href: "/admin/certifications", label: "Certifications", icon: Award, exact: false },
  { href: "/admin/shower-settings", label: "Program Settings", icon: SlidersHorizontal, exact: false },
  { href: "/admin/email", label: "Email inbox", icon: Mail, exact: false, badge: "inbox" as const },
  { href: "/admin/conversations", label: "Chat Log", icon: MessageCircle, exact: false },
  { href: "/admin/import", label: "Import", icon: Upload, exact: false },
  { href: "/admin/scraping", label: "Scraping", icon: RefreshCw, exact: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
];

/**
 * Unread, non-spam mail waiting in /admin/email, shown as a sidebar badge.
 * Refetched on navigation and when the tab comes back into focus
 * (throttled), so a reply that arrived while the admin was elsewhere is
 * visible without opening the page.
 */
function useUnreadInbox(pathname: string) {
  const [count, setCount] = useState(0);
  const lastFetch = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (Date.now() - lastFetch.current < 30_000) return;
      lastFetch.current = Date.now();
      fetch("/api/admin/inbox/unread")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d && typeof d.count === "number") setCount(d.count);
        })
        .catch(() => {
          /* the badge is optional */
        });
    };
    lastFetch.current = 0;
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);
  return count;
}

export function AdminNav() {
  const pathname = usePathname();
  const unreadInbox = useUnreadInbox(pathname);

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b px-6">
        <Link href="/admin" className="flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          <span className="text-lg font-bold">Staycio Admin</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-4">
        {navLinks.map((link) => {
          const active = isActive(link.href, link.exact);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{link.label}</span>
              {"badge" in link && link.badge === "inbox" && unreadInbox > 0 && (
                <span
                  className="rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-violet-200"
                  aria-label={`${unreadInbox} unread`}
                >
                  {unreadInbox > 99 ? "99+" : unreadInbox}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-3" asChild>
          <Link href="/">
            <LogOut className="h-4 w-4" />
            Exit Admin
          </Link>
        </Button>
      </div>
    </div>
  );
}
