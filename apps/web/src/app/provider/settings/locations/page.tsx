"use client";

import React, { useState, useEffect } from "react";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, MapPin, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import { useSearchParams } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { LocationMapPickerDialog } from "@/components/mapbox/LocationMapPickerDialog";
import { OperatingHoursEditor, type OperatingHours } from "@/components/provider/OperatingHoursEditor";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";
import { invalidateProviderPortalCache } from "@/providers/provider-portal/ProviderPortalProvider";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";

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
  /** 'salon' = clients can visit; 'base' = distance/travel only (mobile-only) */
  location_type?: "salon" | "base";
  operating_hours?: OperatingHours;
}

export default function LocationsSettings() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<"forbidden" | "other" | null>(null);
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
      setLoadError(null);
      const response = await fetcher.get<{ data: Location[] }>(
        "/api/provider/locations?include_inactive=true"
      );
      setLocations(response.data || []);
    } catch (error) {
      console.error("Error loading locations:", error);
      if (error instanceof FetchError && error.status === 403) {
        setLoadError("forbidden");
        toast.error("You need provider access to view locations. Please sign in with a provider account.");
      } else {
        setLoadError("other");
        toast.error("Failed to load locations");
      }
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
      const res = (await fetcher.delete(`/api/provider/locations/${location.id}`)) as {
        data?: { deactivated?: boolean };
      };
      const deactivated = Boolean(res?.data?.deactivated);
      toast.success(
        deactivated
          ? "Location deactivated (it is still linked to bookings or other records)."
          : "Location removed"
      );
      loadLocations();
    } catch {
      toast.error("Failed to delete location");
    }
  };

  const handleSave = async (locationData: Record<string, unknown> & { label?: string }) => {
    try {
      if (editingLocation) {
        await fetcher.patch(`/api/provider/locations/${editingLocation.id}`, locationData);
        toast.success("Location updated");
      } else {
        await fetcher.post("/api/provider/locations", {
          name: (locationData.label as string) || "Location",
          ...locationData,
        });
        toast.success("Location created");
      }
      setShowDialog(false);
      setEditingLocation(null);
      invalidateSetupStatusCache();
      invalidateProviderPortalCache();
      loadLocations();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to save location";
      toast.error(msg);
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
        <div className="mb-6 bg-gradient-to-r from-primary/10 to-primary-hover/10 border border-primary/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-primary" />
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
            <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Get Started
            </Button>
          </Link>
        </div>
      )}

      {/* Quick link: set service radius / distance for house calls */}
      <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50/50 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-700">
          <span className="font-medium">House calls:</span> Set how far you&apos;re willing to travel (service radius).
        </p>
        <Link href="/provider/settings/distance">
          <Button variant="outline" size="sm" className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 shrink-0">
            Distance & radius
          </Button>
        </Link>
      </div>

      {loadError === "forbidden" ? (
        <SectionCard className="p-12">
          <div className="text-center max-w-md mx-auto">
            <p className="text-muted-foreground mb-2">
              You need provider access to view and manage locations.
            </p>
            <p className="text-sm text-muted-foreground">
              Please sign in with an account that has provider (owner or staff) access, or contact support if you believe you should have access.
            </p>
          </div>
        </SectionCard>
      ) : loadError === "other" ? (
        <SectionCard className="p-12">
          <div className="text-center max-w-md mx-auto">
            <p className="text-muted-foreground mb-4">Couldn&apos;t load locations.</p>
            <Button onClick={loadLocations} variant="outline">Try again</Button>
          </div>
        </SectionCard>
      ) : locations.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title="No locations yet"
            description="Add your business address for travel distance and fees. Add a salon location when clients can visit you in-studio."
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
                      <div className="flex flex-wrap gap-2 mt-1">
                        {location.is_active ? (
                          <span className="text-xs text-primary font-medium">Active</span>
                        ) : (
                          <span className="text-xs text-amber-700 font-medium">Inactive</span>
                        )}
                        {(location.location_type || "salon") === "salon" ? (
                          <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded font-medium">
                            Salon — clients can visit
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded font-medium">
                            Base address (travel distance only)
                          </span>
                        )}
                      </div>
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
  onSave: (data: Record<string, unknown>) => void;
}) {
  const defaultHours: OperatingHours = {
    monday: { open: "09:00", close: "18:00", closed: false },
    tuesday: { open: "09:00", close: "18:00", closed: false },
    wednesday: { open: "09:00", close: "18:00", closed: false },
    thursday: { open: "09:00", close: "18:00", closed: false },
    friday: { open: "09:00", close: "18:00", closed: false },
    saturday: { open: "09:00", close: "18:00", closed: false },
    sunday: { open: "09:00", close: "18:00", closed: false },
  };

  const [locationMapPickerOpen, setLocationMapPickerOpen] = useState(false);

  const [formData, setFormData] = useState({
    label: location?.name ?? "",
    address_line1: location?.address_line1 ?? "",
    address_line2: location?.address_line2 ?? "",
    city: location?.city ?? "",
    state: location?.state ?? "",
    postal_code: location?.postal_code ?? "",
    country: location?.country ?? "ZA",
    phone: location?.phone ?? "",
    description: location?.description ?? "",
    latitude: location?.latitude ?? undefined,
    longitude: location?.longitude ?? undefined,
    operating_hours: location?.operating_hours ?? defaultHours,
    location_type: (location?.location_type || "salon") as "salon" | "base",
    is_active: location?.is_active !== false,
  });

  // Sync form when editing a different location
  useEffect(() => {
    setFormData({
      label: location?.name ?? "",
      address_line1: location?.address_line1 ?? "",
      address_line2: location?.address_line2 ?? "",
      city: location?.city ?? "",
      state: location?.state ?? "",
      postal_code: location?.postal_code ?? "",
      country: location?.country ?? "ZA",
      phone: location?.phone ?? "",
      description: location?.description ?? "",
      latitude: location?.latitude ?? undefined,
      longitude: location?.longitude ?? undefined,
      operating_hours: location?.operating_hours ?? defaultHours,
      location_type: (location?.location_type || "salon") as "salon" | "base",
      is_active: location?.is_active !== false,
    });
  }, [location?.id]);

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
    if (formData.phone?.trim() && !isCompleteE164(formData.phone)) {
      toast.error("Enter a valid phone number or leave the field blank.");
      return;
    }
    onSave({
      name: formData.label,
      ...formData,
      phone: formData.phone?.trim() || null,
      operating_hours: formData.operating_hours,
      location_type: formData.location_type,
      ...(location ? { is_active: formData.is_active } : {}),
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-6 pb-2 border-b border-gray-100">
          <DialogHeader>
            <DialogTitle className="text-xl">{location ? "Edit Location" : "Add Location"}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              {location
                ? "Update address and location type. Salon locations allow in-studio bookings."
                : "Add a business location. Salon = clients can visit; Base = house calls only. Address is geocoded."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Location type */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Location type</h3>
              <p className="text-xs text-muted-foreground">
                Salon: clients can book in-studio. Base: travel distance only (mobile).
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <label
                  className={`flex items-center gap-3 cursor-pointer rounded-xl border-2 p-4 transition-colors ${
                    formData.location_type === "salon"
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="location_type"
                    checked={formData.location_type === "salon"}
                    onChange={() => setFormData({ ...formData, location_type: "salon" })}
                    className="rounded-full border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-gray-900">Salon / studio — clients can visit</span>
                </label>
                <label
                  className={`flex items-center gap-3 cursor-pointer rounded-xl border-2 p-4 transition-colors ${
                    formData.location_type === "base"
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="location_type"
                    checked={formData.location_type === "base"}
                    onChange={() => setFormData({ ...formData, location_type: "base" })}
                    className="rounded-full border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm font-medium text-gray-900">Base address only (travel distance)</span>
                </label>
              </div>
            </section>

            {/* Details */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Details</h3>
              {location && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-800">Location is active (shown in booking flows)</span>
                </label>
              )}
              <div>
                <Label htmlFor="name">Location name *</Label>
                <Input
                  id="name"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="Main Branch"
                  className="mt-1.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 36) setFormData({ ...formData, description: value });
                  }}
                  rows={2}
                  maxLength={36}
                  placeholder="Brief description of this location"
                  className="mt-1.5 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">{formData.description.length}/36</p>
              </div>
            </section>

            {/* Address */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Address</h3>
              <div>
                <Label htmlFor="address">Address *</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                  Type an address and pick a suggestion to fill city, state, postal code and coordinates.
                </p>
                <AddressAutocomplete
                  value={formData.address_line1}
                  onChange={handleAddressSelect}
                  onInputChange={(value) => setFormData((prev) => ({ ...prev, address_line1: value }))}
                  placeholder="Start typing an address..."
                  country={formData.country || "ZA"}
                  className="relative z-[1]"
                  required
                />
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setLocationMapPickerOpen(true)}>
                  <MapPin className="w-4 h-4 mr-2" />
                  Drop pin on map
                </Button>
              </div>
              <div>
                <Label htmlFor="address_line2">Address line 2 (optional)</Label>
                <Input
                  id="address_line2"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                  placeholder="Suite, unit, floor"
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="mt-1.5"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="state">State / Province</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="postal_code">Postal code</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className="mt-1.5"
                    required
                  />
                </div>
              </div>
              <div>
                <PhoneInput
                  inputId="settings-location-dialog-phone"
                  label="Phone (optional)"
                  value={formData.phone}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                  placeholder="Phone number"
                  className="mt-1.5"
                />
              </div>
            </section>

            {/* Operating hours */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">Operating hours</h3>
              <p className="text-xs text-muted-foreground">Opening and closing times for each day.</p>
              <OperatingHoursEditor
                hours={formData.operating_hours}
                onChange={(hours) => setFormData({ ...formData, operating_hours: hours })}
              />
            </section>
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formData.label?.trim() || !formData.address_line1?.trim() || !formData.city?.trim()}>
              {location ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>

      <LocationMapPickerDialog
        open={locationMapPickerOpen}
        onOpenChange={setLocationMapPickerOpen}
        initialLatitude={formData.latitude ?? undefined}
        initialLongitude={formData.longitude ?? undefined}
        defaultCountryName={formData.country || undefined}
        onLocationPicked={(loc) => {
          setFormData(prev => ({
            ...prev,
            address_line1: loc.address_line1 || prev.address_line1,
            city: loc.city || prev.city,
            state: loc.state || prev.state,
            postal_code: loc.postal_code || prev.postal_code,
            country: loc.country || prev.country,
            latitude: loc.latitude,
            longitude: loc.longitude,
          }));
        }}
      />
    </Dialog>
  );
}
