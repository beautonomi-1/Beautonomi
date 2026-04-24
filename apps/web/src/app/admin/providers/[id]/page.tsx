"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Mail,
  Phone,
  MapPin,
  Calendar,
  DollarSign,
  Star,
  CheckCircle2,
  XCircle,
  Edit,
  Save,
  X,
  ArrowLeft,
  CreditCard,
  Building,
  Trash2,
  Loader2,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { useReportCurrency } from "@/app/provider/reports/utils/use-report-export-currency";
import { CompliancePurgeProviderDialog } from "@/components/admin/CompliancePurgeProviderDialog";

interface Provider {
  id: string;
  business_name: string;
  slug: string;
  business_type: string;
  status: string;
  is_verified: boolean;
  email: string;
  billing_email?: string | null;
  phone: string;
  description: string;
  owner: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    avatar_url: string;
  };
  locations: Array<{
    id: string;
    name: string;
    address_line1: string;
    city: string;
    country: string;
    is_primary: boolean;
  }>;
  staff: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
  }>;
  offerings: Array<{
    id: string;
    title: string;
    name: string;
    price: number;
    duration_minutes: number;
    is_active: boolean;
  }>;
  stats: {
    booking_count: number;
    review_count: number;
    average_rating: number;
  };
  created_at: string;
  updated_at: string;
}

