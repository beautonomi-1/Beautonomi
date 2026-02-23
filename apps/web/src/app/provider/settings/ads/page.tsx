"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useModuleConfig, useFeatureFlag } from "@/providers/ConfigBundleProvider";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Megaphone, Plus, Loader2 } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Campaign = {
  id: string;
  status: string;
  budget: number;
  spent: number;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
};

export default function ProviderAdsPage() {
  const adsConfig = useModuleConfig("ads") as { enabled?: boolean } | undefined;
  const adsEnabled = useFeatureFlag("ads.enabled");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [budget, setBudget] = useState("");

  const enabled = Boolean(adsConfig?.enabled) || adsEnabled;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetcher.get<{ data: Campaign[] }>("/api/provider/ads/campaigns");
        setCampaigns(res.data ?? []);
      } catch {
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [enabled]);

  const createDraft = async () => {
    const num = parseFloat(budget);
    if (!Number.isFinite(num) || num < 0) {
      toast.error("Enter a valid budget");
      return;
    }
    setCreating(true);
    try {
      const res = await fetcher.post<{ data: Campaign }>("/api/provider/ads/campaigns", { budget: num });
      setCampaigns((prev) => [res.data, ...prev]);
      setBudget("");
      toast.success("Campaign created (draft). Activate it when ready.");
    } catch {
      toast.error("Failed to create campaign");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <SettingsDetailLayout title="Paid ads" description="Boost your visibility with sponsored slots.">
        <LoadingTimeout loadingMessage="Loading..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout title="Paid ads" description="Create campaigns to appear in sponsored slots on the home page.">
      {!enabled && (
        <Alert className="mb-6">
          <AlertDescription>Paid ads are not enabled. Contact support or enable the ads module in Control Plane.</AlertDescription>
        </Alert>
      )}

      <SectionCard title="Campaigns">
        <div className="space-y-4">
          {enabled && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label>Budget (ZAR)</Label>
                <Input type="number" min={0} step={10} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="500" className="w-32" />
              </div>
              <Button onClick={createDraft} disabled={creating}>
                {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Creating…</> : <><Plus className="h-4 w-4 mr-2" /> New campaign (draft)</>}
              </Button>
            </div>
          )}
          {campaigns.length === 0 ? (
            <p className="text-muted-foreground">No campaigns yet. Create a draft to get started.</p>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((c) => (
                <li key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <span className="font-medium">Campaign</span>
                    <span className="text-muted-foreground ml-2">ZAR {Number(c.budget).toFixed(2)} budget · {Number(c.spent).toFixed(2)} spent</span>
                  </div>
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
