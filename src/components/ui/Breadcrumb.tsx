import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav
      aria-label="Breadcrumb"
      // One line that scrolls sideways on phones: wrapping split names like
      // "Downtown Miami" across two ragged lines.
      className={cn(
        "flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <Link
        href="/"
        className="flex shrink-0 items-center py-2 hover:text-foreground transition-colors"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>

      {items.map((item, index) => (
        <span key={index} className="flex shrink-0 items-center gap-1">
          <ChevronRight className="h-4 w-4 shrink-0" />
          {item.href ? (
            <Link
              href={item.href}
              className="py-2 hover:text-foreground transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
