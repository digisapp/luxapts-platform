import { redirect } from "next/navigation";
import { getShower } from "@/lib/shower/auth";

// Guards the shower dashboard pages. The registration page lives at
// /shower/profile OUTSIDE this route group so unregistered users can
// actually reach it (previously this redirect looped onto itself).
export default async function ShowerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shower = await getShower();

  if (!shower) {
    // Not registered — send to the registration page
    redirect("/shower/profile");
  }

  return <>{children}</>;
}
