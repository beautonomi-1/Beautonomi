"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { fetcher } from "@/lib/http/fetcher";
import {
  ArrowLeft,
  Eye,
  MousePointer,
  ShoppingBag,
  Pause,
  Play,
  StopCircle,
  DollarSign,
  Clock,
  Building2,
} from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

type CampaignDetail = {
  id: string;
  provider_id: string;
  status: string;
  billing_model: string;
  budget: number;
  spent: number;
  bid_cpc: number;
  daily_budget: number | null;
  pack_impressions: number | null;
  total_impressions: number | null;
  duration_days: number | null;
  start_at: string | null;
  end_at: string | null;
  targeting: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  provider: {
    id: string;
    business_name: string;
    owner_name: string | null;
    email: string | null;
    phone: string | null;
    slug: string | null;
    avatar_url: string | null;
  } | null;
  events_30d: { impressions: number; clicks: number; books: number };
  budget_orders: {
    id: string;
    amount: number;
    payment_status: string;
    paystack_reference: string | null;
    created_at: string;
  }[];
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-amber-100 text-amber-700",
  ended: "bg-slate-100 text-slate-500",
};

const MODEL_LABELS: Record<string, string> = {
  cpc_budget: "CPC Budget",
  impression_pack: "Impression Pack",
  time_based: "Time-Based Boost",
};

