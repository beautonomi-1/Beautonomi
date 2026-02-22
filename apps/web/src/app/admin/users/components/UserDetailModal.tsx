"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  CreditCard,
  Key,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Ban,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import type { UserRole } from "@/types/beautonomi";

interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at?: string;
  last_login?: string;
  is_active?: boolean;
  deactivated_at?: string | null;
  deactivation_reason?: string | null;
  stats?: {
    booking_count?: number;
    provider_count?: number;
    total_spent?: number;
  };
}

interface Booking {
  id: string;
  status: string;
  service_name: string;
  provider_name: string;
  scheduled_at: string;
  total_amount: number;
  created_at: string;
}

interface UserDetailModalProps {
  user: UserData | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function UserDetailModal({
  user,
  open,
  onClose,
  onUpdate,
}: UserDetailModalProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordData, setPasswordData] = useState({
    newPassword: "",
    confirmPassword: "",
  });
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isSuspending, setIsSuspending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
   
  const [, _setSuspensionReason] = useState("");

  const [fullUserData, setFullUserData] = useState<UserData | null>(null);

  useEffect(() => {
    if (open && user) {
      loadFullUserData();
      if (activeTab === "bookings") {
        loadBookings();
      }
    }
  }, [open, user, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps -- load when modal opens or tab changes

  const loadFullUserData = async () => {
    if (!user) return;
    try {
      const response = await fetcher.get<{
        data: UserData;
        error: null;
      }>(`/api/admin/users/${user.id}`);
      setFullUserData(response.data);
    } catch (error) {
      console.error("Error loading user data:", error);
      setFullUserData(user); // Fallback to passed user data
    }
  };

  const loadBookings = async () => {
    if (!user) return;
    try {
      setIsLoadingBookings(true);
      const response = await fetcher.get<{
        data: Booking[];
        error: null;
      }>(`/api/admin/users/${user.id}/bookings`);
      setBookings(response.data || []);
    } catch (error) {
      console.error("Error loading bookings:", error);
      toast.error("Failed to load bookings");
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!displayUser) return;
    if (!passwordData.newPassword || passwordData.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setIsResettingPassword(true);
      await fetcher.put(`/api/admin/users/${displayUser.id}/password`, {
        new_password: passwordData.newPassword,
      });
      toast.success("Password reset successfully");
      setShowPasswordForm(false);
      setPasswordData({ newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleImpersonate = async () => {
    if (!displayUser) return;
    if (
      !confirm(
        `Are you sure you want to impersonate ${displayUser.full_name || displayUser.email}? You will be logged in as this user.`
      )
    ) {
      return;
    }

    try {
      const response = await fetcher.post<{ data: { success: boolean; url: string }; error: null }>(
        `/api/admin/users/${displayUser.id}/impersonate`,
        undefined,
        { timeoutMs: 30000 } // 30 seconds timeout for impersonation
      );
      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.success("Impersonation started. Redirecting...");
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to impersonate user");
    }
  };

  const handleSuspend = async () => {
    if (!displayUser) return;
    
    const reason = prompt(
      `Enter reason for suspending ${displayUser.full_name || displayUser.email} (optional):`
    );
    
    if (reason === null) return; // User cancelled

    if (
      !confirm(
        `Are you sure you want to suspend ${displayUser.full_name || displayUser.email}? They will not be able to access their account.`
      )
    ) {
      return;
    }

    try {
      setIsSuspending(true);
      await fetcher.patch(`/api/admin/users/${displayUser.id}`, {
        deactivated_at: new Date().toISOString(),
        deactivation_reason: reason || null,
      });
      toast.success("User suspended successfully");
      loadFullUserData();
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to suspend user");
    } finally {
      setIsSuspending(false);
    }
  };

  const handleReactivate = async () => {
    if (!displayUser) return;
    
    if (
      !confirm(
        `Are you sure you want to reactivate ${displayUser.full_name || displayUser.email}? They will be able to access their account again.`
      )
    ) {
      return;
    }

    try {
      setIsSuspending(true);
      await fetcher.patch(`/api/admin/users/${displayUser.id}`, {
        deactivated_at: null,
        deactivation_reason: null,
      });
      toast.success("User reactivated successfully");
      loadFullUserData();
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to reactivate user");
    } finally {
      setIsSuspending(false);
    }
  };

  const handleDelete = async () => {
    if (!displayUser) return;
    
    const confirmMessage = `WARNING: This will permanently delete ${displayUser.full_name || displayUser.email} and all their data. This action cannot be undone.\n\nType "DELETE" to confirm:`;
    const confirmation = prompt(confirmMessage);
    
    if (confirmation !== "DELETE") {
      toast.info("Deletion cancelled");
      return;
    }

    if (
      !confirm(
        `Final confirmation: Are you absolutely sure you want to permanently delete ${displayUser.full_name || displayUser.email}? This cannot be undone!`
      )
    ) {
      return;
    }

    try {
      setIsDeleting(true);
      await fetcher.delete(`/api/admin/users/${displayUser.id}`);
      toast.success("User deleted successfully");
      onClose();
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case "superadmin":
        return "bg-red-100 text-red-800";
      case "provider_owner":
        return "bg-blue-100 text-blue-800";
      case "provider_staff":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
    }).format(amount);
  };

  const displayUser = fullUserData || user;
  if (!displayUser) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
              {displayUser.avatar_url ? (
                <img
                  src={displayUser.avatar_url}
                  alt={displayUser.full_name || displayUser.email}
                  className="h-12 w-12 rounded-full"
                />
              ) : (
                <User className="w-6 h-6 text-gray-500" />
              )}
            </div>
            <div>
              <div className="text-xl font-semibold">
                {displayUser.full_name || "No name"}
              </div>
              <div className="text-sm text-gray-500 font-normal">{displayUser.email}</div>
            </div>
          </DialogTitle>
          <DialogDescription>
            User ID: {displayUser.id}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500">Email:</span>
                  <span className="font-medium">{displayUser.email}</span>
                </div>
                {displayUser.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-500">Phone:</span>
                    <span className="font-medium">{displayUser.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500">Role:</span>
                  <Badge className={getRoleBadgeColor(displayUser.role)}>
                    {displayUser.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500">Created:</span>
                  <span className="font-medium">{formatDate(displayUser.created_at)}</span>
                </div>
                {displayUser.last_login && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-500">Last Login:</span>
                    <span className="font-medium">{formatDate(displayUser.last_login)}</span>
                  </div>
                )}
                {displayUser.deactivated_at && (
                  <div className="flex items-center gap-2 text-sm">
                    <Ban className="w-4 h-4 text-red-500" />
                    <span className="text-red-500 font-semibold">Suspended</span>
                    <span className="text-gray-500">({formatDate(displayUser.deactivated_at)})</span>
                  </div>
                )}
                {displayUser.deactivation_reason && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-500">Reason:</span>
                    <span className="font-medium text-red-600">{displayUser.deactivation_reason}</span>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {displayUser.stats && (
                  <>
                    {displayUser.stats.booking_count !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-500">Total Bookings:</span>
                        <span className="font-medium">{displayUser.stats.booking_count}</span>
                      </div>
                    )}
                    {displayUser.stats.provider_count !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-500">Providers:</span>
                        <span className="font-medium">{displayUser.stats.provider_count}</span>
                      </div>
                    )}
                    {displayUser.stats.total_spent !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-500">Total Spent:</span>
                        <span className="font-medium">
                          {formatCurrency(displayUser.stats.total_spent)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="bookings" className="mt-4">
            {isLoadingBookings ? (
              <div className="text-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-gray-400" />
                <p className="mt-2 text-sm text-gray-500">Loading bookings...</p>
              </div>
            ) : bookings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No bookings found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-semibold text-sm">{booking.service_name}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Provider: {booking.provider_name}
                        </div>
                        <div className="text-xs text-gray-500">
                          Scheduled: {formatDate(booking.scheduled_at)}
                        </div>
                        <div className="text-xs text-gray-500">
                          Amount: {formatCurrency(booking.total_amount)}
                        </div>
                      </div>
                      <Badge
                        className={`ml-2 ${
                          booking.status === "completed"
                            ? "bg-green-100 text-green-800"
                            : booking.status === "cancelled"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {booking.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="security" className="mt-4 space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Reset Password</h3>
                {!showPasswordForm ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowPasswordForm(true)}
                    className="w-full sm:w-auto"
                  >
                    <Key className="w-4 h-4 mr-2" />
                    Reset Password
                  </Button>
                ) : (
                  <div className="space-y-3 border rounded-lg p-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        New Password
                      </label>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          value={passwordData.newPassword}
                          onChange={(e) =>
                            setPasswordData({
                              ...passwordData,
                              newPassword: e.target.value,
                            })
                          }
                          placeholder="Enter new password (min 8 characters)"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Confirm Password
                      </label>
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={passwordData.confirmPassword}
                        onChange={(e) =>
                          setPasswordData({
                            ...passwordData,
                            confirmPassword: e.target.value,
                          })
                        }
                        placeholder="Confirm new password"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handlePasswordReset}
                        disabled={isResettingPassword}
                        className="flex-1"
                      >
                        {isResettingPassword ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Resetting...
                          </>
                        ) : (
                          <>
                            <Key className="w-4 h-4 mr-2" />
                            Reset Password
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowPasswordForm(false);
                          setPasswordData({ newPassword: "", confirmPassword: "" });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="mt-4 space-y-4">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">User Actions</h3>
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    onClick={handleImpersonate}
                    className="w-full sm:w-auto"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Impersonate User
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                      const response = await fetch(
                        `/api/admin/users/${displayUser.id}/export`
                      );
                        if (!response.ok) throw new Error("Export failed");
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `user-${displayUser.id}-export-${new Date().toISOString().split("T")[0]}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        toast.success("User data exported");
                      } catch {
                        toast.error("Failed to export user data");
                      }
                    }}
                    className="w-full sm:w-auto ml-0 sm:ml-2"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export User Data
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Account Status</h3>
                <div className="space-y-2">
                  {displayUser.deactivated_at ? (
                    <Button
                      variant="outline"
                      onClick={handleReactivate}
                      disabled={isSuspending}
                      className="w-full sm:w-auto bg-green-50 hover:bg-green-100 text-green-700 border-green-300"
                    >
                      {isSuspending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Reactivating...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Reactivate User
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleSuspend}
                      disabled={isSuspending || displayUser.role === "superadmin"}
                      className="w-full sm:w-auto bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border-yellow-300"
                    >
                      {isSuspending ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Suspending...
                        </>
                      ) : (
                        <>
                          <Ban className="w-4 h-4 mr-2" />
                          Suspend User
                        </>
                      )}
                    </Button>
                  )}
                  {displayUser.role === "superadmin" && (
                    <p className="text-xs text-gray-500 mt-1">
                      Superadmin accounts cannot be suspended
                    </p>
                  )}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2 text-red-600">Danger Zone</h3>
                <div className="space-y-2">
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting || displayUser.role === "superadmin"}
                    className="w-full sm:w-auto"
                  >
                    {isDeleting ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete User Permanently
                      </>
                    )}
                  </Button>
                  {displayUser.role === "superadmin" && (
                    <p className="text-xs text-gray-500 mt-1">
                      Superadmin accounts cannot be deleted
                    </p>
                  )}
                  <p className="text-xs text-red-600 mt-1">
                    This action cannot be undone. All user data will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
