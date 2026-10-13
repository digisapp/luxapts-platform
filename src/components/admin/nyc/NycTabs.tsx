"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, CalendarCheck2, Copy, FileText, Upload, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/nyc", label: "People", icon: Users },
  { href: "/admin/nyc/today", label: "Today", icon: CalendarCheck2 },
  { href: "/admin/nyc/recruiting", label: "Recruiting", icon: BriefcaseBusiness },
  { href: "/admin/nyc/duplicates", label: "Duplicates", icon: Copy },
  { href: "/admin/nyc/templates", label: "Templates", icon: FileText },
  { href: "/admin/nyc/import", label: "Import", icon: Upload },
];

/**
 * People · Today · Recruiting · Duplicates · Templates · Import. Today shows how many follow-ups are
 * due; People how many replies came in over the last three days unanswered.
 */
export function NycTabs() {
  const pathname = usePathname();
  const [due, setDue] = useState(0);
  const [replies, setReplies] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/nyc/tasks?count=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.due === "number") setDue(d.due);
        if (!cancelled && d && typeof d.newReplies === "number") setReplies(d.newReplies);
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
    <nav aria-label="NYC Contacts" className="-mx-4 flex gap-1 overflow-x-auto border-b border-white/[0.08] px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const Icon = t.icon;
        const on = active(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              on ? "border-white text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t.label}
            {t.label === "People" && replies > 0 && (
              <span className="rounded-full bg-sky-400/20 px-1.5 text-[11px] font-semibold tabular-nums text-sky-100" aria-label={`${replies} new replies`}>
                {replies > 99 ? "99+" : replies}
              </span>
            )}
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
