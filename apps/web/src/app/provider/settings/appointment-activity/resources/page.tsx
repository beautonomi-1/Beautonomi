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
import { fetcher, FetchError } from "@/lib/http/fetcher";
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

interface Resource {
  id: string;
  name: string;
  description?: string | null;
  capacity?: number | null;
  is_active: boolean;
  group_name?: string | null;
  group_color?: string | null;
}

export default function ResourcesSettings() {
  const { t } = useTranslation();
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    capacity: 1,
    is_active: true,
  });

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Resource[] }>("/api/provider/resources");
      setResources(response.data || []);
    } catch (error: any) {
      console.error("Error loading resources:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.appointment-activity/resources.failedToLoad");
      toast.error(errorMessage);
      setResources([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingResource(null);
    setFormData({
      name: "",
      description: "",
      capacity: 1,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (resource: Resource) => {
    setEditingResource(resource);
    setFormData({
      name: resource.name,
      description: resource.description || "",
      capacity: resource.capacity || 1,
      is_active: resource.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.appointment-activity/resources.deleteConfirm"))) return;

    try {
      await fetcher.delete(`/api/provider/resources/${id}`);
      toast.success(t("web.provider.settings.pages.appointment-activity/resources.resourceDeletedSuccessfully"));
      await loadResources();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.appointment-activity/resources.failedToDelete");
      toast.error(errorMessage);
      console.error("Error deleting resource:", error);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error(t("web.provider.settings.pages.appointment-activity/resources.resourceNameIsRequired"));
        return;
      }

      if (formData.capacity && formData.capacity < 1) {
        toast.error(t("web.provider.settings.pages.appointment-activity/resources.capacityMustBeAtLeast1"));
        return;
      }

      if (editingResource) {
        await fetcher.patch(`/api/provider/resources/${editingResource.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          capacity: formData.capacity || 1,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.appointment-activity/resources.resourceUpdatedSuccessfully"));
      } else {
        await fetcher.post("/api/provider/resources", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          capacity: formData.capacity || 1,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.appointment-activity/resources.resourceCreatedSuccessfully"));
      }
      setIsDialogOpen(false);
      await loadResources();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.appointment-activity/resources.failedToSave");
      toast.error(errorMessage);
      console.error("Error saving resource:", error);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.appointment-activity/resources.resources") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.resources.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.resources.description")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.appointment-activity/resources.loadingResources")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.appointmentActivity.items.resources.title")}
      subtitle={t("web.provider.settings.categories.appointmentActivity.items.resources.description")}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
              {t("web.provider.settings.pages.appointment-activity/resources.emptyHint")}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.settings.pages.appointment-activity/resources.addResource")}
          </Button>
        </div>

        {resources.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title={t("web.provider.settings.pages.appointment-activity/resources.noResourcesYet")}
              description={t("web.provider.settings.pages.appointment-activity/resources.emptyHint")}
              action={{
                label: t("web.provider.settings.pages.appointment-activity/resources.addResource"),
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources.map((resource) => (
              <SectionCard key={resource.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{resource.name}</h3>
                    {resource.description && (
                      <p className="text-sm text-gray-600 mb-2">{resource.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {resource.capacity && (
                        <Badge variant="outline" className="text-xs">
                          {t("web.provider.settings.pages.appointment-activity/resources.capacityValue", { count: resource.capacity })}
                        </Badge>
                      )}
                      <Badge
                        className={resource.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
                        {resource.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(resource)}
                    className="flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Edit className="w-3 h-3 me-1" />
                    {t("web.provider.common.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(resource.id)}
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
            <DialogTitle>{editingResource ? t("web.provider.settings.pages.appointment-activity/resources.editResource") : t("web.provider.settings.pages.appointment-activity/resources.addResource")}</DialogTitle>
            <DialogDescription>
              {editingResource
                ? t("web.provider.settings.pages.appointment-activity/resources.updateHint")
                : t("web.provider.settings.pages.appointment-activity/resources.addHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">{t("web.provider.settings.pages.appointment-activity/resources.nameRequired")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.provider.settings.pages.appointment-activity/resources.eGTreatmentRoom1")}
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
                placeholder={t("web.provider.settings.pages.appointment-activity/resources.optionalDescription")}
                rows={3}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="capacity">{t("web.provider.settings.pages.appointment-activity/resources.capacity")}</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                className="mt-1.5 min-h-[44px] touch-manipulation"
              />
              <p className="text-xs text-gray-500 mt-1">{t("web.provider.settings.pages.appointment-activity/resources.capacityHint")}</p>
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
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="min-h-[44px] touch-manipulation">
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              className="bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
            >
              {editingResource ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
