"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Edit, Trash2, Mail, Eye } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface EmailTemplate {
  id: string;
  name: string;
  subject_template: string;
  body_template: string;
  category: string | null;
  variables: string[];
  is_html: boolean;
  enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    subject_template: "",
    body_template: "",
    category: "",
    variables: [] as string[],
    is_html: true,
    enabled: true,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ templates: EmailTemplate[] }>('/api/admin/email-templates');
      setTemplates(response.templates || []);
    } catch (error) {
      console.error("Failed to load templates:", error);
      toast.error("Failed to load email templates");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      subject_template: "",
      body_template: "",
      category: "",
      variables: [],
      is_html: true,
      enabled: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject_template: template.subject_template,
      body_template: template.body_template,
      category: template.category || "",
      variables: template.variables || [],
      is_html: template.is_html,
      enabled: template.enabled,
    });
    setIsDialogOpen(true);
  };

  const handlePreview = async (template: EmailTemplate) => {
    setPreviewData(template);
    setIsPreviewOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      await fetcher.delete(`/api/admin/email-templates/${id}`);
      toast.success("Template deleted successfully");
      loadTemplates();
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast.error("Failed to delete template");
    }
  };

  const handleSave = async () => {
    try {
      if (editingTemplate) {
        await fetcher.patch(`/api/admin/email-templates/${editingTemplate.id}`, formData);
        toast.success("Template updated successfully");
      } else {
        await fetcher.post('/api/admin/email-templates', formData);
        toast.success("Template created successfully");
      }
      setIsDialogOpen(false);
      loadTemplates();
    } catch (error) {
      console.error("Failed to save template:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to save template");
    }
  };

  const extractVariables = (text: string): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const matches = Array.from(text.matchAll(regex));
    return [...new Set(matches.map(m => m[1]))];
  };

  const handleTemplateChange = (field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      // Auto-extract variables
      if (field === 'subject_template' || field === 'body_template') {
        const allText = `${updated.subject_template} ${updated.body_template}`;
        updated.variables = extractVariables(allText);
      }
      return updated;
    });
  };

  const categories = [
    "booking",
    "payment",
    "notification",
    "marketing",
    "system",
    "verification",
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading email templates..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Email Templates</h1>
            <p className="text-gray-600 mt-1">Manage email templates for the platform</p>
          </div>
          <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No email templates"
            description="Create your first email template to get started"
            action={{
              label: "Create Template",
              onClick: handleCreate,
            }}
          />
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      {template.category ? (
                        <Badge variant="outline">{template.category}</Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {template.variables?.slice(0, 3).map((v) => (
                          <Badge key={v} variant="secondary" className="text-xs">
                            {`{{${v}}}`}
                          </Badge>
                        ))}
                        {template.variables?.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{template.variables.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {template.enabled ? (
                        <Badge className="bg-green-100 text-green-800">Enabled</Badge>
                      ) : (
                        <Badge variant="outline">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell>v{template.version}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreview(template)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(template.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Email Template" : "Create Email Template"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Booking Confirmation"
                  required
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="subject_template">Subject Template *</Label>
                <Input
                  id="subject_template"
                  value={formData.subject_template}
                  onChange={(e) => handleTemplateChange('subject_template', e.target.value)}
                  placeholder="e.g., Booking Confirmation: {{service_name}}"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {`{{variable_name}}`} for dynamic content
                </p>
              </div>

              <div>
                <Label htmlFor="body_template">Body Template *</Label>
                <Textarea
                  id="body_template"
                  value={formData.body_template}
                  onChange={(e) => handleTemplateChange('body_template', e.target.value)}
                  placeholder="HTML or plain text email body"
                  rows={10}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use {`{{variable_name}}`} for dynamic content
                </p>
              </div>

              {formData.variables.length > 0 && (
                <div>
                  <Label>Detected Variables</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.variables.map((v) => (
                      <Badge key={v} variant="secondary">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.is_html}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_html: checked })}
                />
                <div>
                  <Label>HTML Email</Label>
                  <p className="text-xs text-gray-500">Enable HTML formatting</p>
                </div>
              </div>

              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
                <div>
                  <Label>Enabled</Label>
                  <p className="text-xs text-gray-500">Enable this template</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-[#FF0077] hover:bg-[#D60565]">
                {editingTemplate ? "Update" : "Create"} Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Preview: {previewData?.name}</DialogTitle>
            </DialogHeader>
            {previewData && (
              <div className="space-y-4">
                <div>
                  <Label>Subject</Label>
                  <div className="p-3 bg-gray-50 rounded border">
                    {previewData.subject_template}
                  </div>
                </div>
                <div>
                  <Label>Body</Label>
                  <div
                    className="p-3 bg-gray-50 rounded border max-h-96 overflow-y-auto"
                    dangerouslySetInnerHTML={{
                      __html: previewData.is_html
                        ? previewData.body_template
                        : previewData.body_template.replace(/\n/g, "<br />"),
                    }}
                  />
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
