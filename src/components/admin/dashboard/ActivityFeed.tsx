"use client";

import Link from "next/link";
import { Users, RefreshCw, UserCheck } from "lucide-react";

export interface ActivityEvent {
  id: string;
  type: "lead_event" | "scrape_job" | "assignment";
  description: string;
  timestamp: string;
  link: string | null;
}

interface ActivityFeedProps {
  events: ActivityEvent[];
}

const iconByType: Record<ActivityEvent["type"], React.ElementType> = {
  lead_event: Users,
  scrape_job: RefreshCw,
  assignment: UserCheck,
};

const colorByType: Record<ActivityEvent["type"], string> = {
  lead_event: "text-blue-400 bg-blue-500/20",
  scrape_job: "text-purple-400 bg-purple-500/20",
  assignment: "text-green-400 bg-green-500/20",
};

function timeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No recent activity to display.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const Icon = iconByType[event.type];
        const color = colorByType[event.type];
        const content = (
          <div className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">{event.description}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {timeAgo(event.timestamp)}
              </p>
            </div>
          </div>
        );

        if (event.link) {
          return (
            <Link key={event.id} href={event.link} className="block">
              {content}
            </Link>
          );
        }

        return <div key={event.id}>{content}</div>;
      })}
    </div>
  );
}