export default function ProviderDetailPage() {
  const { format: fmt } = useReportCurrency();
  const params = useParams();
  const router = useRouter();
  const providerId = params.id as string;
  
  const [provider, setProvider] = useState<Provider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Provider>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [statusAction, setStatusAction] = useState<"approve" | "suspend" | "reject" | "reactivate">("approve");
  const [statusReason, setStatusReason] = useState("");
  const [compliancePurgeOpen, setCompliancePurgeOpen] = useState(false);

  const [payoutAccounts, setPayoutAccounts] = useState<
    Array<{
      id: string;
      account_name: string;
      account_number_last4: string;
      bank_name: string | null;
      bank_code: string;
      currency: string;
      active: boolean;
    }>
  >([]);

  useEffect(() => {
    if (providerId) {
      loadProvider();
    }
  }, [providerId]); // eslint-disable-line react-hooks/exhaustive-deps -- load when providerId changes

  const loadPayoutAccounts = async (id: string) => {
    try {
      const res = await fetcher.get<{ data: typeof payoutAccounts }>(
        `/api/admin/providers/${id}/payout-accounts`
      );
      setPayoutAccounts(res.data || []);
    } catch (err) {
      console.error("Failed to load payout accounts:", err);
      toast.error("Could not load payout accounts");
      setPayoutAccounts([]);
    }
  };

  const loadProvider = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: Provider }>(
        `/api/admin/providers/${providerId}`
      );
      setProvider(response.data);
      setEditData(response.data);
      await loadPayoutAccounts(response.data.id);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load provider";
      setError(errorMessage);
      // Don't log expected 404 (e.g. invalid id or deleted provider) as an error
      const isNotFound =
        err instanceof FetchError &&
        (err.status === 404 || err.message === "Provider not found");
      if (!isNotFound) {
        console.error("Error loading provider:", err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!provider) return;

    try {
      setIsSaving(true);

      await fetcher.patch(`/api/admin/providers/${provider.id}`, editData);
      
      toast.success("Provider updated successfully");
      setIsEditing(false);
      loadProvider();
    } catch (error: any) {
      toast.error(error.message || "Failed to update provider");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (action: "approve" | "suspend" | "reject" | "reactivate") => {
    if (!provider) return;

    setStatusAction(action);
    setShowStatusDialog(true);
  };

  const confirmStatusChange = async () => {
    if (!provider) return;

    try {
      let newStatus = provider.status;
      
      switch (statusAction) {
        case "approve":
          newStatus = "active";
          break;
        case "suspend":
          newStatus = "suspended";
          break;
        case "reject":
          newStatus = "rejected";
          break;
        case "reactivate":
          newStatus = "active";
          break;
      }

      await fetcher.patch(`/api/admin/providers/${provider.id}/status`, {
        status: newStatus,
        reason: statusReason || undefined,
      });

      const actionLabels: Record<string, string> = {
        approve: "approved",
        suspend: "suspended",
        reject: "rejected",
        reactivate: "reactivated",
      };
      toast.success(`Provider ${actionLabels[statusAction || ""] || "updated"} successfully`);
      setShowStatusDialog(false);
      setStatusReason("");
      loadProvider();
    } catch (error: any) {
      toast.error(error.message || `Failed to ${statusAction} provider`);
    }
  };

  const handleVerification = async (verified: boolean) => {
    if (!provider) return;

    try {
      await fetcher.patch(`/api/admin/providers/${provider.id}/verify`, {
        verified,
      });

      toast.success(verified ? "Provider verified" : "Verification removed");
      loadProvider();
    } catch (error: any) {
      toast.error(error.message || "Failed to update verification");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "pending":
      case "pending_approval":
        return "bg-yellow-100 text-yellow-800";
      case "suspended":
        return "bg-red-100 text-red-800";
      case "rejected":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading provider details..." />
        </div>
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <EmptyState
            title="Failed to load provider"
            description={error || "Provider not found"}
            action={{
              label: "Back to Providers",
              onClick: () => router.push("/admin/providers"),
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          {/* Header */}
          <div className="mb-6">
            <Link href="/admin/providers">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Providers
              </Button>
            </Link>

            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-3xl font-semibold text-gray-900">
                    {provider.business_name}
                  </h1>
                  <Badge className={getStatusColor(provider.status)}>
                    {provider.status}
                  </Badge>
                  {provider.is_verified && (
                    <Badge className="bg-blue-100 text-blue-800">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
                <p className="text-gray-600">{provider.business_type}</p>
              </div>

              <div className="flex gap-2">
                {!isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    {provider.status === "pending" || provider.status === "pending_approval" ? (
                      <>
                        <Button
                          onClick={() => handleStatusChange("approve")}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleStatusChange("reject")}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Reject
                        </Button>
                      </>
                    ) : provider.status === "active" ? (
                      <>
                        <Button
                          variant="destructive"
                          onClick={() => handleStatusChange("suspend")}
                        >
                          Suspend
                        </Button>
                        {!provider.is_verified && (
                          <Button
                            variant="outline"
                            onClick={() => handleVerification(true)}
                          >
                            Verify
                          </Button>
                        )}
                      </>
                    ) : provider.status === "suspended" ? (
                      <Button
                        onClick={() => handleStatusChange("reactivate")}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Reactivate
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        setEditData(provider);
                      }}
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="staff">
                Staff ({provider.staff?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="services">
                Services ({provider.offerings?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="gamification">Badges & Points</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Info */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Business Information */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border rounded-lg p-6"
                  >
                    <h2 className="text-xl font-semibold mb-4">Business Information</h2>
                    
                    {isEditing ? (
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="business_name">Business Name</Label>
                          <Input
                            id="business_name"
                            value={editData.business_name || ""}
                            onChange={(e) =>
                              setEditData({ ...editData, business_name: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="description">Description</Label>
                          <Textarea
                            id="description"
                            value={editData.description || ""}
                            onChange={(e) =>
                              setEditData({ ...editData, description: e.target.value })
                            }
                            rows={4}
                          />
                        </div>
                        <div>
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            value={editData.email || ""}
                            onChange={(e) =>
                              setEditData({ ...editData, email: e.target.value })
                            }
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone">Phone</Label>
                          <Input
                            id="phone"
                            value={editData.phone || ""}
                            onChange={(e) =>
                              setEditData({ ...editData, phone: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Business Name</p>
                          <p className="font-medium">{provider.business_name}</p>
                        </div>
                        {provider.description && (
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Description</p>
                            <p>{provider.description}</p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Email</p>
                            <div className="flex items-center gap-2">
                              <Mail className="w-4 h-4 text-gray-400" />
                              <p>{provider.email}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 mb-1">Phone</p>
                            <div className="flex items-center gap-2">
                              <Phone className="w-4 h-4 text-gray-400" />
                              <p>{provider.phone || "N/A"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* Owner Information */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white border rounded-lg p-6"
                  >
                    <h2 className="text-xl font-semibold mb-4">Owner Information</h2>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Name</p>
                        <p className="font-medium">{provider.owner?.full_name || "N/A"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Email</p>
                          <p>{provider.owner?.email || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500 mb-1">Phone</p>
                          <p>{provider.owner?.phone || "N/A"}</p>
                        </div>
                      </div>
                      <Link href={`/admin/users/${provider.owner?.id}`}>
                        <Button variant="outline" size="sm">
                          View Owner Profile
                        </Button>
                      </Link>
                    </div>
                  </motion.div>

                  {/* Locations */}
                  {provider.locations && provider.locations.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-white border rounded-lg p-6"
                    >
                      <h2 className="text-xl font-semibold mb-4">Locations</h2>
                      <div className="space-y-3">
                        {provider.locations.map((location) => (
                          <div
                            key={location.id}
                            className="flex items-start gap-3 p-3 border rounded-lg"
                          >
                            <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                            <div className="flex-1">
                              <p className="font-medium">{location.name}</p>
                              <p className="text-sm text-gray-600">
                                {location.address_line1}, {location.city}, {location.country}
                              </p>
                              {location.is_primary && (
                                <Badge className="mt-1 bg-blue-100 text-blue-800">
                                  Primary
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Sidebar Stats */}
                <div className="space-y-6">
                  {/* Stats */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border rounded-lg p-6"
                  >
                    <h2 className="text-xl font-semibold mb-4">Statistics</h2>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Total Bookings</p>
                        <p className="text-2xl font-semibold">
                          {provider.stats?.booking_count || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Reviews</p>
                        <div className="flex items-center gap-2">
                          <Star className="w-5 h-5 text-yellow-500" />
                          <p className="text-2xl font-semibold">
                            {provider.stats?.average_rating?.toFixed(1) || "0.0"}
                          </p>
                          <p className="text-sm text-gray-500">
                            ({provider.stats?.review_count || 0} reviews)
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Staff Members</p>
                        <p className="text-2xl font-semibold">
                          {provider.staff?.length || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500 mb-1">Services</p>
                        <p className="text-2xl font-semibold">
                          {provider.offerings?.length || 0}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  {/* Quick Actions */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white border rounded-lg p-6"
                  >
                    <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
                    <div className="space-y-2">
                      <Link href={`/admin/bookings?provider_id=${provider.id}`}>
                        <Button variant="outline" className="w-full justify-start">
                          <Calendar className="w-4 h-4 mr-2" />
                          View Bookings
                        </Button>
                      </Link>
                      <Link href={`/admin/reviews?provider_id=${provider.id}`}>
                        <Button variant="outline" className="w-full justify-start">
                          <Star className="w-4 h-4 mr-2" />
                          View Reviews
                        </Button>
                      </Link>
                      <Link href={`/admin/finance?provider_id=${provider.id}`}>
                        <Button variant="outline" className="w-full justify-start">
                          <DollarSign className="w-4 h-4 mr-2" />
                          View Finance
                        </Button>
                      </Link>
                      <Link href={`/admin/payouts?provider_id=${provider.id}`}>
                        <Button variant="outline" className="w-full justify-start">
                          <CreditCard className="w-4 h-4 mr-2" />
                          View Payouts
                        </Button>
                      </Link>
                    </div>
                  </motion.div>

                  {/* Payout Accounts (Bank Accounts) */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="bg-white border rounded-lg p-6"
                  >
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                      <Building className="w-5 h-5 text-gray-500" />
                      Payout Accounts
                    </h2>
                    {payoutAccounts.length > 0 ? (
                      <div className="space-y-3">
                        {payoutAccounts.map((acct) => (
                          <div
                            key={acct.id}
                            className={`flex items-center justify-between p-4 border rounded-lg ${
                              acct.active ? "border-green-200 bg-green-50/50" : "border-gray-200 bg-gray-50"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <CreditCard className="w-5 h-5 text-gray-400" />
                              <div>
                                <p className="font-medium text-sm">{acct.account_name}</p>
                                <p className="text-xs text-gray-500">
                                  {acct.bank_name || "Bank"} •••• {acct.account_number_last4} • {acct.currency}
                                </p>
                              </div>
                            </div>
                            <Badge
                              className={
                                acct.active
                                  ? "bg-green-100 text-green-800 border-green-300"
                                  : "bg-gray-100 text-gray-600"
                              }
                            >
                              {acct.active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No bank accounts added for payouts</p>
                    )}
                    <p className="text-xs text-gray-400 mt-3">
                      Provider manages these in Settings → Sales → Payout Accounts
                    </p>
                  </motion.div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings">
              <div className="bg-white border rounded-lg p-6 space-y-6">
                <h2 className="text-xl font-semibold">Provider Settings</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Provider ID</p>
                    <p className="font-mono text-sm break-all">{provider.id}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Slug</p>
                    <p className="font-mono text-sm">{provider.slug}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Business Type</p>
                    <p className="text-sm font-medium">{provider.business_type}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Created</p>
                    <p className="text-sm">{new Date(provider.created_at).toLocaleDateString("en-ZA", { dateStyle: "long" })}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Last Updated</p>
                    <p className="text-sm">{new Date(provider.updated_at).toLocaleDateString("en-ZA", { dateStyle: "long" })}</p>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <p className="text-xs text-gray-400 mb-1">Verification</p>
                    <Badge className={provider.is_verified ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}>
                      {provider.is_verified ? "Verified" : "Not Verified"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Provider-managed settings (service config, calendar, integrations) are controlled by the provider from their own dashboard. Admin can override status and verification above.</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="staff">
              <div className="bg-white border rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Staff Members</h2>
                {provider.staff && provider.staff.length > 0 ? (
                  <div className="space-y-3">
                    {provider.staff.map((staff) => (
                      <div
                        key={staff.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{staff.name}</p>
                          <p className="text-sm text-gray-500">{staff.email}</p>
                          <Badge className="mt-1">{staff.role}</Badge>
                        </div>
                        <Badge
                          className={staff.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                        >
                          {staff.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">No staff members found</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="services">
              <div className="bg-white border rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Services</h2>
                {provider.offerings && provider.offerings.length > 0 ? (
                  <div className="space-y-3">
                    {provider.offerings.map((service) => (
                      <div
                        key={service.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{service.title || service.name}</p>
                          <p className="text-sm text-gray-500">
                            {service.duration_minutes} min • {fmt(Number(service.price ?? 0))}
                          </p>
                        </div>
                        <Badge
                          className={service.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                        >
                          {service.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600">No services found</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="analytics">
              <div className="bg-white border rounded-lg p-6 space-y-6">
                <h2 className="text-xl font-semibold">Provider Analytics</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-3xl font-bold text-gray-900">{provider.stats?.booking_count ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-1">Total Bookings</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-3xl font-bold text-yellow-600">{provider.stats?.average_rating?.toFixed(1) ?? "0.0"}</p>
                    <p className="text-xs text-gray-500 mt-1">Avg Rating</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-3xl font-bold text-gray-900">{provider.stats?.review_count ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-1">Reviews</p>
                  </div>
                  <div className="p-4 border rounded-lg text-center">
                    <p className="text-3xl font-bold text-gray-900">{provider.staff?.length ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-1">Staff Members</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Link href={`/admin/bookings?provider_id=${provider.id}`} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors block">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <p className="font-medium text-sm">Booking History</p>
                    </div>
                    <p className="text-xs text-gray-500">View all bookings for this provider with full search and filters</p>
                  </Link>
                  <Link href={`/admin/finance?provider_id=${provider.id}`} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors block">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-gray-500" />
                      <p className="font-medium text-sm">Financial Reports</p>
                    </div>
                    <p className="text-xs text-gray-500">Revenue, commissions, payouts, and transaction history</p>
                  </Link>
                  <Link href={`/admin/reviews?provider_id=${provider.id}`} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors block">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="w-4 h-4 text-gray-500" />
                      <p className="font-medium text-sm">Reviews & Ratings</p>
                    </div>
                    <p className="text-xs text-gray-500">All reviews from customers with moderation tools</p>
                  </Link>
                  <Link href={`/admin/payouts?provider_id=${provider.id}`} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors block">
                    <div className="flex items-center gap-2 mb-1">
                      <CreditCard className="w-4 h-4 text-gray-500" />
                      <p className="font-medium text-sm">Payout History</p>
                    </div>
                    <p className="text-xs text-gray-500">All payout requests and their statuses</p>
                  </Link>
                </div>
              </div>
            </TabsContent>

            {/* Gamification / Badges & Points Tab */}
            <TabsContent value="gamification">
              <GamificationSection providerId={provider.id} />
            </TabsContent>

            {/* Reports & Trust Tab */}
            <TabsContent value="reports">
              <ProviderReportsSection providerId={provider.id} ownerUserId={provider.owner?.id} />
            </TabsContent>
          </Tabs>

          <div className="mt-10 rounded-xl border-2 border-red-200 bg-red-50/50 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-red-900">Compliance: purge provider organization</h2>
                <p className="mt-2 max-w-3xl text-sm text-red-900/85">
                  Permanently removes this provider&apos;s business data (cascading bookings, catalogue,
                  locations, and related records), deletes every linked team member&apos;s login, then the
                  owner&apos;s account. Use only for regulatory requirements or verified data-subject /
                  erasure requests.{" "}
                  <span className="font-semibold">Cannot be undone.</span>
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                className="shrink-0"
                onClick={() => setCompliancePurgeOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Purge organization…
              </Button>
            </div>
          </div>
        </div>

        <CompliancePurgeProviderDialog
          open={compliancePurgeOpen}
          onOpenChange={setCompliancePurgeOpen}
          providerId={provider.id}
          providerEmail={provider.email}
          billingEmail={provider.billing_email ?? ""}
          ownerEmail={provider.owner?.email ?? ""}
          onComplete={() => router.push("/admin/providers")}
        />

        {/* Status Change Dialog */}
        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {statusAction === "approve" && "Approve Provider"}
                {statusAction === "suspend" && "Suspend Provider"}
                {statusAction === "reject" && "Reject Provider"}
                {statusAction === "reactivate" && "Reactivate Provider"}
              </DialogTitle>
              <DialogDescription>
                {statusAction === "approve" && "Are you sure you want to approve this provider?"}
                {statusAction === "suspend" && "Are you sure you want to suspend this provider?"}
                {statusAction === "reject" && "Are you sure you want to reject this provider?"}
                {statusAction === "reactivate" && "Are you sure you want to reactivate this provider?"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Enter reason for this action..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowStatusDialog(false);
                    setStatusReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmStatusChange}
                  variant={statusAction === "reject" || statusAction === "suspend" ? "destructive" : "default"}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}

interface GamificationData {
  total_points: number;
  current_badge: { id: string; name: string; slug: string; tier: number; icon: string | null; min_points: number; description: string | null } | null;
  badge_earned_at: string | null;
  all_badges: Array<{ id: string; name: string; slug: string; tier: number; icon: string | null; min_points: number; description: string | null; color: string | null }>;
  milestones: Array<{ id: string; milestone_type: string; achieved_at: string; metadata: Record<string, unknown> }>;
  recent_transactions: Array<{ id: string; points: number; source: string; description: string | null; created_at: string }>;
  progress_to_next_badge: { next_badge: { name: string; min_points: number }; points_needed: number; progress_percent: number } | null;
}

function GamificationSection({ providerId }: { providerId: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<GamificationData | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetcher.get<{ data: GamificationData }>(
          `/api/admin/providers/${providerId}/gamification`
        );
        setData(res.data);
      } catch {
        // Gamification may not be configured
      } finally {
        setLoading(false);
      }
    })();
  }, [providerId]);

  if (loading) return <LoadingTimeout loadingMessage="Loading gamification data..." />;

  if (!data || (data.total_points === 0 && data.recent_transactions.length === 0)) {
    return (
      <EmptyState
        title="No gamification data"
        description="This provider has not earned any points or badges yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Points & Badge Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Points</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{data.total_points.toLocaleString()}</p>
        </div>
        <div className="bg-white border rounded-lg p-5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Current Badge</p>
          {data.current_badge ? (
            <div className="mt-1">
              <p className="text-lg font-bold text-gray-900">{data.current_badge.icon || "🏅"} {data.current_badge.name}</p>
              <p className="text-xs text-gray-400">Tier {data.current_badge.tier}</p>
            </div>
          ) : (
            <p className="text-lg font-bold text-gray-300 mt-1">None yet</p>
          )}
        </div>
        <div className="bg-white border rounded-lg p-5 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Next Badge</p>
          {data.progress_to_next_badge ? (
            <div className="mt-1">
              <p className="text-sm font-semibold text-gray-700">{data.progress_to_next_badge.next_badge.name}</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${data.progress_to_next_badge.progress_percent}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">{data.progress_to_next_badge.points_needed} pts to go ({data.progress_to_next_badge.progress_percent}%)</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 mt-2">Highest tier reached</p>
          )}
        </div>
      </div>

      {/* All Badges */}
      {data.all_badges.length > 0 && (
        <div className="bg-white border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Badge Tiers</h3>
          <div className="flex flex-wrap gap-3">
            {data.all_badges.map((badge) => {
              const earned = data.current_badge && badge.tier <= data.current_badge.tier;
              return (
                <div
                  key={badge.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${earned ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200 opacity-50"}`}
                >
                  <span className="text-lg">{badge.icon || "🏅"}</span>
                  <div>
                    <p className="text-xs font-semibold">{badge.name}</p>
                    <p className="text-[10px] text-gray-400">{badge.min_points.toLocaleString()} pts</p>
                  </div>
                  {earned && <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 ml-1" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestones */}
      {data.milestones.length > 0 && (
        <div className="bg-white border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Milestones</h3>
          <div className="flex flex-wrap gap-2">
            {data.milestones.map((m) => (
              <Badge key={m.id} variant="secondary" className="text-xs">
                {m.milestone_type.replace(/_/g, " ")} · {new Date(m.achieved_at).toLocaleDateString()}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Recent Point Transactions */}
      {data.recent_transactions.length > 0 && (
        <div className="bg-white border rounded-lg p-5">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Recent Point Activity</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {data.recent_transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm">{tx.description || tx.source?.replace(/_/g, " ") || "Points"}</p>
                  <p className="text-xs text-gray-400">{new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
                <p className={`text-sm font-semibold ${tx.points >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {tx.points >= 0 ? "+" : ""}{tx.points}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ProviderReportSummary {
  total_reports: number;
  adverse_finding_count: number;
  unique_adverse_reporters: number;
  is_flagged: boolean;
  flag_threshold: number;
  pending_count: number;
}

interface ProviderReportRow {
  id: string;
  reporter_id: string;
  report_type: string;
  description: string;
  status: string;
  is_adverse_finding: boolean;
  admin_action_taken: string | null;
  created_at: string;
  reporter: { full_name: string | null; email: string } | null;
}

function ProviderReportsSection({ providerId, ownerUserId }: { providerId: string; ownerUserId?: string }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ProviderReportSummary | null>(null);
  const [reports, setReports] = useState<ProviderReportRow[]>([]);
  const [deductOpen, setDeductOpen] = useState(false);
  const [deductPoints, setDeductPoints] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [deductSubmitting, setDeductSubmitting] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnReason, setWarnReason] = useState("");
  const [warnSubmitting, setWarnSubmitting] = useState(false);

  useEffect(() => {
    if (!ownerUserId) { setLoading(false); return; }
    (async () => {
      try {
        setLoading(true);
        const [summaryRes, reportsRes] = await Promise.all([
          fetcher.get<{ data: ProviderReportSummary }>(
            `/api/admin/user-reports/summary?user_id=${ownerUserId}`
          ),
          fetcher.get<{ data: { data: ProviderReportRow[] } }>(
            `/api/admin/user-reports?reported_user_id=${ownerUserId}&limit=30`
          ),
        ]);
        setSummary(summaryRes.data);
        const inner = (reportsRes as { data?: { data?: ProviderReportRow[] } })?.data;
        setReports(Array.isArray(inner?.data) ? inner.data : []);
      } catch {
        // may not have reports
      } finally {
        setLoading(false);
      }
    })();
  }, [ownerUserId]);

  const handleDeduct = async () => {
    const pts = parseInt(deductPoints, 10);
    if (!pts || pts <= 0 || !deductReason.trim()) return;
    setDeductSubmitting(true);
    try {
      await fetcher.post(`/api/admin/providers/${providerId}/gamification/deduct`, {
        points: pts,
        reason: deductReason.trim(),
      });
      toast.success(`${pts} points deducted`);
      setDeductOpen(false);
      setDeductPoints("");
      setDeductReason("");
    } catch (err) {
      toast.error(err instanceof FetchError ? err.message : "Failed to deduct points");
    } finally {
      setDeductSubmitting(false);
    }
  };

  const handleWarn = async () => {
    if (!ownerUserId || !warnReason.trim()) return;
    setWarnSubmitting(true);
    try {
      await fetcher.post(`/api/admin/users/${ownerUserId}/warn`, {
        reason: warnReason.trim(),
        send_notification: true,
      });
      toast.success("Warning issued");
      setWarnOpen(false);
      setWarnReason("");
    } catch {
      toast.error("Failed to issue warning");
    } finally {
      setWarnSubmitting(false);
    }
  };

  if (loading) return <LoadingTimeout loadingMessage="Loading reports..." />;

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      {summary && (
        <div className={`rounded-lg border p-5 ${summary.is_flagged ? "border-red-300 bg-red-50" : "bg-white"}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              Reports & Trust
              {summary.is_flagged && (
                <Badge className="bg-red-600 text-white animate-pulse">FLAGGED</Badge>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {summary.adverse_finding_count > 0 && (
                <>
                  <Button size="sm" variant="outline" className="text-amber-700 border-amber-300"
                    onClick={() => { setWarnOpen(true); setWarnReason(""); }}>
                    Warn Provider
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-700 border-red-300"
                    onClick={() => { setDeductOpen(true); setDeductPoints(""); setDeductReason(""); }}>
                    Deduct Points
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-500">Total Reports</p>
              <p className="text-2xl font-bold">{summary.total_reports}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Adverse Findings</p>
              <p className={`text-2xl font-bold ${summary.adverse_finding_count > 0 ? "text-red-600" : ""}`}>
                {summary.adverse_finding_count}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Unique Reporters</p>
              <p className={`text-2xl font-bold ${summary.unique_adverse_reporters >= 3 ? "text-red-600" : ""}`}>
                {summary.unique_adverse_reporters}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-amber-600">{summary.pending_count}</p>
            </div>
          </div>

          {summary.is_flagged && (
            <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg text-sm text-red-800">
              <strong>Action needed:</strong> {summary.unique_adverse_reporters} unique adverse reporters
              (threshold: {summary.flag_threshold}). Consider deducting points, downgrading badge, or suspending.
            </div>
          )}
        </div>
      )}

      {/* Report History */}
      {reports.length === 0 ? (
        <EmptyState title="No reports" description="No reports have been filed against this provider." />
      ) : (
        <div className="space-y-3">
          <h3 className="text-md font-semibold text-gray-700">Report History</h3>
          {reports.map((r) => (
            <div key={r.id} className={`border rounded-lg p-3 text-sm ${
              r.is_adverse_finding ? "border-red-200 bg-red-50/50" : "bg-white border-gray-200"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {r.report_type === "customer_reported_provider" ? "By Customer" : "By Provider"}
                  </Badge>
                  <Badge className={
                    r.status === "pending" ? "bg-amber-100 text-amber-800" :
                    r.status === "resolved" ? "bg-green-100 text-green-800" :
                    "bg-gray-100 text-gray-800"
                  }>{r.status}</Badge>
                  {r.is_adverse_finding && (
                    <Badge className="bg-red-100 text-red-800 text-xs">Adverse</Badge>
                  )}
                </div>
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{r.description}</p>
              <p className="text-xs text-gray-400 mt-1">
                Reporter:{" "}
                <Link href={`/admin/users/${r.reporter_id}`} className="text-[#FF0077] hover:underline">
                  {r.reporter?.full_name || r.reporter?.email || r.reporter_id}
                </Link>
              </p>
              {r.admin_action_taken && (
                <p className="text-xs text-orange-600 mt-1">Action: {r.admin_action_taken.replace(/_/g, " ")}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Deduct Points Dialog */}
      <Dialog open={deductOpen} onOpenChange={setDeductOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deduct Points</DialogTitle>
            <DialogDescription>
              Points will be deducted and the badge will be automatically recalculated.
              This may result in a badge downgrade.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Points to deduct</Label>
              <Input type="number" min="1" value={deductPoints}
                onChange={(e) => setDeductPoints(e.target.value)}
                placeholder="e.g. 500" />
            </div>
            <div>
              <Label>Reason</Label>
              <Textarea value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                placeholder="e.g. Substantiated complaints about service quality"
                rows={2} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeductOpen(false)} disabled={deductSubmitting}>Cancel</Button>
            <Button onClick={handleDeduct}
              disabled={deductSubmitting || !deductPoints || !deductReason.trim()}
              className="bg-red-600 hover:bg-red-700">
              {deductSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Deduct Points
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Warn Dialog */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Warning</DialogTitle>
            <DialogDescription>
              The provider will receive a notification. This is logged for audit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Warning reason</Label>
            <Textarea value={warnReason} onChange={(e) => setWarnReason(e.target.value)}
              placeholder="e.g. Multiple substantiated complaints..." rows={3} className="resize-none" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarnOpen(false)} disabled={warnSubmitting}>Cancel</Button>
            <Button onClick={handleWarn} disabled={warnSubmitting || !warnReason.trim()}
              className="bg-amber-600 hover:bg-amber-700">
              {warnSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Issue Warning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
