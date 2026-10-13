import Link from "next/link";
import { StaycioMark } from "@/components/brand/StaycioMark";

const FOOTER_LINKS = [
  { href: "/search", label: "Search" },
  { href: "/cities", label: "Cities" },
  { href: "/neighborhoods", label: "Neighborhoods" },
  { href: "/compare", label: "Compare" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

export function Footer() {
  return (
    // Light: a deep navy band with white type and Stacy-cyan accents. Dark:
    // the original (inverse is black there, so it reads as the page).
    <footer className="border-t border-inverse bg-inverse text-inverse-foreground pb-20 lg:pb-0 dark:border-zinc-900">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          {/* Left side */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <Link href="/" className="-my-2 flex items-center gap-2 py-2 text-lg font-medium text-inverse-foreground">
                <StaycioMark className="h-6 w-auto" />
                Staycio
              </Link>
              <span className="font-mono text-xs text-stacy/80 dark:text-zinc-400">
                /STAY-see-oh/
              </span>
            </div>
            <p className="text-sm text-white/60 max-w-xs dark:text-zinc-400">
              Your space, found.
            </p>
          </div>

          {/* Links */}
          <nav aria-label="Footer navigation">
            {/* 3-column grid of 44px rows on phones (the inline row was 20px
                tall — too small to tap reliably); a single row from md up,
                compact only with a mouse so tablets keep finger-sized rows. */}
            <div className="grid grid-cols-3 gap-x-4 text-sm md:flex md:flex-wrap md:gap-x-8">
              {FOOTER_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-11 items-center text-white/70 hover:text-stacy dark:text-zinc-400 dark:hover:text-white transition-colors md:pointer-fine:min-h-0"
                >
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </div>

        {/* Social icons removed until the @staycio handles are registered —
            linking to unregistered handles risks pointing at a squatter */}
        <div className="mt-10 pt-8 border-t border-white/10 dark:border-zinc-900">
          <p className="text-sm text-white/50 dark:text-zinc-400">
            &copy; {new Date().getFullYear()} Staycio
          </p>
        </div>
      </div>
    </footer>
  );
}
