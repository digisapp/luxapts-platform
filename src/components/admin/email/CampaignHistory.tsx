"use client";

import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Mail } from "lucide-react";

interface Campaign {
  id: string;
  subject: string;
  recipients_count: number;
  sent_at: string;
}

interface CampaignHistoryProps {
  campaigns: Campaign[];
}

export function CampaignHistory({ campaigns }: CampaignHistoryProps) {
  if (campaigns.length === 0) {
    return (
      <div className="py-8 text-center">
        <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-muted-foreground">No campaigns sent yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {campaigns.map((campaign) => (
        <div
          key={campaign.id}
          className="flex items-center justify-between rounded-lg border p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium truncate">{campaign.subject}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(campaign.sent_at)}
            </p>
          </div>
          <Badge variant="secondary">
            {campaign.recipients_count} recipients
          </Badge>
        </div>
      ))}
    </div>
  );
}
