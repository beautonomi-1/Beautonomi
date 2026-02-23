"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2 } from "lucide-react";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CustomField {
  id: string;
  name: string;
  label: string;
  field_type: string;
  entity_type: string;
  is_required: boolean;
  is_active: boolean;
  validation_rules: Record<string, any> | null;
  default_value: string | null;
  placeholder: string | null;
  help_text: string | null;
  display_order: number;
  created_at: string;
}

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    label: "",
    field_type: "text",
    entity_type: "user",
    is_required: false,
    is_active: true,
    placeholder: "",
    help_text: "",
    default_value: "",
    display_order: 0,
  });

  useEffect(() => {
    loadFields();
  }, []);

  const loadFields = async () => {
    try {
      setIsLoading(true);
      // Note: This would need a backend API endpoint
      // For now, using a placeholder
      const response = await fetcher.get<{ fields: CustomField[] }>("/api/admin/custom-fields").catch(() => ({ fields: [] }));
      setFields(response.fields || []);
    } catch (error) {
      console.error("Failed to load custom fields:", error);
      // Don't show error if endpoint doesn't exist yet
      setFields([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingField(null);
    setFormData({
      name: "",
      label: "",
      field_type: "text",
      entity_type: "user",
      is_required: false,
      is_active: true,
      placeholder: "",
      help_text: "",
      default_value: "",
      display_order: fields.length,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (field: CustomField) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      label: field.label,
      field_type: field.field_type,
      entity_type: field.entity_type,
      is_required: field.is_required,
      is_active: field.is_active,
      placeholder: field.placeholder || "",
      help_text: field.help_text || "",
      default_value: field.default_value || "",
      display_order: field.display_order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingField) {
        await fetcher.put(`/api/admin/custom-fields/${editingField.id}`, formData);
        toast.success("Custom field updated successfully");
      } else {
        await fetcher.post("/api/admin/custom-fields", formData);
        toast.success("Custom field created successfully");
      }
      setIsDialogOpen(false);
      loadFields();
    } catch (error) {
      console.error("Failed to save custom field:", error);
      toast.error(error instanceof FetchError ? error.message : "Failed to save custom field");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this custom field?")) {
      return;
    }

    try {
      await fetcher.delete(`/api/admin/custom-fields/${id}`);
      toast.success("Custom field deleted successfully");
      loadFields();
    } catch (error) {
      console.error("Failed to delete custom field:", error);
      toast.error("Failed to delete custom field");
    }
  };

  const handleToggleActive = async (field: CustomField) => {
    try {
      await fetcher.patch(`/api/admin/custom-fields/${field.id}`, {
        is_active: !field.is_active,
      });
      toast.success(`Custom field ${!field.is_active ? "activated" : "deactivated"}`);
      loadFields();
    } catch (error) {
      console.error("Failed to toggle custom field:", error);
      toast.error("Failed to update custom field");
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading custom fields..." />;
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]} redirectTo="/">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Custom Fields</h1>
            <p className="text-gray-600 mt-1">
              Platform-level definitions: extra fields that can apply to users, providers, bookings, and services. Managed by superadmin only—not by individual providers.
            </p>
            <p className="text-sm text-amber-700 mt-2">
              <strong>Not provider-managed:</strong> Providers do not define their own custom fields here. You define which fields exist for each entity type; those definitions would be used when editing a user, provider, booking, or service (consumer UI may not be wired yet).
            </p>
          </div>
          <Button onClick={handleCreate} className="bg-[#FF0077] hover:bg-[#D60565]">
            <Plus className="w-4 h-4 mr-2" />
            Add Custom Field
          </Button>
        </div>

        {fields.length === 0 ? (
          <EmptyState
            icon={Edit}
            title="No custom fields yet"
            description="Define platform-wide extra fields for user, provider, booking, or service entities. Only superadmin can create or edit these."
            action={{
              label: "Create Custom Field",
              onClick: handleCreate,
            }}
          />
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell className="font-medium">{field.name}</TableCell>
                    <TableCell>{field.label}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{field.field_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{field.entity_type}</Badge>
                    </TableCell>
                    <TableCell>
                      {field.is_required ? (
                        <Badge variant="destructive">Required</Badge>
                      ) : (
                        <span className="text-gray-400">Optional</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={field.is_active}
                        onCheckedChange={() => handleToggleActive(field)}
                      />
                    </TableCell>
                    <TableCell>{field.display_order}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(field)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(field.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingField ? "Edit Custom Field" : "Create Custom Field"}
              </DialogTitle>
              <DialogDescription>
                {editingField
                  ? "Update the custom field details"
                  : "Add a new custom field to collect additional information"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Field Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., emergency_contact"
                  />
                </div>
                <div>
                  <Label htmlFor="label">Display Label *</Label>
                  <Input
                    id="label"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                    placeholder="e.g., Emergency Contact"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="field_type">Field Type *</Label>
                  <Select
                    value={formData.field_type}
                    onValueChange={(value) => setFormData({ ...formData, field_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="textarea">Textarea</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="phone">Phone</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="select">Select</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                      <SelectItem value="radio">Radio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="entity_type">Entity Type *</Label>
                  <Select
                    value={formData.entity_type}
                    onValueChange={(value) => setFormData({ ...formData, entity_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="booking">Booking</SelectItem>
                      <SelectItem value="service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="placeholder">Placeholder</Label>
                <Input
                  id="placeholder"
                  value={formData.placeholder}
                  onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                  placeholder="Enter placeholder text"
                />
              </div>

              <div>
                <Label htmlFor="help_text">Help Text</Label>
                <Textarea
                  id="help_text"
                  value={formData.help_text}
                  onChange={(e) => setFormData({ ...formData, help_text: e.target.value })}
                  placeholder="Additional information to help users"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="default_value">Default Value</Label>
                <Input
                  id="default_value"
                  value={formData.default_value}
                  onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
                  placeholder="Default value for this field"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="display_order">Display Order</Label>
                  <Input
                    id="display_order"
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_required"
                    checked={formData.is_required}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
                  />
                  <Label htmlFor="is_required">Required Field</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!formData.name || !formData.label}
                className="bg-[#FF0077] hover:bg-[#D60565]"
              >
                {editingField ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
