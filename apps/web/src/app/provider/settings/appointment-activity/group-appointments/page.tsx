"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { providerApi } from "@/lib/provider-portal/api";
import { fetcher } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { Save, MapPin } from "lucide-react";
import type { ServiceItem, ServiceCategory } from "@/lib/provider-portal/types";

interface Location {
  id: string;
  name: string;
  address_line1: string;
  city: string;
  is_active: boolean;
}

export default function GroupAppointmentsSettings() {
  const [_isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  
  const [settings, setSettings] = useState({
    enableGroupBooking: false,
    allowOnlineGroupBooking: false,
    maxGroupSize: 5,
    enabledLocations: [] as string[], // Location IDs where group booking is enabled
    excludedServices: [] as string[], // Service IDs excluded from online group booking
  });

  useEffect(() => {
    loadSettings();
    loadServices();
    loadLocations();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{
        data: {
          enableGroupBooking: boolean;
          allowOnlineGroupBooking: boolean;
          maxGroupSize: number;
          enabledLocations: string[];
          excludedServices: string[];
        };
      }>("/api/provider/settings/group-bookings");
      setSettings(response.data);
    } catch (error) {
      console.error("Failed to load settings:", error);
      toast.error("Failed to load settings");
      // Keep defaults on error
      setSettings({
        enableGroupBooking: false,
        allowOnlineGroupBooking: false,
        maxGroupSize: 5,
        enabledLocations: [],
        excludedServices: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadServices = async () => {
    try {
      const categories = await providerApi.listServiceCategories();
      const allServices = categories.flatMap((cat: ServiceCategory) => cat.services || []);
      setServices(allServices);
    } catch (error) {
      console.error("Failed to load services:", error);
    }
  };

  const loadLocations = async () => {
    try {
      const response = await fetcher.get<{ data: Location[] }>("/api/provider/locations");
      setLocations(response.data.filter(loc => loc.is_active));
    } catch (error) {
      console.error("Failed to load locations:", error);
      // Don't show error toast - locations are optional
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await fetcher.patch("/api/provider/settings/group-bookings", {
        enable_group_booking: settings.enableGroupBooking,
        allow_online_group_booking: settings.allowOnlineGroupBooking,
        max_group_size: settings.maxGroupSize,
        enabled_locations: settings.enabledLocations,
        excluded_services: settings.excludedServices,
      });
      toast.success("Group booking settings saved successfully");
    } catch (error: any) {
      console.error("Failed to save settings:", error);
      toast.error(error.message || "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleServiceToggle = (serviceId: string, checked: boolean) => {
    if (checked) {
      setSettings({
        ...settings,
        excludedServices: [...settings.excludedServices, serviceId],
      });
    } else {
      setSettings({
        ...settings,
        excludedServices: settings.excludedServices.filter((id) => id !== serviceId),
      });
    }
  };

  return (
    <div>
      <PageHeader
        title="Group Appointments"
        subtitle="Configure group booking settings for your business"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Provider", href: "/provider" },
          { label: "Settings", href: "/provider/settings" },
          { label: "Group Appointments" },
        ]}
      />

      <div className="space-y-6">
        {/* Enable Group Booking */}
        <SectionCard>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Group Booking Settings</h3>
              <p className="text-sm text-gray-600">
                Enable group appointments to allow multiple clients to be scheduled together
              </p>
            </div>

            <Separator />

            {/* Enable scheduling of group appointments */}
            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
              <Switch
                checked={settings.enableGroupBooking}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, enableGroupBooking: checked })
                }
                className="mt-1"
              />
              <div className="flex-1">
                <Label className="text-base font-medium cursor-pointer">
                  Enable scheduling of group appointments
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  Allow staff members to create and manage group appointments from the calendar
                </p>
              </div>
            </div>

            {/* Allow clients to book group appointments online */}
            {settings.enableGroupBooking && (
              <>
                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                  <Switch
                    checked={settings.allowOnlineGroupBooking}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, allowOnlineGroupBooking: checked })
                    }
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <Label className="text-base font-medium cursor-pointer">
                      Allow clients to book group appointments online
                    </Label>
                    <p className="text-sm text-gray-500 mt-1">
                      Enable group booking in your online booking page for clients
                    </p>
                  </div>
                </div>

                {settings.allowOnlineGroupBooking && (
                  <div className="ml-0 sm:ml-12 space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    {/* Maximum Group Size */}
                    <div>
                      <Label htmlFor="maxGroupSize" className="text-sm font-medium">
                        Maximum Group Size
                      </Label>
                      <Input
                        id="maxGroupSize"
                        type="number"
                        min={2}
                        max={10}
                        value={settings.maxGroupSize}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            maxGroupSize: parseInt(e.target.value) || 5,
                          })
                        }
                        className="mt-1.5 max-w-[120px]"
                      />
                      <p className="text-xs text-gray-500 mt-1.5">
                        Maximum number of clients that can be added to a group appointment via online booking (2-10). This limit does not apply to group appointments created from the calendar by staff members.
                      </p>
                    </div>

                    {/* Location Support */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">
                        Enable Group Booking for Locations
                      </Label>
                      <p className="text-xs text-gray-500 mb-3">
                        Select which locations support group bookings in online booking
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 bg-white rounded border">
                          <Checkbox
                            checked={true}
                            onCheckedChange={() => {}}
                          />
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            <span className="text-sm">All Locations</span>
                          </div>
                        </div>
                        {/* Location selector */}
                        {locations.length > 0 && (
                          <div className="mt-2 space-y-2">
                            {locations.map((loc) => (
                              <div key={loc.id} className="flex items-center gap-2 p-2 bg-white rounded border">
                                <Checkbox
                                  checked={settings.enabledLocations.includes(loc.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSettings({
                                        ...settings,
                                        enabledLocations: [...settings.enabledLocations, loc.id],
                                      });
                                    } else {
                                      setSettings({
                                        ...settings,
                                        enabledLocations: settings.enabledLocations.filter(id => id !== loc.id),
                                      });
                                    }
                                  }}
                                />
                                <div className="flex items-center gap-2 flex-1">
                                  <MapPin className="w-4 h-4 text-gray-400" />
                                  <div>
                                    <span className="text-sm font-medium">{loc.name}</span>
                                    <p className="text-xs text-gray-500">{loc.address_line1}, {loc.city}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Excluded Services */}
                    <div>
                      <Label className="text-sm font-medium mb-2 block">
                        Exclude Services from Online Group Booking
                      </Label>
                      <p className="text-xs text-gray-500 mb-3">
                        Select services that should not be available for group booking online. This only excludes them from group appointments, not individual bookings.
                      </p>
                      <div className="max-h-60 overflow-y-auto border rounded-lg p-3 space-y-2 bg-white">
                        {services.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">
                            No services available
                          </p>
                        ) : (
                          services.map((service) => (
                            <div
                              key={service.id}
                              className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded"
                            >
                              <Checkbox
                                checked={settings.excludedServices.includes(service.id)}
                                onCheckedChange={(checked) =>
                                  handleServiceToggle(service.id, checked as boolean)
                                }
                              />
                              <Label className="text-sm font-normal cursor-pointer flex-1">
                                {service.name}
                              </Label>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </SectionCard>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#FF0077] hover:bg-[#D60565] min-h-[44px] touch-manipulation"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
