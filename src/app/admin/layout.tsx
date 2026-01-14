import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Users, LayoutDashboard, Settings, FileText, LogOut, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUserRole } from "@/lib/admin/auth";

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
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center border-b px-6">
            <Link href="/admin" className="flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              <span className="text-lg font-bold">LuxApts Admin</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              href="/admin/leads"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Users className="h-4 w-4" />
              Leads
            </Link>
            <Link
              href="/admin/buildings"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Building2 className="h-4 w-4" />
              Buildings
            </Link>
            <Link
              href="/admin/agents"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <FileText className="h-4 w-4" />
              Agents
            </Link>
            <Link
              href="/admin/import"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import
            </Link>
            <Link
              href="/admin/settings"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </nav>

          {/* Footer */}
          <div className="border-t p-4">
            <Button variant="ghost" className="w-full justify-start gap-3" asChild>
              <Link href="/">
                <LogOut className="h-4 w-4" />
                Exit Admin
              </Link>
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1">
        {/* Mobile Header */}
        <header className="flex h-16 items-center border-b px-6 lg:hidden">
          <Link href="/admin" className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <span className="text-lg font-bold">LuxApts Admin</span>
          </Link>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
