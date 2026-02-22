"use client";

import React, { useState, useEffect, useCallback } from "react";
import { providerApi } from "@/lib/provider-portal/api";
import type { Resource, ResourceGroup } from "@/lib/provider-portal/types";
import { PageHeader } from "@/components/provider/PageHeader";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Package, Users } from "lucide-react";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { SectionCard } from "@/components/provider/SectionCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceGroups, setResourceGroups] = useState<ResourceGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("resources");
  const [isResourceDialogOpen, setIsResourceDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ResourceGroup | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [resourcesData, groupsData] = await Promise.all([
        providerApi.listResources(),
        providerApi.listResourceGroups(),
      ]);
      setResources(resourcesData);
      setResourceGroups(groupsData);
    } catch (error) {
      console.error("Failed to load resources:", error);
      toast.error("Failed to load resources");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateResource = () => {
    setSelectedResource(null);
    setIsResourceDialogOpen(true);
  };

  const handleEditResource = (resource: Resource) => {
    setSelectedResource(resource);
    setIsResourceDialogOpen(true);
  };

  const handleDeleteResource = async (id: string) => {
    if (!confirm("Are you sure you want to delete this resource?")) return;

    try {
      await providerApi.deleteResource(id);
      toast.success("Resource deleted");
      loadData();
    } catch (error) {
      console.error("Failed to delete resource:", error);
      toast.error("Failed to delete resource");
    }
  };

  const handleCreateGroup = () => {
    setSelectedGroup(null);
    setIsGroupDialogOpen(true);
  };

  const handleEditGroup = (group: ResourceGroup) => {
    setSelectedGroup(group);
    setIsGroupDialogOpen(true);
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm("Are you sure you want to delete this resource group?")) return;

    try {
      await providerApi.deleteResourceGroup(id);
      toast.success("Resource group deleted");
      loadData();
    } catch (error) {
      console.error("Failed to delete resource group:", error);
      toast.error("Failed to delete resource group");
    }
  };

  const getTypeColor = (type: Resource["type"]) => {
    switch (type) {
      case "room":
        return "bg-blue-100 text-blue-800";
      case "chair":
        return "bg-green-100 text-green-800";
      case "equipment":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading resources..." />;
  }

  return (
    <div>
      <PageHeader
        title="Resources"
        subtitle="Manage rooms, chairs, equipment, and resource groups"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList>
          <TabsTrigger value="resources">
            <Package className="w-4 h-4 mr-2" />
            Resources
          </TabsTrigger>
          <TabsTrigger value="groups">
            <Users className="w-4 h-4 mr-2" />
            Resource Groups
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resources" className="mt-6">
          <div className="mb-4 flex justify-end">
            <Button onClick={handleCreateResource} className="bg-[#FF0077] hover:bg-[#D60565]">
              <Plus className="w-4 h-4 mr-2" />
              Add Resource
            </Button>
          </div>

          {resources.length === 0 ? (
            <SectionCard className="p-12">
              <EmptyState
                title="No resources"
                description="Add resources like rooms, chairs, or equipment"
                action={{
                  label: "Add Resource",
                  onClick: handleCreateResource,
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
                      <TableHead>Description</TableHead>
                      <TableHead>Capacity</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resources.map((resource) => (
                      <TableRow key={resource.id}>
                        <TableCell className="font-medium">{resource.name}</TableCell>
                        <TableCell>
                          <Badge className={getTypeColor(resource.type)}>
                            {resource.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {resource.description || "-"}
                        </TableCell>
                        <TableCell>
                          {resource.capacity || "-"}
                        </TableCell>
                        <TableCell>
                          {resource.is_active ? (
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
                              onClick={() => handleEditResource(resource)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteResource(resource.id)}
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
        </TabsContent>

        <TabsContent value="groups" className="mt-6">
          <div className="mb-4 flex justify-end">
            <Button onClick={handleCreateGroup} className="bg-[#FF0077] hover:bg-[#D60565]">
              <Plus className="w-4 h-4 mr-2" />
              Add Group
            </Button>
          </div>

          {resourceGroups.length === 0 ? (
            <SectionCard className="p-12">
              <EmptyState
                title="No resource groups"
                description="Create groups to organize related resources"
                action={{
                  label: "Add Group",
                  onClick: handleCreateGroup,
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
                      <TableHead>Description</TableHead>
                      <TableHead>Resources</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resourceGroups.map((group) => (
                      <TableRow key={group.id}>
                        <TableCell className="font-medium">{group.name}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {group.description || "-"}
                        </TableCell>
                        <TableCell>
                          {group.resource_ids.length} resources
                        </TableCell>
                        <TableCell>
                          {group.is_active ? (
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
                              onClick={() => handleEditGroup(group)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteGroup(group.id)}
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
        </TabsContent>
      </Tabs>

      <ResourceDialog
        open={isResourceDialogOpen}
        onOpenChange={setIsResourceDialogOpen}
        resource={selectedResource}
        onSuccess={loadData}
      />

      <ResourceGroupDialog
        open={isGroupDialogOpen}
        onOpenChange={setIsGroupDialogOpen}
        group={selectedGroup}
        resources={resources}
        onSuccess={loadData}
      />
    </div>
  );
}

// Resource Create/Edit Dialog
function ResourceDialog({
  open,
  onOpenChange,
  resource,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: Resource | null;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    type: "other" as Resource["type"],
    description: "",
    capacity: undefined as number | undefined,
    is_active: true,
    color: "#FF0077",
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (resource) {
        setFormData({
          name: resource.name,
          type: resource.type,
          description: resource.description || "",
          capacity: resource.capacity,
          is_active: resource.is_active,
          color: resource.color || "#FF0077",
        });
      } else {
        setFormData({
          name: "",
          type: "other",
          description: "",
          capacity: undefined,
          is_active: true,
          color: "#FF0077",
        });
      }
    }
  }, [open, resource]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (resource) {
        await providerApi.updateResource(resource.id, formData);
        toast.success("Resource updated");
      } else {
        await providerApi.createResource(formData);
        toast.success("Resource created");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save resource:", error);
      toast.error("Failed to save resource");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{resource ? "Edit Resource" : "New Resource"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Resource Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="type">Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value) =>
                setFormData({ ...formData, type: value as Resource["type"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="room">Room</SelectItem>
                <SelectItem value="chair">Chair</SelectItem>
                <SelectItem value="equipment">Equipment</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="capacity">Capacity</Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                value={formData.capacity || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    capacity: parseInt(e.target.value) || undefined,
                  })
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <Label htmlFor="color">Color (for calendar)</Label>
              <Input
                id="color"
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
              />
            </div>
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
              {isLoading ? "Saving..." : resource ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Resource Group Create/Edit Dialog
function ResourceGroupDialog({
  open,
  onOpenChange,
  group,
  resources,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ResourceGroup | null;
  resources: Resource[];
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    resource_ids: [] as string[],
    is_active: true,
  });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (group) {
        setFormData({
          name: group.name,
          description: group.description || "",
          resource_ids: group.resource_ids,
          is_active: group.is_active,
        });
      } else {
        setFormData({
          name: "",
          description: "",
          resource_ids: [],
          is_active: true,
        });
      }
    }
  }, [open, group]);

  const handleToggleResource = (resourceId: string) => {
    setFormData((prev) => ({
      ...prev,
      resource_ids: prev.resource_ids.includes(resourceId)
        ? prev.resource_ids.filter((id) => id !== resourceId)
        : [...prev.resource_ids, resourceId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (group) {
        await providerApi.updateResourceGroup(group.id, formData);
        toast.success("Resource group updated");
      } else {
        await providerApi.createResourceGroup(formData);
        toast.success("Resource group created");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save resource group:", error);
      toast.error("Failed to save resource group");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{group ? "Edit Resource Group" : "New Resource Group"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Group Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div>
            <Label>Resources</Label>
            <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
              {resources.length === 0 ? (
                <p className="text-sm text-gray-500">No resources available</p>
              ) : (
                <div className="space-y-2">
                  {resources.map((resource) => (
                    <div key={resource.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`resource-${resource.id}`}
                        checked={formData.resource_ids.includes(resource.id)}
                        onCheckedChange={() => handleToggleResource(resource.id)}
                      />
                      <Label
                        htmlFor={`resource-${resource.id}`}
                        className="cursor-pointer flex-1"
                      >
                        {resource.name} ({resource.type})
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              {isLoading ? "Saving..." : group ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
