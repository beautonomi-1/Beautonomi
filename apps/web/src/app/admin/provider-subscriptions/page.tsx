"use client";

import React, { useState, useEffect, useCallback } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, CreditCard, Pencil } from "lucide-react";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import Link from "next/link";

interface ProviderSubscription {
  id: string;
  provider_id: string;
  plan_id: string;
  status: string;
  paystack_subscription_code: string | null;
  paystack_customer_code: string | null;
  billing_period: string;
  auto_renew: boolean;
  next_payment_date: string | null;
  started_at: string;
  expires_at: string | null;
  providers: {
    id: string;
    business_name: string;
    slug: string;
    status: string;
  };
  subscription_plans: {
    id: string;
    name: string;
    price_monthly: number | null;
    price_yearly: number | null;
  } | null;
  paystack_sync_pending?: boolean | null;
  paystack_sync_note?: string | null;
}

interface SubscriptionPlanOption {
  id: string;
  name: string;
  is_free?: boolean | null;
}

export default function ProviderSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<ProviderSubscription[]>([]);
  const [listMeta, setListMeta] = useState<{ scope?: string; tenant_id?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planOptions, setPlanOptions] = useState<SubscriptionPlanOption[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editSub, setEditSub] = useState<ProviderSubscription | null>(null);
  const [editPlanId, setEditPlanId] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editBilling, setEditBilling] = useState<string>("monthly");
  const [editAutoRenew, setEditAutoRenew] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPlanOptions = useCallback(async () => {
    try {
      const res = await fetcher.get<{
        data: { plans?: SubscriptionPlanOption[] };
      }>("/api/admin/plans", { staleTimeMs: 0 });
      const body = res.data as { plans?: SubscriptionPlanOption[] };
      setPlanOptions(Array.isArray(body?.plans) ? body.plans : []);
    } catch {
      setPlanOptions([]);
    }
  }, []);

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const response = await fetcher.get<{
        data:
          | ProviderSubscription[]
          | {
              subscriptions?: ProviderSubscription[];
              meta?: { scope?: string; tenant_id?: string | null };
            };
      }>(`/api/admin/provider-subscriptions?${params.toString()}`, { staleTimeMs: 0 });
      const raw = response.data;
      if (Array.isArray(raw)) {
        setSubscriptions(raw);
        setListMeta(null);
      } else {
        setSubscriptions(raw?.subscriptions ?? []);
        setListMeta(raw?.meta ?? null);
      }
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      toast.error("Failed to load provider subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubscriptions();
    void loadPlanOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch list when status filter changes
  }, [statusFilter]);

  const openEdit = (sub: ProviderSubscription) => {
    setEditSub(sub);
    setEditPlanId(sub.plan_id);
    setEditStatus(sub.status || "active");
    setEditBilling(sub.billing_period || "monthly");
    setEditAutoRenew(sub.auto_renew !== false);
    setEditOpen(true);
    void loadPlanOptions();
  };

  const saveEdit = async () => {
    if (!editSub) return;
    setSaving(true);
    try {
      await fetcher.patch<{ data: ProviderSubscription }>(`/api/admin/provider-subscriptions/${editSub.id}`, {
        plan_id: editPlanId,
        status: editStatus,
        billing_period: editBilling === "none" ? null : editBilling,
        auto_renew: editAutoRenew,
      });
      toast.success("Subscription updated");
      setEditOpen(false);
      setEditSub(null);
      await fetchSubscriptions();
      await loadPlanOptions();
    } catch (e) {
      const msg =
        e instanceof FetchError ? e.message : e instanceof Error ? e.message : "Failed to save";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredSubscriptions = subscriptions.filter((sub) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        (sub.providers?.business_name ?? "").toLowerCase().includes(query) ||
        (sub.paystack_subscription_code ?? "").toLowerCase().includes(query) ||
        (sub.subscription_plans?.name ?? "").toLowerCase().includes(query)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
      active: { label: "Active", variant: "default" },
      trialing: { label: "Trialing", variant: "default" },
      cancelled: { label: "Cancelled", variant: "secondary" },
      past_due: { label: "Past Due", variant: "destructive" },
      inactive: { label: "Inactive", variant: "secondary" },
    };
    const statusInfo = statusMap[status] || { label: status, variant: "secondary" };
    return (
      <Badge variant={statusInfo.variant} className={
        status === "active" ? "bg-green-100 text-green-800" :
        status === "past_due" ? "bg-red-100 text-red-800" :
        "bg-gray-100 text-gray-800"
      }>
        {statusInfo.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
        <LoadingTimeout loadingMessage="Loading provider subscriptions..." />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Provider Subscriptions</h1>
            <p className="text-gray-600 mt-1">
              View and manage all provider subscription plans
            </p>
            {listMeta?.scope ? (
              <p className="text-xs text-muted-foreground mt-1">
                List scope: <strong>{listMeta.scope}</strong>
                {listMeta.tenant_id ? (
                  <>
                    {" "}
                    · tenant <code className="text-[10px] bg-muted px-1 rounded">{listMeta.tenant_id}</code>
                  </>
                ) : null}
                . Changing a paid plan cancels the existing Paystack subscription (see sync note on the row).
              </p>
            ) : null}
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by business name, Paystack code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="cancelled">Cancelled</option>
            <option value="past_due">Past Due</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {filteredSubscriptions.length === 0 ? (
          <EmptyState
            title="No subscriptions found"
            description={
              searchQuery || statusFilter !== "all"
                ? "Try adjusting your search or filters"
                : "No provider subscriptions yet"
            }
          />
        ) : (
          <div className="bg-white rounded-lg border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Paystack Code</TableHead>
                  <TableHead>Next Payment</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscriptions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>
                      <Link
                        href={`/admin/providers/${sub.provider_id}`}
                        className="text-[#FF0077] hover:underline font-medium"
                      >
                        {sub.providers?.business_name || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {sub.subscription_plans?.name || "Unknown Plan"}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(sub.status)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{sub.billing_period}</span>
                      {sub.auto_renew && (
                        <Badge variant="outline" className="ml-2 text-xs">Auto-renew</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {sub.paystack_subscription_code ? (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <CreditCard className="w-3 h-3" />
                          {sub.paystack_subscription_code.slice(0, 12)}...
                        </div>
                      ) : (
                        <span className="text-gray-400 text-sm">Not synced</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sub.next_payment_date ? (
                        <span className="text-sm">
                          {new Date(sub.next_payment_date).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {new Date(sub.started_at).toLocaleDateString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Button type="button" variant="outline" size="sm" onClick={() => openEdit(sub)}>
                          <Pencil className="w-3 h-3 mr-1" aria-hidden />
                          Edit
                        </Button>
                        {sub.paystack_subscription_code && (
                          <a
                            href={`https://dashboard.paystack.com/#/subscriptions/${sub.paystack_subscription_code}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#FF0077] hover:underline text-sm flex items-center gap-1"
                          >
                            View in Paystack
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {sub.paystack_sync_pending ? (
                          <span className="text-[10px] text-amber-700 max-w-[200px] leading-tight">
                            Billing sync pending
                            {sub.paystack_sync_note ? `: ${sub.paystack_sync_note}` : ""}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit provider subscription</DialogTitle>
              <DialogDescription>
                {editSub?.providers?.business_name ?? "Provider"} — plan changes may cancel Paystack billing at the
                previous rate; the provider may need to subscribe again for paid tiers.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select value={editPlanId} onValueChange={setEditPlanId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {planOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.is_free ? " (free)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {planOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Could not load plans. Open /admin/plans and retry.</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="trialing">trialing</SelectItem>
                    <SelectItem value="past_due">past_due</SelectItem>
                    <SelectItem value="cancelled">cancelled</SelectItem>
                    <SelectItem value="expired">expired</SelectItem>
                    <SelectItem value="inactive">inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Billing period</Label>
                <Select value={editBilling} onValueChange={setEditBilling}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">monthly</SelectItem>
                    <SelectItem value="yearly">yearly</SelectItem>
                    <SelectItem value="none">none / null</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="ar">Auto-renew</Label>
                  <p className="text-xs text-muted-foreground">When off, renewals should not be expected.</p>
                </div>
                <Switch id="ar" checked={editAutoRenew} onCheckedChange={setEditAutoRenew} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveEdit()} disabled={saving || !editPlanId}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
