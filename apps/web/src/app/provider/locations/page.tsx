"use client";

import React, { useState, useEffect } from "react";
import RoleGuard from "@/components/auth/RoleGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, MapPin, Phone, Clock, Sparkles } from "lucide-react";
import { fetcher, FetchError, FetchTimeoutError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Location {
  id: string;
  name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  phone?: string;
  email?: string;
  operating_hours?: {
    [key: string]: { open: string; close: string; closed: boolean };
  };
  is_active: boolean;
  latitude?: number;
  longitude?: number;
}

export default function ProviderLocations() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [showZoneSuggestions, setShowZoneSuggestions] = useState(false);
  const [suggestedZones, setSuggestedZones] = useState<any[]>([]);

  useEffect(() => {
    loadLocations();
    
    // Check for zone suggestions from location save
    const checkZoneSuggestions = () => {
      if ((window as any).__showZoneSuggestions && (window as any).__zoneSuggestions) {
        setSuggestedZones((window as any).__zoneSuggestions);
        setShowZoneSuggestions(true);
        (window as any).__showZoneSuggestions = false;
        (window as any).__zoneSuggestions = null;
      }
    };
    
    // Check immediately and also set up interval for delayed checks
    checkZoneSuggestions();
    const interval = setInterval(checkZoneSuggestions, 500);
    
    return () => clearInterval(interval);
  }, []);

  const loadLocations = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetcher.get<{ data: Location[] }>(
        "/api/provider/locations"
      );
      setLocations(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof FetchTimeoutError
          ? "Request timed out. Please try again."
          : err instanceof FetchError
          ? err.message
          : "Failed to load locations";
      setError(errorMessage);
      console.error("Error loading locations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this location?")) return;

    try {
      await fetcher.delete(`/api/provider/locations/${id}`);
      toast.success("Location deleted successfully");
      loadLocations();
    } catch {
      toast.error("Failed to delete location");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage="Loading locations..." />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Locations</h1>
            <p className="text-gray-600">Manage your business locations</p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Location
          </Button>
        </div>

        {/* Locations List */}
        {error ? (
          <EmptyState
            title="Failed to load locations"
            description={error}
            action={{
              label: "Retry",
              onClick: loadLocations,
            }}
          />
        ) : locations.length === 0 ? (
          <EmptyState
            title="No locations yet"
            description="Add your first business location to get started"
            action={{
              label: "Add Location",
              onClick: () => setShowAddModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {locations.map((location) => (
              <LocationCard
                key={location.id}
                location={location}
                onEdit={() => setEditingLocation(location)}
                onDelete={() => handleDelete(location.id)}
              />
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {(showAddModal || editingLocation) && (
          <LocationModal
            location={editingLocation}
            onClose={() => {
              setShowAddModal(false);
              setEditingLocation(null);
            }}
            onSave={() => {
              setShowAddModal(false);
              setEditingLocation(null);
              loadLocations();
            }}
          />
        )}

        {/* Zone Suggestions Modal */}
        {showZoneSuggestions && suggestedZones.length > 0 && (
          <ZoneSuggestionsModal
            zones={suggestedZones}
            onClose={() => setShowZoneSuggestions(false)}
            onSelectZone={(zoneId) => {
              window.location.href = `/provider/settings/service-zones?select=${zoneId}`;
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}

function ZoneSuggestionsModal({
  zones,
  onClose,
  onSelectZone,
}: {
  zones: any[];
  onClose: () => void;
  onSelectZone: (zoneId: string) => void;
}) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Sparkles className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle>Service Zone Suggestions</DialogTitle>
              <DialogDescription className="mt-1">
                We found {zones.length} zone{zones.length !== 1 ? "s" : ""} matching your location. Select zones to start offering at-home services.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mb-6">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="border-2 border-blue-200 rounded-lg p-4 bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{zone.name}</h3>
                  <p className="text-sm text-blue-700 mb-2">{zone.match_reason}</p>
                  <p className="text-xs text-gray-600">
                    Type: {zone.zone_type === "postal_code" ? "Postal Code" : 
                           zone.zone_type === "city" ? "City" :
                           zone.zone_type === "radius" ? "Radius" : "Polygon"}
                  </p>
                </div>
                <Button
                  onClick={() => onSelectZone(zone.id)}
                  className="bg-[#FF0077] hover:bg-[#D60565] text-white ml-4"
                >
                  Select Zone
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Maybe Later
          </Button>
          <Button
            onClick={() => {
              window.location.href = "/provider/settings/service-zones";
            }}
            className="bg-[#FF0077] hover:bg-[#D60565] text-white"
          >
            View All Zones
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LocationCard({
  location,
  onEdit,
  onDelete,
}: {
  location: Location;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white border rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <MapPin className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{location.name}</h3>
            <p className="text-sm text-gray-600">
              {location.city}, {location.state}
            </p>
          </div>
        </div>
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

      <div className="space-y-2 text-sm text-gray-600 mb-4">
        <p>
          {location.address_line1}
          {location.address_line2 && `, ${location.address_line2}`}
        </p>
        <p>
          {location.city}, {location.state} {location.postal_code}
        </p>
        <p>{location.country}</p>
        {location.phone && (
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4" />
            <span>{location.phone}</span>
          </div>
        )}
        {location.email && (
          <div className="flex items-center gap-2">
            <span>{location.email}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <span
          className={`px-2 py-1 rounded text-xs font-medium ${
            location.is_active
              ? "bg-green-100 text-green-800"
              : "bg-gray-100 text-gray-800"
          }`}
        >
          {location.is_active ? "Active" : "Inactive"}
        </span>
        {location.operating_hours && (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <Clock className="w-3 h-3" />
            <span>Hours set</span>
          </div>
        )}
      </div>
    </div>
  );
}

function LocationModal({
  location,
  onClose,
  onSave,
}: {
  location: Location | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    name: location?.name || "",
    address_line1: location?.address_line1 || "",
    address_line2: location?.address_line2 || "",
    city: location?.city || "",
    state: location?.state || "",
    postal_code: location?.postal_code || "",
    country: location?.country || "South Africa",
    phone: location?.phone || "",
    email: location?.email || "",
    is_active: location?.is_active ?? true,
    latitude: location?.latitude || undefined,
    longitude: location?.longitude || undefined,
  });
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation for required fields
    if (!formData.name?.trim()) {
      toast.error("Location name is required");
      return;
    }
    if (!formData.address_line1?.trim()) {
      toast.error("Address is required");
      return;
    }
    if (!formData.city?.trim()) {
      toast.error("City is required");
      return;
    }
    if (!formData.country?.trim()) {
      toast.error("Country is required");
      return;
    }

    try {
      setIsSaving(true);

      const submitData = {
        name: formData.name.trim(),
        address_line1: formData.address_line1.trim(),
        address_line2: formData.address_line2?.trim() || null,
        city: formData.city.trim(),
        state: formData.state?.trim() || null,
        postal_code: formData.postal_code?.trim() || null,
        country: formData.country.trim(),
        phone: formData.phone?.trim() || null,
        email: formData.email?.trim() || null,
        is_active: formData.is_active,
        latitude: formData.latitude || null,
        longitude: formData.longitude || null,
      };

      let response;
      if (location) {
        response = await fetcher.patch<{ data: any }>(`/api/provider/locations/${location.id}`, submitData);
      } else {
        response = await fetcher.post<{ data: any }>("/api/provider/locations", submitData);
      }

      toast.success(location ? "Location updated" : "Location added");
      
      // Check if zone suggestions are available
      if (response.data?._metadata?.has_zone_suggestions && response.data?._metadata?.suggested_zones?.length > 0) {
        // Store suggestions for modal display
        (window as any).__zoneSuggestions = response.data._metadata.suggested_zones;
        (window as any).__showZoneSuggestions = true;
      }
      
      onSave();
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to save location";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-semibold mb-4">
          {location ? "Edit Location" : "Add Location"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Location Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Main Salon, Branch Location, etc."
              required
            />
          </div>

          <div>
            <Label htmlFor="address">Address *</Label>
            <p className="text-sm text-gray-600 mb-2">
              Start typing an address and select from suggestions. Address will be automatically geocoded with coordinates.
            </p>
            <AddressAutocomplete
              value={formData.address_line1}
              onChange={handleAddressSelect}
              placeholder="Start typing an address..."
              country={formData.country}
              required
            />
          </div>

          <div>
            <Label htmlFor="address_line2">Apt/Suite (optional)</Label>
            <Input
              id="address_line2"
              value={formData.address_line2}
              onChange={(e) =>
                setFormData({ ...formData, address_line2: e.target.value })
              }
              placeholder="Apt 4B, Suite 201, etc."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="state">State/Province</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="postal_code">Postal Code</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) =>
                  setFormData({ ...formData, postal_code: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="country">Country *</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) =>
                  setFormData({ ...formData, country: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
            </div>
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
            <Button 
              type="submit" 
              disabled={isSaving || !formData.name?.trim() || !formData.address_line1?.trim() || !formData.city?.trim() || !formData.country?.trim()} 
              className="flex-1"
            >
              {isSaving ? "Saving..." : location ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
