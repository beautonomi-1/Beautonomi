"use client";

import { useTranslation } from "@beautonomi/i18n";
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
import { invalidateProviderPortalCache } from "@/providers/provider-portal/ProviderPortalProvider";

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
  const { t } = useTranslation();
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
          sunday: { open: "09:00", close: "18:00", closed: false },
        };
        // Convert Format A (is_open/open_time/close_time) from DB to Format B (open/close/closed)
        const raw = location.operating_hours || {};
        const converted: OperatingHours = {} as OperatingHours;
        const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
        for (const dk of dayKeys) {
          const d = (raw as Record<string, any>)[dk];
          if (d && typeof d === "object") {
            converted[dk] = {
              open: d.open || d.open_time || "09:00",
              close: d.close || d.close_time || "18:00",
              closed: d.closed === true || d.is_open === false,
            };
          } else {
            converted[dk] = defaultHours[dk];
          }
        }
        setOperatingHours(converted);
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
      toast.error(t("web.provider.settings.pages.operating-hours.failedToLoadLocations"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedLocationId) {
      toast.error(t("web.provider.settings.pages.operating-hours.pleaseSelectALocation"));
      return;
    }

    try {
      setIsSaving(true);
      await fetcher.patch(`/api/provider/locations/${selectedLocationId}`, {
        operating_hours: operatingHours,
      });
      toast.success(t("web.provider.settings.pages.operating-hours.operatingHoursUpdatedSuccessfully"));
      setHasChanges(false);
      invalidateSetupStatusCache();
      invalidateProviderPortalCache();
      // Reload locations to get updated data
      await loadLocations();
    } catch (error: any) {
      toast.error(error.message || t("web.provider.settings.pages.operating-hours.failedToSave"));
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
    { label: t("web.provider.common.breadcrumbHome"), href: "/" },
    { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
    { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
    { label: t("web.provider.settings.pages.operating-hours.operatingHours") },
  ];

  if (isLoading) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.categories.appointmentActivity.items.operatingHours.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.operatingHours.description")}
        breadcrumbs={breadcrumbs}
      >
        <LoadingTimeout loadingMessage={t("web.provider.settings.pages.operating-hours.loadingLocations")} />
      </SettingsDetailLayout>
    );
  }

  if (locations.length === 0) {
    return (
      <SettingsDetailLayout
        title={t("web.provider.settings.pages.operating-hours.operatingHours")}
        subtitle={t("web.provider.settings.pages.operating-hours.manageOpeningAndClosingTimesFor")}
        breadcrumbs={breadcrumbs}
      >
        <SectionCard className="p-12">
          <EmptyState
            title={t("web.provider.settings.pages.operating-hours.noLocationsFound")}
            description={t("web.provider.settings.pages.operating-hours.addLocationFirst")}
            action={{
              label: t("web.provider.settings.pages.operating-hours.addLocation"),
              onClick: () => (window.location.href = "/provider/settings/locations"),
            }}
          />
        </SectionCard>
      </SettingsDetailLayout>
    );
  }

  return (
    <SettingsDetailLayout
      title={t("web.provider.settings.pages.operating-hours.operatingHours")}
      subtitle={t("web.provider.settings.pages.operating-hours.manageOpeningAndClosingTimesFor")}
      onSave={handleSave}
      saveLabel={isSaving ? t("web.provider.settings.common.saving") : t("web.provider.settings.common.saveChanges")}
      saveDisabled={isSaving || !hasChanges || !selectedLocationId}
      breadcrumbs={breadcrumbs}
    >
      <SectionCard className="w-full">
        <div className="space-y-6">
          {/* Location Selector */}
          <div className="space-y-2">
<Label htmlFor="location-select">{t("web.provider.settings.pages.operating-hours.selectLocation")}</Label>
            <Select
              value={selectedLocationId || ""}
              onValueChange={setSelectedLocationId}
            >
              <SelectTrigger id="location-select" className="w-full sm:w-auto min-w-[300px]">
                <SelectValue placeholder={t("web.provider.settings.pages.operating-hours.selectALocation")} />
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
                  {t("web.provider.settings.pages.operating-hours.operatingHours")}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
{t("web.provider.settings.pages.operating-hours.setHoursHint")}
                </p>
                <OperatingHoursEditor
                  hours={operatingHours}
                  onChange={handleHoursChange}
                />
              </div>
            </div>
          )}

          {/* Info Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm text-blue-800">
<strong>{t("web.provider.settings.pages.operating-hours.howItWorks")}</strong>
            </p>
            <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
<li>{t("web.provider.settings.pages.operating-hours.hoursDetermine")}</li>
<li>{t("web.provider.settings.pages.operating-hours.staffFollow")}</li>
<li>{t("web.provider.settings.pages.operating-hours.staffWith")} <strong>{t("web.provider.settings.pages.operating-hours.customWorkHours")}</strong> {t("web.provider.settings.pages.operating-hours.enabledUseOwn")}</li>
<li>{t("web.provider.settings.pages.operating-hours.timeBlocksRestrict")}</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </SettingsDetailLayout>
  );
}
