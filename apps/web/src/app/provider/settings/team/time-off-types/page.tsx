"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2 } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import { fetcher } from "@/lib/http/fetcher";
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

interface TimeOffType {
  id: string;
  name: string;
  description?: string | null;
  is_paid: boolean;
  is_active: boolean;
}

export default function TimeOffTypesSettings() {
  const [types, setTypes] = useState<TimeOffType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<TimeOffType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_paid: false,
    is_active: true,
  });

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: TimeOffType[] }>(
        "/api/provider/time-off-types"
      );
      setTypes(response.data || []);
    } catch (error: any) {
      console.error("Error loading time off types:", error);
      toast.error("Failed to load time off types");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingType(null);
    setFormData({
      name: "",
      description: "",
      is_paid: false,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (type: TimeOffType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description || "",
      is_paid: type.is_paid,
      is_active: type.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this time off type?")) return;

    try {
      await fetcher.delete(`/api/provider/time-off-types/${id}`);
      toast.success("Time off type deleted");
      loadTypes();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete time off type");
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Time off type name is required");
        return;
      }

      if (editingType) {
        await fetcher.patch(`/api/provider/time-off-types/${editingType.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_paid: formData.is_paid,
          is_active: formData.is_active,
        });
        toast.success("Time off type updated");
      } else {
        await fetcher.post("/api/provider/time-off-types", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_paid: formData.is_paid,
          is_active: formData.is_active,
        });
        toast.success("Time off type created");
      }
      setIsDialogOpen(false);
      loadTypes();
    } catch (error: any) {
      toast.error(error.message || "Failed to save time off type");
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Team", href: "/provider/settings/team/roles" },
    { label: "Time Off Types" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Time Off Types"
        subtitle="Manage time off categories for your team"
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading time off types..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Time Off Types"
      subtitle="Manage time off categories for your team"
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
              Create time off types like Vacation, Sick Leave, Personal Day, etc.
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Time Off Type
          </Button>
        </div>

        {types.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title="No time off types yet"
              description="Create time off types like Vacation, Sick Leave, Personal Day, etc."
              action={{
                label: "Add Time Off Type",
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {types.map((type) => (
              <SectionCard key={type.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{type.name}</h3>
                    {type.description && (
                      <p className="text-sm text-gray-600 mb-2">{type.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        className={type.is_paid ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}
                      >
                        {type.is_paid ? "Paid" : "Unpaid"}
                      </Badge>
                      <Badge
                        className={type.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
                        {type.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(type)}
                    className="flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(type.id)}
                    className="text-red-600 hover:text-red-700 flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
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
              {editingType ? "Edit Time Off Type" : "Add Time Off Type"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Update time off type information"
                : "Create a new time off type for your team"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Vacation, Sick Leave, Personal Day"
                className="mt-1.5 min-h-[44px] touch-manipulation"
                required
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
                rows={3}
                className="mt-1.5"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_paid"
                checked={formData.is_paid}
                onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_paid" className="cursor-pointer">
                Paid time off
              </Label>
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
                Active
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              className="min-h-[44px] touch-manipulation"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              {editingType ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
