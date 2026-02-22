"use client";

import React, { useState, useEffect } from "react";
import { SettingsDetailLayout } from "@/components/provider/SettingsDetailLayout";
import { PageHeader } from "@/components/provider/PageHeader";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";
import { Plus, Edit, Trash2, Loader2, TrendingUp, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import ZoneMapViewer from "@/components/mapbox/ZoneMapViewer";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";

interface PlatformZone {
  id: string;
  name: string;
  zone_type: "postal_code" | "city" | "polygon" | "radius";
  postal_codes?: string[];
  cities?: string[];
  polygon_coordinates?: any;
  center_latitude?: number;
  center_longitude?: number;
  radius_km?: number;
  description?: string;
  is_active: boolean;
}

interface ZoneSelection {
  id: string;
  platform_zone_id: string;
  travel_fee: number;
  currency: string;
  travel_time_minutes: number;
  description?: string;
  is_active: boolean;
}

interface ZoneWithSelection {
  platform_zone: PlatformZone;
  selection: ZoneSelection | null;
  is_selected: boolean;
}

export default function ServiceZonesPage() {
  const [zonesWithSelections, setZonesWithSelections] = useState<ZoneWithSelection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPlatformZone, setSelectedPlatformZone] = useState<PlatformZone | null>(null);
  const [editingSelection, setEditingSelection] = useState<ZoneSelection | null>(null);
  const [formData, setFormData] = useState({
    travel_fee: 0,
    currency: "ZAR",
    travel_time_minutes: 30,
    description: "",
    is_active: true,
  });
  const [providerLocation, setProviderLocation] = useState<{ latitude: number; longitude: number } | undefined>();
  const [suggestedZones, setSuggestedZones] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  
  // Onboarding tour steps
  const tourSteps = [
    {
      id: "intro",
      title: "Welcome to Service Zones",
      description: "Service zones define where you offer at-home services. Select zones that match your business location and set your travel fees.",
      targetSelector: "[data-tour='page-header']",
      position: "bottom" as const,
    },
    {
      id: "suggested-zones",
      title: "Suggested Zones",
      description: "These zones match your primary business location. We recommend selecting them first for faster setup.",
      targetSelector: "[data-tour='suggested-zones']",
      position: "bottom" as const,
    },
    {
      id: "selected-zones",
      title: "Your Selected Zones",
      description: "Zones you've selected will appear here. You can edit pricing or remove zones at any time.",
      targetSelector: "[data-tour='selected-zones']",
      position: "bottom" as const,
    },
    {
      id: "available-zones",
      title: "Available Zones",
      description: "Browse all platform zones. Click 'Select Zone' to add them and set your custom pricing.",
      targetSelector: "[data-tour='available-zones']",
      position: "top" as const,
    },
  ];

  useEffect(() => {
    loadZones();
    loadProviderLocation();
    loadSuggestedZones();
  }, []);

  const loadSuggestedZones = async () => {
    try {
      const response = await fetcher.get<{ data: { suggested_zones: any[] } }>("/api/provider/zone-selections/suggest");
      setSuggestedZones(response.data?.suggested_zones || []);
    } catch (error) {
      console.warn("Failed to load suggested zones:", error);
    }
  };

  const loadProviderLocation = async () => {
    try {
      const response = await fetcher.get<{ data: any[] }>("/api/provider/locations");
      const primaryLocation = response.data?.find((loc: any) => loc.is_primary);
      const lat = primaryLocation?.latitude ?? primaryLocation?.address_lat;
      const lng = primaryLocation?.longitude ?? primaryLocation?.address_lng;
      if (lat != null && lng != null) {
        setProviderLocation({ latitude: lat, longitude: lng });
      }
    } catch (error) {
      console.warn("Failed to load provider location:", error);
    }
  };

  const loadZones = async () => {
    try {
      setIsLoading(true);
      const response = await fetcher.get<{ data: ZoneWithSelection[] }>("/api/provider/zone-selections");
      setZonesWithSelections(response.data || []);
    } catch (error) {
      toast.error("Failed to load platform zones");
      console.error("Error loading zones:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectZone = (platformZone: PlatformZone) => {
    setSelectedPlatformZone(platformZone);
    setEditingSelection(null);
    setFormData({
      travel_fee: 0,
      currency: "ZAR",
      travel_time_minutes: 30,
      description: "",
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEditSelection = (zoneWithSelection: ZoneWithSelection) => {
    if (!zoneWithSelection.selection) return;
    setSelectedPlatformZone(zoneWithSelection.platform_zone);
    setEditingSelection(zoneWithSelection.selection);
    setFormData({
      travel_fee: zoneWithSelection.selection.travel_fee,
      currency: zoneWithSelection.selection.currency,
      travel_time_minutes: zoneWithSelection.selection.travel_time_minutes,
      description: zoneWithSelection.selection.description || "",
      is_active: zoneWithSelection.selection.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedPlatformZone) return;

    try {
      setIsSaving(true);

      if (editingSelection) {
        // Update existing selection
        await fetcher.patch(`/api/provider/zone-selections/${editingSelection.id}`, {
          ...formData,
        });
        toast.success("Zone selection updated");
      } else {
        // Create new selection
        await fetcher.post("/api/provider/zone-selections", {
          platform_zone_id: selectedPlatformZone.id,
          ...formData,
        });
        toast.success("Zone selected successfully");
      }

      setIsDialogOpen(false);
      setSelectedPlatformZone(null);
      setEditingSelection(null);
      loadZones();
    } catch (error) {
      toast.error(
        error instanceof FetchError
          ? error.message
          : "Failed to save zone selection"
      );
      console.error("Error saving selection:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveSelection = async (selectionId: string) => {
    if (!confirm("Are you sure you want to remove this zone selection?")) {
      return;
    }

    try {
      await fetcher.delete(`/api/provider/zone-selections/${selectionId}`);
      toast.success("Zone selection removed");
      loadZones();
    } catch (error) {
      toast.error("Failed to remove zone selection");
      console.error("Error removing selection:", error);
    }
  };

  const getZoneTypeLabel = (type: PlatformZone["zone_type"]) => {
    const labels: Record<PlatformZone["zone_type"], string> = {
      postal_code: "Postal Code",
      city: "City",
      polygon: "Polygon",
      radius: "Radius",
    };
    return labels[type];
  };

  const getZoneDetails = (zone: PlatformZone) => {
    if (zone.zone_type === "postal_code" && zone.postal_codes) {
      return `${zone.postal_codes.length} postal codes`;
    }
    if (zone.zone_type === "city" && zone.cities) {
      return `${zone.cities.length} cities`;
    }
    if (zone.zone_type === "radius" && zone.radius_km) {
      return `${zone.radius_km}km radius`;
    }
    if (zone.zone_type === "polygon") {
      return "Polygon zone";
    }
    return "-";
  };

  const selectedZones = zonesWithSelections.filter((z) => z.is_selected);
  const availableZones = zonesWithSelections.filter((z) => !z.is_selected);

  const breadcrumbs = [
    { label: "Home", href: "/" },
    { label: "Provider", href: "/provider" },
    { label: "Settings", href: "/provider/settings" },
    { label: "Service Zones" },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout breadcrumbs={breadcrumbs}>
        <LoadingTimeout loadingMessage="Loading platform zones..." />
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout breadcrumbs={breadcrumbs}>
      <OnboardingTour
        steps={tourSteps}
        storageKey="service-zones-tour-completed"
        onComplete={() => {
          toast.success("Tour completed! You can restart it anytime from the help menu.");
        }}
      />
      
      <PageHeader
        title="Service Zones"
        subtitle="Select platform zones where you provide at-home services and set your own pricing. You can only select from zones created by the platform administrator."
        data-tour="page-header"
      />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            onClick={() => {
              localStorage.removeItem("service-zones-tour-completed");
              window.location.reload();
            }}
            className="text-sm"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Restart Tour
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = "/provider/settings/service-zones/analytics"}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            View Analytics
          </Button>
        </div>

        {/* Suggested Zones Based on Location */}
        {showSuggestions && suggestedZones.length > 0 && (
          <SectionCard className="bg-blue-50 border-blue-200" data-tour="suggested-zones">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                  Suggested Zones (Based on Your Location)
                </h3>
                <p className="text-sm text-gray-600">
                  These zones match your primary business location. We recommend selecting them first.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSuggestions(false)}
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid gap-4">
              {suggestedZones.map((zone) => {
                const existingSelection = zonesWithSelections.find(
                  (z) => z.platform_zone.id === zone.id
                );
                const isSelected = existingSelection?.is_selected || false;

                return (
                  <div
                    key={zone.id}
                    className="border-2 border-blue-300 rounded-lg p-4 bg-white hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{zone.name}</h4>
                          <Badge variant="default" className="bg-blue-600">
                            Suggested
                          </Badge>
                          <Badge variant="outline">{getZoneTypeLabel(zone.zone_type)}</Badge>
                        </div>
                        <p className="text-sm text-blue-700 mb-2">
                          {zone.match_reason}
                        </p>
                        <div className="space-y-1 text-sm text-gray-600">
                          <p>
                            <strong>Zone Details:</strong> {getZoneDetails(zone)}
                          </p>
                        </div>
                      </div>
                      {isSelected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => existingSelection && handleEditSelection(existingSelection)}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      ) : (
                        <Button
                          onClick={() => handleSelectZone(zone)}
                          className="bg-[#FF0077] hover:bg-[#D60565]"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Select Zone
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}

        {/* Selected Zones */}
        {selectedZones.length > 0 && (
          <SectionCard data-tour="selected-zones">
            <h3 className="font-semibold text-lg mb-4">Your Selected Zones</h3>
            <div className="grid gap-4">
              {selectedZones.map((zoneWithSelection) => (
                <div
                  key={zoneWithSelection.platform_zone.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{zoneWithSelection.platform_zone.name}</h4>
                        <Badge variant={zoneWithSelection.selection?.is_active ? "default" : "secondary"}>
                          {zoneWithSelection.selection?.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">{getZoneTypeLabel(zoneWithSelection.platform_zone.zone_type)}</Badge>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>
                          <strong>Your Travel Fee:</strong> {zoneWithSelection.selection?.currency} {zoneWithSelection.selection?.travel_fee.toFixed(2)}
                        </p>
                        <p>
                          <strong>Travel Time:</strong> {zoneWithSelection.selection?.travel_time_minutes} minutes
                        </p>
                        <p>
                          <strong>Zone Details:</strong> {getZoneDetails(zoneWithSelection.platform_zone)}
                        </p>
                        {zoneWithSelection.platform_zone.description && (
                          <p className="mt-2 text-gray-500">{zoneWithSelection.platform_zone.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditSelection(zoneWithSelection)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {zoneWithSelection.selection && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveSelection(zoneWithSelection.selection!.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* Available Zones */}
        <SectionCard data-tour="available-zones">
          <h3 className="font-semibold text-lg mb-4">Available Platform Zones</h3>
          {availableZones.length === 0 ? (
            <EmptyState
              title="No available zones"
              description="All platform zones have been selected, or no platform zones are available. Contact support if you need additional zones."
            />
          ) : (
            <div className="grid gap-4">
              {availableZones.map((zoneWithSelection) => (
                <div
                  key={zoneWithSelection.platform_zone.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">{zoneWithSelection.platform_zone.name}</h4>
                        <Badge variant="outline">{getZoneTypeLabel(zoneWithSelection.platform_zone.zone_type)}</Badge>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>
                          <strong>Zone Details:</strong> {getZoneDetails(zoneWithSelection.platform_zone)}
                        </p>
                        {zoneWithSelection.platform_zone.description && (
                          <p className="mt-2 text-gray-500">{zoneWithSelection.platform_zone.description}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleSelectZone(zoneWithSelection.platform_zone)}
                      className="bg-[#FF0077] hover:bg-[#D60565]"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Select Zone
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Map Visualization */}
        {selectedZones.length > 0 && (
          <SectionCard>
            <h3 className="font-semibold mb-4">Zone Map</h3>
            <ZoneMapViewer
              zones={selectedZones.map((z) => ({
                id: z.platform_zone.id,
                name: z.platform_zone.name,
                zone_type: z.platform_zone.zone_type,
                polygon_coordinates: z.platform_zone.polygon_coordinates,
                center_latitude: z.platform_zone.center_latitude,
                center_longitude: z.platform_zone.center_longitude,
                radius_km: z.platform_zone.radius_km,
                travel_fee: z.selection?.travel_fee || 0,
                is_active: z.selection?.is_active || false,
              }))}
              providerLocation={providerLocation}
              height="400px"
            />
          </SectionCard>
        )}
      </div>

      {/* Select/Edit Zone Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSelection ? "Edit Zone Selection" : "Select Platform Zone"}
            </DialogTitle>
            <DialogDescription>
              {selectedPlatformZone && (
                <>
                  Setting pricing for <strong>{selectedPlatformZone.name}</strong>. Customers can only book at-home services if their address is within this zone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedPlatformZone && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Platform Zone: {selectedPlatformZone.name}</p>
                <p className="text-xs text-gray-600">
                  Type: {getZoneTypeLabel(selectedPlatformZone.zone_type)} • {getZoneDetails(selectedPlatformZone)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="travel_fee">Travel Fee *</Label>
                  <Input
                    id="travel_fee"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.travel_fee}
                    onChange={(e) => setFormData({ ...formData, travel_fee: parseFloat(e.target.value) || 0 })}
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
              </div>

              <div>
                <Label htmlFor="travel_time_minutes">Travel Time (minutes) *</Label>
                <Input
                  id="travel_time_minutes"
                  type="number"
                  min="1"
                  value={formData.travel_time_minutes}
                  onChange={(e) => setFormData({ ...formData, travel_time_minutes: parseInt(e.target.value) || 30 })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional notes about this zone"
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked === true })}
                />
                <Label htmlFor="is_active" className="cursor-pointer">
                  Active (accept bookings in this zone)
                </Label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => {
                  setIsDialogOpen(false);
                  setSelectedPlatformZone(null);
                  setEditingSelection(null);
                }} disabled={isSaving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving} className="bg-[#FF0077] hover:bg-[#D60565]">
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    editingSelection ? "Update" : "Select Zone"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SettingsDetailLayout>
  );
}
