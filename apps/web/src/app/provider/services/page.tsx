"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  DollarSign,
  Clock,
  Tag,
} from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import type { OfferingCard } from "@/types/beautonomi";
import { toast } from "sonner";

export default function ProviderServices() {
  const [services, setServices] = useState<OfferingCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingService, setEditingService] = useState<OfferingCard | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: OfferingCard[] }>(
        "/api/provider/services"
      );
      setServices(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load services";
      setError(errorMessage);
      console.error("Error loading services:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this service?")) return;

    try {
      await fetcher.delete(`/api/provider/services/${id}`);
      toast.success("Service deleted successfully");
      loadServices();
    } catch {
      toast.error("Failed to delete service");
    }
  };

  const filteredServices = services.filter((service) =>
    service.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading services..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner", "provider_staff"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Services</h1>
            <p className="text-gray-600">Manage your service offerings</p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Service
          </Button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search services..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Services List */}
        {error ? (
          <EmptyState
            title="Failed to load services"
            description={error}
            action={{
              label: "Retry",
              onClick: loadServices,
            }}
          />
        ) : filteredServices.length === 0 ? (
          <EmptyState
            title="No services yet"
            description="Get started by adding your first service offering"
            action={{
              label: "Add Service",
              onClick: () => setShowAddModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={() => setEditingService(service)}
                onDelete={() => handleDelete(service.id)}
              />
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {(showAddModal || editingService) && (
          <ServiceModal
            service={editingService}
            onClose={() => {
              setShowAddModal(false);
              setEditingService(null);
            }}
            onSave={() => {
              setShowAddModal(false);
              setEditingService(null);
              loadServices();
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}

function ServiceCard({
  service,
  onEdit,
  onDelete,
}: {
  service: OfferingCard;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold">{service.title}</h3>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="p-1 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-600 hover:text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4" />
          <span>
            {service.currency} {service.price?.toFixed(2)}
          </span>
        </div>
        {service.duration_minutes && (
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{service.duration_minutes} minutes</span>
          </div>
        )}
        {(service as any).category_name && (
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <span>{(service as any).category_name}</span>
          </div>
        )}
      </div>

      {service.description && (
        <p className="mt-4 text-sm text-gray-600 line-clamp-2">
          {service.description}
        </p>
      )}

      <div className="mt-4 pt-4 border-t">
        <span
          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            service.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {service.is_active ? "Active" : "Inactive"}
        </span>
      </div>
    </div>
  );
}

function ServiceModal({
  service,
  onClose,
  onSave,
}: {
  service: OfferingCard | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    title: service?.title || "",
    description: service?.description || "",
    price: service?.price || 0,
    duration_minutes: service?.duration_minutes || 60,
    category_id: (service as any)?.category_id || "",
    is_active: service?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);

      if (service) {
        await fetcher.patch(`/api/provider/services/${service.id}`, formData);
      } else {
        await fetcher.post("/api/provider/services", formData);
      }

      toast.success(service ? "Service updated" : "Service created");
      onSave();
    } catch {
      toast.error("Failed to save service");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {service ? "Edit Service" : "Add Service"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Service Name *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full p-2 border rounded-md min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="price">Price (ZAR) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: parseFloat(e.target.value) })
                }
                required
              />
            </div>
            <div>
              <Label htmlFor="duration">Duration (minutes) *</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    duration_minutes: parseInt(e.target.value),
                  })
                }
                required
              />
            </div>
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={formData.category_id}
              onChange={(e) =>
                setFormData({ ...formData, category_id: e.target.value })
              }
              placeholder="Category ID"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
            />
            <Label htmlFor="is_active">Active (visible to customers)</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Saving..." : service ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
