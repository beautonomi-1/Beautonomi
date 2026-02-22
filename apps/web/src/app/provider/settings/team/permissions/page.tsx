"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { providerApi } from "@/lib/provider-portal/api";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import type { TeamMember } from "@/lib/provider-portal/types";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { User, Settings, Calendar, DollarSign, Package, Users, FileText } from "lucide-react";

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
}

const permissionCategories: Permission[] = [
  // Calendar & Appointments
  { id: "view_calendar", name: "View Calendar", description: "View all appointments and calendar", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "create_appointments", name: "Create Appointments", description: "Create new appointments", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "edit_appointments", name: "Edit Appointments", description: "Edit existing appointments", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "cancel_appointments", name: "Cancel Appointments", description: "Cancel appointments", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "delete_appointments", name: "Delete Appointments", description: "Delete appointments", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  
  // Sales & Payments
  { id: "view_sales", name: "View Sales", description: "View sales and transactions", category: "sales", icon: <DollarSign className="w-4 h-4" /> },
  { id: "create_sales", name: "Create Sales", description: "Create new sales", category: "sales", icon: <DollarSign className="w-4 h-4" /> },
  { id: "process_payments", name: "Process Payments", description: "Process payments and refunds", category: "sales", icon: <DollarSign className="w-4 h-4" /> },
  { id: "view_reports", name: "View Reports", description: "View business reports", category: "sales", icon: <FileText className="w-4 h-4" /> },
  
  // Services & Products
  { id: "view_services", name: "View Services", description: "View service catalogue", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  { id: "edit_services", name: "Edit Services", description: "Edit services", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  { id: "view_products", name: "View Products", description: "View product catalogue", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  { id: "edit_products", name: "Edit Products", description: "Edit products", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  
  // Team Management
  { id: "view_team", name: "View Team", description: "View team members", category: "team", icon: <Users className="w-4 h-4" /> },
  { id: "manage_team", name: "Manage Team", description: "Add, edit, or remove team members", category: "team", icon: <Users className="w-4 h-4" /> },
  
  // Settings
  { id: "view_settings", name: "View Settings", description: "View business settings", category: "settings", icon: <Settings className="w-4 h-4" /> },
  { id: "edit_settings", name: "Edit Settings", description: "Edit business settings", category: "settings", icon: <Settings className="w-4 h-4" /> },
  
  // Clients
  { id: "view_clients", name: "View Clients", description: "View client list", category: "clients", icon: <User className="w-4 h-4" /> },
  { id: "edit_clients", name: "Edit Clients", description: "Edit client information", category: "clients", icon: <User className="w-4 h-4" /> },
];

export default function PermissionsSettings() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadTeamMembers();
  }, []);

  useEffect(() => {
    if (selectedMember) {
      loadPermissions(selectedMember);
    }
  }, [selectedMember]);

  const loadTeamMembers = async () => {
    try {
      setIsLoading(true);
      const members = await providerApi.listTeamMembers();
      setTeamMembers(members);
      if (members.length > 0 && !selectedMember) {
        setSelectedMember(members[0].id);
      }
    } catch (error: any) {
      console.error("Failed to load team members:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to load team members";
      toast.error(errorMessage);
      setTeamMembers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPermissions = async (memberId: string) => {
    try {
      const response = await fetcher.get<{
        data: { permissions: Record<string, boolean> };
      }>(`/api/provider/staff/${memberId}/permissions`);
      setPermissions(response.data.permissions || {});
    } catch (error: any) {
      console.error("Failed to load permissions:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to load permissions";
      toast.error(errorMessage);
      // Initialize all permissions as false if API fails
      const initialPermissions: Record<string, boolean> = {};
      permissionCategories.forEach((perm) => {
        initialPermissions[perm.id] = false;
      });
      setPermissions(initialPermissions);
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    setPermissions((prev) => ({
      ...prev,
      [permissionId]: !prev[permissionId],
    }));
  };

  const handleSave = async () => {
    if (!selectedMember) {
      toast.error("Please select a team member");
      return;
    }

    setIsSaving(true);
    try {
      await fetcher.patch(`/api/provider/staff/${selectedMember}/permissions`, {
        permissions,
      });
      toast.success("Permissions saved successfully");
      // Reload permissions to ensure UI is in sync
      await loadPermissions(selectedMember);
    } catch (error: any) {
      console.error("Failed to save permissions:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save permissions";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAll = (category: string) => {
    const categoryPermissions = permissionCategories.filter((p) => p.category === category);
    const allEnabled = categoryPermissions.every((p) => permissions[p.id]);
    
    setPermissions((prev) => {
      const updated = { ...prev };
      categoryPermissions.forEach((p) => {
        updated[p.id] = !allEnabled;
      });
      return updated;
    });
  };

  const selectedMemberData = teamMembers.find((m) => m.id === selectedMember);
  const groupedPermissions = permissionCategories.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const categoryLabels: Record<string, string> = {
    calendar: "Calendar & Appointments",
    sales: "Sales & Payments",
    catalogue: "Services & Products",
    team: "Team Management",
    settings: "Business Settings",
    clients: "Client Management",
  };

  return (
    <SettingsDetailLayout
      title="Permissions"
      subtitle="Manage what each team member can access and do"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Permissions"}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: "Provider", href: "/provider" },
        { label: "Settings", href: "/provider/settings" },
        { label: "Team", href: "/provider/settings/team/roles" },
        { label: "Permissions" },
      ]}
    >
      {isLoading ? (
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading team members and permissions..." />
        </SectionCard>
      ) : teamMembers.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
          <p className="text-gray-600 mb-4">No team members found</p>
          <Button onClick={() => window.location.href = "/provider/team/members"}>
            Add Team Members
          </Button>
        </SectionCard>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Team Member Selector */}
          <SectionCard>
            <div className="space-y-4">
              <div>
                <Label className="text-sm sm:text-base font-semibold mb-2 block">
                  Select Team Member
                </Label>
                <Select value={selectedMember || ""} onValueChange={setSelectedMember}>
                  <SelectTrigger className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder="Select a team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077] text-xs">
                              {member.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{member.name}</span>
                          <Badge variant="outline" className="ml-2 capitalize text-xs">
                            {member.role}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMemberData && (
                <div className="p-3 sm:p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10 sm:w-12 sm:h-12">
                      <AvatarFallback className="bg-[#FF0077]/10 text-[#FF0077]">
                        {selectedMemberData.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-sm sm:text-base">{selectedMemberData.name}</p>
                      <p className="text-xs sm:text-sm text-gray-500">{selectedMemberData.email}</p>
                      <Badge variant="outline" className="mt-1 capitalize text-xs">
                        {selectedMemberData.role}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Permissions by Category */}
          {selectedMember && (
            <div className="space-y-4 sm:space-y-6">
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <SectionCard key={category}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm sm:text-base font-semibold">
                          {categoryLabels[category] || category}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {perms.length} permission{perms.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectAll(category)}
                        className="min-h-[36px] touch-manipulation"
                      >
                        {perms.every((p) => permissions[p.id]) ? "Deselect All" : "Select All"}
                      </Button>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      {perms.map((perm) => (
                        <div
                          key={perm.id}
                          className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <Switch
                            checked={permissions[perm.id] || false}
                            onCheckedChange={() => handlePermissionToggle(perm.id)}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <div className="text-gray-600">{perm.icon}</div>
                              <Label className="text-sm sm:text-base font-medium cursor-pointer">
                                {perm.name}
                              </Label>
                            </div>
                            <p className="text-xs text-gray-500">{perm.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </div>
      )}
    </SettingsDetailLayout>
  );
}
