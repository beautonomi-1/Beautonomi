"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Shield } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions: Record<string, boolean>;
  is_active: boolean;
}

const permissionCategories = [
  { id: "view_calendar", name: "View Calendar", category: "calendar" },
  { id: "create_appointments", name: "Create Appointments", category: "calendar" },
  { id: "edit_appointments", name: "Edit Appointments", category: "calendar" },
  { id: "cancel_appointments", name: "Cancel Appointments", category: "calendar" },
  { id: "view_sales", name: "View Sales", category: "sales" },
  { id: "create_sales", name: "Create Sales", category: "sales" },
  { id: "process_payments", name: "Process Payments", category: "sales" },
  { id: "view_services", name: "View Services", category: "catalogue" },
  { id: "edit_services", name: "Edit Services", category: "catalogue" },
  { id: "view_team", name: "View Team", category: "team" },
  { id: "manage_team", name: "Manage Team", category: "team" },
  { id: "view_settings", name: "View Settings", category: "settings" },
  { id: "edit_settings", name: "Edit Settings", category: "settings" },
  { id: "view_clients", name: "View Clients", category: "clients" },
  { id: "edit_clients", name: "Edit Clients", category: "clients" },
];

export default function RolesSettings() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: {} as Record<string, boolean>,
    is_active: true,
  });

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Role[] }>("/api/provider/roles");
      setRoles(response.data || []);
    } catch (error: any) {
      console.error("Error loading roles:", error);
      toast.error("Failed to load roles");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingRole(null);
    const initialPermissions: Record<string, boolean> = {};
    permissionCategories.forEach((perm) => {
      initialPermissions[perm.id] = false;
    });
    setFormData({
      name: "",
      description: "",
      permissions: initialPermissions,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description || "",
      permissions: role.permissions || {},
      is_active: role.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;

    try {
      await fetcher.delete(`/api/provider/roles/${id}`);
      toast.success("Role deleted");
      loadRoles();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete role");
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Role name is required");
        return;
      }

      if (editingRole) {
        await fetcher.patch(`/api/provider/roles/${editingRole.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          permissions: formData.permissions,
          is_active: formData.is_active,
        });
        toast.success("Role updated");
      } else {
        await fetcher.post("/api/provider/roles", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          permissions: formData.permissions,
          is_active: formData.is_active,
        });
        toast.success("Role created");
      }
      setIsDialogOpen(false);
      loadRoles();
    } catch (error: any) {
      toast.error(error.message || "Failed to save role");
    }
  };

  const handlePermissionToggle = (permissionId: string) => {
    setFormData({
      ...formData,
      permissions: {
        ...formData.permissions,
        [permissionId]: !formData.permissions[permissionId],
      },
    });
  };

  const handleSelectAll = (category: string) => {
    const categoryPermissions = permissionCategories.filter((p) => p.category === category);
    const allEnabled = categoryPermissions.every((p) => formData.permissions[p.id]);

    const updatedPermissions = { ...formData.permissions };
    categoryPermissions.forEach((p) => {
      updatedPermissions[p.id] = !allEnabled;
    });

    setFormData({
      ...formData,
      permissions: updatedPermissions,
    });
  };

  const groupedPermissions = permissionCategories.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, typeof permissionCategories>);

  const categoryLabels: Record<string, string> = {
    calendar: "Calendar & Appointments",
    sales: "Sales & Payments",
    catalogue: "Services & Products",
    team: "Team Management",
    settings: "Business Settings",
    clients: "Client Management",
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Team", href: "/provider/settings/team/roles" },
    { label: "Roles" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Roles"
        subtitle="Configure team roles"
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading roles..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Roles"
      subtitle="Configure team roles"
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
              Create and manage team roles with different permissions
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Role
          </Button>
        </div>

        {roles.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title="No roles yet"
              description="Create roles to group permissions together for easier team management"
              action={{
                label: "Add Role",
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => {
              const permissionCount = Object.values(role.permissions || {}).filter(Boolean).length;
              return (
                <SectionCard key={role.id} className="p-4 sm:p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield className="w-4 h-4 text-[#FF0077]" />
                        <h3 className="font-semibold text-base sm:text-lg">{role.name}</h3>
                      </div>
                      {role.description && (
                        <p className="text-sm text-gray-600 mb-2">{role.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
                          {permissionCount} permission{permissionCount !== 1 ? "s" : ""}
                        </Badge>
                        <Badge
                          className={role.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                        >
                          {role.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(role)}
                      className="flex-1 min-h-[36px] touch-manipulation"
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(role.id)}
                      className="text-red-600 hover:text-red-700 flex-1 min-h-[36px] touch-manipulation"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </SectionCard>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Edit Role" : "Add Role"}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? "Update role information and permissions"
                : "Create a new role with specific permissions"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Manager, Staff, Receptionist"
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
                className="mt-1.5"
              />
            </div>

            <Separator />

            <div>
              <Label className="mb-3 block">Permissions</Label>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {Object.entries(groupedPermissions).map(([category, perms]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">{categoryLabels[category] || category}</h4>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectAll(category)}
                        className="text-xs min-h-[32px] touch-manipulation"
                      >
                        {perms.every((p) => formData.permissions[p.id]) ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    <div className="space-y-2 pl-4">
                      {perms.map((perm) => (
                        <div
                          key={perm.id}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                        >
                          <Label htmlFor={perm.id} className="text-sm cursor-pointer flex-1">
                            {perm.name}
                          </Label>
                          <Switch
                            id={perm.id}
                            checked={formData.permissions[perm.id] || false}
                            onCheckedChange={() => handlePermissionToggle(perm.id)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_active" className="cursor-pointer">
                Active
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              {editingRole ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
