"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  DollarSign,
  ArrowLeft,
  Edit,
  Ban,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserDetail {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  deactivated_at?: string | null;
  deactivation_reason?: string | null;
  stats?: {
    total_bookings: number;
    total_spent: number;
    last_booking_date: string | null;
  };
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<UserDetail | null>(null);

  useEffect(() => {
    if (userId) {
      loadUser();
    }
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps -- load when userId changes

  const loadUser = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: UserDetail }>(`/api/admin/users/${userId}`);
      setUser(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load user";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm("Are you sure you want to deactivate this user?")) {
      return;
    }

    try {
      await fetcher.patch(`/api/admin/users/${userId}`, {
        deactivated_at: new Date().toISOString(),
        deactivation_reason: "Deactivated by admin",
      });
      toast.success("User deactivated successfully");
      loadUser();
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate user");
    }
  };

  const handleReactivate = async () => {
    try {
      await fetcher.patch(`/api/admin/users/${userId}`, {
        deactivated_at: null,
        deactivation_reason: null,
      });
      toast.success("User reactivated successfully");
      loadUser();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate user");
    }
  };

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <LoadingTimeout loadingMessage="Loading user details..." />
        </div>
      </RoleGuard>
    );
  }

  if (error || !user) {
    return (
      <RoleGuard allowedRoles={["superadmin"]}>
        <div className="container mx-auto px-4 py-8">
          <EmptyState
            title="Failed to load user"
            description={error || "Unable to load user details"}
            action={{
              label: "Back to Users",
              onClick: () => router.push("/admin/users"),
            }}
          />
        </div>
      </RoleGuard>
    );
  }

  const isDeactivated = !!user.deactivated_at;

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push("/admin/users")}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div>
                  <h1 className="text-3xl font-semibold text-gray-900">
                    {user.full_name || "User"}
                  </h1>
                  <p className="text-gray-600 mt-1">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={isDeactivated ? "destructive" : "default"}
                  className="text-sm"
                >
                  {isDeactivated ? "Deactivated" : "Active"}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Edit className="w-4 h-4 mr-2" />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {isDeactivated ? (
                      <DropdownMenuItem onClick={handleReactivate}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Reactivate User
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={handleDeactivate}>
                        <Ban className="w-4 h-4 mr-2" />
                        Deactivate User
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* User Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>User Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <User className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Full Name</p>
                      <p className="font-medium">{user.full_name || "Not provided"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Email</p>
                      <p className="font-medium">{user.email}</p>
                    </div>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="font-medium">{user.phone}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Role</p>
                      <Badge className="mt-1">{user.role}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Member Since</p>
                      <p className="font-medium">
                        {format(new Date(user.created_at), "PP")}
                      </p>
                    </div>
                  </div>
                  {isDeactivated && (
                    <div className="flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-400" />
                      <div>
                        <p className="text-sm text-gray-500">Deactivated</p>
                        <p className="font-medium text-red-600">
                          {user.deactivated_at
                            ? format(new Date(user.deactivated_at), "PP")
                            : "N/A"}
                        </p>
                        {user.deactivation_reason && (
                          <p className="text-sm text-gray-500 mt-1">
                            {user.deactivation_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats */}
              {user.stats && (
                <Card>
                  <CardHeader>
                    <CardTitle>Activity Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Total Bookings</p>
                        <p className="font-medium text-2xl">{user.stats.total_bookings || 0}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <DollarSign className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-500">Total Spent</p>
                        <p className="font-medium text-2xl">
                          ${(user.stats.total_spent || 0).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    {user.stats.last_booking_date && (
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-gray-400" />
                        <div>
                          <p className="text-sm text-gray-500">Last Booking</p>
                          <p className="font-medium">
                            {format(new Date(user.stats.last_booking_date), "PP")}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </RoleGuard>
  );
}
