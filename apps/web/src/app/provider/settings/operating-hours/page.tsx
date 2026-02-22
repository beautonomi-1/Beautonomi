"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { SectionCard } from "@/components/provider/SectionCard";
import { Clock } from "lucide-react";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { OperatingHoursEditor, type OperatingHours } from "@/components/provider/OperatingHoursEditor";
import { invalidateSetupStatusCache } from "@/lib/provider-portal/setup-status-utils";

interface Location {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  state?: string | null;
  country: string;
  operating_hours?: OperatingHours;
}

export default function OperatingHoursSettings() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [operatingHours, setOperatingHours] = useState<OperatingHours>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    if (selectedLocationId) {
      const location = locations.find((loc) => loc.id === selectedLocationId);
      if (location) {
        const defaultHours: OperatingHours = {
          monday: { open: "09:00", close: "18:00", closed: false },
          tuesday: { open: "09:00", close: "18:00", closed: false },
          wednesday: { open: "09:00", close: "18:00", closed: false },
          thursday: { open: "09:00", close: "18:00", closed: false },
          friday: { open: "09:00", close: "18:00", closed: false },
          saturday: { open: "09:00", close: "18:00", closed: false },
          sunday: { open: "09:00", close: "18:00", closed: true },
        };
        setOperatingHours(location.operating_hours || defaultHours);
        setHasChanges(false);
      }
    }
  }, [selectedLocationId, locations]);

  const loadLocations = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: Location[] }>("/api/provider/locations");
      const locationsData = response.data || [];
      setLocations(locationsData);
      
      // Auto-select first location if available
      if (locationsData.length > 0 && !selectedLocationId) {
        setSelectedLocationId(locationsData[0].id);
      }
    } catch (error) {
      console.error("Error loading locations:", error);
      toast.error("Failed to load locations");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedLocationId) {
      toast.error("Please select a location");
      return;
    }

    try {
      setIsSaving(true);
      await fetcher.patch(`/api/provider/locations/${selectedLocationId}`, {
        operating_hours: operatingHours,
      });
      toast.success("Operating hours updated successfully");
      setHasChanges(false);
      invalidateSetupStatusCache();
      // Reload locations to get updated data
      await loadLocations();
    } catch (error: any) {
      toast.error(error.message || "Failed to save operating hours");
    } finally {
      setIsSaving(false);
    }
  };

  const handleHoursChange = (hours: OperatingHours) => {
    setOperatingHours(hours);
    setHasChanges(true);
  };

  const selectedLocation = locations.find((loc) => loc.id === selectedLocationId);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Operating Hours" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title="Operating Hours"
        subtitle="Manage opening and closing times for your locations"
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage="Loading locations..." />
      </SettingsDetailLayout>
    );
  }

  if (locations.length === 0) {
    return (
      <SettingsDetailLayout
        title="Operating Hours"
        subtitle="Manage opening and closing times for your locations"
        breadcrumbs={breadcrumbs}
      >
        <SectionCard className="p-12">
          <EmptyState
            title="No locations found"
            description="Add a location first to manage operating hours"
            action={{
              label: "Add Location",
              onClick: () => (window.location.href = "/provider/settings/locations"),
            }}
          />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title="Operating Hours"
      subtitle="Manage opening and closing times for your locations"
      onSave={handleSave}
      saveLabel={isSaving ? "Saving..." : "Save Changes"}
      saveDisabled={isSaving || !hasChanges || !selectedLocationId}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="w-full">
        <div className="space-y-6">
          {/* Location Selector */}
          <div className="space-y-2">
            <Label htmlFor="location-select">Select Location</Label>
            <Select
              value={selectedLocationId || ""}
              onValueChange={setSelectedLocationId}
            >
              <SelectTrigger id="location-select" className="w-full sm:w-auto min-w-[300px]">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name} - {location.city}, {location.country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLocation && (
              <p className="text-sm text-gray-600">
                {selectedLocation.address_line1}, {selectedLocation.city}
                {selectedLocation.state && `, ${selectedLocation.state}`}
              </p>
            )}
          </div>

          {/* Operating Hours Editor */}
          {selectedLocationId && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Operating Hours
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Set the opening and closing times for each day of the week. Uncheck "Open" to mark a day as closed.
                </p>
                <OperatingHoursEditor
                  hours={operatingHours}
                  onChange={handleHoursChange}
                />
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Operating hours determine when customers can book appointments at this location.
              Make sure to keep these hours up to date to avoid booking conflicts.
            </p>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
