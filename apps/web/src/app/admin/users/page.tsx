"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  User,
  ChevronDown,
  Edit,
  Download,
  Ban,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { UserRole } from "@/types/beautonomi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import UserDetailModal from "./components/UserDetailModal";
import Link from "next/link";
import BulkActionsBar from "@/components/admin/BulkActionsBar";
import { Checkbox } from "@/components/ui/checkbox";

interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  deactivated_at?: string | null;
  deactivation_reason?: string | null;
  stats?: {
    booking_count?: number;
    provider_count?: number;
  };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isSelectAll, setIsSelectAll] = useState(false);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    loadUsers();
  }, [page, roleFilter, debouncedSearchQuery]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters/pagination change

  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (debouncedSearchQuery) params.set("search", debouncedSearchQuery);
      if (roleFilter !== "all") params.set("role", roleFilter);
      params.set("page", page.toString());
      params.set("limit", "50");

      const response = await fetcher.get<{
        data: UserData[];
        error: null;
        meta: { page: number; limit: number; total: number; has_more: boolean };
      }>(`/api/admin/users?${params.toString()}`);

      setUsers(response.data || []);
      if (response.meta) {
        setTotal(response.meta.total);
        setHasMore(response.meta.has_more);
      }
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load users";
      setError(errorMessage);
      console.error("Error loading users:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserClick = (user: UserData) => {
    setSelectedUser(user);
    setIsDetailModalOpen(true);
  };

  const handleModalClose = () => {
    setIsDetailModalOpen(false);
    setSelectedUser(null);
  };

  const handleModalUpdate = () => {
    loadUsers();
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    const newSelected = new Set(selectedUserIds);
    if (checked) {
      newSelected.add(userId);
    } else {
      newSelected.delete(userId);
    }
    setSelectedUserIds(newSelected);
    setIsSelectAll(newSelected.size === filteredUsers.length && filteredUsers.length > 0);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredUsers.map((u) => u.id));
      setSelectedUserIds(allIds);
      setIsSelectAll(true);
    } else {
      setSelectedUserIds(new Set());
      setIsSelectAll(false);
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selectedUserIds.size === 0) {
      toast.error("Please select at least one user");
      return;
    }

    const userIds = Array.from(selectedUserIds);

    try {
      switch (action) {
        case "activate":
          if (!confirm(`Activate ${userIds.length} user(s)?`)) return;
          await fetcher.post("/api/admin/users/bulk", {
            user_ids: userIds,
            action: "activate",
          });
          toast.success(`${userIds.length} user(s) activated`);
          break;
        case "deactivate":
          if (!confirm(`Deactivate ${userIds.length} user(s)?`)) return;
          const reason = prompt("Enter reason (optional):");
          await fetcher.post("/api/admin/users/bulk", {
            user_ids: userIds,
            action: "deactivate",
            reason: reason || null,
          });
          toast.success(`${userIds.length} user(s) deactivated`);
          break;
        case "delete":
          const confirmation = prompt(
            `WARNING: This will permanently delete ${userIds.length} user(s) and all their data. This action cannot be undone.\n\nType "DELETE" to confirm:`
          );
          if (confirmation !== "DELETE") {
            toast.info("Deletion cancelled");
            return;
          }
          await fetcher.post("/api/admin/users/bulk", {
            user_ids: userIds,
            action: "delete",
          });
          toast.success(`${userIds.length} user(s) deleted`);
          break;
        case "export":
          // Export selected users
          toast.info("Export functionality for selected users coming soon");
          return;
      }
      setSelectedUserIds(new Set());
      setIsSelectAll(false);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || `Failed to perform bulk ${action}`);
    }
  };

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
      return;
    }

    try {
      await fetcher.put(`/api/admin/users/${userId}/role`, { role: newRole });
      toast.success("User role updated");
      loadUsers();
    } catch {
      toast.error("Failed to update user role");
    }
  };

  const handleSuspend = async (user: UserData, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    if (user.role === "superadmin") {
      toast.error("Cannot suspend superadmin accounts");
      return;
    }

    const reason = prompt(`Enter reason for suspending ${user.full_name || user.email} (optional):`);
    if (reason === null) return;

    if (!confirm(`Are you sure you want to suspend ${user.full_name || user.email}?`)) {
      return;
    }

    try {
      await fetcher.patch(`/api/admin/users/${user.id}`, {
        deactivated_at: new Date().toISOString(),
        deactivation_reason: reason || null,
      });
      toast.success("User suspended successfully");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to suspend user");
    }
  };

  const handleReactivate = async (user: UserData, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    
    if (!confirm(`Are you sure you want to reactivate ${user.full_name || user.email}?`)) {
      return;
    }

    try {
      await fetcher.patch(`/api/admin/users/${user.id}`, {
        deactivated_at: null,
        deactivation_reason: null,
      });
      toast.success("User reactivated successfully");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to reactivate user");
    }
  };

  const handleDelete = async (user: UserData, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    if (user.role === "superadmin") {
      toast.error("Cannot delete superadmin accounts");
      return;
    }

    const confirmation = prompt(
      `WARNING: This will permanently delete ${user.full_name || user.email} and all their data. This action cannot be undone.\n\nType "DELETE" to confirm:`
    );
    
    if (confirmation !== "DELETE") {
      toast.info("Deletion cancelled");
      return;
    }

    if (!confirm(`Final confirmation: Are you absolutely sure you want to permanently delete ${user.full_name || user.email}?`)) {
      return;
    }

    try {
      await fetcher.delete(`/api/admin/users/${user.id}`);
      toast.success("User deleted successfully");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
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

  const filteredUsers = users.filter((user) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.phone?.toLowerCase().includes(query)
    );
  });

  if (isLoading && users.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <LoadingTimeout loadingMessage="Loading users..." />
        </div>
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="min-h-screen bg-zinc-50/50">
        <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="backdrop-blur-2xl bg-white/60 border border-white/40 shadow-2xl rounded-2xl p-6 md:p-8 mb-8"
          >
            <div className="mb-4 sm:mb-6">
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
                className="text-2xl sm:text-3xl font-semibold tracking-tighter mb-1 sm:mb-2 text-gray-900"
              >
                User Management
              </motion.h1>
              <p className="text-sm sm:text-base font-light text-gray-600">Manage platform users and roles</p>
            </div>

            {/* Search and Filters */}
            <div className="mb-4 sm:mb-6 space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search by name, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="pl-10 text-sm sm:text-base backdrop-blur-xl bg-white/80 border border-white/40 focus:border-[#FF0077] focus:ring-[#FF0077] rounded-xl"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 sm:px-4 py-2 text-sm sm:text-base border border-white/40 rounded-xl backdrop-blur-sm bg-white/60 focus:border-[#FF0077] focus:ring-[#FF0077]"
                >
              <option value="all">All Roles</option>
              <option value="customer">Customer</option>
              <option value="provider_owner">Provider Owner</option>
              <option value="provider_staff">Provider Staff</option>
              <option value="superadmin">Superadmin</option>
            </select>
            </div>
            <div className="flex gap-2 sm:gap-0 sm:flex-col">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none border-white/40 backdrop-blur-xl bg-white/80 hover:bg-white/90 rounded-xl"
                  onClick={async () => {
                    try {
                      const params = new URLSearchParams();
                      if (roleFilter !== "all") params.set("role", roleFilter);
                      
                      const response = await fetch(`/api/admin/export/users?${params.toString()}`);
                      if (!response.ok) throw new Error("Export failed");
                      
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `users-export-${new Date().toISOString().split("T")[0]}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                      toast.success("Export downloaded");
                    } catch {
                      toast.error("Failed to export users");
                    }
                  }}
                >
                  <Download className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">Export</span>
                </Button>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Bulk Actions Bar */}
        <BulkActionsBar
          selectedCount={selectedUserIds.size}
          onClearSelection={() => {
            setSelectedUserIds(new Set());
            setIsSelectAll(false);
          }}
          onBulkAction={handleBulkAction}
        />

        {/* Users Table */}
        {error ? (
          <EmptyState
            title="Failed to load users"
            description={error}
            action={{ label: "Retry", onClick: loadUsers }}
          />
        ) : filteredUsers.length === 0 ? (
          <EmptyState
            title="No users found"
            description="No users match your search criteria"
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="backdrop-blur-sm bg-white/60 border-b border-white/40">
                    <tr>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                        <Checkbox
                          checked={isSelectAll}
                          onCheckedChange={handleSelectAll}
                        />
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stats
                      </th>
                      <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="backdrop-blur-sm bg-white/40 divide-y divide-white/40">
                    {filteredUsers.map((user) => (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ backgroundColor: "rgba(255, 255, 255, 0.6)" }}
                        className="cursor-pointer transition-colors"
                        onClick={(e) => {
                          // Don't trigger row click if clicking checkbox
                          if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
                            return;
                          }
                          handleUserClick(user);
                        }}
                      >
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedUserIds.has(user.id)}
                            onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                          />
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10">
                              {user.avatar_url ? (
                                <img
                                  className="h-10 w-10 rounded-full"
                                  src={user.avatar_url}
                                  alt={user.full_name || user.email}
                                />
                              ) : (
                                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                  <User className="w-5 h-5 text-gray-500" />
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {user.full_name || "No name"}
                              </div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {user.phone || "No phone"}
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <Badge className={getRoleBadgeColor(user.role)}>
                              {user.role}
                            </Badge>
                            {user.deactivated_at && (
                              <Badge className="bg-red-100 text-red-800 text-xs">
                                <Ban className="w-3 h-3 mr-1" />
                                Suspended
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.stats?.booking_count !== undefined && (
                            <div>Bookings: {user.stats.booking_count}</div>
                          )}
                          {user.stats?.provider_count !== undefined && (
                            <div>Providers: {user.stats.provider_count}</div>
                          )}
                        </td>
                        <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <Edit className="w-4 h-4 mr-2" />
                                Actions
                                <ChevronDown className="w-4 h-4 ml-2" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user.id, "customer")}
                                disabled={user.role === "customer"}
                              >
                                Set as Customer
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user.id, "provider_owner")}
                                disabled={user.role === "provider_owner"}
                              >
                                Set as Provider Owner
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user.id, "provider_staff")}
                                disabled={user.role === "provider_staff"}
                              >
                                Set as Provider Staff
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleRoleChange(user.id, "superadmin")}
                                disabled={user.role === "superadmin"}
                              >
                                Set as Superadmin
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => user.deactivated_at ? handleReactivate(user, e) : handleSuspend(user, e)}
                                disabled={user.role === "superadmin"}
                                className={user.deactivated_at ? "text-green-600" : "text-yellow-600"}
                              >
                                {user.deactivated_at ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Reactivate
                                  </>
                                ) : (
                                  <>
                                    <Ban className="w-4 h-4 mr-2" />
                                    Suspend
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => handleDelete(user, e)}
                                disabled={user.role === "superadmin"}
                                className="text-red-600"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredUsers.map((user) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="backdrop-blur-xl bg-white/80 border border-white/40 rounded-xl p-4 shadow-lg hover:shadow-xl transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedUserIds.has(user.id)}
                        onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                      />
                    </div>
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => handleUserClick(user)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center flex-1 min-w-0">
                          <div className="flex-shrink-0 h-12 w-12">
                            {user.avatar_url ? (
                              <img
                                className="h-12 w-12 rounded-full"
                                src={user.avatar_url}
                                alt={user.full_name || user.email}
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                                <User className="w-6 h-6 text-gray-500" />
                              </div>
                            )}
                          </div>
                          <div className="ml-3 flex-1 min-w-0">
                            <div className="text-sm font-semibold text-gray-900 truncate">
                              {user.full_name || "No name"}
                            </div>
                            <div className="text-xs text-gray-500 truncate mt-0.5">{user.email}</div>
                          </div>
                        </div>
                        <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="flex-shrink-0">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(user.id, "customer")}
                          disabled={user.role === "customer"}
                        >
                          Set as Customer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(user.id, "provider_owner")}
                          disabled={user.role === "provider_owner"}
                        >
                          Set as Provider Owner
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(user.id, "provider_staff")}
                          disabled={user.role === "provider_staff"}
                        >
                          Set as Provider Staff
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleRoleChange(user.id, "superadmin")}
                          disabled={user.role === "superadmin"}
                        >
                          Set as Superadmin
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => user.deactivated_at ? handleReactivate(user, e) : handleSuspend(user, e)}
                          disabled={user.role === "superadmin"}
                          className={user.deactivated_at ? "text-green-600" : "text-yellow-600"}
                        >
                          {user.deactivated_at ? (
                            <>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Reactivate
                            </>
                          ) : (
                            <>
                              <Ban className="w-4 h-4 mr-2" />
                              Suspend
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(user, e)}
                          disabled={user.role === "superadmin"}
                          className="text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/users/${user.id}`}>
                            <Edit className="w-4 h-4 mr-2" />
                            View Details
                          </Link>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  
                    <div className="space-y-2 pt-3 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Phone:</span>
                      <span className="text-gray-900 font-medium">
                        {user.phone || "No phone"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Role:</span>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge className={getRoleBadgeColor(user.role)}>
                          {user.role}
                        </Badge>
                        {user.deactivated_at && (
                          <Badge className="bg-red-100 text-red-800 text-xs">
                            <Ban className="w-3 h-3 mr-1" />
                            Suspended
                          </Badge>
                        )}
                      </div>
                    </div>
                    {(user.stats?.booking_count !== undefined || user.stats?.provider_count !== undefined) && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">Stats:</span>
                        <div className="text-gray-900 font-medium text-right">
                          {user.stats?.booking_count !== undefined && (
                            <div>Bookings: {user.stats.booking_count}</div>
                          )}
                          {user.stats?.provider_count !== undefined && (
                            <div>Providers: {user.stats.provider_count}</div>
                          )}
                        </div>
                      </div>
                    )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            {total > 50 && (
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
                <div className="text-xs sm:text-sm text-gray-700 text-center sm:text-left">
                  Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, total)} of {total} users
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!hasMore}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* User Detail Modal */}
        <UserDetailModal
          user={selectedUser}
          open={isDetailModalOpen}
          onClose={handleModalClose}
          onUpdate={handleModalUpdate}
        />
        </div>
      </div>
    </RoleGuard>
  );
}
