import Link from "next/link";
import { Building2 } from "lucide-react";
import { ShowerNav } from "@/components/shower/layout/ShowerNav";

// The registration guard lives in (dashboard)/layout.tsx. Keeping it here
// would redirect /shower/profile (the registration page) to itself forever.
export default function ShowerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r bg-muted/30 lg:block">
        <ShowerNav />
      </aside>

      {/* Main Content */}
      <div className="flex-1">
        {/* Mobile Header */}
        <header className="flex h-16 items-center border-b px-6 lg:hidden">
          <Link href="/shower" className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <span className="text-lg font-bold">LuxApts Shower</span>
          </Link>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
