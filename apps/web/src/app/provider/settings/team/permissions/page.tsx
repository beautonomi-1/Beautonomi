"use client";

import { useTranslation } from "@beautonomi/i18n";
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
import { MessageSquare, Star, User, Settings, Calendar, DollarSign, Package, Users, FileText, Sparkles } from "lucide-react";

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ReactNode;
}

const permissionMeta = [
  { id: "view_calendar", nameKey: "viewCalendar", descKey: "viewCalendarDesc", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "create_appointments", nameKey: "createAppointments", descKey: "createAppointmentsDesc", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "edit_appointments", nameKey: "editAppointments", descKey: "editAppointmentsDesc", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "cancel_appointments", nameKey: "cancelAppointments", descKey: "cancelAppointmentsDesc", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "delete_appointments", nameKey: "deleteAppointments", descKey: "deleteAppointmentsDesc", category: "calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "view_sales", nameKey: "viewSales", descKey: "viewSalesDesc", category: "sales", icon: <DollarSign className="w-4 h-4" /> },
  { id: "create_sales", nameKey: "createSales", descKey: "createSalesDesc", category: "sales", icon: <DollarSign className="w-4 h-4" /> },
  { id: "process_payments", nameKey: "processPayments", descKey: "processPaymentsDesc", category: "sales", icon: <DollarSign className="w-4 h-4" /> },
  { id: "view_reports", nameKey: "viewReports", descKey: "viewReportsDesc", category: "sales", icon: <FileText className="w-4 h-4" /> },
  { id: "view_services", nameKey: "viewServices", descKey: "viewServicesDesc", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  { id: "edit_services", nameKey: "editServices", descKey: "editServicesDesc", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  { id: "view_products", nameKey: "viewProducts", descKey: "viewProductsDesc", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  { id: "edit_products", nameKey: "editProducts", descKey: "editProductsDesc", category: "catalogue", icon: <Package className="w-4 h-4" /> },
  { id: "view_team", nameKey: "viewTeam", descKey: "viewTeamDesc", category: "team", icon: <Users className="w-4 h-4" /> },
  { id: "manage_team", nameKey: "manageTeam", descKey: "manageTeamDesc", category: "team", icon: <Users className="w-4 h-4" /> },
  { id: "view_settings", nameKey: "viewSettings", descKey: "viewSettingsDesc", category: "settings", icon: <Settings className="w-4 h-4" /> },
  { id: "edit_settings", nameKey: "editSettings", descKey: "editSettingsDesc", category: "settings", icon: <Settings className="w-4 h-4" /> },
  { id: "view_clients", nameKey: "viewClients", descKey: "viewClientsDesc", category: "clients", icon: <User className="w-4 h-4" /> },
  { id: "edit_clients", nameKey: "editClients", descKey: "editClientsDesc", category: "clients", icon: <User className="w-4 h-4" /> },
  { id: "view_reviews", nameKey: "viewReviews", descKey: "viewReviewsDesc", category: "engagement", icon: <Star className="w-4 h-4" /> },
  { id: "edit_reviews", nameKey: "editReviews", descKey: "editReviewsDesc", category: "engagement", icon: <Star className="w-4 h-4" /> },
  { id: "view_client_ratings", nameKey: "viewClientRatings", descKey: "viewClientRatingsDesc", category: "engagement", icon: <Star className="w-4 h-4" /> },
  { id: "rate_clients", nameKey: "rateClients", descKey: "rateClientsDesc", category: "engagement", icon: <Star className="w-4 h-4" /> },
  { id: "view_messages", nameKey: "viewMessages", descKey: "viewMessagesDesc", category: "engagement", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "send_messages", nameKey: "sendMessages", descKey: "sendMessagesDesc", category: "engagement", icon: <MessageSquare className="w-4 h-4" /> },
  { id: "create_explore_posts", nameKey: "createExplorePosts", descKey: "createExplorePostsDesc", category: "engagement", icon: <Sparkles className="w-4 h-4" /> },
] as const;

export default function PermissionsSettings() {
  const { t } = useTranslation();
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
: error?.error?.message || t("web.provider.settings.pages.team/commissions.failedToLoadTeamMembers");
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
: error?.error?.message || t("web.provider.settings.pages.team/permissions.failedToLoadPermissions");
      toast.error(errorMessage);
      // Initialize all permissions as false if API fails
      const initialPermissions: Record<string, boolean> = {};
permissionMeta.forEach((perm) => {
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
      toast.error(t("web.provider.settings.pages.team/permissions.pleaseSelectATeamMember"));
      return;
    }

    setIsSaving(true);
    try {
      await fetcher.patch(`/api/provider/staff/${selectedMember}/permissions`, {
        permissions,
      });
      toast.success(t("web.provider.settings.pages.team/permissions.permissionsSavedSuccessfully"));
      // Reload permissions to ensure UI is in sync
      await loadPermissions(selectedMember);
    } catch (error: any) {
      console.error("Failed to save permissions:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
: error?.error?.message || t("web.provider.settings.pages.team/permissions.failedToSavePermissions");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectAll = (category: string) => {
const categoryPermissions = permissionMeta.filter((p) => p.category === category);
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
  const permissionCategories: Permission[] = permissionMeta.map((perm) => ({
    id: perm.id,
    name: t(`web.provider.settings.pages.team/permissions.${perm.nameKey}`),
    description: t(`web.provider.settings.pages.team/permissions.${perm.descKey}`),
    category: perm.category,
    icon: perm.icon,
  }));
  const groupedPermissions = permissionCategories.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const categoryLabels: Record<string, string> = {
    calendar: t("web.provider.settings.pages.team/permissions.catCalendar"),
    sales: t("web.provider.settings.pages.team/permissions.catSales"),
    catalogue: t("web.provider.settings.pages.team/permissions.catCatalogue"),
    team: t("web.provider.settings.pages.team/permissions.catTeam"),
    settings: t("web.provider.settings.pages.team/permissions.catSettings"),
    clients: t("web.provider.settings.pages.team/permissions.catClients"),
    engagement: t("web.provider.settings.pages.team/permissions.catEngagement"),
  };

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.team.items.permissions.title")}
      subtitle={t("web.provider.settings.categories.team.items.permissions.description")}
      onSave={handleSave}
saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.pages.team/permissions.savePermissions")}
      breadcrumbs={[
        { label: t("web.provider.common.breadcrumbHome"), href: "/" },
        { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
        { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
        { label: t("web.provider.settings.pages.team/permissions.team"), href: "/provider/settings/team/roles" },
        { label: t("web.provider.settings.pages.team/permissions.permissions") },
      ]}
    >
      {isLoading ? (
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.team/permissions.loadingTeamMembersAndPermissions")} />
        </SectionCard>
      ) : teamMembers.length === 0 ? (
        <SectionCard className="p-8 sm:p-12 text-center">
<p className="text-gray-600 mb-4">{t("web.provider.settings.pages.team/permissions.noTeamMembersFound")}</p>
          <Button onClick={() => window.location.href = "/provider/team/members"}>
{t("web.provider.settings.pages.team/commissions.addTeamMembers")}
          </Button>
        </SectionCard>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* Team Member Selector */}
          <SectionCard>
            <div className="space-y-4">
              <div>
                <Label className="text-sm sm:text-base font-semibold mb-2 block">
{t("web.provider.settings.pages.team/permissions.selectTeamMember")}
                </Label>
                <Select value={selectedMember || ""} onValueChange={setSelectedMember}>
                  <SelectTrigger className="min-h-[44px] touch-manipulation">
                    <SelectValue placeholder={t("web.provider.settings.pages.team/permissions.selectATeamMember")} />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {member.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{member.name}</span>
                          <Badge variant="outline" className="ms-2 capitalize text-xs">
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
                      <AvatarFallback className="bg-primary/10 text-primary">
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
{t("web.provider.settings.pages.team/permissions.permissionCount", { count: perms.length })}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectAll(category)}
                        className="min-h-[36px] touch-manipulation"
                      >
{perms.every((p) => permissions[p.id]) ? t("web.provider.bookings.bulkActions.deselectAll") : t("web.provider.bookings.bulkActions.selectAll")}
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
