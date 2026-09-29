import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getShower } from "@/lib/shower/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getFirstRelation } from "@/lib/db-helpers";
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
    // building_id is unique on building_certification_content, so PostgREST
    // embeds it as a single object (one-to-one), not an array.
    building_certification_content: CertContent | CertContent[] | null;
  };
};

type CertContent = {
  shadows_required: number;
  key_selling_points: string | null;
};

const statusConfig = {
  in_progress: {
    label: "Study Mode",
    color: "bg-yellow-500/15 text-yellow-300",
    icon: BookOpen,
    description: "Complete the knowledge quiz to advance",
  },
  shadow_pending: {
    label: "Shadow Mode",
    color: "bg-blue-500/15 text-blue-300",
    icon: Users,
    description: "Shadow certified Showers to complete certification",
  },
  certified: {
    label: "Certified",
    color: "bg-green-500/15 text-green-300",
    icon: CheckCircle,
    description: "You are certified and can claim leads for this building",
  },
  expired: {
    label: "Expired",
    color: "bg-white/10 text-white/60",
    icon: Clock,
    description: "Recertification required (quiz only)",
  },
};

export default async function CertificationsPage() {
  const shower = await getShower();
  if (!shower || shower.status !== "approved") redirect("/shower");

  const adminClient = createAdminClient();

  const { data: certs, error } = await adminClient
    .from("shower_certifications")
    .select(`
      id, status, knowledge_attempts, knowledge_best_score, knowledge_passed_at,
      shadow_count, shadow_completed_at, certified_at, expires_at,
      buildings:building_id (
        id, name, address:address_1,
        building_certification_content (shadows_required, key_selling_points)
      )
    `)
    .eq("shower_id", shower.id)
    .order("certified_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Failed to load certifications: ${error.message}`);
  }

  // Skip rows whose building was deleted — they'd crash on cert.buildings.name.
  const certifications = ((certs || []) as unknown as CertRow[]).filter((c) => c.buildings);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Certifications</h1>
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                step: "1",
                icon: BookOpen,
                title: "Knowledge",
                desc: "Study floor plans, amenities, and policies. Pass a 10-question quiz (70%+).",
                color: "bg-yellow-500/10 text-yellow-400",
              },
              {
                step: "2",
                icon: Users,
                title: "Shadow",
                desc: "Join 2 certified Showers on live tours as an observer. They confirm your attendance.",
                color: "bg-blue-500/10 text-blue-400",
              },
              {
                step: "3",
                icon: Award,
                title: "Certified",
                desc: "Claim leads for this building. Certification valid for 12 months.",
                color: "bg-green-500/10 text-green-400",
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
            // Unknown statuses fall back to Study Mode rather than crashing the page.
            const config =
              statusConfig[cert.status as keyof typeof statusConfig] ?? statusConfig.in_progress;
            const Icon = config.icon;
            const content = getFirstRelation(cert.buildings.building_certification_content);
            const shadowsRequired = content?.shadows_required || 2;

            return (
              <Card key={cert.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{cert.buildings.name}</CardTitle>
                      {cert.buildings.address && (
                        <CardDescription className="mt-0.5">{cert.buildings.address}</CardDescription>
                      )}
                    </div>
                    <Badge variant="outline" className={`shrink-0 border-transparent ${config.color}`}>
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
                          <div className="h-4 w-4 rounded-full border-2 border-white/20" aria-hidden="true" />
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
                          <div className="h-4 w-4 rounded-full border-2 border-white/20" aria-hidden="true" />
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
                          <div className="h-4 w-4 rounded-full border-2 border-white/20" aria-hidden="true" />
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
                    <div className="rounded-md bg-blue-500/10 p-3 text-xs text-blue-300">
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

