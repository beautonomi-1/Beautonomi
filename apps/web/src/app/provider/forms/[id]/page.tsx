"use client";
import { useTranslation } from "@beautonomi/i18n";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowLeft, FileEdit } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

function fieldTypes(t: (k: string) => string) {
  return [
    { value: "text", label: t("web.provider.pages.forms/[id].typeText") },
    { value: "checkbox", label: t("web.provider.pages.forms/[id].typeCheckbox") },
    { value: "signature", label: t("web.provider.pages.forms/[id].typeSignature") },
    { value: "date", label: t("web.provider.pages.forms/[id].typeDate") },
  ];
}

function fieldTypeLabel(t: (k: string) => string, value: string) {
  return fieldTypes(t).find((ft) => ft.value === value)?.label ?? value;
}

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
  is_active?: boolean;
  fields?: FormField[];
}

export default function FormDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [form, setForm] = useState<Form | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<string>("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  const loadForm = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const res = await fetcher.get<{ data: Form[] }>("/api/provider/forms");
      const list = res?.data ?? [];
      const found = list.find((f: Form) => f.id === id);
      if (!found) {
        toast.error(t("web.provider.pages.forms/[id].formNotFound"));
        router.replace("/provider/forms");
        return;
      }
      setForm(found);
    } catch (error) {
      console.error("Failed to load form:", error);
      toast.error(t("web.provider.pages.forms/[id].failedToLoad"));
      router.replace("/provider/forms");
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  const handleAddField = async () => {
    if (!newFieldName.trim()) {
      toast.error(t("web.provider.pages.forms/[id].fieldNameRequired"));
      return;
    }
    try {
      await fetcher.put(`/api/provider/forms/${id}/fields`, {
        name: newFieldName.trim(),
        field_type: newFieldType,
        is_required: newFieldRequired,
      });
      toast.success(t("web.provider.pages.forms/[id].fieldAdded"));
      setNewFieldName("");
      setNewFieldType("text");
      setNewFieldRequired(false);
      setAddFieldOpen(false);
      loadForm();
    } catch (error) {
      console.error("Failed to add field:", error);
      toast.error(t("web.provider.pages.forms/[id].failedToAdd"));
    }
  };

  const handleDeleteField = async (field: FormField) => {
    if (!confirm(t("web.provider.pages.forms/[id].removeConfirm", { name: field.name }))) return;
    try {
      await fetcher.delete(`/api/provider/forms/${id}/fields/${field.id}`);
      toast.success(t("web.provider.pages.forms/[id].fieldRemoved"));
      loadForm();
    } catch (error) {
      console.error("Failed to delete field:", error);
      toast.error(t("web.provider.pages.forms/[id].failedToDelete"));
    }
  };

  const openEditForm = () => {
    setEditTitle(form?.title ?? "");
    setEditDescription(form?.description ?? "");
    setEditFormOpen(true);
  };

  const handleSaveForm = async () => {
    if (!editTitle.trim()) {
      toast.error(t("web.provider.pages.forms/[id].titleRequired"));
      return;
    }
    try {
      await fetcher.put(`/api/provider/forms/${id}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      toast.success(t("web.provider.pages.forms/[id].formUpdated"));
      setEditFormOpen(false);
      loadForm();
    } catch (error) {
      console.error("Failed to update form:", error);
      toast.error(t("web.provider.pages.forms/[id].failedToUpdate"));
    }
  };

  if (isLoading || !form) {
    return <LoadingTimeout loadingMessage={t("web.provider.pages.forms/[id].loading")} />;
  }

  const fields = (form.fields ?? []).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return (
    <div>
      <PageHeader
        title={form.title}
        subtitle={form.description ?? t("web.provider.pages.forms/[id].manageFields")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/provider/dashboard" },
          { label: t("web.provider.sidebar.sections.resourcesForms"), href: "/provider/resources-forms" },
          { label: t("web.provider.sidebar.items.forms"), href: "/provider/forms" },
          { label: form.title },
        ]}
      />

      <div className="mt-6 flex flex-wrap gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/provider/forms" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("web.provider.pages.forms/[id].backToForms")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={openEditForm} className="gap-2">
          <FileEdit className="w-4 h-4" />
          {t("web.provider.pages.forms/[id].editForm")}
        </Button>
      </div>

      <SectionCard className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold">{t("web.provider.pages.forms/[id].fields")}</h3>
          <Button onClick={() => setAddFieldOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("web.provider.pages.forms/[id].addField")}
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border border-dashed rounded-lg">
            <p className="font-medium">{t("web.provider.pages.forms/[id].noFields")}</p>
            <p className="text-sm mt-1">{t("web.provider.pages.forms/[id].noFieldsHint")}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setAddFieldOpen(true)}
            >
              {t("web.provider.pages.forms/[id].addField")}
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("web.provider.pages.forms/[id].order")}</TableHead>
                <TableHead>{t("web.provider.common.name")}</TableHead>
                <TableHead>{t("web.provider.common.type")}</TableHead>
                <TableHead>{t("web.provider.pages.forms/[id].required")}</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell className="text-gray-500">{index + 1}</TableCell>
                  <TableCell className="font-medium">{field.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{fieldTypeLabel(t, field.field_type)}</Badge>
                  </TableCell>
                  <TableCell>{field.is_required ? t("web.provider.common.yes") : t("web.provider.common.no")}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteField(field)}
                      aria-label={t("web.provider.pages.forms/[id].removeField")}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <Dialog open={editFormOpen} onOpenChange={setEditFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("web.provider.pages.forms/[id].editForm")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-form-title">{t("web.provider.pages.forms/[id].title")}</Label>
              <Input
                id="edit-form-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={t("web.provider.pages.forms/[id].titlePlaceholder")}
              />
            </div>
            <div>
              <Label htmlFor="edit-form-desc">{t("web.provider.pages.forms/[id].descriptionOptional")}</Label>
              <Textarea
                id="edit-form-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t("web.provider.pages.forms/[id].descriptionPlaceholder")}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFormOpen(false)}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button onClick={handleSaveForm}>{t("web.provider.common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("web.provider.pages.forms/[id].addField")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="field-name">{t("web.provider.pages.forms/[id].fieldName")}</Label>
              <Input
                id="field-name"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder={t("web.provider.pages.forms/[id].fieldNamePlaceholder")}
              />
            </div>
            <div>
              <Label>{t("web.provider.common.type")}</Label>
              <Select value={newFieldType} onValueChange={setNewFieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes(t).map((ft) => (
                    <SelectItem key={ft.value} value={ft.value}>
                      {ft.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="field-required"
                checked={newFieldRequired}
                onCheckedChange={(v) => setNewFieldRequired(!!v)}
              />
              <Label htmlFor="field-required" className="font-normal cursor-pointer">
                {t("web.provider.pages.forms/[id].required")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldOpen(false)}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button onClick={handleAddField}>{t("web.provider.pages.forms/[id].addField")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
