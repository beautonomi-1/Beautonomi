"use client";

import React, { useState, useEffect } from "react";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, MapPin, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddressForm from "@/components/mapbox/AddressForm";
import { OperatingHoursEditor, type OperatingHours } from "@/components/provider/OperatingHoursEditor";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";

interface Location {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  description?: string | null;
  is_active: boolean;
  operating_hours?: OperatingHours;
}

export default function LocationsSettings() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Location[] }>("/api/provider/locations");
      setLocations(response.data || []);
    } catch (error) {
      console.error("Error loading locations:", error);
      toast.error("Failed to load locations");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingLocation(null);
    setShowDialog(true);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setShowDialog(true);
  };

  const handleDelete = async (location: Location) => {
    if (!confirm(`Are you sure you want to delete "${location.name}"?`)) return;

    try {
      await fetcher.delete(`/api/provider/locations/${location.id}`);
      toast.success("Location deleted");
      loadLocations();
    } catch {
      toast.error("Failed to delete location");
    }
  };

  const handleSave = async (locationData: any) => {
    try {
      if (editingLocation) {
        await fetcher.patch(`/api/provider/locations/${editingLocation.id}`, locationData);
        toast.success("Location updated");
      } else {
        await fetcher.post("/api/provider/locations", {
          name: locationData.label || "Location",
          ...locationData,
        });
        toast.success("Location created");
      }
      setShowDialog(false);
      setEditingLocation(null);
      invalidateSetupStatusCache();
      loadLocations();
    } catch (error: any) {
      toast.error(error.message || "Failed to save location");
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage="Loading locations..." />;
  }

  return (
    <div>
      <PageHeader
        title="Locations"
        subtitle="Manage your business locations"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          ...(returnTo ? [{ label: "Get Started", href: returnTo }] : []),
          { label: "Settings", href: "/provider/settings" },
          { label: "Locations" }
        ]}
        primaryAction={{
          label: "Add a new location",
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 mr-2" />,
        }}
      />

      {/* Return to Get Started banner */}
      {returnTo && (
        <div className="mb-6 bg-gradient-to-r from-[#FF0077]/10 to-[#D60565]/10 border border-[#FF0077]/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-[#FF0077]" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                Complete this step to continue your setup
              </p>
              <p className="text-xs text-gray-600">
                Add your business location to help customers find you
              </p>
            </div>
          </div>
          <Link href={returnTo}>
            <Button variant="outline" size="sm" className="border-[#FF0077]/30 text-[#FF0077] hover:bg-[#FF0077]/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Get Started
            </Button>
          </Link>
        </div>
      )}

      {locations.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No locations yet"
            description="Add your first business location to get started"
            action={{
              label: "Add Location",
              onClick: handleCreate,
            }}
          />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {locations.map((location) => (
            <SectionCard key={location.id} className="relative">
              <div className="flex gap-4">
                {/* Map Preview Placeholder */}
                <div className="w-32 h-32 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-8 h-8 text-gray-400" />
                </div>

                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-lg">{location.name}</h3>
                      {location.is_active && (
                        <span className="text-xs text-[#FF0077] font-medium">Active</span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {location.address_line1}
                    {location.address_line2 && `, ${location.address_line2}`}
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    {location.city}
                    {location.state && `, ${location.state}`}
                    {location.postal_code && ` ${location.postal_code}`}
                    {`, ${location.country}`}
                  </p>
                  {location.latitude && location.longitude && (
                    <p className="text-xs text-gray-400 mb-4">
                      Coordinates: {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(location)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(location)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      {showDialog && (
        <LocationDialog
          location={editingLocation}
          onClose={() => {
            setShowDialog(false);
            setEditingLocation(null);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function LocationDialog({
  location,
  onClose,
  onSave,
}: {
  location: Location | null;
  onClose: () => void;
  onSave: (data: any) => void;
}) {
  const defaultHours: OperatingHours = {
    monday: { open: "09:00", close: "18:00", closed: false },
    tuesday: { open: "09:00", close: "18:00", closed: false },
    wednesday: { open: "09:00", close: "18:00", closed: false },
    thursday: { open: "09:00", close: "18:00", closed: false },
    friday: { open: "09:00", close: "18:00", closed: false },
    saturday: { open: "09:00", close: "18:00", closed: false },
    sunday: { open: "09:00", close: "18:00", closed: true },
  };

  const [formData, setFormData] = useState({
    label: location?.name || "",
    address_line1: location?.address_line1 || "",
    address_line2: location?.address_line2 || "",
    city: location?.city || "",
    state: location?.state || "",
    postal_code: location?.postal_code || "",
    country: location?.country || "",
    phone: location?.phone || "",
    description: location?.description || "",
    latitude: location?.latitude || undefined,
    longitude: location?.longitude || undefined,
    operating_hours: location?.operating_hours || defaultHours,
  });

  const handleAddressSelect = (address: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
  }) => {
    setFormData({
      ...formData,
      address_line1: address.address_line1,
      city: address.city,
      state: address.state || "",
      postal_code: address.postal_code || "",
      country: address.country,
      latitude: address.latitude,
      longitude: address.longitude,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: formData.label,
      ...formData,
      operating_hours: formData.operating_hours,
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{location ? "Edit Location" : "Add Location"}</DialogTitle>
          <DialogDescription>
            Add a business location. Address will be automatically geocoded.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Location Name *</Label>
            <Input
              id="name"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Main Branch"
              required
            />
          </div>

          <div>
            <Label htmlFor="address">Address *</Label>
            <AddressForm
              initialAddress={location ? {
                address_line1: location.address_line1,
                address_line2: location.address_line2 || undefined,
                city: location.city,
                state: location.state || undefined,
                postal_code: location.postal_code || undefined,
                country: location.country,
                latitude: location.latitude || undefined,
                longitude: location.longitude || undefined,
              } : undefined}
              onSave={(address) => {
                handleAddressSelect(address);
                // Auto-submit if editing existing location
                if (location) {
                  onSave({
                    name: formData.label,
                    ...address,
                    phone: formData.phone,
                  });
                }
              }}
              showLabel={false}
              asForm={false}
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone (Optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+27 11 123 4567"
            />
          </div>

          <div>
            <Label htmlFor="description">Location Description (Optional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 36) {
                  setFormData({ ...formData, description: value });
                }
              }}
              rows={2}
              maxLength={36}
              placeholder="Brief description of this location..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.description.length}/36 characters
            </p>
          </div>

          <div>
            <Label>Operating Hours</Label>
            <p className="text-sm text-gray-600 mb-3">
              Set the opening and closing times for each day of the week
            </p>
            <OperatingHoursEditor
              hours={formData.operating_hours}
              onChange={(hours) => setFormData({ ...formData, operating_hours: hours })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.label || !formData.address_line1 || !formData.city}>
              {location ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
