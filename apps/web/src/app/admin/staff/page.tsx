"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Building2,
  User,
  Mail,
  Phone,
  Ban,
  CheckCircle2,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Edit, KeyRound } from "lucide-react";

interface StaffMember {
  id: string;
  provider_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: "owner" | "manager" | "employee";
  user_role: string | null; // from users.role: provider_owner | provider_staff
  avatar_url: string | null;
  bio: string | null;
  is_active: boolean;
  commission_percentage: number;
  created_at: string;
  provider: {
    id: string;
    business_name: string;
    slug: string;
  };
}

interface StaffStatistics {
  total: number;
  active: number;
  inactive: number;
  by_staff_role: {
    owner: number;
    manager: number;
    employee: number;
  };
  by_user_role: {
    provider_owner: number;
    provider_staff: number;
    no_account: number;
  };
}

export default function AdminStaff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [statistics, setStatistics] = useState<StaffStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>("all");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; email: string; phone: string; role: string; commission_percentage: number; bio: string }>({ name: "", email: "", phone: "", role: "employee", commission_percentage: 0, bio: "" });
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState<string | null>(null);

  useEffect(() => {
    loadStaff();
  }, [staffRoleFilter, userRoleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters change

  const loadStaff = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (staffRoleFilter !== "all") params.set("role", staffRoleFilter);
      if (userRoleFilter !== "all") params.set("user_role", userRoleFilter);
      if (statusFilter !== "all") params.set("is_active", statusFilter === "active" ? "true" : "false");

      const response = await fetcher.get<{
        data: { staff: StaffMember[]; statistics: StaffStatistics };
      }>(`/api/admin/staff?${params.toString()}`);

      const data = (response as { data?: { staff?: StaffMember[]; statistics?: StaffStatistics } }).data;
      setStaff(data?.staff || []);
      setStatistics(data?.statistics ?? null);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load staff";
      setError(errorMessage);
      console.error("Error loading staff:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (staffId: string, currentStatus: boolean) => {
    try {
      await fetcher.patch(`/api/admin/staff/${staffId}`, {
        is_active: !currentStatus,
      });
      toast.success(`Staff member ${!currentStatus ? "activated" : "deactivated"}`);
      loadStaff();
    } catch (error: any) {
      toast.error(error.message || "Failed to update staff status");
    }
  };

  const openEditModal = (member: StaffMember) => {
    setEditingMember(member);
    setEditForm({
      name: member.name ?? "",
      email: member.email ?? "",
      phone: member.phone ?? "",
      role: member.role ?? "employee",
      commission_percentage: member.commission_percentage ?? 0,
      bio: member.bio ?? "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMember) return;
    try {
      setIsSavingEdit(true);
      await fetcher.patch(`/api/admin/staff/${editingMember.id}`, {
        name: editForm.name,
        email: editForm.email || null,
        phone: editForm.phone || null,
        role: editForm.role,
        commission_percentage: editForm.commission_percentage,
        bio: editForm.bio || null,
      });
      toast.success("Staff details updated");
      setEditingMember(null);
      loadStaff();
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSendPasswordReset = async (member: StaffMember) => {
    if (!member.email && !member.user_id) {
      toast.error("Add an email for this staff member first");
      return;
    }
    try {
      setIsSendingReset(member.id);
      await fetcher.post(`/api/admin/staff/${member.id}/reset-password`, {});
      toast.success("Password reset email sent");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setIsSendingReset(null);
    }
  };

  const getStaffRoleBadgeColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-purple-100 text-purple-800";
      case "manager":
        return "bg-blue-100 text-blue-800";
      case "employee":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getUserRoleLabel = (userRole: string | null) => {
    if (!userRole) return "—";
    if (userRole === "provider_owner") return "Provider owner";
    if (userRole === "provider_staff") return "Provider staff";
    return userRole;
  };

  const getUserRoleBadgeColor = (userRole: string | null) => {
    if (!userRole) return "bg-gray-100 text-gray-500";
    if (userRole === "provider_owner") return "bg-amber-100 text-amber-800";
    if (userRole === "provider_staff") return "bg-sky-100 text-sky-800";
    return "bg-gray-100 text-gray-800";
  };

  const filteredStaff = staff.filter((member) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      member.name.toLowerCase().includes(query) ||
      member.email?.toLowerCase().includes(query) ||
      member.phone?.toLowerCase().includes(query) ||
      member.provider.business_name.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading staff..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-semibold mb-2">Staff Management</h1>
          <p className="text-gray-600">Manage staff members across all providers</p>
        </div>

        {/* Statistics */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Staff</p>
              <p className="text-2xl font-semibold">{statistics.total}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-2xl font-semibold text-green-600">{statistics.active}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Provider owners</p>
              <p className="text-2xl font-semibold">{statistics.by_user_role?.provider_owner ?? 0}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Provider staff</p>
              <p className="text-2xl font-semibold">{statistics.by_user_role?.provider_staff ?? 0}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Staff role: Manager</p>
              <p className="text-2xl font-semibold">{statistics.by_staff_role?.manager ?? 0}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Staff role: Employee</p>
              <p className="text-2xl font-semibold">{statistics.by_staff_role?.employee ?? 0}</p>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-6 space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by name, email, phone, or provider..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="px-4 py-2 border rounded-md bg-white"
              title="Account role (users table)"
            >
              <option value="all">All account roles</option>
              <option value="provider_owner">Provider owner</option>
              <option value="provider_staff">Provider staff</option>
            </select>
            <select
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value)}
              className="px-4 py-2 border rounded-md bg-white"
              title="Staff role within provider"
            >
              <option value="all">All staff roles</option>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border rounded-md bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {/* Staff Table */}
        {error ? (
          <EmptyState
            title="Failed to load staff"
            description={error}
            action={{ label: "Retry", onClick: loadStaff }}
          />
        ) : filteredStaff.length === 0 ? (
          <EmptyState
            title="No staff found"
            description="No staff members match your search criteria"
          />
        ) : (
          <div className="bg-white border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Account role</TableHead>
                  <TableHead>Staff role</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {member.avatar_url ? (
                          <img
                            className="h-10 w-10 rounded-full"
                            src={member.avatar_url}
                            alt={member.name}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <User className="w-5 h-5 text-gray-500" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{member.name}</div>
                          {member.bio && (
                            <div className="text-sm text-gray-500 truncate max-w-xs">
                              {member.bio}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{member.provider.business_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {member.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="w-3 h-3 text-gray-400" />
                            <span>{member.email}</span>
                          </div>
                        )}
                        {member.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="w-3 h-3 text-gray-400" />
                            <span>{member.phone}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getUserRoleBadgeColor(member.user_role ?? null)}>
                        {getUserRoleLabel(member.user_role ?? null)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStaffRoleBadgeColor(member.role)}>
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.commission_percentage > 0 ? (
                        <span className="font-medium">{member.commission_percentage}%</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.is_active ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800">
                          <Ban className="w-3 h-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            Actions
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditModal(member)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSendPasswordReset(member)}
                            disabled={(!member.email && !member.user_id) || isSendingReset === member.id}
                          >
                            <KeyRound className="w-4 h-4 mr-2" />
                            {isSendingReset === member.id ? "Sending…" : "Send password reset"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(member.id, member.is_active)}
                          >
                            {member.is_active ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Edit staff dialog */}
        <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit staff member</DialogTitle>
            </DialogHeader>
            {editingMember && (
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-role">Staff role</Label>
                  <select
                    id="edit-role"
                    value={editForm.role}
                    onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="owner">Owner</option>
                    <option value="manager">Manager</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="edit-commission">Commission %</Label>
                  <Input
                    id="edit-commission"
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={editForm.commission_percentage}
                    onChange={(e) => setEditForm((f) => ({ ...f, commission_percentage: parseFloat(e.target.value) || 0 }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-bio">Bio</Label>
                  <Textarea
                    id="edit-bio"
                    value={editForm.bio}
                    onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                    className="mt-1 min-h-[80px]"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMember(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
                {isSavingEdit ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
