import { Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown when a Chat Log query comes back with "undefined column/table", i.e.
 * migration 025_chat_transcripts.sql has not been applied to this database yet.
 * The page has to stay usable in that state rather than throwing a 500.
 */
export function MigrationNotice({ detail }: { detail?: string }) {
  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.04]">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
          <Database className="h-5 w-5 text-amber-400" />
        </div>
        <p className="font-medium">Transcript storage is not set up yet</p>
        <p className="max-w-md text-sm text-muted-foreground">
          Apply migration{" "}
          <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-xs">
            025_chat_transcripts.sql
          </code>{" "}
          to enable transcripts. It adds the <code>chat_messages</code> table and
          the session columns this page reads.
        </p>
        {detail && <p className="text-xs text-muted-foreground/70">{detail}</p>}
      </CardContent>
    </Card>
  );
}