export default function AdminCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { format: fmt } = useReportCurrency();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [actionDialog, setActionDialog] = useState<"pause" | "resume" | "end" | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actioning, setActioning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: CampaignDetail }>(`/api/admin/ads/campaigns/${id}`);
      setCampaign(res.data ?? null);
    } catch {
      toast.error("Failed to load campaign");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async () => {
    if (!campaign || !actionDialog) return;
    const statusMap = { pause: "paused", resume: "active", end: "ended" } as const;
    setActioning(true);
    try {
      await fetcher.patch(`/api/admin/ads/campaigns/${campaign.id}`, {
        status: statusMap[actionDialog],
        reason: actionReason || undefined,
      });
      toast.success(`Campaign ${actionDialog === "resume" ? "resumed" : actionDialog === "pause" ? "paused" : "ended"}`);
      setActionDialog(null);
      setActionReason("");
      load();
    } catch {
      toast.error("Action failed");
    } finally {
      setActioning(false);
    }
  };

  if (loading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Loading campaign...</p>
        </div>
      </RoleGuard>
    );
  }

  if (!campaign) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
        <div className="py-20 text-center">
          <p className="text-muted-foreground">Campaign not found.</p>
          <Link href="/admin/ads"><Button variant="outline" className="mt-4">Back to Ads</Button></Link>
        </div>
      </RoleGuard>
    );
  }

  const ctr = campaign.events_30d.impressions
    ? ((campaign.events_30d.clicks / campaign.events_30d.impressions) * 100).toFixed(1)
    : "0.0";

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push("/admin/ads")}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-xl font-bold">Campaign Detail</h1>
              <p className="text-xs text-muted-foreground font-mono">{campaign.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={STATUS_COLORS[campaign.status] ?? "bg-gray-100"} variant="secondary">
              {campaign.status}
            </Badge>
            {campaign.status === "active" && (
              <Button variant="outline" size="sm" onClick={() => setActionDialog("pause")}>
                <Pause className="h-3 w-3 mr-1" /> Pause
              </Button>
            )}
            {(campaign.status === "paused" || campaign.status === "draft") && (
              <Button variant="outline" size="sm" onClick={() => setActionDialog("resume")}>
                <Play className="h-3 w-3 mr-1" /> Resume
              </Button>
            )}
            {campaign.status !== "ended" && (
              <Button variant="destructive" size="sm" onClick={() => setActionDialog("end")}>
                <StopCircle className="h-3 w-3 mr-1" /> End
              </Button>
            )}
          </div>
        </div>

        {/* Provider + Campaign info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Provider
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {campaign.provider ? (
                <>
                  <p className="font-semibold">{campaign.provider.business_name}</p>
                  {campaign.provider.owner_name && (
                    <p className="text-sm text-muted-foreground">{campaign.provider.owner_name}</p>
                  )}
                  {campaign.provider.email && <p className="text-sm">{campaign.provider.email}</p>}
                  {campaign.provider.phone && <p className="text-sm">{campaign.provider.phone}</p>}
                  <Link href={`/admin/providers/${campaign.provider_id}`}>
                    <Button variant="link" size="sm" className="px-0 h-auto">View Provider</Button>
                  </Link>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">Provider data unavailable</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Campaign Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billing Model</span>
                <span className="font-medium">{MODEL_LABELS[campaign.billing_model] ?? campaign.billing_model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{campaign.billing_model === "time_based" ? "Paid" : "Budget"}</span>
                <span className="font-medium">{fmt(campaign.budget)}</span>
              </div>
              {campaign.billing_model !== "time_based" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spent</span>
                  <span className="font-medium">{fmt(campaign.spent)}</span>
                </div>
              )}
              {campaign.bid_cpc > 0 && campaign.billing_model === "cpc_budget" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bid CPC</span>
                  <span className="font-medium">{fmt(campaign.bid_cpc)}</span>
                </div>
              )}
              {campaign.daily_budget && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily Budget</span>
                  <span className="font-medium">{fmt(campaign.daily_budget)}</span>
                </div>
              )}
              {campaign.pack_impressions && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pack Impressions</span>
                  <span className="font-medium">{campaign.pack_impressions.toLocaleString()}</span>
                </div>
              )}
              {campaign.total_impressions != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Impressions Used</span>
                  <span className="font-medium">{campaign.total_impressions.toLocaleString()}</span>
                </div>
              )}
              {campaign.duration_days && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{campaign.duration_days} days</span>
                </div>
              )}
              {campaign.start_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start</span>
                  <span>{new Date(campaign.start_at).toLocaleString()}</span>
                </div>
              )}
              {campaign.end_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End</span>
                  <span>{new Date(campaign.end_at).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 30-day Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">30-Day Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div className="border rounded-lg p-3">
                <Eye className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{campaign.events_30d.impressions.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Impressions</p>
              </div>
              <div className="border rounded-lg p-3">
                <MousePointer className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{campaign.events_30d.clicks.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Clicks</p>
              </div>
              <div className="border rounded-lg p-3">
                <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{ctr}%</p>
                <p className="text-xs text-muted-foreground">CTR</p>
              </div>
              <div className="border rounded-lg p-3">
                <ShoppingBag className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-lg font-bold">{campaign.events_30d.books.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Bookings</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Targeting */}
        {campaign.targeting && Object.keys(campaign.targeting).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Targeting</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-48">
                {JSON.stringify(campaign.targeting, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Budget Orders (payment history) */}
        {campaign.budget_orders.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Payment History</CardTitle>
              <CardDescription>{campaign.budget_orders.length} order(s)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-right px-3 py-2">Amount</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {campaign.budget_orders.map((o) => (
                      <tr key={o.id}>
                        <td className="px-3 py-2">{new Date(o.created_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-right font-medium">{fmt(o.amount)}</td>
                        <td className="px-3 py-2">
                          <Badge variant={o.payment_status === "paid" ? "default" : "secondary"}>
                            {o.payment_status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
                          {o.paystack_reference ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Dialog */}
        <Dialog open={!!actionDialog} onOpenChange={(v) => !v && setActionDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {actionDialog === "pause" && "Pause Campaign"}
                {actionDialog === "resume" && "Resume Campaign"}
                {actionDialog === "end" && "End Campaign"}
              </DialogTitle>
              <DialogDescription>
                {actionDialog === "pause" && "This will stop the campaign from showing in sponsored slots."}
                {actionDialog === "resume" && "This will re-activate the campaign and resume ad delivery."}
                {actionDialog === "end" && "This will permanently end the campaign. It cannot be restarted."}
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label>Reason (optional)</Label>
              <Input
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder="Internal note..."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
              <Button
                variant={actionDialog === "end" ? "destructive" : "default"}
                onClick={handleAction}
                disabled={actioning}
              >
                {actioning ? "Processing..." : "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
