"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  BarChart3,
  LogOut,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/agent", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/agent/leads", label: "My Leads", icon: Users, exact: false },
  { href: "/agent/schedule", label: "Schedule", icon: Calendar, exact: false },
  { href: "/agent/performance", label: "Performance", icon: BarChart3, exact: false },
];

export function AgentNav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b px-6">
        <Link href="/agent" className="flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          <span className="text-lg font-bold">Staycio Agent</span>
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
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-3" asChild>
          <Link href="/">
            <LogOut className="h-4 w-4" />
            Exit Portal
          </Link>
        </Button>
      </div>
    </div>
  );
}
