"use client";

import { useTranslation } from "@beautonomi/i18n";
import React, { useState, useEffect } from "react";
import { SectionCard } from "@/components/provider/SectionCard";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, MapPin, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/provider/PageHeader";
import EmptyState from "@/components/ui/empty-state";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import { toast } from "sonner";
import { toastPlanGateError } from "@/lib/subscriptions/plan-gate-toast";
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
  const { t } = useTranslation();
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
        toast.error(t("web.provider.settings.pages.locations.youNeedProviderAccessToView"));
      } else {
        setLoadError("other");
        toast.error(t("web.provider.settings.pages.locations.failedToLoadLocations"));
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
    if (!confirm(t("web.provider.settings.pages.locations.deleteConfirm", { name: location.name }))) return;

    try {
      const res = (await fetcher.delete(`/api/provider/locations/${location.id}`)) as {
        data?: { deactivated?: boolean };
      };
      const deactivated = Boolean(res?.data?.deactivated);
      toast.success(
        deactivated
          ? t("web.provider.settings.pages.locations.deactivatedLinked")
          : t("web.provider.settings.pages.locations.locationRemoved")
      );
      loadLocations();
    } catch {
      toast.error(t("web.provider.settings.pages.locations.failedToDeleteLocation"));
    }
  };

  const handleSave = async (locationData: Record<string, unknown> & { label?: string }) => {
    try {
      if (editingLocation) {
        await fetcher.patch(`/api/provider/locations/${editingLocation.id}`, locationData);
        toast.success(t("web.provider.settings.pages.locations.locationUpdated"));
      } else {
        await fetcher.post("/api/provider/locations", {
          name: (locationData.label as string) || "Location",
          ...locationData,
        });
        toast.success(t("web.provider.settings.pages.locations.locationCreated"));
      }
      setShowDialog(false);
      setEditingLocation(null);
      invalidateSetupStatusCache();
      invalidateProviderPortalCache();
      loadLocations();
    } catch (error: unknown) {
      toastPlanGateError(error, t("web.provider.settings.pages.locations.failedToSave"));
    }
  };

  if (isLoading) {
    return <LoadingTimeout loadingMessage={t("web.provider.settings.pages.locations.loadingLocations")} />;
  }

  return (
    <div>
      <PageHeader
        title={t("web.provider.settings.categories.appointmentActivity.items.locations.title")}
        subtitle={t("web.provider.settings.categories.appointmentActivity.items.locations.description")}
        breadcrumbs={[
          { label: t("web.provider.common.breadcrumbHome"), href: "/" },
          { label: t("web.provider.common.breadcrumbProvider"), href: "/provider" },
          ...(returnTo ? [{ label: t("web.provider.settings.pages.locations.getStarted"), href: returnTo }] : []),
          { label: t("web.provider.common.breadcrumbSettings"), href: "/provider/settings" },
          { label: t("web.provider.settings.pages.locations.locations") }
        ]}
        primaryAction={{
          label: t("web.provider.settings.pages.locations.addANewLocation"),
          onClick: handleCreate,
          icon: <Plus className="w-4 h-4 me-2" />,
        }}
      />

      {/* Return to Get Started banner */}
      {returnTo && (
        <div className="mb-6 bg-gradient-to-r from-primary/10 to-primary-hover/10 border border-primary/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium text-gray-900">
                {t("web.provider.settings.pages.locations.setupBannerTitle")}
              </p>
              <p className="text-xs text-gray-600">
                {t("web.provider.settings.pages.locations.setupBannerBody")}
              </p>
            </div>
          </div>
          <Link href={returnTo}>
            <Button variant="outline" size="sm" className="border-primary/30 text-primary hover:bg-primary/10">
              <ArrowLeft className="w-4 h-4 me-2" />
              {t("web.provider.settings.pages.locations.backToGetStarted")}
            </Button>
          </Link>
        </div>
      )}

      {/* Quick link: set service radius / distance for house calls */}
      <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50/50 px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-700">
          <span className="font-medium">{t("web.provider.settings.pages.locations.houseCalls")}</span>
          {t("web.provider.settings.pages.locations.houseCallsBody")}
        </p>
        <Link href="/provider/settings/distance">
          <Button variant="outline" size="sm" className="border-indigo-300 text-indigo-700 hover:bg-indigo-100 shrink-0">
            {t("web.provider.settings.pages.locations.distanceAndRadius")}
          </Button>
        </Link>
      </div>

      {loadError === "forbidden" ? (
        <SectionCard className="p-12">
          <div className="text-center max-w-md mx-auto">
            <p className="text-muted-foreground mb-2">
              {t("web.provider.settings.pages.locations.needProviderAccess")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("web.provider.settings.pages.locations.needProviderAccessHint")}
            </p>
          </div>
        </SectionCard>
      ) : loadError === "other" ? (
        <SectionCard className="p-12">
          <div className="text-center max-w-md mx-auto">
            <p className="text-muted-foreground mb-4">{t("web.provider.settings.pages.locations.couldntLoad")}</p>
            <Button onClick={loadLocations} variant="outline">{t("web.provider.settings.pages.locations.tryAgain")}</Button>
          </div>
        </SectionCard>
      ) : locations.length === 0 ? (
        <SectionCard className="p-12">
          <EmptyState
            title={t("web.provider.settings.categories.appointmentActivity.items.locations.title")}
            description={t("web.provider.settings.pages.locations.emptyDescription")}
            action={{
              label: t("web.provider.settings.pages.locations.addLocation"),
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
                          <span className="text-xs text-primary font-medium">{t("web.provider.settings.pages.locations.active")}</span>
                        ) : (
                          <span className="text-xs text-amber-700 font-medium">{t("web.provider.settings.pages.locations.inactive")}</span>
                        )}
                        {(location.location_type || "salon") === "salon" ? (
                          <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded font-medium">
                            {t("web.provider.settings.pages.locations.salonClientsCanVisit")}
                          </span>
                        ) : (
                          <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded font-medium">
                            {t("web.provider.settings.pages.locations.baseTravelOnly")}
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
                      {t("web.provider.settings.pages.locations.coordinates", { lat: location.latitude.toFixed(6), lng: location.longitude.toFixed(6) })}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(location)}
                    >
                      <Edit className="w-4 h-4 me-2" />
                      {t("web.provider.common.edit")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(location)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4 me-2" />
                      {t("web.provider.common.delete")}
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
  const { t } = useTranslation();
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
      toast.error(t("web.provider.settings.pages.locations.enterAValidPhoneNumberOr"));
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
            <DialogTitle className="text-xl">{location ? t("web.provider.settings.pages.locations.editLocation") : t("web.provider.settings.pages.locations.addLocation")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-1">
              {location
                ? t("web.provider.settings.pages.locations.editLocationDesc")
                : t("web.provider.settings.pages.locations.addLocationDesc")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Location type */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">{t("web.provider.settings.pages.locations.locationType")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("web.provider.settings.pages.locations.locationTypeHint")}
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
                  <span className="text-sm font-medium text-gray-900">{t("web.provider.settings.pages.locations.salonStudio")}</span>
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
                  <span className="text-sm font-medium text-gray-900">{t("web.provider.settings.pages.locations.baseAddressOnly")}</span>
                </label>
              </div>
            </section>

            {/* Details */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">{t("web.provider.settings.pages.locations.details")}</h3>
              {location && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-gray-800">{t("web.provider.settings.pages.locations.locationIsActive")}</span>
                </label>
              )}
              <div>
                <Label htmlFor="name">{t("web.provider.settings.pages.locations.locationName")}</Label>
                <Input
                  id="name"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder={t("web.provider.settings.pages.locations.mainBranch")}
                  className="mt-1.5"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">{t("web.provider.settings.pages.locations.descriptionOptional")}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value.length <= 36) setFormData({ ...formData, description: value });
                  }}
                  rows={2}
                  maxLength={36}
                  placeholder={t("web.provider.settings.pages.locations.briefDescriptionOfThisLocation")}
                  className="mt-1.5 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">{formData.description.length}/36</p>
              </div>
            </section>

            {/* Address */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">{t("web.provider.settings.pages.locations.address")}</h3>
              <div>
                <Label htmlFor="address">{t("web.provider.settings.pages.locations.addressRequired")}</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
                  {t("web.provider.settings.pages.locations.addressHint")}
                </p>
                <AddressAutocomplete
                  value={formData.address_line1}
                  onChange={handleAddressSelect}
                  onInputChange={(value) => setFormData((prev) => ({ ...prev, address_line1: value }))}
                  placeholder={t("web.provider.settings.pages.locations.startTypingAnAddress")}
                  country={formData.country || "ZA"}
                  className="relative z-[1]"
                  required
                />
              </div>
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs text-slate-600">
                  {t("web.provider.settings.pages.locations.mapPinHint")}
                </p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setLocationMapPickerOpen(true)}>
                  <MapPin className="w-4 h-4 me-2" />
                  {t("web.provider.settings.pages.locations.dropPinOnMap")}
                </Button>
              </div>
              <div>
                <Label htmlFor="address_line2">{t("web.provider.settings.pages.locations.addressLine2")}</Label>
                <Input
                  id="address_line2"
                  value={formData.address_line2}
                  onChange={(e) => setFormData({ ...formData, address_line2: e.target.value })}
                  placeholder={t("web.provider.settings.pages.locations.suiteUnitFloor")}
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div>
                <PhoneInput
                  inputId="settings-location-dialog-phone"
                  label={t("web.provider.settings.pages.locations.phoneOptional")}
                  value={formData.phone}
                  onChange={(e164) => setFormData({ ...formData, phone: e164 })}
                  placeholder={t("web.provider.settings.pages.locations.phoneNumber")}
                  className="mt-1.5"
                />
              </div>
            </section>

            {/* Operating hours */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900">{t("web.provider.settings.pages.locations.operatingHours")}</h3>
              <p className="text-xs text-muted-foreground">{t("web.provider.settings.pages.locations.operatingHoursHint")}</p>
              <OperatingHoursEditor
                hours={formData.operating_hours}
                onChange={(hours) => setFormData({ ...formData, operating_hours: hours })}
              />
            </section>
          </div>

          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("web.provider.common.cancel")}
            </Button>
            <Button type="submit" disabled={!formData.label?.trim() || !formData.address_line1?.trim() || !formData.city?.trim()}>
              {location ? t("web.provider.common.update") : t("web.provider.common.create")}
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
