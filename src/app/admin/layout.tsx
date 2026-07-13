import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getUserRole } from "@/lib/admin/auth";
import { AdminNav } from "@/components/admin/layout/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user has admin role
  const role = await getUserRole();

  if (role !== "admin") {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r bg-muted/30 lg:block">
        <AdminNav />
      </aside>

      {/* Main Content */}
      <div className="flex-1">
        {/* Mobile Header */}
        <header className="flex h-16 items-center border-b px-6 lg:hidden">
          <Link href="/admin" className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <span className="text-lg font-bold">Staycio Admin</span>
          </Link>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
