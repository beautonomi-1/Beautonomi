"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2 } from "lucide-react";
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

interface TimeOffType {
  id: string;
  name: string;
  description?: string | null;
  is_paid: boolean;
  is_active: boolean;
}

export default function TimeOffTypesSettings() {
  const { t } = useTranslation();
  const [types, setTypes] = useState<TimeOffType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<TimeOffType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_paid: false,
    is_active: true,
  });

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: TimeOffType[] }>(
        "/api/provider/time-off-types"
      );
      setTypes(response.data || []);
    } catch (error: any) {
      console.error("Error loading time off types:", error);
      toast.error(t("web.provider.settings.pages.team/time-off-types.failedToLoadTimeOffTypes"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingType(null);
    setFormData({
      name: "",
      description: "",
      is_paid: false,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (type: TimeOffType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || "",
      is_paid: type.is_paid,
      is_active: type.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.team/time-off-types.deleteConfirm"))) return;

    try {
      await fetcher.delete(`/api/provider/time-off-types/${id}`);
      toast.success(t("web.provider.settings.pages.team/time-off-types.timeOffTypeDeleted"));
      loadTypes();
    } catch (error: any) {
      toast.error(error.message || t("web.provider.settings.pages.team/time-off-types.failedToDelete"));
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error(t("web.provider.settings.pages.team/time-off-types.timeOffTypeNameIsRequired"));
        return;
      }

      if (editingType) {
        await fetcher.patch(`/api/provider/time-off-types/${editingType.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_paid: formData.is_paid,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.team/time-off-types.timeOffTypeUpdated"));
      } else {
        await fetcher.post("/api/provider/time-off-types", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_paid: formData.is_paid,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.team/time-off-types.timeOffTypeCreated"));
      }
      setIsDialogOpen(false);
      loadTypes();
    } catch (error: any) {
      toast.error(error.message || t("web.provider.settings.pages.team/time-off-types.failedToSave"));
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.team/time-off-types.team"), href: "/provider/settings/team/roles" },
    { label: t("web.provider.settings.pages.team/time-off-types.timeOffTypes") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.team.items.timeOffTypes.title")}
        subtitle={t("web.provider.settings.categories.team.items.timeOffTypes.description")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.team/time-off-types.loadingTimeOffTypes")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.team/time-off-types.timeOffTypes")}
      subtitle={t("web.provider.settings.pages.team/time-off-types.manageTimeOffCategoriesForYour")}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.team/time-off-types.createHint")}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.settings.pages.team/time-off-types.addTimeOffType")}
          </Button>
        </div>

        {types.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title={t("web.provider.settings.pages.team/time-off-types.noTimeOffTypesYet")}
              description={t("web.provider.settings.pages.team/time-off-types.createHint")}
              action={{
                label: t("web.provider.settings.pages.team/time-off-types.addTimeOffType"),
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map((type) => (
              <SectionCard key={type.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{type.name}</h3>
                    {type.description && (
                      <p className="text-sm text-gray-600 mb-2">{type.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={type.is_paid ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}
                      >
{type.is_paid ? t("web.provider.settings.pages.team/time-off-types.paid") : t("web.provider.settings.pages.team/time-off-types.unpaid")}
                      </Badge>
                      <Badge
                        className={type.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
{type.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(type)}
                    className="flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Edit className="w-3 h-3 me-1" />
{t("web.provider.common.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(type.id)}
                    className="text-red-600 hover:text-red-700 flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Trash2 className="w-3 h-3 me-1" />
{t("web.provider.common.delete")}
                  </Button>
                </div>
              </SectionCard>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
{editingType ? t("web.provider.settings.pages.team/time-off-types.editTitle") : t("web.provider.settings.pages.team/time-off-types.addTimeOffType")}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? t("web.provider.settings.pages.team/time-off-types.updateHint")
                : t("web.provider.settings.pages.team/time-off-types.createTitleHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
<Label htmlFor="name">{t("web.provider.common.nameRequired")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.provider.settings.pages.team/time-off-types.eGVacationSickLeavePersonal")}
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
                placeholder={t("web.provider.settings.pages.team/time-off-types.optionalDescription")}
                rows={3}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_paid"
                checked={formData.is_paid}
                onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_paid" className="cursor-pointer">
{t("web.provider.settings.pages.team/time-off-types.paidTimeOff")}
              </Label>
            </div>
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
{editingType ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
