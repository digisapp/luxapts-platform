import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getShower } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isValidUUID } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { QuizClient } from "./QuizClient";

export const dynamic = "force-dynamic";

interface QuizPageProps {
  params: Promise<{ buildingId: string }>;
}

export default async function CertificationQuizPage({ params }: QuizPageProps) {
  const { buildingId } = await params;

  const shower = await getShower();
  if (!shower || shower.status !== "approved") redirect("/shower");

  // A malformed id would 400 at Postgres rather than 404 here
  if (!isValidUUID(buildingId)) notFound();

  const adminClient = createAdminClient();
  const { data: building } = await adminClient
    .from("buildings")
    .select("id, name")
    .eq("id", buildingId)
    .maybeSingle();

  if (!building) notFound();

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1 px-2" asChild>
          <Link href="/shower/certifications">
            <ArrowLeft className="h-4 w-4" />
            Certifications
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Knowledge Quiz</h1>
          <p className="text-muted-foreground">{building.name}</p>
        </div>
      </div>

      <QuizClient buildingId={buildingId} />
    </div>
  );
}
