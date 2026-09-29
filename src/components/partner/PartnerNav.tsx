"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Users, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/partner", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/partner/buildings", label: "My Buildings", icon: Building2 },
  { href: "/partner/leads", label: "Inquiries", icon: Users },
  { href: "/partner/settings", label: "Settings", icon: Settings },
];

export function PartnerNav({ companyName }: { companyName: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-2 border-b px-6 pr-14 lg:pr-6">
        <Building2 className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={companyName}>{companyName}</p>
          <p className="text-xs text-muted-foreground">Partner Portal</p>
        </div>
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t p-4">
        <Button variant="ghost" className="w-full justify-start gap-3" asChild>
          <Link href="/">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Exit Portal
          </Link>
        </Button>
      </div>
    </div>
  );
}
