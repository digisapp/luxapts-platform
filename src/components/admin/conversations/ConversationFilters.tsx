"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  buildConversationsHref,
  parseReviewFilter,
  parseSurface,
  type ReviewFilter,
  type Surface,
} from "./helpers";

interface ConversationFiltersProps {
  surface: Surface | null;
  filter: ReviewFilter | null;
  q: string;
}

const SELECT_CLASS =
  "h-11 md:h-10 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-white/20";

/**
 * Filter bar for the Chat Log. The page itself is server-rendered from the
 * query string, so every control here does one thing: navigate to a new URL.
 * Only the selects genuinely need JS (navigate on change); the text search
 * still works as a plain form submit.
 */
export function ConversationFilters({ surface, filter, q }: ConversationFiltersProps) {
  const router = useRouter();
  const [term, setTerm] = useState(q);

  function navigate(next: { surface?: Surface | null; filter?: ReviewFilter | null; q?: string }) {
    router.push(
      // Any filter change resets to page 1 — page 4 of the old result set is
      // meaningless against the new one.
      buildConversationsHref({
        surface,
        filter,
        q: term,
        ...next,
      }),
    );
  }

  const hasFilters = Boolean(surface || filter || q);

  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({});
      }}
    >
      <div className="relative min-w-[16rem] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search what people asked…"
          aria-label="Search first questions"
          className="pl-9"
        />
      </div>

      <select
        className={SELECT_CLASS}
        value={surface ?? ""}
        aria-label="Surface"
        onChange={(e) => navigate({ surface: parseSurface(e.target.value) })}
      >
        <option value="">All surfaces</option>
        <option value="chat">Chat</option>
        <option value="voice">Voice</option>
      </select>

      <select
        className={SELECT_CLASS}
        value={filter ?? ""}
        aria-label="Session filter"
        onChange={(e) => navigate({ filter: parseReviewFilter(e.target.value) })}
      >
        <option value="">All sessions</option>
        <option value="needs_review">Needs review</option>
        <option value="converted">Converted to lead</option>
      </select>

      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>

      {hasFilters && (
        <Link
          href="/admin/conversations"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </Link>
      )}
    </form>
  );
}
