"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, Users, Settings } from "lucide-react";
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
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Building2 className="h-6 w-6 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{companyName}</p>
          <p className="text-xs text-muted-foreground">Partner Portal</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t px-3 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to LuxApts
        </Link>
      </div>
    </div>
  );
}
