"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Purge one transcript. Transcripts hold whatever a renter typed — names,
 * emails, phone numbers — so an admin needs a way to delete a single one on
 * request. The delete cascades to chat_messages.
 */
export function DeleteConversationButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (busy) return;
    if (
      !window.confirm(
        "Delete this conversation and its transcript? This cannot be undone.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/conversations/${sessionId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.error === "string" ? body.error : "Failed to delete");
        setBusy(false);
        return;
      }
      router.push("/admin/conversations");
      router.refresh();
    } catch {
      setError("Failed to delete");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleDelete} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Delete
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
