import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getShower } from "@/lib/shower/auth";
import { ShowerNav } from "@/components/shower/layout/ShowerNav";

export default async function ShowerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shower = await getShower();

  if (!shower) {
    // Not registered — send to registration page (which is public)
    redirect("/shower/profile");
  }

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
