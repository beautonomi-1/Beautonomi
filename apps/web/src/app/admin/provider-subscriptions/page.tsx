"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ExternalLink, CreditCard } from "lucide-react";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher } from "@/lib/http/fetcher";
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
}

export default function ProviderSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<ProviderSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const response = await fetcher.get<{ data: ProviderSubscription[] }>(
        `/api/admin/provider-subscriptions?${params.toString()}`
      );
      setSubscriptions(response.data || []);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      toast.error("Failed to load provider subscriptions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filter changes

  const filteredSubscriptions = subscriptions.filter((sub) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        sub.providers?.business_name?.toLowerCase().includes(query) ||
        sub.paystack_subscription_code?.toLowerCase().includes(query) ||
        sub.subscription_plans?.name?.toLowerCase().includes(query)
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
      <RoleGuard allowedRoles={["superadmin"]}>
        <LoadingTimeout loadingMessage="Loading provider subscriptions..." />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Provider Subscriptions</h1>
            <p className="text-gray-600 mt-1">
              View and manage all provider subscription plans
            </p>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
