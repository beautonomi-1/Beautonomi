"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileEdit, Trash2, ListOrdered } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { fetcher } from "@/lib/http/fetcher";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface FormField {
  id: string;
  name: string;
  field_type: string;
  is_required?: boolean;
  sort_order?: number;
}

interface Form {
  id: string;
  title: string;
  description?: string;
  form_type?: string;
  is_required?: boolean;
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
  fields?: FormField[];
}

export default function ProviderFormsPage() {
  const { t } = useTranslation();
  const [forms, setForms] = useState<Form[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const loadForms = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: Form[] }>(`/api/provider/forms`);
      setForms(res?.data ?? []);
    } catch (error) {
      console.error("Failed to load forms:", error);
      toast.error(t("web.provider.formsPage.failedToLoad"));
      setForms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const openCreate = () => {
    setEditingForm(null);
    setTitle("");
    setDescription("");
    setIsDialogOpen(true);
  };

  const openEdit = (form: Form) => {
    setEditingForm(form);
    setTitle(form.title);
    setDescription(form.description ?? "");
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error(t("web.provider.formsPage.titleRequired"));
      return;
    }
    try {
      if (editingForm) {
        await fetcher.put(`/api/provider/forms/${editingForm.id}`, {
          title: title.trim(),
          description: description.trim() || undefined,
        });
        toast.success(t("web.provider.formsPage.updated"));
      } else {
        await fetcher.post(`/api/provider/forms`, {
          title: title.trim(),
          description: description.trim() || undefined,
        });
        toast.success(t("web.provider.formsPage.created"));
      }
      setIsDialogOpen(false);
      loadForms();
    } catch (error) {
      console.error("Failed to save form:", error);
      toast.error(editingForm ? t("web.provider.formsPage.updateFailed") : t("web.provider.formsPage.createFailed"));
    }
  };

  const handleDelete = async (form: Form) => {
    if (!confirm(t("web.provider.formsPage.deleteConfirm", { title: form.title }))) return;
    try {
      await fetcher.delete(`/api/provider/forms/${form.id}`);
      toast.success(t("web.provider.formsPage.deleted"));
      loadForms();
    } catch (error) {
      console.error("Failed to delete form:", error);
      toast.error(t("web.provider.formsPage.deleteFailed"));
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.formsPage.loading")} />;
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.formsPage.title")}
        subtitle={t("web.provider.formsPage.subtitle")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/provider/dashboard" },
          { label: t("web.provider.sidebar.sections.resourcesForms"), href: "/provider/resources" },
          { label: t("web.provider.sidebar.items.forms") },
        ]}
      />

      <SectionCard className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold">{t("web.provider.formsPage.yourForms")}</h3>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("web.provider.formsPage.addForm")}
          </Button>
        </div>

        {forms.length === 0 ? (
          <EmptyState
            title={t("web.provider.formsPage.emptyTitle")}
            description={t("web.provider.formsPage.emptyDescription")}
            action={{ label: t("web.provider.formsPage.addForm"), onClick: openCreate }}
          />
        ) : (
          <>
            {/* Mobile card layout */}
            <div className="md:hidden divide-y">
              {forms.map((form) => (
                <div key={form.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/provider/forms/${form.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {form.title}
                      </Link>
                      {form.description && (
                        <p className="text-sm text-gray-500 line-clamp-2 mt-0.5">{form.description}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="shrink-0">{form.form_type ?? t("web.provider.formsPage.intake")}</Badge>
                  </div>

                  <div className="text-sm text-gray-600">
                    <Link
                      href={`/provider/forms/${form.id}`}
                      className="text-primary hover:underline"
                    >
                      {t("web.provider.formsPage.fieldsCount", { count: (form.fields ?? []).length })}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="outline" size="sm" className="min-h-[44px] flex-1" asChild>
                      <Link href={`/provider/forms/${form.id}`} className="gap-1">
                        <ListOrdered className="w-4 h-4" />
                        {t("web.provider.formsPage.fields")}
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px]"
                      onClick={() => openEdit(form)}
                      aria-label={t("web.provider.formsPage.editFormA11y")}
                    >
                      <FileEdit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px] text-destructive"
                      onClick={() => handleDelete(form)}
                      aria-label={t("web.provider.formsPage.deleteFormA11y")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table layout */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("web.provider.formsPage.colTitle")}</TableHead>
                    <TableHead>{t("web.provider.formsPage.colType")}</TableHead>
                    <TableHead>{t("web.provider.formsPage.fields")}</TableHead>
                    <TableHead className="text-end">{t("web.provider.common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forms.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell>
                        <div>
                          <Link
                            href={`/provider/forms/${form.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {form.title}
                          </Link>
                          {form.description && (
                            <p className="text-sm text-gray-500 line-clamp-1">{form.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{form.form_type ?? t("web.provider.formsPage.intake")}</Badge>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/provider/forms/${form.id}`}
                          className="text-primary hover:underline"
                        >
                          {t("web.provider.formsPage.fieldsCount", { count: (form.fields ?? []).length })}
                        </Link>
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/provider/forms/${form.id}`} className="gap-1">
                              <ListOrdered className="w-4 h-4" />
                              {t("web.provider.formsPage.fields")}
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(form)}
                            aria-label={t("web.provider.formsPage.editFormA11y")}
                          >
                            <FileEdit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(form)}
                            aria-label={t("web.provider.formsPage.deleteFormA11y")}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </SectionCard>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingForm ? t("web.provider.formsPage.editForm") : t("web.provider.formsPage.newForm")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="form-title">{t("web.provider.formsPage.titleLabel")}</Label>
              <Input
                id="form-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("web.provider.formsPage.titlePlaceholder")}
              />
            </div>
            <div>
              <Label htmlFor="form-desc">{t("web.provider.formsPage.descriptionLabel")}</Label>
              <Textarea
                id="form-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("web.provider.formsPage.descriptionPlaceholder")}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button onClick={handleSave}>{editingForm ? t("web.provider.common.update") : t("web.provider.common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
