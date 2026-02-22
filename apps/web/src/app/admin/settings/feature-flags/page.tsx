"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import {
  getAllFeatureFlags,
  updateFeatureFlag,
  createFeatureFlag,
  deleteFeatureFlag,
  type FeatureFlag,
} from "@/lib/feature-flags";

export default function FeatureFlagsPage() {
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<FeatureFlag | null>(
    null
  );

  // Form state for create/edit
  const [formData, setFormData] = useState({
    feature_key: "",
    feature_name: "",
    description: "",
    enabled: false,
    category: "",
    metadata: {},
    rollout_percent: 100,
    platforms_allowed: "" as string,
    roles_allowed: "" as string,
    min_app_version: "",
    environments_allowed: "" as string,
  });

  // Fetch feature flags
  const fetchFeatureFlags = async () => {
    try {
      setLoading(true);
      const flags = await getAllFeatureFlags();
      setFeatureFlags(flags);
    } catch {
      toast.error("Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeatureFlags();
  }, []);

  // Get unique categories
  const categories = Array.from(
    new Set(featureFlags.map((flag) => flag.category).filter((cat): cat is string => Boolean(cat)))
  );

  // Filter feature flags
  const filteredFlags = featureFlags.filter((flag) => {
    const matchesSearch =
      flag.feature_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      flag.feature_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (flag.description || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "all" || flag.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Group by category (reserved for future category UI)
  const _groupedFlags = filteredFlags.reduce((acc, flag) => {
    const category = flag.category || "uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(flag);
    return acc;
  }, {} as Record<string, FeatureFlag[]>);

  // Handle toggle feature
  const handleToggleFeature = async (flag: FeatureFlag) => {
    try {
      const updated = await updateFeatureFlag(flag.id, {
        enabled: !flag.enabled,
      });
      setFeatureFlags((prev) =>
        prev.map((f) => (f.id === flag.id ? updated : f))
      );
      toast.success(
        `${flag.feature_name} ${updated.enabled ? "enabled" : "disabled"}`
      );
    } catch (error) {
      console.error("Error toggling feature:", error);
      toast.error("Failed to update feature flag");
    }
  };

  // Handle create
  const handleCreate = async () => {
    try {
      if (!formData.feature_key || !formData.feature_name) {
        toast.error("Feature key and name are required");
        return;
      }

      const newFlag = await createFeatureFlag({
        feature_key: formData.feature_key,
        feature_name: formData.feature_name,
        description: formData.description || null,
        enabled: formData.enabled,
        category: formData.category || null,
        metadata: formData.metadata,
      });

      setFeatureFlags((prev) => [...prev, newFlag]);
      setIsCreateDialogOpen(false);
      setFormData({
        feature_key: "",
        feature_name: "",
        description: "",
        enabled: false,
        category: "",
        metadata: {},
        rollout_percent: 100,
        platforms_allowed: "",
        roles_allowed: "",
        min_app_version: "",
        environments_allowed: "",
      });
      toast.success("Feature flag created successfully");
    } catch (error: any) {
      console.error("Error creating feature flag:", error);
      toast.error(error.message || "Failed to create feature flag");
    }
  };

  // Handle edit
  const handleEdit = async () => {
    if (!selectedFeature) return;

    try {
      const platforms = formData.platforms_allowed
        ? formData.platforms_allowed.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const roles = formData.roles_allowed
        ? formData.roles_allowed.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const environments = formData.environments_allowed
        ? formData.environments_allowed.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      const updated = await updateFeatureFlag(selectedFeature.id, {
        feature_name: formData.feature_name,
        description: formData.description || null,
        enabled: formData.enabled,
        category: formData.category || null,
        metadata: formData.metadata,
        rollout_percent: formData.rollout_percent,
        platforms_allowed: platforms ?? undefined,
        roles_allowed: roles ?? undefined,
        min_app_version: formData.min_app_version || null,
        environments_allowed: environments ?? undefined,
      });

      setFeatureFlags((prev) =>
        prev.map((f) => (f.id === selectedFeature.id ? updated : f))
      );
      setIsEditDialogOpen(false);
      setSelectedFeature(null);
      toast.success("Feature flag updated successfully");
    } catch (error: any) {
      console.error("Error updating feature flag:", error);
      toast.error(error.message || "Failed to update feature flag");
    }
  };

  // Handle delete
  const handleDelete = async (flag: FeatureFlag) => {
    if (
      !confirm(
        `Are you sure you want to delete "${flag.feature_name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await deleteFeatureFlag(flag.id);
      setFeatureFlags((prev) => prev.filter((f) => f.id !== flag.id));
      toast.success("Feature flag deleted successfully");
    } catch (error: any) {
      console.error("Error deleting feature flag:", error);
      toast.error(error.message || "Failed to delete feature flag");
    }
  };

  // Open edit dialog
  const openEditDialog = (flag: FeatureFlag) => {
    setSelectedFeature(flag);
    setFormData({
      feature_key: flag.feature_key,
      feature_name: flag.feature_name,
      description: flag.description || "",
      enabled: flag.enabled,
      category: flag.category || "",
      metadata: flag.metadata || {},
      rollout_percent: flag.rollout_percent ?? 100,
      platforms_allowed: (flag.platforms_allowed ?? []).join(", "),
      roles_allowed: (flag.roles_allowed ?? []).join(", "),
      min_app_version: flag.min_app_version || "",
      environments_allowed: (flag.environments_allowed ?? []).join(", "),
    });
    setIsEditDialogOpen(true);
  };

  if (loading) {
    return <LoadingTimeout loadingMessage="Loading feature flags..." />;
  }

  return (
    <RoleGuard allowedRoles={["superadmin"]}>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Feature Flags</h1>
            <p className="text-muted-foreground mt-1">
              Enable or disable features across the platform
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Feature Flag
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Feature Flag</DialogTitle>
                <DialogDescription>
                  Add a new feature flag to control platform features
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="create-key">Feature Key *</Label>
                  <Input
                    id="create-key"
                    value={formData.feature_key}
                    onChange={(e) =>
                      setFormData({ ...formData, feature_key: e.target.value })
                    }
                    placeholder="e.g., booking_online"
                  />
                </div>
                <div>
                  <Label htmlFor="create-name">Feature Name *</Label>
                  <Input
                    id="create-name"
                    value={formData.feature_name}
                    onChange={(e) =>
                      setFormData({ ...formData, feature_name: e.target.value })
                    }
                    placeholder="e.g., Online Booking"
                  />
                </div>
                <div>
                  <Label htmlFor="create-description">Description</Label>
                  <Textarea
                    id="create-description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe what this feature does..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="create-category">Category</Label>
                  <Input
                    id="create-category"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    placeholder="e.g., booking, payment, notifications"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="create-enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, enabled: checked })
                    }
                  />
                  <Label htmlFor="create-enabled">Enabled</Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreate}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search feature flags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Feature Flags Table */}
        {filteredFlags.length === 0 ? (
          <EmptyState
            title="No feature flags found"
            description={
              searchQuery || selectedCategory !== "all"
                ? "Try adjusting your filters"
                : "Create your first feature flag to get started"
            }
          />
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFlags.map((flag) => (
                  <TableRow key={flag.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{flag.feature_name}</div>
                        {flag.description && (
                          <div className="text-sm text-muted-foreground">
                            {flag.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {flag.feature_key}
                      </code>
                    </TableCell>
                    <TableCell>
                      {flag.category ? (
                        <Badge variant="outline">{flag.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={flag.enabled}
                          onCheckedChange={() => handleToggleFeature(flag)}
                        />
                        <Badge
                          variant={flag.enabled ? "default" : "secondary"}
                        >
                          {flag.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(flag)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(flag)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Feature Flag</DialogTitle>
              <DialogDescription>
                Update the feature flag settings
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-key">Feature Key</Label>
                <Input
                  id="edit-key"
                  value={formData.feature_key}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Feature key cannot be changed
                </p>
              </div>
              <div>
                <Label htmlFor="edit-name">Feature Name *</Label>
                <Input
                  id="edit-name"
                  value={formData.feature_name}
                  onChange={(e) =>
                    setFormData({ ...formData, feature_name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, enabled: checked })
                  }
                />
                <Label htmlFor="edit-enabled">Enabled</Label>
              </div>
              <div className="border-t pt-4 space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Rollout &amp; gating</p>
                <div>
                  <Label htmlFor="edit-rollout">Rollout % (0-100)</Label>
                  <Input
                    id="edit-rollout"
                    type="number"
                    min={0}
                    max={100}
                    value={formData.rollout_percent}
                    onChange={(e) =>
                      setFormData({ ...formData, rollout_percent: parseInt(e.target.value, 10) || 100 })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="edit-platforms">Platforms allowed (comma-separated: web, customer, provider)</Label>
                  <Input
                    id="edit-platforms"
                    value={formData.platforms_allowed}
                    onChange={(e) =>
                      setFormData({ ...formData, platforms_allowed: e.target.value })
                    }
                    placeholder="web, customer, provider or empty for all"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-roles">Roles allowed (comma-separated)</Label>
                  <Input
                    id="edit-roles"
                    value={formData.roles_allowed}
                    onChange={(e) =>
                      setFormData({ ...formData, roles_allowed: e.target.value })
                    }
                    placeholder="superadmin, provider_owner, customer or empty for all"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-min-version">Min app version</Label>
                  <Input
                    id="edit-min-version"
                    value={formData.min_app_version}
                    onChange={(e) =>
                      setFormData({ ...formData, min_app_version: e.target.value })
                    }
                    placeholder="e.g. 1.2.0 or empty"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-envs">Environments allowed (comma-separated)</Label>
                  <Input
                    id="edit-envs"
                    value={formData.environments_allowed}
                    onChange={(e) =>
                      setFormData({ ...formData, environments_allowed: e.target.value })
                    }
                    placeholder="production, staging, development or empty for all"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleEdit}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  );
}
