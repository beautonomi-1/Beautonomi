"use client";

import React, { useState, useEffect } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Campaign } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";

export default function ProviderBlastCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listCampaigns();
      setCampaigns(data.filter((c) => c.type === "blast"));
    } catch (error) {
      console.error("Failed to load campaigns:", error);
      toast.error("Failed to load campaigns");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Blast Campaigns"
        subtitle="Promote your business with targeted campaigns"
        primaryAction={{
          label: "Start Campaign",
          onClick: () => console.log("Start campaign"),
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <SectionCard className="p-12 text-center">
          <EmptyState
            title="Promote your business with blast campaigns"
            description="Reach your clients with targeted marketing messages, promote special offers, and increase bookings."
            action={{
              label: "Start now",
              onClick: () => console.log("Start campaign"),
            }}
          />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((campaign) => (
            <SectionCard key={campaign.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{campaign.name}</h3>
                  <p className="text-sm text-gray-600">
                    Created {new Date(campaign.created_date).toLocaleDateString()}
                  </p>
                </div>
                <Badge
                  variant={
                    campaign.status === "active"
                      ? "default"
                      : campaign.status === "paused"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {campaign.status}
                </Badge>
              </div>
              {campaign.sent_count !== undefined && (
                <div className="space-y-1 text-sm text-gray-600 pt-4 border-t">
                  <div className="flex justify-between">
                    <span>Sent:</span>
                    <span className="font-medium">{campaign.sent_count}</span>
                  </div>
                  {campaign.open_count !== undefined && (
                    <div className="flex justify-between">
                      <span>Opened:</span>
                      <span className="font-medium">{campaign.open_count}</span>
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
