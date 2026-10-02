import { cn } from "@/lib/utils";
import { TONE_CLASSES, type BadgeTone } from "./types";

export function ToneBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
