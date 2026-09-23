import { Building2 } from "lucide-react";

/**
 * Shown when a listing has no photograph of its own.
 *
 * Deliberately *not* stock photography. Every building without a photo used to
 * render a hand-picked Unsplash apartment, indistinguishable from a real one,
 * which meant roughly half the grid showed a picture of somewhere else. A
 * listing that looks incomplete is honest; one that looks wrong is not.
 */

/** Stable hash so a building always gets the same tint across renders. */
function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

/** Muted, on-brand tints — enough variation that a grid does not look broken. */
const TINTS = [
  "from-cyan-500/[0.07] via-transparent to-slate-400/[0.05]",
  "from-slate-400/[0.07] via-transparent to-cyan-500/[0.04]",
  "from-white/[0.05] via-transparent to-cyan-400/[0.05]",
  "from-cyan-400/[0.05] via-transparent to-white/[0.04]",
  "from-slate-500/[0.07] via-transparent to-cyan-500/[0.03]",
  "from-white/[0.04] via-transparent to-slate-400/[0.05]",
];

export function ListingPlaceholder({
  seed,
  name,
  className = "",
  showName = true,
}: {
  /** Building or unit id — keeps the tint stable for this listing. */
  seed: string;
  name?: string | null;
  className?: string;
  showName?: boolean;
}) {
  const tint = TINTS[stableIndex(seed, TINTS.length)];

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br ${tint} ${className}`}
      // Decorative: the listing's name is already in the card's text.
      aria-hidden="true"
    >
      <Building2 className="h-10 w-10 text-white/20" strokeWidth={1.25} />
      {showName && name ? (
        <span className="px-4 text-center text-[11px] font-medium uppercase tracking-[0.15em] text-white/30 line-clamp-2">
          {name}
        </span>
      ) : null}
      <span className="text-[10px] uppercase tracking-[0.2em] text-white/20">Photo coming soon</span>
    </div>
  );
}
