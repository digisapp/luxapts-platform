import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/admin/auth";
import { AdminNav } from "@/components/admin/layout/AdminNav";
import { PortalShell } from "@/components/admin/layout/PortalShell";

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
    <PortalShell nav={<AdminNav />} brand="Staycio Admin" homeHref="/admin">
      {children}
    </PortalShell>
  );
}
