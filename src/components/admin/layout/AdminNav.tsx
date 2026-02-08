"use client";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/leads", label: "Leads", icon: Users, exact: false },
  { href: "/admin/buildings", label: "Buildings", icon: Building2, exact: false },
  { href: "/admin/agents", label: "Agents", icon: FileText, exact: false },
  { href: "/admin/import", label: "Import", icon: Upload, exact: false },
  { href: "/admin/scraping", label: "Scraping", icon: RefreshCw, exact: false },
  { href: "/admin/settings", label: "Settings", icon: Settings, exact: false },
];

export function AdminNav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/admin" className="flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          <span className="text-lg font-bold">LuxApts Admin</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navLinks.map((link) => {
          const active = isActive(link.href, link.exact);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4">
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
