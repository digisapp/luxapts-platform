"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { DeleteLeadsDialog } from "@/components/admin/leads/DeleteLeadsDialog";

interface LeadDeleteButtonProps {
  leadId: string;
  leadName: string | null;
}

export function LeadDeleteButton({ leadId, leadName }: LeadDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className="border-red-500/40 text-red-300 hover:border-red-500/60 hover:bg-red-500/10"
      >
        <Trash2 className="mr-1 h-3 w-3" />
        Delete
      </Button>
      <DeleteLeadsDialog
        open={open}
        onOpenChange={setOpen}
        leadIds={[leadId]}
        leadName={leadName}
        onDeleted={() => {
          router.replace("/admin/leads");
          router.refresh();
        }}
      />
    </>
  );
}
