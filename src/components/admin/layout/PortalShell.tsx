import Link from "next/link";
import { Building2 } from "lucide-react";
import { MobileNavDrawer } from "./MobileNavDrawer";

interface PortalShellProps {
  /** Sidebar navigation (AdminNav, AgentNav, PartnerNav, ShowerNav). */
  nav: React.ReactNode;
  /** Brand label shown in the mobile header, e.g. "Staycio Admin". */
  brand: string;
  /** Where the mobile header's brand link goes, e.g. "/admin". */
  homeHref: string;
  children: React.ReactNode;
}

/**
 * Shared chrome for the four logged-in portals (admin, agent, partner,
 * shower). Desktop gets a sticky sidebar; below `lg` the sidebar is replaced
 * by a sticky header with a menu button that opens the same nav in a drawer
 * (previously the portals had no navigation at all on phones/tablets).
 */
export function PortalShell({ nav, brand, homeHref, children }: PortalShellProps) {
  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 lg:block">
        <div className="sticky top-0 h-screen">{nav}</div>
      </aside>

      {/* min-w-0 lets wide tables scroll inside their own overflow wrappers
          instead of stretching the whole page horizontally. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* pt-safe-area: installed as a standalone PWA (viewport-fit=cover)
            the status bar would otherwise sit on top of the menu button. */}
        <header className="sticky top-0 z-40 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
            <MobileNavDrawer>{nav}</MobileNavDrawer>
            <Link href={homeHref} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
              <Building2 className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="truncate text-base font-bold">{brand}</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
