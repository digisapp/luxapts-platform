import { redirect } from "next/navigation";
import { getPartner } from "@/lib/partner/auth";
import { PartnerNav } from "@/components/partner/PartnerNav";
import { PortalShell } from "@/components/admin/layout/PortalShell";

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const partner = await getPartner();

  if (!partner) {
    redirect("/");
  }

  return (
    <PortalShell
      nav={<PartnerNav companyName={partner.company_name || "My Portfolio"} />}
      brand="Partner Portal"
      homeHref="/partner"
    >
      {children}
    </PortalShell>
  );
}
