import { EmailInbox } from "@/components/admin/inbox/EmailInbox";

export const dynamic = "force-dynamic";

export default function AdminEmailPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Email</h1>
        <p className="text-muted-foreground">
          View received emails, send replies, and compose new messages
        </p>
      </div>

      <EmailInbox />
    </div>
  );
}
