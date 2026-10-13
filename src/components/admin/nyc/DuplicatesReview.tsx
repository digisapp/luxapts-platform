"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Users } from "lucide-react";
import { cn, formatPrice } from "@/lib/utils";
import { displayName, formatPhone } from "@/lib/crm/normalize";
import { stageMeta } from "@/lib/crm/stages";
import type { DuplicatePair, DuplicateSide } from "@/lib/crm/types";
import { errorOf } from "./NycDialogs";

interface DuplicatesReviewProps {
  initial: { high: number; check: number; pairs: DuplicatePair[] };
}

type Confidence = "high" | "check";

type Outcome =
  | { kind: "merged"; mergeId: string; keptName: string; keptId: string }
  | { kind: "dismissed" };

const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "America/New_York" });

const pairKey = (p: DuplicatePair) => `${p.a.id}|${p.b.id}`;

/** The record worth keeping: more history, then more recent activity. */
function suggestedKeep(p: DuplicatePair): "a" | "b" {
  if (p.a.history !== p.b.history) return p.a.history > p.b.history ? "a" : "b";
  return (p.a.last_activity_at ?? "") >= (p.b.last_activity_at ?? "") ? "a" : "b";
}

function Side({
  side,
  shared,
  suggested,
  busy,
  onKeep,
}: {
  side: DuplicateSide;
  shared: string[];
  suggested: boolean;
  busy: boolean;
  onKeep: () => void;
}) {
  const name = displayName(side);
  const stage = stageMeta(side.stage);
  const facts = [
    side.source,
    side.added_at ? `Inquired ${monthYear.format(new Date(side.added_at))}` : null,
    side.previous_agent ? `with ${side.previous_agent}` : null,
  ].filter(Boolean);
  const listing = [
    side.property_address,
    side.neighborhood,
    side.price && side.price < 50_000 ? formatPrice(side.price) : side.price ? `${formatPrice(side.price)} (sale)` : null,
    side.beds === null ? null : side.beds === 0 ? "Studio" : `${side.beds} bd`,
  ].filter(Boolean);

  return (
    <div className={cn("flex flex-col rounded-lg border p-3.5", suggested ? "border-emerald-400/30 bg-emerald-400/[0.04]" : "border-white/[0.08]")}>
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/admin/nyc/${side.id}`}
          target="_blank"
          className="inline-flex min-w-0 items-center gap-1 text-sm font-semibold hover:underline"
        >
          <span className="truncate">{name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
        {suggested && (
          <span className="shrink-0 rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-100">Suggested to keep</span>
        )}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[13px]">
        {side.phones.map((p) => (
          <li key={p} className={cn("tabular-nums", shared.includes(p) ? "font-medium text-emerald-300" : "text-muted-foreground")}>
            {formatPhone(p)}
            {shared.includes(p) && <span className="ml-1 text-[11px]">· same</span>}
          </li>
        ))}
        {side.emails.map((e) => (
          <li key={e} className={cn("break-all", shared.includes(e) ? "font-medium text-emerald-300" : "text-muted-foreground")}>
            {e}
            {shared.includes(e) && <span className="ml-1 text-[11px]">· same</span>}
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
        {facts.length > 0 && <dd>{facts.join(" · ")}</dd>}
        {listing.length > 0 && <dd className="text-foreground/80">{listing.join(" · ")}</dd>}
        <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className={cn("h-1.5 w-1.5 rounded-full", stage.dot)} aria-hidden="true" />
            {stage.label}
          </span>
          <span>· {side.history} history {side.history === 1 ? "entry" : "entries"}</span>
          {side.open_tasks > 0 && <span>· {side.open_tasks} follow-up{side.open_tasks === 1 ? "" : "s"}</span>}
          {side.kind !== "renter" && <span>· {side.kind === "buyer" ? "Buyer" : "Broker"}</span>}
          {side.do_not_contact && <span className="text-red-300">· Do not contact</span>}
        </dd>
      </dl>
      <button
        type="button"
        onClick={onKeep}
        disabled={busy}
        className={cn(
          "mt-3 h-10 rounded-lg text-sm font-medium transition-colors disabled:opacity-50",
          suggested ? "bg-white text-black hover:bg-white/90" : "border border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
        )}
      >
        Keep this one
      </button>
    </div>
  );
}

/**
 * Suggested duplicates, reviewed one pair at a time. Nothing merges unless
 * "Keep this one" is pressed, and each merge or "not the same person" can be
 * undone on the spot (merges also from the contact's page, any time later).
 */
export function DuplicatesReview({ initial }: DuplicatesReviewProps) {
  const [confidence, setConfidence] = useState<Confidence>("high");
  const [counts, setCounts] = useState({ high: initial.high, check: initial.check });
  const [pairs, setPairs] = useState(initial.pairs);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = pairs.filter((p) => outcomes[pairKey(p)]).length;
  const total = counts[confidence];

  async function load(next: Confidence, append: boolean) {
    setLoading(true);
    setError(null);
    // Resolved pairs no longer come back from the server, so the next
    // page starts that many rows earlier.
    const offset = append ? pairs.length - resolved : 0;
    const res = await fetch(`/api/admin/nyc/duplicates?confidence=${next}&offset=${offset}`).catch(() => null);
    setLoading(false);
    if (!res) return setError("Could not reach the server.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || `Could not load (${res.status}).`);
    setCounts({ high: data.high, check: data.check });
    if (append) {
      const seen = new Set(pairs.map(pairKey));
      setPairs((prev) => [...prev, ...(data.pairs as DuplicatePair[]).filter((p) => !seen.has(pairKey(p)))]);
    } else {
      setPairs(data.pairs);
      setOutcomes({});
    }
  }

  async function act(p: DuplicatePair, body: Record<string, string>, outcome: (data: Record<string, string>) => Outcome) {
    const key = pairKey(p);
    setBusy(key);
    setError(null);
    const res = await fetch("/api/admin/nyc/duplicates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setBusy(null);
    if (!res) return setError("Could not reach the server.");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || `That did not work (${res.status}).`);
    setOutcomes((o) => ({ ...o, [key]: outcome(data) }));
    setCounts((c) => ({ ...c, [confidence]: Math.max(0, c[confidence] - 1) }));
  }

  async function undo(p: DuplicatePair) {
    const key = pairKey(p);
    const o = outcomes[key];
    if (!o) return;
    setBusy(key);
    setError(null);
    const res =
      o.kind === "merged"
        ? await fetch(`/api/admin/nyc/merges/${o.mergeId}/undo`, { method: "POST" }).catch(() => null)
        : await fetch("/api/admin/nyc/duplicates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "undismiss", a: p.a.id, b: p.b.id }),
          }).catch(() => null);
    setBusy(null);
    const err = res ? await errorOf(res) : "Could not reach the server.";
    if (err) return setError(err);
    setOutcomes((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCounts((c) => ({ ...c, [confidence]: c[confidence] + 1 }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Possible duplicates</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          People who share a phone number or email. Nothing changes until you choose. A merge keeps both records&apos;
          history and can be undone later from the contact&apos;s page.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Which pairs">
        {(
          [
            ["high", "Very likely", counts.high],
            ["check", "Check carefully", counts.check],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            aria-pressed={confidence === key}
            onClick={() => {
              setConfidence(key);
              load(key, false);
            }}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm",
              confidence === key ? "border-white/25 bg-white/[0.1] font-semibold" : "border-white/10 bg-white/[0.02] text-foreground/80 hover:bg-white/[0.06]"
            )}
          >
            {label}
            <span className="rounded-full bg-white/[0.08] px-1.5 text-xs tabular-nums">{n.toLocaleString()}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {confidence === "high"
          ? "Same phone or email, and the same first name (or one has none)."
          : "Same phone or email but different first names: often a couple or roommates on one number. Merge only if you know it is one person."}
      </p>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {pairs.length === 0 && !loading ? (
        <div className="flex flex-col items-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-6 py-16 text-center">
          <Users className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-semibold">No {confidence === "high" ? "likely" : "uncertain"} duplicates left</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {pairs.map((p) => {
            const key = pairKey(p);
            const o = outcomes[key];
            const keep = suggestedKeep(p);
            if (o) {
              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-sm">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                    {o.kind === "merged" ? (
                      <>
                        Merged into{" "}
                        <Link href={`/admin/nyc/${o.keptId}`} className="font-medium text-foreground hover:underline">
                          {o.keptName}
                        </Link>
                      </>
                    ) : (
                      <>Marked as two different people</>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => undo(p)}
                    disabled={busy === key}
                    className="rounded-md px-2 py-1 text-xs font-medium text-sky-300 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    {busy === key ? "Undoing..." : "Undo"}
                  </button>
                </li>
              );
            }
            return (
              <li key={key} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
                {!p.names_agree && (
                  <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Different first names. Merge only if you know these are the same person.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["a", "b"] as const).map((side) => {
                    const other = side === "a" ? "b" : "a";
                    return (
                      <Side
                        key={side}
                        side={p[side]}
                        shared={p.shared}
                        suggested={p.names_agree && keep === side}
                        busy={busy === key}
                        onKeep={() =>
                          act(p, { action: "merge", keep: p[side].id, merge: p[other].id }, (data) => ({
                            kind: "merged",
                            mergeId: data.merge_id,
                            keptName: displayName(p[side]),
                            keptId: p[side].id,
                          }))
                        }
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => act(p, { action: "dismiss", a: p.a.id, b: p.b.id }, () => ({ kind: "dismissed" }))}
                    disabled={busy === key}
                    className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:opacity-50"
                  >
                    Not the same person
                  </button>
                  {busy === key && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Working" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pairs.length - resolved < total && (
        <button
          type="button"
          onClick={() => load(confidence, true)}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium hover:bg-white/[0.08] disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Show more
        </button>
      )}
    </div>
  );
}
