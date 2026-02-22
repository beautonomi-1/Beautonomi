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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";

interface Provider {
  id: string;
  business_name: string;
  slug: string;
  business_type: string;
  status: string;
  is_verified: boolean;
  email: string;
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
      loadPayoutAccounts();
    }
  }, [providerId]); // eslint-disable-line react-hooks/exhaustive-deps -- load when providerId changes

  const loadPayoutAccounts = async () => {
    if (!providerId) return;
    try {
      const res = await fetcher.get<{ data: typeof payoutAccounts }>(
        `/api/admin/providers/${providerId}/payout-accounts`
      );
      setPayoutAccounts(res.data || []);
    } catch {
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
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load provider";
      setError(errorMessage);
      console.error("Error loading provider:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!provider) return;

    try {
      setIsSaving(true);

      await fetcher.patch(`/api/admin/providers/${providerId}`, editData);
      
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

      await fetcher.patch(`/api/admin/providers/${providerId}/status`, {
        status: newStatus,
        reason: statusReason || undefined,
      });

      toast.success(`Provider ${statusAction}d successfully`);
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
      await fetcher.patch(`/api/admin/providers/${providerId}/verify`, {
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
    <RoleGuard allowedRoles={["superadmin"]}>
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
                      <Link href={`/admin/bookings?provider_id=${providerId}`}>
                        <Button variant="outline" className="w-full justify-start">
                          <Calendar className="w-4 h-4 mr-2" />
                          View Bookings
                        </Button>
                      </Link>
                      <Link href={`/admin/reviews?provider_id=${providerId}`}>
                        <Button variant="outline" className="w-full justify-start">
                          <Star className="w-4 h-4 mr-2" />
                          View Reviews
                        </Button>
                      </Link>
                      <Link href={`/admin/finance?provider_id=${providerId}`}>
                        <Button variant="outline" className="w-full justify-start">
                          <DollarSign className="w-4 h-4 mr-2" />
                          View Finance
                        </Button>
                      </Link>
                      <Link href={`/admin/payouts?provider_id=${providerId}`}>
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
              <div className="bg-white border rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Provider Settings</h2>
                <p className="text-gray-600">Settings management coming soon...</p>
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
                            {service.duration_minutes} min • ZAR {service.price?.toFixed(2)}
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
              <div className="bg-white border rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Analytics</h2>
                <p className="text-gray-600">Analytics coming soon...</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

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
