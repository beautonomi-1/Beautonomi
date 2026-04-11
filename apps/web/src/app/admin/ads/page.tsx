"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Eye,
  MousePointer,
  ShoppingBag,
  DollarSign,
  Megaphone,
  Pause,
  StopCircle,
  ChevronLeft,
  ChevronRight,
  Settings,
  Search,
  TrendingUp,
  Clock,
  Package,
  BarChart3,
} from "lucide-react";
import RoleGuard from "@/components/auth/RoleGuard";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";

type Overview = {
  campaigns_by_status: Record<string, number>;
  campaigns_by_model: Record<string, number>;
  events_7d: { impressions: number; clicks: number; books: number };
  events_30d: { impressions: number; clicks: number; books: number };
  prepaid_revenue_30d_zar: number;
  total_spent_in_campaigns_zar: number;
  total_budget_in_campaigns_zar: number;
};

type Campaign = {
  id: string;
  provider_id: string;
  provider_name: string;
  status: string;
  billing_model: string;
  budget: number;
  spent: number;
  bid_cpc: number;
  daily_budget: number | null;
  pack_impressions: number | null;
  duration_days: number | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  updated_at: string;
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
  time_based: "Time-Based",
};

export default function AdminAdsPage() {
  const { format: fmt } = useReportCurrency();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [totalCampaigns, setTotalCampaigns] = useState(0);
  const [loading, setLoading] = useState(true);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const [moderateDialog, setModerateDialog] = useState<Campaign | null>(null);
  const [moderateAction, setModerateAction] = useState<"paused" | "ended">("paused");
  const [moderateReason, setModerateReason] = useState("");
  const [moderating, setModerating] = useState(false);

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetcher.get<{ data: Overview }>("/api/admin/ads/overview");
      setOverview(res.data ?? null);
    } catch {
      toast.error("Failed to load ads overview");
    }
  }, []);

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetcher.get<{ data: { campaigns: Campaign[]; total: number } }>(
        `/api/admin/ads/campaigns?${params.toString()}`
      );
      setCampaigns(res.data?.campaigns ?? []);
      setTotalCampaigns(res.data?.total ?? 0);
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setCampaignsLoading(false);
    }
  }, [statusFilter, searchQuery, page]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadOverview(), loadCampaigns()]).finally(() => setLoading(false));
  }, [loadOverview, loadCampaigns]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, searchQuery]);

  const handleModerate = async () => {
    if (!moderateDialog) return;
    setModerating(true);
    try {
      await fetcher.patch(`/api/admin/ads/campaigns/${moderateDialog.id}`, {
        status: moderateAction,
        reason: moderateReason || undefined,
      });
      toast.success(`Campaign ${moderateAction === "paused" ? "paused" : "ended"} successfully`);
      setModerateDialog(null);
      setModerateReason("");
      loadCampaigns();
      loadOverview();
    } catch {
      toast.error("Failed to moderate campaign");
    } finally {
      setModerating(false);
    }
  };

  const totalPages = Math.ceil(totalCampaigns / limit);
  const ctr7d = overview?.events_7d.impressions
    ? ((overview.events_7d.clicks / overview.events_7d.impressions) * 100).toFixed(1)
    : "0.0";
  const ctr30d = overview?.events_30d.impressions
    ? ((overview.events_30d.clicks / overview.events_30d.impressions) * 100).toFixed(1)
    : "0.0";

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/admin/dashboard">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ads & Campaigns</h1>
            <p className="text-muted-foreground">Manage sponsored listings, moderate campaigns, and monitor ad revenue.</p>
          </div>
          <Link href="/admin/control-plane/modules/ads">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Module Config
            </Button>
          </Link>
        </div>

        {/* Overview KPIs */}
        {overview && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Megaphone className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <p className="text-2xl font-bold">{overview.campaigns_by_status.active ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Impressions (30d)</p>
                  </div>
                  <p className="text-2xl font-bold">{overview.events_30d.impressions.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <MousePointer className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Clicks (30d)</p>
                  </div>
                  <p className="text-2xl font-bold">{overview.events_30d.clicks.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">CTR: {ctr30d}%</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Bookings (30d)</p>
                  </div>
                  <p className="text-2xl font-bold">{overview.events_30d.books.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Revenue (30d)</p>
                  </div>
                  <p className="text-2xl font-bold">{fmt(overview.prepaid_revenue_30d_zar)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Total Budgets</p>
                  </div>
                  <p className="text-2xl font-bold">{fmt(overview.total_budget_in_campaigns_zar)}</p>
                  <p className="text-[10px] text-muted-foreground">Spent: {fmt(overview.total_spent_in_campaigns_zar)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Model + Status breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Campaigns by Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(overview.campaigns_by_status).map(([status, count]) => (
                      <div key={status} className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[status] ?? "bg-gray-100"}>{status}</Badge>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Campaigns by Billing Model</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(overview.campaigns_by_model ?? {}).map(([model, count]) => (
                      <div key={model} className="flex items-center gap-2">
                        {model === "time_based" && <Clock className="h-4 w-4 text-emerald-600" />}
                        {model === "impression_pack" && <Package className="h-4 w-4 text-indigo-600" />}
                        {model === "cpc_budget" && <BarChart3 className="h-4 w-4 text-blue-600" />}
                        <span className="text-sm">{MODEL_LABELS[model] ?? model}</span>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 7-day metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">7-Day Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-lg font-semibold">{overview.events_7d.impressions.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Impressions</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{overview.events_7d.clicks.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Clicks</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{ctr7d}%</p>
                    <p className="text-xs text-muted-foreground">CTR</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{overview.events_7d.books.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Bookings from Ads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Campaigns List */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle>All Campaigns</CardTitle>
                <CardDescription>{totalCampaigns} total campaigns</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search provider..."
                    className="pl-8 w-48"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="ended">Ended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {campaignsLoading && campaigns.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Loading campaigns...</p>
            ) : campaigns.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No campaigns found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Provider</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        <th className="text-left px-3 py-2 font-medium">Model</th>
                        <th className="text-right px-3 py-2 font-medium">Budget</th>
                        <th className="text-right px-3 py-2 font-medium">Spent</th>
                        <th className="text-left px-3 py-2 font-medium">Period</th>
                        <th className="text-left px-3 py-2 font-medium">Updated</th>
                        <th className="text-right px-3 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {campaigns.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-3">
                            <div>
                              <Link href={`/admin/ads/${c.id}`} className="font-medium hover:underline">
                                {c.provider_name}
                              </Link>
                              <p className="text-xs text-muted-foreground font-mono">{c.id.slice(0, 8)}...</p>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge className={STATUS_COLORS[c.status] ?? "bg-gray-100"}>{c.status}</Badge>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs">{MODEL_LABELS[c.billing_model] ?? c.billing_model}</span>
                            {c.billing_model === "time_based" && c.duration_days && (
                              <span className="text-xs text-muted-foreground ml-1">({c.duration_days}d)</span>
                            )}
                            {c.billing_model === "impression_pack" && c.pack_impressions && (
                              <span className="text-xs text-muted-foreground ml-1">({c.pack_impressions} imp)</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-medium">{fmt(c.budget)}</td>
                          <td className="px-3 py-3 text-right">
                            {c.billing_model === "time_based" ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              fmt(c.spent)
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {c.start_at && c.end_at ? (
                              <span className="text-xs">
                                {new Date(c.start_at).toLocaleDateString()} – {new Date(c.end_at).toLocaleDateString()}
                              </span>
                            ) : c.start_at ? (
                              <span className="text-xs">{new Date(c.start_at).toLocaleDateString()} – ongoing</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            {new Date(c.updated_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {c.status === "active" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setModerateDialog(c);
                                    setModerateAction("paused");
                                  }}
                                >
                                  <Pause className="h-3 w-3 mr-1" /> Pause
                                </Button>
                              )}
                              {(c.status === "active" || c.status === "paused" || c.status === "draft") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    setModerateDialog(c);
                                    setModerateAction("ended");
                                  }}
                                >
                                  <StopCircle className="h-3 w-3 mr-1" /> End
                                </Button>
                              )}
                              <Link href={`/admin/providers/${c.provider_id}`}>
                                <Button variant="ghost" size="sm" className="h-7 text-xs">
                                  Provider
                                </Button>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {page + 1} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Moderation Dialog */}
        <Dialog open={!!moderateDialog} onOpenChange={(v) => !v && setModerateDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {moderateAction === "paused" ? "Pause" : "End"} Campaign
              </DialogTitle>
              <DialogDescription>
                {moderateAction === "paused"
                  ? "Pausing will stop this campaign from showing in sponsored slots. The provider can resume it later."
                  : "Ending will permanently stop this campaign. It cannot be restarted."}
              </DialogDescription>
            </DialogHeader>
            {moderateDialog && (
              <div className="space-y-3">
                <div className="bg-muted rounded-lg p-3 text-sm">
                  <p><strong>Provider:</strong> {moderateDialog.provider_name}</p>
                  <p><strong>Model:</strong> {MODEL_LABELS[moderateDialog.billing_model] ?? moderateDialog.billing_model}</p>
                  <p><strong>Budget:</strong> {fmt(moderateDialog.budget)} · Spent: {fmt(moderateDialog.spent)}</p>
                </div>
                <div>
                  <Label>Reason (optional)</Label>
                  <Input
                    value={moderateReason}
                    onChange={(e) => setModerateReason(e.target.value)}
                    placeholder="e.g. Policy violation, billing issue..."
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setModerateDialog(null)}>Cancel</Button>
              <Button
                variant={moderateAction === "ended" ? "destructive" : "default"}
                onClick={handleModerate}
                disabled={moderating}
              >
                {moderating ? "Processing..." : moderateAction === "paused" ? "Pause Campaign" : "End Campaign"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
