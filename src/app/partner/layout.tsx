import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getPartner } from "@/lib/partner/auth";
import { PartnerNav } from "@/components/partner/PartnerNav";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const partner = await getPartner();

  if (!partner) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 border-r bg-muted/30 lg:block">
        <PartnerNav companyName={partner.company_name || "My Portfolio"} />
      </aside>

      <div className="flex-1">
        <header className="flex h-16 items-center border-b px-6 lg:hidden">
          <Link href="/partner" className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <span className="text-lg font-bold">Partner Portal</span>
          </Link>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
