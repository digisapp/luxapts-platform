import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-900 pb-20 lg:pb-0">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
          {/* Left side */}
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2.5">
              <Link href="/" className="text-lg font-medium text-white">
                Staycio
              </Link>
              <span className="font-mono text-xs text-zinc-400">
                /STAY-see-oh/
              </span>
            </div>
            <p className="text-sm text-zinc-400 max-w-xs">
              Your space, found.
            </p>
          </div>

          {/* Links */}
          <nav aria-label="Footer navigation">
            <div className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
              <Link href="/search" className="text-zinc-400 hover:text-white transition-colors">
                Search
              </Link>
              <Link href="/cities" className="text-zinc-400 hover:text-white transition-colors">
                Cities
              </Link>
              <Link href="/neighborhoods" className="text-zinc-400 hover:text-white transition-colors">
                Neighborhoods
              </Link>
              <Link href="/about" className="text-zinc-400 hover:text-white transition-colors">
                About
              </Link>
              <Link href="/privacy" className="text-zinc-400 hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-zinc-400 hover:text-white transition-colors">
                Terms
              </Link>
            </div>
          </nav>
        </div>

        {/* Social icons removed until the @staycio handles are registered —
            linking to unregistered handles risks pointing at a squatter */}
        <div className="mt-12 pt-8 border-t border-zinc-900">
          <p className="text-sm text-zinc-400">
            &copy; {new Date().getFullYear()} Staycio
          </p>
        </div>
      </div>
    </footer>
  );
}
