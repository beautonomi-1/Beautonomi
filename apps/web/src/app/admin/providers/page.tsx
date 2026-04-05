"use client";

import React, { useState, useEffect, useCallback } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";
import BulkActionsBar from "@/components/admin/BulkActionsBar";
import { Checkbox } from "@/components/ui/checkbox";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import Link from "next/link";
import { VirtualList } from "@/components/ui/virtual-list";

interface Provider {
  id: string;
  business_name: string;
  slug: string;
  business_type: string;
  status: "pending" | "active" | "suspended" | "rejected";
  verification_status: "unverified" | "pending" | "verified";
  owner_name: string;
  owner_email: string;
  owner_phone?: string;
  city: string;
  country: string;
  created_at: string;
  rating?: number;
  review_count?: number;
}

export default function AdminProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState<Set<string>>(new Set());
  const [isSelectAll, setIsSelectAll] = useState(false);

  useEffect(() => {
    loadProviders();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filter changes

  const loadProviders = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await fetcher.get<{ data?: Provider[] }>(
        `/api/admin/providers?${params.toString()}`
      );
      setProviders(response.data ?? []);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load providers";
      setError(errorMessage);
      console.error("Error loading providers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (providerId: string, newStatus: string) => {
    try {
      await fetcher.patch(`/api/admin/providers/${providerId}/status`, {
        status: newStatus,
      });
      toast.success("Provider status updated");
      loadProviders();
    } catch {
      toast.error("Failed to update provider status");
    }
  };

  const handleVerification = async (providerId: string, verified: boolean) => {
    try {
      await fetcher.patch(`/api/admin/providers/${providerId}/verify`, {
        verified,
      });
      toast.success(verified ? "Provider verified" : "Verification removed");
      loadProviders();
    } catch {
      toast.error("Failed to update verification");
    }
  };

  const handleSelectProvider = (providerId: string, checked: boolean) => {
    const newSelected = new Set(selectedProviderIds);
    if (checked) {
      newSelected.add(providerId);
    } else {
      newSelected.delete(providerId);
    }
    setSelectedProviderIds(newSelected);
    setIsSelectAll(newSelected.size === filteredProviders.length && filteredProviders.length > 0);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredProviders.map((p) => p.id));
      setSelectedProviderIds(allIds);
      setIsSelectAll(true);
    } else {
      setSelectedProviderIds(new Set());
      setIsSelectAll(false);
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedProviderIds.size === 0) {
      toast.error("Please select at least one provider");
      return;
    }

    const providerIds = Array.from(selectedProviderIds);

    try {
      if (!confirm(`Perform ${action} on ${providerIds.length} provider(s)?`)) return;

      await fetcher.post("/api/admin/providers/bulk", {
        provider_ids: providerIds,
        action: action === "approve" ? "approve" : action === "suspend" ? "suspend" : action === "reject" ? "reject" : action === "verify" ? "verify" : "unverify",
      });

      toast.success(`${providerIds.length} provider(s) updated`);
      setSelectedProviderIds(new Set());
      setIsSelectAll(false);
      loadProviders();
    } catch (error: any) {
      toast.error(error.message || `Failed to perform bulk ${action}`);
    }
  };

  const filteredProviders = providers.filter((provider) => {
    const matchesSearch =
      (provider.business_name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (provider.owner_name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (provider.owner_email ?? "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const groupedProviders = {
    pending: filteredProviders.filter((p) => p.status === "pending"),
    active: filteredProviders.filter((p) => p.status === "active"),
    suspended: filteredProviders.filter((p) => p.status === "suspended"),
    rejected: filteredProviders.filter((p) => p.status === "rejected"),
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading providers..." />
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <div
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
          >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tighter mb-2 text-gray-900">Provider Management</h1>
                <p className="text-sm md:text-base font-light text-gray-600">Manage provider accounts and approvals</p>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="mb-6 space-y-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search by business name, owner name, or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 backdrop-blur-xl bg-white/80 border border-white/40 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="border-white/40 backdrop-blur-xl bg-white/80 hover:bg-white/90 rounded-xl"
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                </Button>
              </div>

              {showFilters && (
                <div
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4"
                >
                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-700">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full p-2 border border-white/40 rounded-lg backdrop-blur-sm bg-white/60 focus:border-[#FF0077] focus:ring-[#FF0077]"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

        {/* Bulk Actions Bar */}
        <BulkActionsBar
          selectedCount={selectedProviderIds.size}
          onClearSelection={() => {
            setSelectedProviderIds(new Set());
            setIsSelectAll(false);
          }}
          onBulkAction={handleBulkAction}
          actions={[
            { id: "approve", label: "Approve", icon: CheckCircle2, variant: "default" as const },
            { id: "suspend", label: "Suspend", icon: XCircle, variant: "outline" as const },
            { id: "reject", label: "Reject", icon: XCircle, variant: "destructive" as const },
            { id: "verify", label: "Verify", icon: CheckCircle2, variant: "default" as const },
            { id: "unverify", label: "Unverify", icon: XCircle, variant: "outline" as const },
          ]}
        />

        {/* Providers Tabs */}
        {error ? (
          <EmptyState
            title="Failed to load providers"
            description={error}
            action={{
              label: "Retry",
              onClick: loadProviders,
            }}
          />
        ) : (
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="mb-6 backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-1 shadow-lg">
                <TabsTrigger value="pending" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  Pending ({groupedProviders.pending.length})
                </TabsTrigger>
                <TabsTrigger value="active" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  Active ({groupedProviders.active.length})
                </TabsTrigger>
                <TabsTrigger value="suspended" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  Suspended ({groupedProviders.suspended.length})
                </TabsTrigger>
                <TabsTrigger value="rejected" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#FF0077] data-[state=active]:to-[#E6006A] data-[state=active]:text-white rounded-lg transition-all">
                  Rejected ({groupedProviders.rejected.length})
                </TabsTrigger>
              </TabsList>

            <TabsContent value="pending">
              <ProvidersList
                providers={groupedProviders.pending}
                onStatusChange={handleStatusChange}
                onVerification={handleVerification}
                selectedIds={selectedProviderIds}
                onSelect={handleSelectProvider}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="active">
              <ProvidersList
                providers={groupedProviders.active}
                onStatusChange={handleStatusChange}
                onVerification={handleVerification}
                selectedIds={selectedProviderIds}
                onSelect={handleSelectProvider}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="suspended">
              <ProvidersList
                providers={groupedProviders.suspended}
                onStatusChange={handleStatusChange}
                onVerification={handleVerification}
                selectedIds={selectedProviderIds}
                onSelect={handleSelectProvider}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
            <TabsContent value="rejected">
              <ProvidersList
                providers={groupedProviders.rejected}
                onStatusChange={handleStatusChange}
                onVerification={handleVerification}
                selectedIds={selectedProviderIds}
                onSelect={handleSelectProvider}
                isSelectAll={isSelectAll}
                onSelectAll={handleSelectAll}
              />
            </TabsContent>
          </Tabs>
        )}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

const PROVIDER_CARD_HEIGHT = 200;

function ProvidersList({
  providers,
  onStatusChange,
  onVerification,
  selectedIds,
  onSelect,
  isSelectAll,
  onSelectAll,
}: {
  providers: Provider[];
  onStatusChange: (id: string, status: string) => void;
  onVerification: (id: string, verified: boolean) => void;
  selectedIds: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  isSelectAll: boolean;
  onSelectAll: (checked: boolean) => void;
}) {
  void isSelectAll;
  void onSelectAll;

  const renderProvider = useCallback(
    (provider: Provider) => (
      <ProviderCard
        key={provider.id}
        provider={provider}
        onStatusChange={onStatusChange}
        onVerification={onVerification}
        selected={selectedIds.has(provider.id)}
        onSelect={(checked) => onSelect(provider.id, checked)}
      />
    ),
    [onStatusChange, onVerification, selectedIds, onSelect],
  );

  if (providers.length === 0) {
    return (
      <EmptyState
        title="No providers found"
        description="No providers match these criteria"
      />
    );
  }

  return (
    <VirtualList
      items={providers}
      itemHeight={PROVIDER_CARD_HEIGHT}
      renderItem={renderProvider}
      containerHeight={Math.min(providers.length * PROVIDER_CARD_HEIGHT, 800)}
      overscan={5}
      itemClassName="pb-4"
    />
  );
}

function ProviderCard({
  provider,
  onStatusChange,
  onVerification,
  selected,
  onSelect,
}: {
  provider: Provider;
  onStatusChange: (id: string, status: string) => void;
  onVerification: (id: string, verified: boolean) => void;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const getStatusColor = () => {
    switch (provider.status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "suspended":
        return "bg-red-100 text-red-800";
      case "rejected":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getVerificationColor = () => {
    switch (provider.verification_status) {
      case "verified":
        return "bg-blue-100 text-blue-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div
      className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onCheckedChange={onSelect} />
        </div>
        <div className="flex-1">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className="p-2 bg-pink-50 rounded-lg border border-pink-100">
                  <Building2 className="w-5 h-5 text-[#FF0077]" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-gray-900">{provider.business_name}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor()}`}>
                  {provider.status}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getVerificationColor()}`}>
                  {provider.verification_status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600 mb-4">
                <div>
                  <p className="font-medium text-gray-900 mb-1">Owner</p>
                  <p>{provider.owner_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>{provider.owner_email}</span>
                </div>
                {provider.owner_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    <span>{provider.owner_phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{provider.city}, {provider.country}</span>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm">
                {provider.rating && (
                  <div>
                    <span className="font-medium">Rating: </span>
                    <span>{provider.rating.toFixed(1)} ⭐</span>
                  </div>
                )}
                {provider.review_count !== undefined && (
                  <div>
                    <span className="font-medium">Reviews: </span>
                    <span>{provider.review_count}</span>
                  </div>
                )}
                <div>
                  <span className="font-medium">Type: </span>
                  <span className="capitalize">{provider.business_type}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {provider.status === "pending" && (
                <>
                  <Button
                    onClick={() => onStatusChange(provider.id, "active")}
                    className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-600 text-white shadow-lg"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => onStatusChange(provider.id, "rejected")}
                    className="shadow-lg"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    Reject
                  </Button>
                </>
              )}
              {provider.status === "active" && (
                <>
                  <Button
                    variant="destructive"
                    onClick={() => onStatusChange(provider.id, "suspended")}
                    className="shadow-lg"
                  >
                    Suspend
                  </Button>
                  {provider.verification_status !== "verified" ? (
                    <Button
                      variant="outline"
                      onClick={() => onVerification(provider.id, true)}
                      className="border-[#FF0077] text-[#FF0077] hover:bg-pink-50"
                    >
                      Verify
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => onVerification(provider.id, false)}
                      className="border-gray-400 text-gray-600 hover:bg-gray-50"
                    >
                      Unverify
                    </Button>
                  )}
                </>
              )}
              {provider.status === "suspended" && (
                <Button
                  onClick={() => onStatusChange(provider.id, "active")}
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-600 text-white shadow-lg"
                >
                  Reactivate
                </Button>
              )}
              <Link href={`/admin/providers/${provider.id}`}>
                <Button variant="outline" className="mt-2 border-white/40 backdrop-blur-sm bg-white/60 hover:bg-white/80">
                  View Details
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
