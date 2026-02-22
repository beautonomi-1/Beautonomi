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
import { Plus, Edit, Trash2, MessageSquare, AlertCircle } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

interface SmsTemplate {
  id: string;
  name: string;
  message_template: string;
  category: string | null;
  variables: string[];
  character_count: number;
  enabled: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export default function SmsTemplatesPage() {
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    message_template: "",
    category: "",
    variables: [] as string[],
    enabled: true,
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ templates: SmsTemplate[] }>('/api/admin/sms-templates');
      setTemplates(response.templates || []);
    } catch (error) {
      console.error("Failed to load templates:", error);
      toast.error("Failed to load SMS templates");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      message_template: "",
      category: "",
      variables: [],
      enabled: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (template: SmsTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      message_template: template.message_template,
      category: template.category || "",
      variables: template.variables || [],
      enabled: template.enabled,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      await fetcher.delete(`/api/admin/sms-templates/${id}`);
      toast.success("Template deleted successfully");
      loadTemplates();
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast.error("Failed to delete template");
    }
  };

  const handleSave = async () => {
    if (formData.message_template.length > 160) {
      toast.error("SMS message cannot exceed 160 characters");
      return;
    }

    try {
      if (editingTemplate) {
        await fetcher.patch(`/api/admin/sms-templates/${editingTemplate.id}`, formData);
        toast.success("Template updated successfully");
      } else {
        await fetcher.post('/api/admin/sms-templates', formData);
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

  const handleMessageChange = (value: string) => {
    setFormData(prev => {
      const updated = { ...prev, message_template: value };
      updated.variables = extractVariables(value);
      return updated;
    });
  };

  const characterCount = formData.message_template.length;
  const isOverLimit = characterCount > 160;

  const categories = [
    "booking",
    "payment",
    "notification",
    "marketing",
    "verification",
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading SMS templates..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">SMS Templates</h1>
            <p className="text-gray-600 mt-1">Manage SMS templates for the platform</p>
          </div>
          <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No SMS templates"
            description="Create your first SMS template to get started"
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
                  <TableHead>Characters</TableHead>
                  <TableHead>Variables</TableHead>
                  <TableHead>Status</TableHead>
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
                      <Badge
                        variant={template.character_count > 160 ? "destructive" : "secondary"}
                      >
                        {template.character_count}/160
                      </Badge>
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
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
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
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit SMS Template" : "Create SMS Template"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Booking Reminder"
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
                <div className="flex justify-between items-center mb-2">
                  <Label htmlFor="message_template">Message Template *</Label>
                  <span
                    className={`text-sm ${
                      isOverLimit ? "text-red-600 font-bold" : "text-gray-500"
                    }`}
                  >
                    {characterCount}/160
                  </span>
                </div>
                <Textarea
                  id="message_template"
                  value={formData.message_template}
                  onChange={(e) => handleMessageChange(e.target.value)}
                  placeholder="e.g., Your appointment for {{service_name}} is on {{date}} at {{time}}."
                  rows={4}
                  required
                  className={isOverLimit ? "border-red-500" : ""}
                />
                {isOverLimit && (
                  <div className="flex items-center gap-2 mt-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>Message exceeds 160 character limit</span>
                  </div>
                )}
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
              <Button
                onClick={handleSave}
                disabled={isOverLimit}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                {editingTemplate ? "Update" : "Create"} Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
