"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { SendEmailDialog } from "@/components/admin/leads/SendEmailDialog";

interface LeadEmailButtonProps {
  leadId: string;
  leadName: string | null;
  leadEmail: string;
}

export function LeadEmailButton({ leadId, leadName, leadEmail }: LeadEmailButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Send className="mr-1 h-3 w-3" />
        Email
      </Button>
      <SendEmailDialog
        open={open}
        onOpenChange={setOpen}
        leadId={leadId}
        leadName={leadName}
        leadEmail={leadEmail}
      />
    </>
  );
}
