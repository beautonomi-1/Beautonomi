"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ServiceAddon {
  id: string;
  name: string;
  description?: string | null;
  type: "service" | "product" | "upgrade";
  category?: string | null;
  price: number;
  currency: string;
  duration_minutes?: number | null;
  is_active: boolean;
  is_recommended: boolean;
  image_url?: string | null;
  provider_id?: string | null;
  service_ids: string[];
  max_quantity?: number | null;
  requires_service: boolean;
  sort_order: number;
}

export default function AdminAddons() {
  const [addons, setAddons] = useState<ServiceAddon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAddon, setEditingAddon] = useState<ServiceAddon | null>(null);
  const [services, setServices] = useState<Array<{ id: string; title: string }>>([]);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    loadAddons();
    loadServices();
  }, [filterType]); // eslint-disable-line react-hooks/exhaustive-deps -- load when filterType changes

  const loadAddons = async () => {
    try {
      setIsLoading(true);
      const params = filterType !== "all" ? `?type=${filterType}` : "";
      const response = await fetcher.get<{ data: ServiceAddon[] }>(`/api/admin/addons${params}`);
      setAddons(response.data || []);
    } catch (error) {
      console.error("Error loading addons:", error);
      toast.error("Failed to load addons");
    } finally {
      setIsLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      const response = await fetcher.get<{ data: Array<{ id: string; title: string }> }>(
        "/api/admin/catalog/services"
      );
      setServices(response.data || []);
    } catch (error) {
      console.error("Error loading services:", error);
    }
  };

  const handleCreate = () => {
    setEditingAddon(null);
    setShowDialog(true);
  };

  const handleEdit = (addon: ServiceAddon) => {
    setEditingAddon(addon);
    setShowDialog(true);
  };

  const handleDelete = async (addon: ServiceAddon) => {
    if (!confirm(`Are you sure you want to delete "${addon.name}"?`)) return;

    try {
      await fetcher.delete(`/api/admin/addons/${addon.id}`);
      toast.success("Addon deleted");
      loadAddons();
    } catch {
      toast.error("Failed to delete addon");
    }
  };

  const handleSave = async (addonData: any) => {
    try {
      if (editingAddon) {
        await fetcher.put(`/api/admin/addons/${editingAddon.id}`, addonData);
        toast.success("Addon updated");
      } else {
        await fetcher.post("/api/admin/addons", addonData);
        toast.success("Addon created");
      }
      setShowDialog(false);
      setEditingAddon(null);
      loadAddons();
    } catch (error: any) {
      toast.error(error.message || "Failed to save addon");
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading addons..." />;
  }

  const filteredAddons = filterType === "all" ? addons : addons.filter((a) => a.type === filterType);

  return (
    <RoleGuard allowedRoles={["superadmin", "provider_owner"]} redirectTo="/admin/dashboard">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Service Addons</h1>
            <p className="text-gray-600">Manage service addons, products, and upgrades</p>
            <p className="text-sm text-amber-600 mt-2">
              Note: Addons are now managed by providers. This page is for provider use only.
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Add Addon
          </Button>
        </div>

        <div className="mb-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="service">Services</SelectItem>
              <SelectItem value="product">Products</SelectItem>
              <SelectItem value="upgrade">Upgrades</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredAddons.length === 0 ? (
          <EmptyState
            title="No addons"
            description="Create addons to offer additional services, products, or upgrades"
            action={{
              label: "Add Addon",
              onClick: handleCreate,
            }}
          />
        ) : (
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredAddons.map((addon) => (
                  <tr key={addon.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{addon.name}</span>
                        {addon.is_recommended && (
                          <Badge variant="default" className="bg-pink-100 text-pink-800">
                            Recommended
                          </Badge>
                        )}
                        {addon.provider_id && (
                          <Badge variant="secondary">Provider</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={addon.type === "service" ? "default" : "secondary"}>
                        {addon.type}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      {addon.currency} {addon.price.toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      {addon.duration_minutes ? `${addon.duration_minutes} mins` : "-"}
                    </td>
                    <td className="px-6 py-4">
                      <Badge className={addon.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {addon.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(addon)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(addon)}>
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showDialog && (
          <AddonDialog
            addon={editingAddon}
            services={services}
            onClose={() => {
              setShowDialog(false);
              setEditingAddon(null);
            }}
            onSave={handleSave}
          />
        )}
      </div>
    </RoleGuard>
  );
}

function AddonDialog({
  addon,
  services,
  onClose,
  onSave,
}: {
  addon: ServiceAddon | null;
  services: Array<{ id: string; title: string }>;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    name: addon?.name || "",
    description: addon?.description || "",
    type: (addon?.type || "service") as "service" | "product" | "upgrade",
    category: addon?.category || "",
    price: addon?.price || 0,
    currency: addon?.currency || "ZAR",
    duration_minutes: addon?.duration_minutes || null,
    is_active: addon?.is_active ?? true,
    is_recommended: addon?.is_recommended ?? false,
    image_url: addon?.image_url || "",
    service_ids: addon?.service_ids || [],
    max_quantity: addon?.max_quantity || null,
    requires_service: addon?.requires_service ?? false,
    sort_order: addon?.sort_order || 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      duration_minutes: formData.duration_minutes || null,
      max_quantity: formData.max_quantity || null,
      price: parseFloat(formData.price.toString()),
      sort_order: parseInt(formData.sort_order.toString()),
    });
  };

  const toggleService = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter((id) => id !== serviceId)
        : [...prev.service_ids, serviceId],
    }));
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{addon ? "Edit Addon" : "Add Addon"}</DialogTitle>
          <DialogDescription>
            Create addons that customers can add to their bookings
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full p-2 border rounded-md min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="type">Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value as any })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="product">Product</SelectItem>
                  <SelectItem value="upgrade">Upgrade</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="price">Price *</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>

            <div>
              <Label htmlFor="currency">Currency *</Label>
              <Input
                id="currency"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                maxLength={3}
                required
              />
            </div>

            <div>
              <Label htmlFor="duration_minutes">Duration (mins)</Label>
              <Input
                id="duration_minutes"
                type="number"
                min="0"
                value={formData.duration_minutes || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="image_url">Image URL</Label>
            <Input
              id="image_url"
              type="url"
              value={formData.image_url}
              onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
            />
          </div>

          <div>
            <Label>Associated Services</Label>
            <div className="mt-2 max-h-40 overflow-y-auto border rounded-md p-2">
              {services.length === 0 ? (
                <p className="text-sm text-gray-500">No services available</p>
              ) : (
                <div className="space-y-2">
                  {services.map((service) => (
                    <label key={service.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.service_ids.includes(service.id)}
                        onChange={() => toggleService(service.id)}
                      />
                      <span className="text-sm">{service.title}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Select services this addon can be added to. Leave empty to allow with any service.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="max_quantity">Max Quantity</Label>
              <Input
                id="max_quantity"
                type="number"
                min="1"
                value={formData.max_quantity || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    max_quantity: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
              />
            </div>

            <div>
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={(e) =>
                  setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              />
              <span>Active</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.is_recommended}
                onChange={(e) => setFormData({ ...formData, is_recommended: e.target.checked })}
              />
              <span>Recommended</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.requires_service}
                onChange={(e) => setFormData({ ...formData, requires_service: e.target.checked })}
              />
              <span>Requires Service</span>
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{addon ? "Update" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
