"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarCheck2, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/nyc", label: "People", icon: Users },
  { href: "/admin/nyc/today", label: "Today", icon: CalendarCheck2 },
  { href: "/admin/nyc/import", label: "Import", icon: Upload },
];

/** People · Today · Import, with today's follow-up count on Today. */
export function NycTabs() {
  const pathname = usePathname();
  const [due, setDue] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/nyc/tasks?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.due === "number") setDue(d.due);
      })
      .catch(() => {
        /* the badge is optional */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const active = (href: string) =>
    href === "/admin/nyc"
      ? pathname === href || !TABS.some((t) => t.href !== href && pathname.startsWith(t.href))
      : pathname.startsWith(href);

  return (
    <nav aria-label="NYC Contacts" className="flex gap-1 border-b border-white/[0.08]">
      {TABS.map((t) => {
        const Icon = t.icon;
        const on = active(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              on ? "border-white text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
            {t.label === "Today" && due > 0 && (
              <span className="rounded-full bg-amber-400/20 px-1.5 text-[11px] font-semibold tabular-nums text-amber-100" aria-label={`${due} due`}>
                {due > 99 ? "99+" : due}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
