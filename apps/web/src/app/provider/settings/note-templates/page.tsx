"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { NoteTemplate, NoteType } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChipCombobox } from "@/components/ui/chip-combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function NoteTemplatesPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NoteTemplate | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await providerApi.listNoteTemplates();
      setTemplates(data);
    } catch (error: any) {
      console.error("Failed to load note templates:", error);
      const errorMessage = error?.message || t("web.provider.settings.pages.note-templates.loadFailed");
      toast.error(errorMessage);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreate = () => {
    setSelectedTemplate(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (template: NoteTemplate) => {
    setSelectedTemplate(template);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.note-templates.deleteConfirm"))) return;

    try {
      await providerApi.deleteNoteTemplate(id);
      toast.success(t("web.provider.settings.pages.note-templates.templateDeletedSuccessfully"));
      await loadTemplates();
    } catch (error: any) {
      console.error("Failed to delete template:", error);
      const errorMessage = error?.message || t("web.provider.settings.pages.note-templates.deleteFailed");
      toast.error(errorMessage);
    }
  };

  const getTypeColor = (type: NoteType) => {
    switch (type) {
      case "internal":
        return "bg-blue-100 text-blue-800";
      case "client_visible":
        return "bg-green-100 text-green-800";
      case "system":
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.settings.pages.note-templates.loadingNoteTemplates")} />;
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.settings.categories.appointmentActivity.items.noteTemplates.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.noteTemplates.description")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.note-templates.noteTemplates") },
        ]}
        primaryAction={{
          label: t("web.provider.settings.pages.note-templates.newTemplate"),
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 me-2" />,
        }}
      />

      {templates.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title={t("web.provider.settings.categories.appointmentActivity.items.noteTemplates.title")}
            description={t("web.provider.settings.pages.note-templates.createHint")}
            action={{
              label: t("web.provider.settings.pages.note-templates.createTemplate"),
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
                  <TableHead>{t("web.provider.common.type")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.note-templates.content")}</TableHead>
                  <TableHead>{t("web.provider.settings.pages.addons.category")}</TableHead>
                  <TableHead>{t("web.provider.common.statusLabel")}</TableHead>
                  <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge className={getTypeColor(template.type)}>
                        {template.type === "internal" ? (
                          <span className="flex items-center gap-1">
                            <EyeOff className="w-3 h-3" />
                            {t("web.provider.settings.pages.note-templates.internal")}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {t("web.provider.settings.pages.note-templates.clientVisible")}
                          </span>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {template.content}
                    </TableCell>
                    <TableCell>{template.category || t("web.provider.common.hyphen")}</TableCell>
                    <TableCell>
                      {template.is_active ? (
                        <Badge className="bg-green-100 text-green-800">{t("web.provider.common.active")}</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">{t("web.provider.common.inactive")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="w-3 h-3 me-1" />
                          {t("web.provider.common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
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

      <NoteTemplateDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        template={selectedTemplate}
        templates={templates}
        onSuccess={loadTemplates}
      />
    </div>
  );
}

// Note Template Create/Edit Dialog
function NoteTemplateDialog({
  open,
  onOpenChange,
  template,
  templates,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: NoteTemplate | null;
  templates: NoteTemplate[];
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const categorySuggestions = useMemo(
    () =>
      Array.from(
        new Set(
          templates.map((t) => t.category).filter((c): c is string => Boolean(c?.trim()))
        )
      ).sort(),
    [templates]
  );
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    type: "internal" as NoteType,
    category: "",
    is_active: true,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (template) {
        setFormData({
          name: template.name,
          content: template.content,
          type: template.type,
          category: template.category || "",
          is_active: template.is_active,
        });
      } else {
        setFormData({
          name: "",
          content: "",
          type: "internal",
          category: "",
          is_active: true,
        });
      }
    }
  }, [open, template]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formData.name.trim()) {
      toast.error(t("web.provider.settings.pages.note-templates.templateNameIsRequired"));
      return;
    }
    
    if (!formData.content.trim()) {
      toast.error(t("web.provider.settings.pages.note-templates.templateContentIsRequired"));
      return;
    }

    setIsLoading(true);

    try {
      if (template) {
        await providerApi.updateNoteTemplate(template.id, {
          name: formData.name.trim(),
          content: formData.content.trim(),
          type: formData.type,
          category: formData.category.trim() || undefined,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.note-templates.templateUpdatedSuccessfully"));
      } else {
        await providerApi.createNoteTemplate({
          name: formData.name.trim(),
          content: formData.content.trim(),
          type: formData.type,
          category: formData.category.trim() || undefined,
          is_active: formData.is_active,
        });
        toast.success(t("web.provider.settings.pages.note-templates.templateCreatedSuccessfully"));
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save template:", error);
      const errorMessage = error?.message || t("web.provider.settings.pages.note-templates.saveFailed");
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? t("web.provider.settings.pages.note-templates.editTemplate") : t("web.provider.settings.pages.note-templates.newNoteTemplate")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">{t("web.provider.settings.pages.note-templates.templateNameRequired")}</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={t("web.provider.settings.pages.note-templates.eGFollowUpReminder")}
              required
            />
          </div>

          <div>
            <Label htmlFor="type">{t("web.provider.settings.pages.note-templates.noteTypeRequired")}</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value as NoteType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">
                  <div className="flex items-center gap-2">
                    <EyeOff className="w-4 h-4" />
                    <span>{t("web.provider.settings.pages.note-templates.internalStaffOnly")}</span>
                  </div>
                </SelectItem>
                <SelectItem value="client_visible">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>{t("web.provider.settings.pages.note-templates.clientVisible")}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="category">{t("web.provider.settings.pages.note-templates.categoryOptional")}</Label>
            <ChipCombobox
              singleSelect
              value={formData.category || null}
              onChange={(v) => setFormData((prev) => ({ ...prev, category: v ?? "" }))}
              staticSuggestions={categorySuggestions.map((c) => ({ value: c, label: c }))}
              placeholder={t("web.provider.settings.pages.note-templates.eGFollowUpReminderSpecial")}
              aria-label={t("web.provider.settings.pages.addons.category")}
            />
          </div>

          <div>
            <Label htmlFor="content">{t("web.provider.settings.pages.note-templates.templateContentRequired")}</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
              placeholder={t("web.provider.settings.pages.note-templates.enterTemplateContentYouCanUse")}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              {t("web.provider.settings.pages.note-templates.tipConsistency")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, is_active: !!checked })
              }
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              {t("web.provider.common.active")}
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              {t("web.provider.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary-hover"
            >
              {isLoading ? t("web.provider.common.saving") : template ? t("web.provider.common.update") : t("web.provider.common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
