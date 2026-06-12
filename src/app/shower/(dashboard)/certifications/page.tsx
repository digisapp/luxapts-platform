import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getShower } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  Award, CheckCircle, BookOpen, Users,
  Lock, ArrowRight, Clock, MapPin,
} from "lucide-react";

export const dynamic = "force-dynamic";

type CertRow = {
  id: string;
  status: string;
  knowledge_attempts: number;
  knowledge_best_score: number | null;
  knowledge_passed_at: string | null;
  shadow_count: number;
  shadow_completed_at: string | null;
  certified_at: string | null;
  expires_at: string | null;
  buildings: {
    id: string;
    name: string;
    address: string | null;
    building_certification_content: Array<{
      shadows_required: number;
      key_selling_points: string | null;
    }>;
  };
};

const statusConfig = {
  in_progress: {
    label: "Study Mode",
    color: "bg-yellow-100 text-yellow-700",
    icon: BookOpen,
    description: "Complete the knowledge quiz to advance",
  },
  shadow_pending: {
    label: "Shadow Mode",
    color: "bg-blue-100 text-blue-700",
    icon: Users,
    description: "Shadow certified Showers to complete certification",
  },
  certified: {
    label: "Certified",
    color: "bg-green-100 text-green-700",
    icon: CheckCircle,
    description: "You are certified and can claim leads for this building",
  },
  expired: {
    label: "Expired",
    color: "bg-gray-100 text-gray-600",
    icon: Clock,
    description: "Recertification required (quiz only)",
  },
};

export default async function CertificationsPage() {
  const shower = await getShower();
  if (!shower || shower.status !== "approved") redirect("/shower");

  const adminClient = createAdminClient();

  const { data: certs } = await adminClient
    .from("shower_certifications")
    .select(`
      id, status, knowledge_attempts, knowledge_best_score, knowledge_passed_at,
      shadow_count, shadow_completed_at, certified_at, expires_at,
      buildings:building_id (
        id, name, address,
        building_certification_content (shadows_required, key_selling_points)
      )
    `)
    .eq("shower_id", shower.id)
    .order("certified_at", { ascending: false, nullsFirst: false });

  const certifications = (certs || []) as unknown as CertRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Certifications</h1>
        <p className="text-muted-foreground">
          Complete building certifications to unlock leads. Each building has its own track.
        </p>
      </div>

      {/* Certification Levels Explainer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How Certification Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                step: "1",
                icon: BookOpen,
                title: "Knowledge",
                desc: "Study floor plans, amenities, and policies. Pass a 10-question quiz (70%+).",
                color: "bg-yellow-50 text-yellow-600",
              },
              {
                step: "2",
                icon: Users,
                title: "Shadow",
                desc: "Join 2 certified Showers on live tours as an observer. They confirm your attendance.",
                color: "bg-blue-50 text-blue-600",
              },
              {
                step: "3",
                icon: Award,
                title: "Certified",
                desc: "Claim leads for this building. Certification valid for 12 months.",
                color: "bg-green-50 text-green-600",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="flex gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full shrink-0 ${item.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Certifications List */}
      {certifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Lock className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">No certifications started</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Admin will assign buildings for you to certify. Check back soon or contact your manager.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {certifications.map((cert) => {
            const config = statusConfig[cert.status as keyof typeof statusConfig];
            const Icon = config.icon;
            const content = cert.buildings.building_certification_content[0];
            const shadowsRequired = content?.shadows_required || 2;

            return (
              <Card key={cert.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{cert.buildings.name}</CardTitle>
                      {cert.buildings.address && (
                        <CardDescription className="mt-0.5">{cert.buildings.address}</CardDescription>
                      )}
                    </div>
                    <Badge className={config.color}>
                      <Icon className="mr-1 h-3 w-3" />
                      {config.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progress Steps */}
                  <div className="space-y-3">
                    {/* Knowledge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {cert.knowledge_passed_at ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <span className="text-sm">Knowledge Quiz</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {cert.knowledge_passed_at
                          ? `Passed (${cert.knowledge_best_score}%)`
                          : cert.knowledge_best_score
                          ? `Best: ${cert.knowledge_best_score}% (need 70%)`
                          : "Not started"}
                      </span>
                    </div>

                    {/* Shadow */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {cert.shadow_completed_at ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <span className="text-sm">Shadow Sessions</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {cert.shadow_count}/{shadowsRequired} completed
                      </span>
                    </div>

                    {/* Certified */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {cert.certified_at ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <div className="h-4 w-4 rounded-full border-2 border-muted" />
                        )}
                        <span className="text-sm">Certified</span>
                      </div>
                      {cert.certified_at && cert.expires_at && (
                        <span className="text-xs text-muted-foreground">
                          Expires {new Date(cert.expires_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action button */}
                  {cert.status === "in_progress" && (
                    <Button className="w-full" variant="outline" asChild>
                      <Link href={`/shower/certifications/${cert.buildings.id}`}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Start / Continue Quiz
                        <ArrowRight className="ml-auto h-4 w-4" />
                      </Link>
                    </Button>
                  )}

                  {cert.status === "shadow_pending" && (
                    <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
                      <strong>Next step:</strong> Join {shadowsRequired - cert.shadow_count} more showing
                      {shadowsRequired - cert.shadow_count !== 1 ? "s" : ""} as an observer.
                      The lead Shower must confirm your attendance in the app.
                    </div>
                  )}

                  {cert.status === "certified" && (
                    <Button className="w-full" variant="secondary" asChild>
                      <Link href="/shower/leads">
                        <MapPin className="mr-2 h-4 w-4" />
                        View Leads for This Building
                      </Link>
                    </Button>
                  )}

                  {cert.status === "expired" && (
                    <Button className="w-full" variant="outline" asChild>
                      <Link href={`/shower/certifications/${cert.buildings.id}`}>
                        Recertify (Quiz Only)
                        <ArrowRight className="ml-auto h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

