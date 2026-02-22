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

interface StaffMember {
  id: string;
  provider_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  role: "owner" | "manager" | "employee";
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
  by_role: {
    owner: number;
    manager: number;
    employee: number;
  };
}

export default function AdminStaff() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [statistics, setStatistics] = useState<StaffStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    loadStaff();
  }, [roleFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filters change

  const loadStaff = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("is_active", statusFilter === "active" ? "true" : "false");

      const response = await fetcher.get<{
        staff: StaffMember[];
        statistics: StaffStatistics;
      }>(`/api/admin/staff?${params.toString()}`);

      setStaff(response.staff || []);
      setStatistics(response.statistics);
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

  const getRoleBadgeColor = (role: string) => {
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Total Staff</p>
              <p className="text-2xl font-semibold">{statistics.total}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Active</p>
              <p className="text-2xl font-semibold text-green-600">{statistics.active}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Inactive</p>
              <p className="text-2xl font-semibold text-red-600">{statistics.inactive}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Managers</p>
              <p className="text-2xl font-semibold">{statistics.by_role.manager}</p>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Employees</p>
              <p className="text-2xl font-semibold">{statistics.by_role.employee}</p>
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
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 border rounded-md bg-white"
            >
              <option value="all">All Roles</option>
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
                  <TableHead>Role</TableHead>
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
                      <Badge className={getRoleBadgeColor(member.role)}>
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
      </div>
    </RoleGuard>
  );
}
