import { redirect } from "next/navigation";
import { getShower } from "@/lib/shower/auth";
import { AvailabilityEditor } from "@/components/shower/AvailabilityEditor";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const shower = await getShower();
  if (!shower || shower.status !== "approved") redirect("/shower");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">My Schedule</h1>
        <p className="text-muted-foreground">
          Set your weekly availability. Renters can instantly book tours in
          these windows at buildings you&apos;re certified for.
        </p>
      </div>
      <AvailabilityEditor />
    </div>
  );
}
