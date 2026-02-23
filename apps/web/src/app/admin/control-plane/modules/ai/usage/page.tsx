"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import { ArrowLeft } from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";

interface UsageRow {
  id: string;
  actor_user_id: string;
  provider_id: string | null;
  feature_key: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_estimate: number;
  success: boolean;
  error_code: string | null;
  created_at: string;
}

export default function AiUsagePage() {
  const [items, setItems] = useState<UsageRow[]>([]);
  const [summary, setSummary] = useState({ tokens_in: 0, tokens_out: 0, cost_estimate: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [featureKey, setFeatureKey] = useState("");
  const [providerId, setProviderId] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: "20" });
        if (featureKey) params.set("feature_key", featureKey);
        if (providerId) params.set("provider_id", providerId);
        const res = await fetcher.get<{
          data: { items: UsageRow[]; total: number; summary: { tokens_in: number; tokens_out: number; cost_estimate: number } };
        }>(`/api/admin/control-plane/modules/ai/usage?${params}`);
        setItems(res.data?.items ?? []);
        setTotal(res.data?.total ?? 0);
        setSummary(res.data?.summary ?? { tokens_in: 0, tokens_out: 0, cost_estimate: 0 });
      } catch {
        toast.error("Failed to load usage");
      } finally {
        setLoading(false);
      }
    })();
  }, [page, featureKey, providerId]);

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/control-plane/modules/ai">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">AI Usage</h1>
          <p className="text-muted-foreground">Token usage and cost estimates per feature.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <Label>Feature key</Label>
          <Input
            placeholder="e.g. ai.provider.profile_completion"
            value={featureKey}
            onChange={(e) => setFeatureKey(e.target.value)}
            className="w-64"
          />
        </div>
        <div>
          <Label>Provider ID</Label>
          <Input
            placeholder="UUID"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Summary (this page)</CardTitle>
          <CardDescription>Tokens in: {summary.tokens_in} · Tokens out: {summary.tokens_out} · Cost est: {summary.cost_estimate}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p>Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">No usage records.</p>
          ) : (
            <>
              <ul className="space-y-2 text-sm">
                {items.map((r) => (
                  <li key={r.id} className="flex justify-between border-b pb-2">
                    <span>{r.feature_key} · {r.model}</span>
                    <span>{r.tokens_in + r.tokens_out} tokens · {r.success ? "ok" : r.error_code}</span>
                    <span>{new Date(r.created_at).toISOString()}</span>
                  </li>
                ))}
              </ul>
              {total > 20 && (
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
    </RoleGuard>
  );
}
