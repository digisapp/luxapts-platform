// The NYC book's pipeline: the brokerage's own Follow Up Boss stages, stored
// verbatim so a re-export still matches, with short labels for the UI.
// Classes are static strings so Tailwind generates every one.

export interface StageMeta {
  value: string;
  label: string;
  dot: string;
  pill: string;
  bar: string;
}

export const STAGES: StageMeta[] = [
  {
    value: "Lead",
    label: "Lead",
    dot: "bg-emerald-400",
    pill: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
    bar: "bg-emerald-400",
  },
  {
    value: "Follow Up Call / Text / Email",
    label: "Follow up",
    dot: "bg-sky-400",
    pill: "border-sky-400/25 bg-sky-400/10 text-sky-200",
    bar: "bg-sky-400",
  },
  {
    value: "Got Them On A Call / Interested To View",
    label: "Interested",
    dot: "bg-cyan-300",
    pill: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
    bar: "bg-cyan-300",
  },
  {
    value: "Sent Best Options",
    label: "Sent options",
    dot: "bg-violet-400",
    pill: "border-violet-400/25 bg-violet-400/10 text-violet-200",
    bar: "bg-violet-400",
  },
  {
    value: "Setup Showing",
    label: "Showing",
    dot: "bg-fuchsia-400",
    pill: "border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200",
    bar: "bg-fuchsia-400",
  },
  {
    value: "Submitted Application",
    label: "Applied",
    dot: "bg-amber-400",
    pill: "border-amber-400/25 bg-amber-400/10 text-amber-200",
    bar: "bg-amber-400",
  },
  {
    value: "Closed",
    label: "Closed",
    dot: "bg-teal-300",
    pill: "border-teal-300/25 bg-teal-300/10 text-teal-100",
    bar: "bg-teal-300",
  },
  {
    // Spelled as in the brokerage's Follow Up Boss account.
    value: "Future Move Ins / Long Term Nuture",
    label: "Nurture",
    dot: "bg-orange-300",
    pill: "border-orange-300/25 bg-orange-300/10 text-orange-100",
    bar: "bg-orange-300",
  },
  {
    value: "Trash",
    label: "Trash",
    dot: "bg-zinc-500",
    pill: "border-white/10 bg-white/[0.04] text-zinc-400",
    bar: "bg-zinc-600",
  },
];

export const DEFAULT_STAGE = "Lead";

/** Stages where someone is being actively worked toward a lease. */
export const WORKING_STAGES = [
  "Follow Up Call / Text / Email",
  "Got Them On A Call / Interested To View",
  "Sent Best Options",
  "Setup Showing",
  "Submitted Application",
];

export const NURTURE_STAGE = "Future Move Ins / Long Term Nuture";

const BY_VALUE = new Map(STAGES.map((s) => [s.value, s]));

/** Meta for any stage, including ones imported that are not in STAGES. */
export function stageMeta(value: string): StageMeta {
  return (
    BY_VALUE.get(value) ?? {
      value,
      label: value,
      dot: "bg-white/50",
      pill: "border-white/15 bg-white/[0.05] text-foreground/80",
      bar: "bg-white/40",
    }
  );
}

/** Known stages in pipeline order, then any others in the data, A–Z. */
export function orderedStages(present: string[]): StageMeta[] {
  const extra = present.filter((v) => !BY_VALUE.has(v)).sort((a, b) => a.localeCompare(b));
  return [...STAGES, ...extra.map(stageMeta)];
}
