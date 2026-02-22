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
import { fetcher, FetchError } from "@/lib/http/fetcher";
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

interface Resource {
  id: string;
  name: string;
  description?: string | null;
  capacity?: number | null;
  is_active: boolean;
  group_name?: string | null;
  group_color?: string | null;
}

export default function ResourcesSettings() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    capacity: 1,
    is_active: true,
  });

  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Resource[] }>("/api/provider/resources");
      setResources(response.data || []);
    } catch (error: any) {
      console.error("Error loading resources:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to load resources";
      toast.error(errorMessage);
      setResources([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingResource(null);
    setFormData({
      name: "",
      description: "",
      capacity: 1,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (resource: Resource) => {
    setEditingResource(resource);
    setFormData({
      name: resource.name,
      description: resource.description || "",
      capacity: resource.capacity || 1,
      is_active: resource.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this resource? This action cannot be undone.")) return;

    try {
      await fetcher.delete(`/api/provider/resources/${id}`);
      toast.success("Resource deleted successfully");
      await loadResources();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to delete resource";
      toast.error(errorMessage);
      console.error("Error deleting resource:", error);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Resource name is required");
        return;
      }

      if (formData.capacity && formData.capacity < 1) {
        toast.error("Capacity must be at least 1");
        return;
      }

      if (editingResource) {
        await fetcher.patch(`/api/provider/resources/${editingResource.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          capacity: formData.capacity || 1,
          is_active: formData.is_active,
        });
        toast.success("Resource updated successfully");
      } else {
        await fetcher.post("/api/provider/resources", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          capacity: formData.capacity || 1,
          is_active: formData.is_active,
        });
        toast.success("Resource created successfully");
      }
      setIsDialogOpen(false);
      await loadResources();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save resource";
      toast.error(errorMessage);
      console.error("Error saving resource:", error);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Resources" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Resources"
        subtitle="Manage resources and equipment"
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading resources..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Resources"
      subtitle="Manage resources and equipment"
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
              Add resources like treatment rooms, equipment, or tools that need to be booked
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Resource
          </Button>
        </div>

        {resources.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title="No resources yet"
              description="Add resources like treatment rooms, equipment, or tools that need to be booked"
              action={{
                label: "Add Resource",
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resources.map((resource) => (
              <SectionCard key={resource.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{resource.name}</h3>
                    {resource.description && (
                      <p className="text-sm text-gray-600 mb-2">{resource.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {resource.capacity && (
                        <Badge variant="outline" className="text-xs">
                          Capacity: {resource.capacity}
                        </Badge>
                      )}
                      <Badge
                        className={resource.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                      >
                        {resource.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(resource)}
                    className="flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(resource.id)}
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
            <DialogTitle>{editingResource ? "Edit Resource" : "Add Resource"}</DialogTitle>
            <DialogDescription>
              {editingResource
                ? "Update resource information"
                : "Add a new resource that can be booked for appointments"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Treatment Room 1"
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
            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseInt(e.target.value) || 1 })}
                className="mt-1.5 min-h-[44px] touch-manipulation"
              />
              <p className="text-xs text-gray-500 mt-1">Number of people this resource can accommodate</p>
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
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="min-h-[44px] touch-manipulation">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
            >
              {editingResource ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
