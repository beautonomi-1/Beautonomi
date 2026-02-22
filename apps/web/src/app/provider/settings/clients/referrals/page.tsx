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

interface ReferralSource {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export default function ReferralSourcesSettings() {
  const [sources, setSources] = useState<ReferralSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<ReferralSource | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: ReferralSource[] }>(
        "/api/provider/referral-sources"
      );
      setSources(response.data || []);
    } catch (error: any) {
      console.error("Error loading referral sources:", error);
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to load referral sources";
      toast.error(errorMessage);
      setSources([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingSource(null);
    setFormData({
      name: "",
      description: "",
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (source: ReferralSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      description: source.description || "",
      is_active: source.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this referral source? This action cannot be undone.")) return;

    try {
      await fetcher.delete(`/api/provider/referral-sources/${id}`);
      toast.success("Referral source deleted successfully");
      await loadSources();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to delete referral source";
      toast.error(errorMessage);
      console.error("Error deleting referral source:", error);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Referral source name is required");
        return;
      }

      if (editingSource) {
        await fetcher.patch(`/api/provider/referral-sources/${editingSource.id}`, {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        });
        toast.success("Referral source updated successfully");
      } else {
        await fetcher.post("/api/provider/referral-sources", {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          is_active: formData.is_active,
        });
        toast.success("Referral source created successfully");
      }
      setIsDialogOpen(false);
      await loadSources();
    } catch (error: any) {
      const errorMessage = error instanceof FetchError
        ? error.message
        : error?.error?.message || "Failed to save referral source";
      toast.error(errorMessage);
      console.error("Error saving referral source:", error);
    }
  };

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Clients", href: "/provider/settings/clients/list" },
    { label: "Referral Sources" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Referral Sources"
        subtitle="Track where your clients come from"
        breadcrumbs={breadcrumbs}
      >
        <SectionCard>
          <LoadingTimeout loadingMessage="Loading referral sources..." />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Referral Sources"
      subtitle="Track where your clients come from"
      breadcrumbs={breadcrumbs}
    >
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <p className="text-sm text-gray-600">
              Add referral sources to track where your clients come from
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="w-full sm:w-auto bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Source
          </Button>
        </div>

        {sources.length === 0 ? (
          <SectionCard className="p-8 sm:p-12">
            <EmptyState
              title="No referral sources yet"
              description="Add referral sources to track where your clients come from"
              action={{
                label: "Add Source",
                onClick: handleCreate,
              }}
            />
          </SectionCard>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map((source) => (
              <SectionCard key={source.id} className="p-4 sm:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base sm:text-lg mb-1">{source.name}</h3>
                    {source.description && (
                      <p className="text-sm text-gray-600 mb-2">{source.description}</p>
                    )}
                    <Badge
                      className={source.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}
                    >
                      {source.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(source)}
                    className="flex-1 min-h-[36px] touch-manipulation"
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(source.id)}
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
              {editingSource ? "Edit Referral Source" : "Add Referral Source"}
            </DialogTitle>
            <DialogDescription>
              {editingSource
                ? "Update referral source information"
                : "Add a new referral source to track where clients come from"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Google, Facebook, Referral"
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
              {editingSource ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
