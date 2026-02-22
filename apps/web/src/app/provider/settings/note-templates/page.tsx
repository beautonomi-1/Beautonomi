"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

export default function NoteTemplatesPage() {
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
      const errorMessage = error?.message || "Failed to load note templates";
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
    if (!confirm("Are you sure you want to delete this template? This action cannot be undone.")) return;

    try {
      await providerApi.deleteNoteTemplate(id);
      toast.success("Template deleted successfully");
      await loadTemplates();
    } catch (error: any) {
      console.error("Failed to delete template:", error);
      const errorMessage = error?.message || "Failed to delete template";
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
    return <LoadingTimeout loadingMessage="Loading note templates..." />;
  }

  return (
    <div>
      <PageHeader
        title="Note Templates"
        subtitle="Create reusable note templates for quick appointment notes"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Note Templates" },
        ]}
        primaryAction={{
          label: "New Template",
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {templates.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No note templates"
            description="Create templates to quickly add common notes to appointments"
            action={{
              label: "Create Template",
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
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                            Internal
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Client Visible
                          </span>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">
                      {template.content}
                    </TableCell>
                    <TableCell>{template.category || "-"}</TableCell>
                    <TableCell>
                      {template.is_active ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-800">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
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
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: NoteTemplate | null;
  onSuccess: () => void;
}) {
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
      toast.error("Template name is required");
      return;
    }
    
    if (!formData.content.trim()) {
      toast.error("Template content is required");
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
        toast.success("Template updated successfully");
      } else {
        await providerApi.createNoteTemplate({
          name: formData.name.trim(),
          content: formData.content.trim(),
          type: formData.type,
          category: formData.category.trim() || undefined,
          is_active: formData.is_active,
        });
        toast.success("Template created successfully");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Failed to save template:", error);
      const errorMessage = error?.message || "Failed to save template";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit Template" : "New Note Template"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Follow-up reminder"
              required
            />
          </div>

          <div>
            <Label htmlFor="type">Note Type *</Label>
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
                    <span>Internal (Staff only)</span>
                  </div>
                </SelectItem>
                <SelectItem value="client_visible">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    <span>Client Visible</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="category">Category (Optional)</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., Follow-up, Reminder, Special Request"
            />
          </div>

          <div>
            <Label htmlFor="content">Template Content *</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={6}
              placeholder="Enter template content. You can use variables like {{client_name}}, {{service_name}}, etc."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Tip: Use this template when adding notes to appointments for consistency
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
              Active
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-[#FF0077] hover:bg-[#D60565]"
            >
              {isLoading ? "Saving..." : template ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
