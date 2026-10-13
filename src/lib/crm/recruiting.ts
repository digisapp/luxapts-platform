// The recruiting pipeline for the brokers in the book: other agents who
// asked about listings, now prospects to bring to Staycio (migration 037).
// Classes are static strings so Tailwind generates every one.

export const PARTNER_STATUSES = [
  {
    value: "not_contacted",
    label: "Not contacted",
    dot: "bg-white/50",
    pill: "border-white/15 bg-white/[0.05] text-foreground/80",
    bar: "bg-white/40",
  },
  {
    value: "reached_out",
    label: "Reached out",
    dot: "bg-sky-400",
    pill: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    bar: "bg-sky-400",
  },
  {
    value: "talking",
    label: "Talking",
    dot: "bg-violet-400",
    pill: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    bar: "bg-violet-400",
  },
  {
    value: "meeting",
    label: "Meeting set",
    dot: "bg-amber-400",
    pill: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    bar: "bg-amber-400",
  },
  {
    value: "joined",
    label: "Joined Staycio",
    dot: "bg-emerald-400",
    pill: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    bar: "bg-emerald-400",
  },
  {
    value: "not_interested",
    label: "Not interested",
    dot: "bg-zinc-500",
    pill: "border-white/10 bg-white/[0.04] text-zinc-400",
    bar: "bg-zinc-600",
  },
] as const;

export type PartnerStatus = (typeof PARTNER_STATUSES)[number]["value"];

export const PARTNER_STATUS_VALUES = PARTNER_STATUSES.map((s) => s.value) as [PartnerStatus, ...PartnerStatus[]];

export function partnerMeta(value: string | null | undefined) {
  return PARTNER_STATUSES.find((s) => s.value === value) ?? PARTNER_STATUSES[0];
}

/** "FiDi · $5,200 · 2 bd": what a broker's inquiry says about the market they work. */
export function worksIn(c: { neighborhood: string | null; price: number | null; beds: number | null }): string | null {
  const parts = [
    c.neighborhood,
    c.price ? (c.price >= 50_000 ? `$${(c.price / 1_000_000).toFixed(1)}M sale` : `$${c.price.toLocaleString("en-US")}`) : null,
    c.beds === null || c.beds === undefined ? null : c.beds === 0 ? "studio" : `${c.beds} bd`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
