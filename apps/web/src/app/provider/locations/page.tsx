"use client";
import { useTranslation } from "@beautonomi/i18n";

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
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { isCompleteE164 } from "@/lib/phone";

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
  const { t } = useTranslation();
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
          ? t("web.provider.common.requestTimeout")
          : err instanceof FetchError
          ? err.message
          : t("web.provider.settings.pages.locations.failedToLoadLocations");
      setError(errorMessage);
      console.error("Error loading locations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("web.provider.settings.pages.locations.deleteConfirm"))) return;

    try {
      await fetcher.delete(`/api/provider/locations/${id}`);
      toast.success(t("web.provider.settings.pages.locations.locationDeleted"));
      loadLocations();
    } catch {
      toast.error(t("web.provider.settings.pages.locations.failedToDeleteLocation"));
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.locations.loadingLocations")} />
      </div>
    );
  }

  return (
    <RoleGuard allowedRoles={["provider_owner"]}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold mb-2">{t("web.provider.settings.pages.locations.locations")}</h1>
            <p className="text-gray-600">{t("web.provider.settings.pages.locations.manageYourBusinessLocations")}</p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4 me-2" />
{t("web.provider.settings.pages.locations.addLocation")}
          </Button>
        </div>

        {/* Locations List */}
        {error ? (
          <EmptyState
title={t("web.provider.settings.pages.locations.failedToLoadLocations")}
            description={error}
            action={{
label: t("web.provider.common.retry"),
              onClick: loadLocations,
            }}
          />
        ) : locations.length === 0 ? (
          <EmptyState
title={t("web.provider.settings.pages.locations.noLocationsYet")}
description={t("web.provider.settings.pages.locations.addFirst")}
            action={{
label: t("web.provider.settings.pages.locations.addLocation"),
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
  const { t } = useTranslation();
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Sparkles className="w-6 h-6 text-blue-600" />
            </div>
            <div>
<DialogTitle>{t("web.provider.settings.pages.locations.serviceZoneSuggestions")}</DialogTitle>
              <DialogDescription className="mt-1">
{t("web.provider.settings.pages.locations.zonesMatching", { count: zones.length })}
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
Type: {zone.zone_type === "postal_code" ? t("web.provider.onboarding.zones.postalCodeType") :
                           zone.zone_type === "city" ? t("web.provider.onboarding.zones.cityType") :
                           zone.zone_type === "radius" ? t("web.provider.onboarding.zones.radius") : t("web.provider.settings.pages.locations.polygon")}
                  </p>
                </div>
                <Button
                  onClick={() => onSelectZone(zone.id)}
                  className="bg-primary hover:bg-primary-hover text-white ms-4"
                >
{t("web.provider.settings.pages.locations.selectZone")}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
{t("web.provider.settings.pages.locations.maybeLater")}
          </Button>
          <Button
            onClick={() => {
              window.location.href = "/provider/settings/service-zones";
            }}
            className="bg-primary hover:bg-primary-hover text-white"
          >
{t("web.provider.settings.pages.locations.viewAllZones")}
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
  const { t } = useTranslation();
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
          {location.is_active ? t("web.provider.common.active") : t("web.provider.common.inactive")}
        </span>
        {location.operating_hours && (
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <Clock className="w-3 h-3" />
            <span>{t("web.provider.settings.pages.locations.hoursSet")}</span>
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
  const { t } = useTranslation();
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
      toast.error(t("web.provider.settings.pages.locations.nameRequired"));
      return;
    }
    if (!formData.address_line1?.trim()) {
      toast.error(t("web.provider.settings.pages.locations.addressRequiredToast"));
      return;
    }
    if (!formData.city?.trim()) {
      toast.error(t("web.provider.settings.pages.locations.cityRequiredToast"));
      return;
    }
    if (!formData.country?.trim()) {
      toast.error(t("web.provider.settings.pages.locations.countryRequiredToast"));
      return;
    }
    if (formData.phone?.trim() && !isCompleteE164(formData.phone)) {
      toast.error(t("web.provider.settings.pages.locations.enterAValidPhoneNumberOr"));
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

      toast.success(location ? t("web.provider.settings.pages.locations.locationUpdated") : t("web.provider.settings.pages.locations.locationAdded"));
      
      // Check if zone suggestions are available
      if (response.data?._metadata?.has_zone_suggestions && response.data?._metadata?.suggested_zones?.length > 0) {
        // Store suggestions for modal display
        (window as any).__zoneSuggestions = response.data._metadata.suggested_zones;
        (window as any).__showZoneSuggestions = true;
      }
      
      onSave();
    } catch (error: unknown) {
      toastPlanGateError(error, t("web.provider.settings.pages.locations.failedToSave"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-6 pb-2 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {location ? t("web.provider.settings.pages.locations.editLocation") : t("web.provider.settings.pages.locations.addLocation")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
{t("web.provider.settings.pages.locations.addressHint")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <Label htmlFor="name">{t("web.provider.settings.pages.locations.locationName")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("web.provider.settings.pages.locations.namePlaceholder")}
                className="mt-1.5"
                required
              />
            </div>

            <div>
              <Label htmlFor="address">{t("web.provider.settings.pages.locations.addressRequired")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
{t("web.provider.settings.pages.locations.autofillHint")}
              </p>
              <AddressAutocomplete
                value={formData.address_line1}
                onChange={handleAddressSelect}
                placeholder={t("web.provider.settings.pages.locations.startTypingAnAddress")}
                country={formData.country || "ZA"}
                className="relative z-[1]"
                required
              />
            </div>

            <div>
              <Label htmlFor="address_line2">{t("web.provider.settings.pages.locations.aptSuiteOptional")}</Label>
              <Input
                id="address_line2"
                value={formData.address_line2}
                onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                placeholder={t("web.provider.settings.pages.locations.aptPlaceholder")}
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">{t("web.provider.settings.pages.locations.cityRequired")}</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="state">{t("web.provider.settings.pages.locations.stateProvince")}</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="postal_code">{t("web.provider.settings.pages.locations.postalCode")}</Label>
                <Input
                  id="postal_code"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="country">{t("web.provider.settings.pages.locations.countryRequired")}</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="mt-1.5"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <PhoneInput
                  label={t("web.provider.common.phone")}
                  inputId="provider-location-form-phone"
                  value={formData.phone}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                  className="mt-1.5 space-y-1"
                />
              </div>
              <div>
                <Label htmlFor="email">{t("web.provider.common.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="is_active" className="font-normal">{t("web.provider.settings.pages.locations.activeVisible")}</Label>
            </div>
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
{t("web.provider.common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !formData.name?.trim() || !formData.address_line1?.trim() || !formData.city?.trim() || !formData.country?.trim()}
            >
              {isSaving ? t("web.provider.common.saving") : location ? t("web.provider.common.update") : t("web.provider.common.add")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
