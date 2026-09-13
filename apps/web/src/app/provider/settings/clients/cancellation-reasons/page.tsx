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

interface CancellationReason {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export default function CancellationReasonsSettings() {
  const { t } = useTranslation();
  const [reasons, setReasons] = useState<CancellationReason[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<CancellationReason | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    loadReasons();
  }, []);

  const loadReasons = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: CancellationReason[] }>(
        "/api/provider/cancellation-reasons"
      );
      setReasons(response.data || []);
    } catch (error: any) {
      console.error("Error loading cancellation reasons:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.clients/cancellation-reasons.failedToLoad");
      toast.error(errorMessage);
      setReasons([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingReason(null);
    setFormData({
      name: "",
      description: "",
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (reason: CancellationReason) => {
    setEditingReason(reason);
    setFormData({
      name: reason.name,
      description: reason.description || "",
      is_active: reason.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.clients/cancellation-reasons.deleteConfirm"))) return;

    try {
      await fetcher.delete(`/api/provider/cancellation-reasons/${id}`);
      toast.success(t("web.provider.settings.pages.clients/cancellation-reasons.cancellationReasonDeletedSuccessfully"));
      await loadReasons();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.clients/cancellation-reasons.failedToDelete");
      toast.error(errorMessage);
      console.error("Error deleting cancellation reason:", error);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error(t("web.provider.settings.pages.clients/cancellation-reasons.cancellationReasonNameIsRequired"));
        return;
      }

      if (editingReason) {
        await fetcher.patch(`/api/provider/cancellation-reasons/${editingReason.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.clients/cancellation-reasons.cancellationReasonUpdatedSuccessfully"));
      } else {
        await fetcher.post("/api/provider/cancellation-reasons", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.clients/cancellation-reasons.cancellationReasonCreatedSuccessfully"));
      }
      setIsDialogOpen(false);
      await loadReasons();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || t("web.provider.settings.pages.clients/cancellation-reasons.failedToSave");
      toast.error(errorMessage);
      console.error("Error saving cancellation reason:", error);
    }
  };

  const breadcrumbs = [
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.clients/cancellation-reasons.clients"), href: "/provider/settings/clients/list" },
    { label: t("web.provider.settings.pages.clients/cancellation-reasons.cancellationReasons") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.clients.items.cancellationReasons.title")}
        subtitle={t("web.provider.settings.categories.clients.items.cancellationReasons.description")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage={t("web.provider.settings.pages.clients/cancellation-reasons.loadingCancellationReasons")} />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.categories.clients.items.cancellationReasons.title")}
      subtitle={t("web.provider.settings.categories.clients.items.cancellationReasons.description")}
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
{t("web.provider.settings.pages.clients/cancellation-reasons.emptyHint")}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-primary hover:bg-primary-hover min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 me-2" />
            {t("web.provider.settings.pages.clients/cancellation-reasons.addReason")}
          </Button>
        </div>

        {reasons.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title={t("web.provider.settings.pages.clients/cancellation-reasons.noCancellationReasonsYet")}
              description={t("web.provider.settings.pages.clients/cancellation-reasons.emptyHint")}
              action={{
                label: t("web.provider.settings.pages.clients/cancellation-reasons.addReason"),
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reasons.map((reason) => (
              <SectionCard key={reason.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{reason.name}</h3>
                    {reason.description && (
                      <p className="text-sm text-gray-600 mb-2">{reason.description}</p>
                    )}
                    <Badge
                      className={reason.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                    >
{reason.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(reason)}
                    className="flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Edit className="w-3 h-3 me-1" />
{t("web.provider.common.edit")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(reason.id)}
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
{editingReason ? t("web.provider.settings.pages.clients/cancellation-reasons.editTitle") : t("web.provider.settings.pages.clients/cancellation-reasons.addTitle")}
            </DialogTitle>
            <DialogDescription>
              {editingReason
                ? t("web.provider.settings.pages.clients/cancellation-reasons.updateHint")
                : t("web.provider.settings.pages.clients/cancellation-reasons.addHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
<Label htmlFor="name">{t("web.provider.onboarding.leftover2.nameRequired")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.provider.settings.pages.clients/cancellation-reasons.eGClientRequestWeatherEmergency")}
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
                placeholder={t("web.provider.settings.pages.clients/cancellation-reasons.optionalDescription")}
                rows={3}
                className="mt-1.5"
              />
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
{editingReason ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
