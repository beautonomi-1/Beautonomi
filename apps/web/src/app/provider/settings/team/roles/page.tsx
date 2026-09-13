"use client";

import { useTranslation } from "@beautonomi/i18n";
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
  { id: "delete_appointments", name: "Delete Appointments", category: "calendar" },
  { id: "view_sales", name: "View Sales", category: "sales" },
  { id: "create_sales", name: "Create Sales", category: "sales" },
  { id: "process_payments", name: "Process Payments", category: "sales" },
  { id: "view_reports", name: "View Reports", category: "sales" },
  { id: "view_services", name: "View Services", category: "catalogue" },
  { id: "edit_services", name: "Edit Services", category: "catalogue" },
  { id: "view_products", name: "View Products", category: "catalogue" },
  { id: "edit_products", name: "Edit Products", category: "catalogue" },
  { id: "view_team", name: "View Team", category: "team" },
  { id: "manage_team", name: "Manage Team", category: "team" },
  { id: "view_settings", name: "View Settings", category: "settings" },
  { id: "edit_settings", name: "Edit Settings", category: "settings" },
  { id: "view_clients", name: "View Clients", category: "clients" },
  { id: "edit_clients", name: "Edit Clients", category: "clients" },
  { id: "view_reviews", name: "View Reviews", category: "engagement" },
  { id: "edit_reviews", name: "Edit Reviews", category: "engagement" },
  { id: "view_client_ratings", name: "View Client Ratings", category: "engagement" },
  { id: "rate_clients", name: "Rate Clients", category: "engagement" },
  { id: "view_messages", name: "View Messages", category: "engagement" },
  { id: "send_messages", name: "Send Messages", category: "engagement" },
  { id: "create_explore_posts", name: "Create Explore Posts", category: "engagement" },
];

export default function RolesSettings() {
  const { t } = useTranslation();
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
      toast.error(t("web.provider.settings.pages.team/roles.failedToLoadRoles"));
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
    if (!confirm(t("web.provider.settings.pages.team/roles.deleteConfirm"))) return;

    try {
      await fetcher.delete(`/api/provider/roles/${id}`);
      toast.success(t("web.provider.settings.pages.team/roles.roleDeleted"));
      loadRoles();
    } catch (error: any) {
      toast.error(error.message || t("web.provider.settings.pages.team/roles.failedToDelete"));
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error(t("web.provider.settings.pages.team/roles.roleNameIsRequired"));
        return;
      }

      if (editingRole) {
        await fetcher.patch(`/api/provider/roles/${editingRole.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          permissions: formData.permissions,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.team/roles.roleUpdated"));
      } else {
        await fetcher.post("/api/provider/roles", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          permissions: formData.permissions,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.team/roles.roleCreated"));
      }
      setIsDialogOpen(false);
      loadRoles();
    } catch (error: any) {
      toast.error(error.message || t("web.provider.settings.pages.team/roles.failedToSave"));
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
    calendar: t("web.provider.settings.pages.team/roles.catCalendar"),
    sales: t("web.provider.settings.pages.team/roles.catSales"),
    catalogue: t("web.provider.settings.pages.team/roles.catCatalogue"),
    team: t("web.provider.settings.pages.team/roles.catTeam"),
    settings: t("web.provider.settings.pages.team/roles.catSettings"),
    clients: t("web.provider.settings.pages.team/roles.catClients"),
    engagement: t("web.provider.settings.pages.team/roles.catEngagement"),
  };
  const permName = (id: string) => t(`web.provider.settings.pages.team/roles.perm.${({
    view_calendar: "viewCalendar",
    create_appointments: "createAppointments",
    edit_appointments: "editAppointments",
    cancel_appointments: "cancelAppointments",
    delete_appointments: "deleteAppointments",
    view_sales: "viewSales",
    create_sales: "createSales",
    process_payments: "processPayments",
    view_reports: "viewReports",
    view_services: "viewServices",
    edit_services: "editServices",
    view_products: "viewProducts",
    edit_products: "editProducts",
    view_team: "viewTeam",
    manage_team: "manageTeam",
    view_settings: "viewSettings",
    edit_settings: "editSettings",
    view_clients: "viewClients",
    edit_clients: "editClients",
    view_reviews: "viewReviews",
    edit_reviews: "editReviews",
    view_client_ratings: "viewClientRatings",
    rate_clients: "rateClients",
    view_messages: "viewMessages",
    send_messages: "sendMessages",
    create_explore_posts: "createExplorePosts",
  } as Record<string, string>)[id] ?? id}`);

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.team/roles.team"), href: "/provider/settings/team/roles" },
    { label: t("web.provider.settings.pages.team/roles.roles") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.team.items.roles.title")}
        subtitle={t("web.provider.settings.categories.team.items.roles.description")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.team/roles.loadingRoles")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.team/roles.roles")}
      subtitle={t("web.provider.settings.pages.team/roles.configureTeamRoles")}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.team/roles.createAndManage")}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.settings.pages.team/roles.addRole")}
          </Button>
        </div>

        {roles.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title={t("web.provider.settings.pages.team/roles.noRolesYet")}
              description={t("web.provider.settings.pages.team/roles.emptyHint")}
              action={{
                label: t("web.provider.settings.pages.team/roles.addRole"),
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
                        <Shield className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold text-base sm:text-lg">{role.name}</h3>
                      </div>
                      {role.description && (
                        <p className="text-sm text-gray-600 mb-2">{role.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="text-xs">
{t("web.provider.settings.pages.team/roles.permissionCount", { count: permissionCount })}
                        </Badge>
                        <Badge
                          className={role.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                        >
{role.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
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
                      <Edit className="w-3 h-3 me-1" />
{t("web.provider.common.edit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(role.id)}
                      className="text-red-600 hover:text-red-700 flex-1 min-h-[36px] touch-manipulation"
                    >
                      <Trash2 className="w-3 h-3 me-1" />
{t("web.provider.common.delete")}
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
<DialogTitle>{editingRole ? t("web.provider.settings.pages.team/roles.editRole") : t("web.provider.settings.pages.team/roles.addRole")}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? t("web.provider.settings.pages.team/roles.updateHint")
                : t("web.provider.settings.pages.team/roles.createHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
<Label htmlFor="name">{t("web.provider.onboarding.leftover2.nameRequired")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.provider.settings.pages.team/roles.eGManagerStaffReceptionist")}
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
            <div>
<Label htmlFor="description">{t("web.provider.common.description")}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t("web.provider.settings.pages.team/roles.optionalDescription")}
                rows={3}
                className="mt-1.5"
              />
            </div>

            <Separator />

            <div>
<Label className="mb-3 block">{t("web.provider.settings.pages.team/permissions.permissions")}</Label>
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
{perms.every((p) => formData.permissions[p.id]) ? t("web.provider.bookings.bulkActions.deselectAll") : t("web.provider.bookings.bulkActions.selectAll")}
                      </Button>
                    </div>
                    <div className="space-y-2 ps-4">
                      {perms.map((perm) => (
                        <div
                          key={perm.id}
                          className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                        >
                          <Label htmlFor={perm.id} className="text-sm cursor-pointer flex-1">
{permName(perm.id)}
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
{t("web.provider.common.active")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="min-h-[44px] touch-manipulation"
            >
{t("web.provider.common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              className="bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
            >
{editingRole ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
