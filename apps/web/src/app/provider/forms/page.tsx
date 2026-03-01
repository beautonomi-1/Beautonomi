"use client";

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
      toast.error("Failed to load forms");
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
      toast.error("Title is required");
      return;
    }
    try {
      if (editingForm) {
        await fetcher.put(`/api/provider/forms/${editingForm.id}`, {
          title: title.trim(),
          description: description.trim() || undefined,
        });
        toast.success("Form updated");
      } else {
        await fetcher.post(`/api/provider/forms`, {
          title: title.trim(),
          description: description.trim() || undefined,
        });
        toast.success("Form created");
      }
      setIsDialogOpen(false);
      loadForms();
    } catch (error) {
      console.error("Failed to save form:", error);
      toast.error(editingForm ? "Failed to update form" : "Failed to create form");
    }
  };

  const handleDelete = async (form: Form) => {
    if (!confirm(`Delete form "${form.title}"?`)) return;
    try {
      await fetcher.delete(`/api/provider/forms/${form.id}`);
      toast.success("Form deleted");
      loadForms();
    } catch (error) {
      console.error("Failed to delete form:", error);
      toast.error("Failed to delete form");
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading forms..." />;
  }

  return (
    <div>
      <PageHeader
        title="Forms"
        subtitle="Intake, consent, and waiver forms for bookings"
        breadcrumbs={[
          { label: "Home", href: "/provider/dashboard" },
          { label: "Resources & Forms", href: "/provider/resources" },
          { label: "Forms" },
        ]}
      />

      <SectionCard className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h3 className="text-lg font-semibold">Your forms</h3>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Add form
          </Button>
        </div>

        {forms.length === 0 ? (
          <EmptyState
            title="No forms yet"
            description="Create intake, consent, or waiver forms to collect information from clients at booking."
            action={{ label: "Add form", onClick: openCreate }}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Fields</TableHead>
                <TableHead className="text-right">Actions</TableHead>
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
                    <Badge variant="secondary">{form.form_type ?? "intake"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/provider/forms/${form.id}`}
                      className="text-primary hover:underline"
                    >
                      {(form.fields ?? []).length} fields
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/provider/forms/${form.id}`} className="gap-1">
                          <ListOrdered className="w-4 h-4" />
                          Fields
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(form)}
                        aria-label="Edit form"
                      >
                        <FileEdit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(form)}
                        aria-label="Delete form"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingForm ? "Edit form" : "New form"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="form-title">Title</Label>
              <Input
                id="form-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Client intake"
              />
            </div>
            <div>
              <Label htmlFor="form-desc">Description (optional)</Label>
              <Textarea
                id="form-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of this form"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>{editingForm ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
