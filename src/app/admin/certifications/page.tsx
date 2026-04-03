import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserRole } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Award, CheckCircle, AlertCircle, ArrowRight, BookOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminCertificationsPage() {
  const role = await getUserRole();
  if (role !== "admin") redirect("/");

  const adminClient = createAdminClient();

  const [buildingsRes, contentRes] = await Promise.all([
    adminClient.from("buildings").select("id, name, address").order("name"),
    adminClient.from("building_certification_content").select("building_id, quiz_questions, shadows_required, updated_at"),
  ]);

  const buildings = buildingsRes.data || [];
  const contentMap = new Map(
    (contentRes.data || []).map((c) => [c.building_id, c])
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Building Certifications</h1>
        <p className="text-muted-foreground">
          Set up quiz questions and study materials for each building. Showers must complete
          these before they can claim leads.
        </p>
      </div>

      <div className="grid gap-3">
        {buildings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-2">
              <BookOpen className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">No buildings found. Add buildings first.</p>
            </CardContent>
          </Card>
        ) : (
          buildings.map((building) => {
            const content = contentMap.get(building.id);
            const questionCount = Array.isArray(content?.quiz_questions)
              ? (content.quiz_questions as unknown[]).length
              : 0;
            const isConfigured = !!content && questionCount > 0;

            return (
              <Card key={building.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="flex items-center justify-between py-4 px-6">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${isConfigured ? "bg-green-50" : "bg-amber-50"}`}>
                      {isConfigured
                        ? <CheckCircle className="h-5 w-5 text-green-600" />
                        : <AlertCircle className="h-5 w-5 text-amber-500" />
                      }
                    </div>
                    <div>
                      <p className="font-medium">{building.name}</p>
                      {building.address && (
                        <p className="text-sm text-muted-foreground">{building.address}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {isConfigured ? (
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <Badge variant="secondary" className="gap-1">
                          <BookOpen className="h-3 w-3" />
                          {questionCount} question{questionCount !== 1 ? "s" : ""}
                        </Badge>
                        <Badge variant="secondary" className="gap-1">
                          <Award className="h-3 w-3" />
                          {content?.shadows_required ?? 2} shadow{(content?.shadows_required ?? 2) !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-sm text-amber-600 font-medium">Not configured</span>
                    )}
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/certifications/${building.id}`}>
                        {isConfigured ? "Edit" : "Set Up"}
                        <ArrowRight className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
