import { AlertTriangle, MapPinOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ClientErrorGroup, ClientErrorSummary, Tally } from "@/lib/client-errors/group";

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  boundary: { label: "Error screen", className: "bg-red-500/15 text-red-300" },
  root: { label: "Whole-site crash", className: "bg-red-500/25 text-red-200" },
  window: { label: "Uncaught error", className: "bg-amber-500/15 text-amber-300" },
  promise: { label: "Unhandled promise", className: "bg-amber-500/15 text-amber-300" },
  map: { label: "Map unavailable", className: "bg-sky-500/15 text-sky-300" },
};

function timeAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function TallyList({ label, items }: { label: string; items: Tally[] }) {
  if (items.length === 0) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {items.map((t) => (
          <li key={t.label} className="flex gap-2">
            <span className="truncate">{t.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{t.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{value.toLocaleString()}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ClientErrorsView({
  groups,
  summary,
  days,
  loadError,
  now,
}: {
  groups: ClientErrorGroup[];
  summary: ClientErrorSummary;
  days: number;
  loadError: string | null;
  now: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Errors · last 24 hours" value={summary.last24h} />
        <SummaryCard label="Errors · last 7 days" value={summary.last7d} />
        <SummaryCard label="Visitors affected · 7 days" value={summary.sessions7d} hint="Distinct browsing sessions" />
        <SummaryCard
          label={`Couldn't show the map · ${days} days`}
          value={summary.mapUnavailableSessions}
          hint="No WebGL2; they still get the list"
        />
      </div>

      {loadError && (
        <Card className="border-red-500/30">
          <CardContent className="p-4 text-sm text-red-300">Couldn&apos;t load error reports: {loadError}</CardContent>
        </Card>
      )}

      {!loadError && groups.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No browser errors in the last {days} days</p>
            <p className="text-sm text-muted-foreground">Reports appear here within seconds of a visitor hitting one.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const source = SOURCE_LABELS[g.source] ?? { label: g.source, className: "bg-muted text-muted-foreground" };
          const extra = g.sample.extra && Object.keys(g.sample.extra).length > 0 ? g.sample.extra : null;
          return (
            <Card key={g.key}>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <Badge variant="outline" className={`shrink-0 border-transparent ${source.className}`}>
                    {g.source === "map" && <MapPinOff className="mr-1 h-3 w-3" />}
                    {source.label}
                  </Badge>
                  {g.last24h > 0 && (
                    <Badge variant="outline" className="shrink-0 border-transparent bg-white/10 text-white">
                      {g.last24h} in last 24 h
                    </Badge>
                  )}
                  <p className="min-w-0 basis-full break-words font-mono text-sm sm:basis-auto sm:flex-1">{g.message}</p>
                </div>

                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">{g.count.toLocaleString()}×</span>
                  {" · "}
                  {g.sessions.toLocaleString()} {g.sessions === 1 ? "session" : "sessions"}
                  {" · last "}
                  {timeAgo(g.lastSeen, now)}
                  {" · first "}
                  {timeAgo(g.firstSeen, now)}
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                  <TallyList label="Pages" items={g.topPaths} />
                  <TallyList label="Browsers" items={g.topBrowsers} />
                  <TallyList label="Devices" items={g.devices} />
                </div>

                <details className="group">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                    Details
                  </summary>
                  <div className="mt-3 space-y-3 text-sm">
                    {g.releases.length > 0 && (
                      <p className="text-muted-foreground">
                        Deploys: <span className="font-mono text-foreground">{g.releases.join(", ")}</span>
                      </p>
                    )}
                    {g.sample.stack && (
                      <pre className="max-h-80 overflow-auto rounded-lg bg-white/[0.04] p-3 text-xs leading-relaxed">
                        {g.sample.stack}
                      </pre>
                    )}
                    {extra && (
                      <pre className="overflow-auto rounded-lg bg-white/[0.04] p-3 text-xs leading-relaxed">
                        {JSON.stringify(extra, null, 2)}
                      </pre>
                    )}
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
