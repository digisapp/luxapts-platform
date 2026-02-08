"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Users, ImageOff, RefreshCw, UserX } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  label: string;
  count: number;
  href: string;
  icon: React.ElementType;
}

interface QuickActionsProps {
  newLeadsCount: number;
  buildingsNeedImages: number;
  staleScrapes: number;
  unassignedLeads: number;
}

export function QuickActions({
  newLeadsCount,
  buildingsNeedImages,
  staleScrapes,
  unassignedLeads,
}: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      label: "New Leads",
      count: newLeadsCount,
      href: "/admin/leads",
      icon: Users,
    },
    {
      label: "Buildings Need Images",
      count: buildingsNeedImages,
      href: "/admin/buildings",
      icon: ImageOff,
    },
    {
      label: "Stale Scrapes",
      count: staleScrapes,
      href: "/admin/scraping",
      icon: RefreshCw,
    },
    {
      label: "Unassigned Leads",
      count: unassignedLeads,
      href: "/admin/leads",
      icon: UserX,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {actions.map((action) => {
        const Icon = action.icon;
        const hasItems = action.count > 0;
        return (
          <Link key={action.label} href={action.href}>
            <Card
              className={cn(
                "transition-colors hover:border-accent cursor-pointer",
                hasItems && "border-amber-500/50 bg-amber-500/5"
              )}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    hasItems
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p
                    className={cn(
                      "text-2xl font-bold",
                      hasItems && "text-amber-400"
                    )}
                  >
                    {action.count}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {action.label}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
