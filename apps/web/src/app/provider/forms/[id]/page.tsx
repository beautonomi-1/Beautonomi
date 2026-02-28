"use client";

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

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "checkbox", label: "Checkbox" },
  { value: "signature", label: "Signature" },
  { value: "date", label: "Date" },
] as const;

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
        toast.error("Form not found");
        router.replace("/provider/forms");
        return;
      }
      setForm(found);
    } catch (error) {
      console.error("Failed to load form:", error);
      toast.error("Failed to load form");
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
      toast.error("Field name is required");
      return;
    }
    try {
      await fetcher.put(`/api/provider/forms/${id}/fields`, {
        name: newFieldName.trim(),
        field_type: newFieldType,
        is_required: newFieldRequired,
      });
      toast.success("Field added");
      setNewFieldName("");
      setNewFieldType("text");
      setNewFieldRequired(false);
      setAddFieldOpen(false);
      loadForm();
    } catch (error) {
      console.error("Failed to add field:", error);
      toast.error("Failed to add field");
    }
  };

  const handleDeleteField = async (field: FormField) => {
    if (!confirm(`Remove field "${field.name}"?`)) return;
    try {
      await fetcher.delete(`/api/provider/forms/${id}/fields/${field.id}`);
      toast.success("Field removed");
      loadForm();
    } catch (error) {
      console.error("Failed to delete field:", error);
      toast.error("Failed to delete field");
    }
  };

  const openEditForm = () => {
    setEditTitle(form?.title ?? "");
    setEditDescription(form?.description ?? "");
    setEditFormOpen(true);
  };

  const handleSaveForm = async () => {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    try {
      await fetcher.put(`/api/provider/forms/${id}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
      });
      toast.success("Form updated");
      setEditFormOpen(false);
      loadForm();
    } catch (error) {
      console.error("Failed to update form:", error);
      toast.error("Failed to update form");
    }
  };

  if (isLoading || !form) {
    return <LoadingTimeout loadingMessage="Loading form..." />;
  }

  const fields = (form.fields ?? []).sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  return (
    <div>
      <PageHeader
        title={form.title}
        subtitle={form.description ?? "Manage form fields"}
        breadcrumbs={[
          { label: "Home", href: "/provider/dashboard" },
          { label: "Resources & Forms", href: "/provider/resources-forms" },
          { label: "Forms", href: "/provider/forms" },
          { label: form.title },
        ]}
      />

      <div className="mt-6 flex flex-wrap gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/provider/forms" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to forms
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={openEditForm} className="gap-2">
          <FileEdit className="w-4 h-4" />
          Edit form
        </Button>
      </div>

      <SectionCard className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold">Fields</h3>
          <Button onClick={() => setAddFieldOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add field
          </Button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border border-dashed rounded-lg">
            <p className="font-medium">No fields yet</p>
            <p className="text-sm mt-1">Add fields to collect information from clients.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setAddFieldOpen(true)}
            >
              Add field
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Required</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <TableRow key={field.id}>
                  <TableCell className="text-gray-500">{index + 1}</TableCell>
                  <TableCell className="font-medium">{field.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{field.field_type}</Badge>
                  </TableCell>
                  <TableCell>{field.is_required ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteField(field)}
                      aria-label="Remove field"
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
            <DialogTitle>Edit form</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-form-title">Title</Label>
              <Input
                id="edit-form-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="e.g. Client intake"
              />
            </div>
            <div>
              <Label htmlFor="edit-form-desc">Description (optional)</Label>
              <Textarea
                id="edit-form-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Brief description"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveForm}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="field-name">Field name</Label>
              <Input
                id="field-name"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="e.g. Phone number"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newFieldType} onValueChange={setNewFieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
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
                Required
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddField}>Add field</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
