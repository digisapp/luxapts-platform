import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getAgentUserId } from "@/lib/agent/auth";
import { AgentNav } from "@/components/agent/layout/AgentNav";

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
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r bg-muted/30 lg:block">
        <AgentNav />
      </aside>

      {/* Main Content */}
      <div className="flex-1">
        {/* Mobile Header */}
        <header className="flex h-16 items-center border-b px-6 lg:hidden">
          <Link href="/agent" className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <span className="text-lg font-bold">LuxApts Agent</span>
          </Link>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
