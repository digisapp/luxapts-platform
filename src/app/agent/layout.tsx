import { redirect } from "next/navigation";
import { getAgentUserId } from "@/lib/agent/auth";
import { AgentNav } from "@/components/agent/layout/AgentNav";
import { PortalShell } from "@/components/admin/layout/PortalShell";

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const agentId = await getAgentUserId();

  if (!agentId) {
    redirect("/");
  }

  return (
    <PortalShell nav={<AgentNav />} brand="Staycio Agent" homeHref="/agent">
      {children}
    </PortalShell>
  );
}
