"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { CalendarColorScheme } from "@/lib/provider-portal/types";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { CalendarColorSchemeDialog } from "@/components/provider-portal/CalendarColorSchemeDialog";
import { toast } from "sonner";

export default function CalendarColorsIconsPage() {
  const { t } = useTranslation();
  const [colorSchemes, setColorSchemes] = useState<CalendarColorScheme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedScheme, setSelectedScheme] = useState<CalendarColorScheme | null>(null);

  const loadColorSchemes = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listCalendarColorSchemes();
      setColorSchemes(data);
    } catch (error) {
      console.error("Failed to load color schemes:", error);
      toast.error(t("web.provider.settings.pages.calendar/colors-icons.failedToLoadColorSchemes"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadColorSchemes();
  }, [loadColorSchemes]);

  const handleCreate = () => {
    setSelectedScheme(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (scheme: CalendarColorScheme) => {
    setSelectedScheme(scheme);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.calendar/colors-icons.deleteConfirm"))) return;

    try {
      await providerApi.deleteCalendarColorScheme(id);
      toast.success(t("web.provider.settings.pages.calendar/colors-icons.colorSchemeDeleted"));
      loadColorSchemes();
    } catch (error) {
      console.error("Failed to delete color scheme:", error);
      toast.error(t("web.provider.settings.pages.calendar/colors-icons.failedToDeleteColorScheme"));
    }
  };

  const getAppliesToLabel = (scheme: CalendarColorScheme) => {
    if (scheme.applies_to === "service" && scheme.service_id) {
      return t("web.provider.common.service");
    }
    if (scheme.applies_to === "status" && scheme.status) {
      return t("web.provider.pages.team/payroll/[id].statusLabel", { status: scheme.status });
    }
    if (scheme.applies_to === "team_member" && scheme.team_member_id) {
      return t("web.provider.settings.pages.calendar/display-preferences.teamMember");
    }
    return scheme.applies_to;
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.calendar/colors-icons.calendar"), href: "/provider/calendar" },
    { label: t("web.provider.settings.pages.calendar/colors-icons.colorsIcons") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.calendarColors.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.calendarColors.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.calendar/colors-icons.loadingColorSchemes")} />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.appointmentActivity.items.calendarColors.title")}
      subtitle={t("web.provider.settings.categories.appointmentActivity.items.calendarColors.description")}
      breadcrumbs={breadcrumbs}
    >
      <div className="mb-4 flex justify-end">
        <Button onClick={handleCreate} className="bg-primary hover:bg-primary-hover">
          <Plus className="w-4 h-4 me-2" />
          {t("web.provider.settings.pages.calendar/colors-icons.addColorScheme")}
        </Button>
      </div>

      {colorSchemes.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title={t("web.provider.settings.pages.calendar/colors-icons.noColorSchemes")}
            description={t("web.provider.settings.pages.calendar/colors-icons.emptyDescription")}
            action={{
              label: t("web.provider.settings.pages.calendar/colors-icons.addColorScheme"),
              onClick: handleCreate,
            }}
          />
        </SectionCard>
      ) : (
        <SectionCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("web.provider.common.name")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.calendar/colors-icons.appliesTo")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.calendar/colors-icons.color")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.calendar/colors-icons.icon")}</TableHead>
                  <TableHead>{t("web.provider.common.default")}</TableHead>
                  <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {colorSchemes.map((scheme) => (
                  <TableRow key={scheme.id}>
                    <TableCell className="font-medium">{scheme.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getAppliesToLabel(scheme)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded border"
                          style={{ backgroundColor: scheme.color }}
                        />
                        <span className="text-sm">{scheme.color}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {scheme.icon ? (
                        <span className="text-sm">{scheme.icon}</span>
                      ) : (
                        <span className="text-gray-400">{t("web.provider.common.hyphen")}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {scheme.is_default ? (
                        <Badge className="bg-green-100 text-green-800">{t("web.provider.common.default")}</Badge>
                      ) : (
                        <span className="text-gray-400">{t("web.provider.common.hyphen")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(scheme)}
                        >
                          <Edit className="w-3 h-3 me-1" />
                          {t("web.provider.common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(scheme.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3 me-1" />
                          {t("web.provider.common.delete")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}

      <CalendarColorSchemeDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        scheme={selectedScheme}
        onSuccess={loadColorSchemes}
      />
    </SettingsDetailLayout>
  );
}