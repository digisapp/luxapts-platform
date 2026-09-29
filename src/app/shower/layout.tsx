import { ShowerNav } from "@/components/shower/layout/ShowerNav";
import { PortalShell } from "@/components/admin/layout/PortalShell";

// The registration guard lives in (dashboard)/layout.tsx. Keeping it here
// would redirect /shower/profile (the registration page) to itself forever.
export default function ShowerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalShell nav={<ShowerNav />} brand="Staycio Shower" homeHref="/shower">
      {children}
    </PortalShell>
  );
}
