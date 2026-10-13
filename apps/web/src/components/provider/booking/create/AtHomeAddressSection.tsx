"use client";

import { useTranslation } from "@beautonomi/i18n";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { mapGeocodeFeatureToAddressParts } from "@beautonomi/utils";
import { fetcher } from "@/lib/http/fetcher";
import { useProviderPortal } from "@/providers/provider-portal/ProviderPortalProvider";
import { useProviderMoneyFormat } from "@/hooks/use-provider-money-format";
import AddressAutocomplete from "@/components/mapbox/AddressAutocomplete";
import { LocationMapPickerDialog } from "@/components/mapbox/LocationMapPickerDialog";
import { BookingSectionCard, BookingSectionLabel } from "../ui";

export interface AtHomeAddressValue {
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  addressLatitude: number | null;
  addressLongitude: number | null;
  travelFee: number;
  travelPreviewMinutes: number | null;
  travelPreviewDistanceKm: number | null;
  useTravelOverride: boolean;
  travelFeeOverride: number | null;
}

interface AtHomeAddressSectionProps {
  value: AtHomeAddressValue;
  onChange: Dispatch<SetStateAction<AtHomeAddressValue>>;
}

export function effectiveAtHomeTravelFee(value: AtHomeAddressValue): number {
  if (value.useTravelOverride && value.travelFeeOverride != null) {
    return Math.max(0, value.travelFeeOverride);
  }
  return Math.max(0, value.travelFee);
}

function hasValidCoordinates(value: AtHomeAddressValue): boolean {
  const lat = value.addressLatitude;
  const lng = value.addressLongitude;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  return !(lat === 0 && lng === 0);
}

function validationRequestKey(value: AtHomeAddressValue): string | null {
  const line1 = value.addressLine1.trim();
  const hasCoords = hasValidCoordinates(value);
  const hasStructured = Boolean(line1) && Boolean(value.addressCity.trim());
  if (!hasCoords && line1.length >= 5) {
    return `text:${line1}:${value.addressCity}:${value.addressState}:${value.addressPostalCode}`;
  }
  if (hasCoords || hasStructured) {
    return [
      line1,
      value.addressLine2,
      value.addressCity,
      value.addressState,
      value.addressPostalCode,
      value.addressCountry,
      value.addressLatitude,
      value.addressLongitude,
    ].join("|");
  }
  return null;
}

export function isAtHomeAddressReady(value: AtHomeAddressValue): boolean {
  return Boolean(value.addressLine1.trim()) && hasValidCoordinates(value);
}

export function AtHomeAddressSection({ value, onChange }: AtHomeAddressSectionProps) {
  const { t } = useTranslation();
  const { provider } = useProviderPortal();
  const { format: formatMoney } = useProviderMoneyFormat();
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [needsGeocodeHint, setNeedsGeocodeHint] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestKeyRef = useRef<string | null>(null);

  const patch = (partial: Partial<AtHomeAddressValue>) => {
    onChange((prev) => ({ ...prev, ...partial }));
  };

  const applyPickedAddress = (addr: {
    address_line1: string;
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude: number;
    longitude: number;
    place_name?: string;
  }) => {
    patch({
      addressLine1: addr.place_name || addr.address_line1,
      addressCity: addr.city,
      addressState: addr.state ?? "",
      addressPostalCode: addr.postal_code ?? "",
      addressCountry: addr.country || "South Africa",
      addressLatitude: Number.isFinite(addr.latitude) ? addr.latitude : null,
      addressLongitude: Number.isFinite(addr.longitude) ? addr.longitude : null,
    });
    setNeedsGeocodeHint(false);
  };

  useEffect(() => {
    if (!provider?.id) return;

    const requestKey = validationRequestKey(value);
    const line1 = value.addressLine1.trim();

    if (!requestKey) {
      setValidationError(null);
      setNeedsGeocodeHint(Boolean(line1) && !hasValidCoordinates(value));
      onChange((prev) => {
        if (prev.travelFee === 0 && prev.travelPreviewMinutes == null) return prev;
        return {
          ...prev,
          travelFee: 0,
          travelPreviewMinutes: null,
          travelPreviewDistanceKm: null,
        };
      });
      return;
    }

    setNeedsGeocodeHint(Boolean(line1) && !hasValidCoordinates(value));

    if (requestKey === lastRequestKeyRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    let cancelled = false;
    timerRef.current = setTimeout(() => {
      void (async () => {
        setValidating(true);
        setValidationError(null);
        try {
          const country = value.addressCountry.trim() || "South Africa";
          const hasCoords = hasValidCoordinates(value);
          const hasStructured = Boolean(line1) && Boolean(value.addressCity.trim());
          const addressString = hasStructured
            ? [
                value.addressLine1,
                value.addressLine2,
                value.addressCity,
                value.addressState,
                value.addressPostalCode,
                country,
              ]
                .filter(Boolean)
                .join(", ")
            : `${value.addressLatitude},${value.addressLongitude}`;

          const body: Record<string, unknown> = {
            address: addressString,
            provider_id: provider.id,
          };
          if (hasCoords) {
            body.latitude = value.addressLatitude;
            body.longitude = value.addressLongitude;
          }

          const json = await fetcher.post<{
            data?: {
              valid?: boolean;
              travelFee?: number;
              travelTimeMinutes?: number;
              distanceKm?: number;
              message?: string;
              reason?: string;
              coordinates?: { latitude: number; longitude: number };
              address?: {
                line1?: string;
                city?: string;
                state?: string;
                country?: string;
                postalCode?: string;
              };
            };
          }>("/api/location/validate", body);
          if (cancelled) return;

          lastRequestKeyRef.current = requestKey;
          const payload = json?.data;
          if (payload?.valid === false) {
            setValidationError(
              payload.reason || payload.message || t("web.provider.atHomeAddress.outsideArea"),
            );
            patch({ travelFee: 0, travelPreviewMinutes: null, travelPreviewDistanceKm: null });
            return;
          }

          const fee = Math.max(0, Number(payload?.travelFee ?? 0));
          const minutes =
            typeof payload?.travelTimeMinutes === "number" &&
            Number.isFinite(payload.travelTimeMinutes) &&
            payload.travelTimeMinutes > 0
              ? Math.ceil(payload.travelTimeMinutes)
              : null;
          const distanceKm =
            typeof payload?.distanceKm === "number" && Number.isFinite(payload.distanceKm)
              ? payload.distanceKm
              : null;

          const addrPatch: Partial<AtHomeAddressValue> = {
            travelFee: fee,
            travelPreviewMinutes: minutes,
            travelPreviewDistanceKm: distanceKm,
          };
          if (payload?.coordinates) {
            addrPatch.addressLatitude = payload.coordinates.latitude;
            addrPatch.addressLongitude = payload.coordinates.longitude;
          }
          const resolved = payload?.address;
          if (resolved) {
            if (resolved.city && !value.addressCity.trim()) addrPatch.addressCity = resolved.city;
            if (resolved.state && !value.addressState.trim()) addrPatch.addressState = resolved.state;
            if (resolved.postalCode && !value.addressPostalCode.trim()) {
              addrPatch.addressPostalCode = resolved.postalCode;
            }
            if (resolved.country && !value.addressCountry.trim()) {
              addrPatch.addressCountry = resolved.country;
            }
          }
          patch(addrPatch);
          setNeedsGeocodeHint(false);
        } catch (err: unknown) {
          if (!cancelled) {
            const msg =
              err && typeof err === "object" && "message" in err && typeof err.message === "string"
                ? err.message
                : t("web.provider.atHomeAddress.validateFailed");
            setValidationError(msg);
            patch({ travelFee: 0, travelPreviewMinutes: null, travelPreviewDistanceKm: null });
          }
        } finally {
          if (!cancelled) setValidating(false);
        }
      })();
    }, 600);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validate when address fields change
  }, [
    provider?.id,
    value.addressLine1,
    value.addressLine2,
    value.addressCity,
    value.addressState,
    value.addressPostalCode,
    value.addressCountry,
    value.addressLatitude,
    value.addressLongitude,
  ]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetcher.post<{
            data?: { place_name: string; center: [number, number]; context?: Array<{ id: string; text: string; short_code?: string }> };
          }>("/api/mapbox/reverse-geocode", {
            longitude: pos.coords.longitude,
            latitude: pos.coords.latitude,
          });
          const feature = res?.data;
          if (feature) {
            const address = mapGeocodeFeatureToAddressParts(feature, {
              defaultCountryName: "South Africa",
            });
            applyPickedAddress({
              ...address,
              state: address.state || undefined,
              postal_code: address.postal_code || undefined,
              place_name: feature.place_name,
            });
          } else {
            patch({
              addressLatitude: pos.coords.latitude,
              addressLongitude: pos.coords.longitude,
            });
          }
        } catch {
          patch({
            addressLatitude: pos.coords.latitude,
            addressLongitude: pos.coords.longitude,
          });
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  };

  const displayFee = effectiveAtHomeTravelFee(value);

  return (
    <BookingSectionCard data-testid="at-home-address-section">
      <BookingSectionLabel className="mb-2">{t("web.provider.atHomeAddress.title")}</BookingSectionLabel>
      <div className="space-y-2">
        <AddressAutocomplete
          value={value.addressLine1}
          commitOnBlur={false}
          onChange={(addr) => {
            const line2 = value.addressLine2.trim()
              ? value.addressLine2
              : (addr.address_line2 ?? value.addressLine2);
            patch({
              addressLine1: addr.place_name || addr.address_line1,
              addressLine2: line2,
              addressCity: addr.city || value.addressCity,
              addressState: addr.state ?? value.addressState,
              addressPostalCode: addr.postal_code ?? value.addressPostalCode,
              addressCountry: addr.country || value.addressCountry || "South Africa",
              addressLatitude: Number.isFinite(addr.latitude) ? addr.latitude : null,
              addressLongitude: Number.isFinite(addr.longitude) ? addr.longitude : null,
            });
            lastRequestKeyRef.current = null;
            setNeedsGeocodeHint(false);
          }}
          onInputChange={(val) => {
            patch({
              addressLine1: val,
              addressLatitude: null,
              addressLongitude: null,
            });
            lastRequestKeyRef.current = null;
          }}
          placeholder={t("web.provider.atHomeAddress.searchPlaceholder")}
          label=""
          country="ZA"
          defaultCountryName="South Africa"
          inputClassName="rounded-xl min-h-[44px]"
          inputId="at-home-address-autocomplete"
        />
        <Input
          value={value.addressLine2}
          onChange={(e) => patch({ addressLine2: e.target.value })}
          placeholder={t("web.provider.atHomeAddress.aptPlaceholder")}
          className="rounded-xl min-h-[44px]"
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={value.addressCity}
            onChange={(e) => patch({ addressCity: e.target.value })}
            placeholder={t("web.provider.atHomeAddress.city")}
            className="rounded-xl min-h-[44px]"
          />
          <Input
            value={value.addressState}
            onChange={(e) => patch({ addressState: e.target.value })}
            placeholder={t("web.provider.atHomeAddress.province")}
            className="rounded-xl min-h-[44px]"
          />
        </div>
        <Input
          value={value.addressPostalCode}
          onChange={(e) => patch({ addressPostalCode: e.target.value })}
          placeholder={t("web.provider.atHomeAddress.postalCode")}
          className="rounded-xl min-h-[44px]"
        />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl min-h-[40px] touch-manipulation"
            onClick={() => setMapOpen(true)}
          >
            <MapPin className="me-1.5 h-4 w-4" />
            {t("web.provider.atHomeAddress.pinOnMap")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl min-h-[40px] touch-manipulation"
            onClick={handleUseMyLocation}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="me-1.5 h-4 w-4" />
            )}
            {t("web.provider.atHomeAddress.useMyLocation")}
          </Button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm text-blue-900">
          {validating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span>{t("web.provider.atHomeAddress.calculating")}</span>
            </>
          ) : validationError ? (
            <span className="text-amber-800">{validationError}</span>
          ) : needsGeocodeHint ? (
            <span className="text-blue-700">{t("web.provider.atHomeAddress.chooseSuggestionOrPin")}</span>
          ) : displayFee > 0 ? (
            <>
              <MapPin className="h-4 w-4 shrink-0 text-blue-600" />
              <span>
                {t("web.provider.atHomeAddress.travelFee", { amount: formatMoney(displayFee) })}
                {value.useTravelOverride ? t("web.provider.atHomeAddress.overrideSuffix") : null}
              </span>
            </>
          ) : (
            <span className="text-blue-700">{t("web.provider.atHomeAddress.enterAddress")}</span>
          )}
        </div>
        {!validationError &&
        (value.travelPreviewDistanceKm != null || value.travelPreviewMinutes != null) ? (
          <p className="text-xs text-blue-600 mt-1">
            {value.travelPreviewDistanceKm != null
              ? t("web.provider.atHomeAddress.distanceKm", { km: value.travelPreviewDistanceKm.toFixed(1) })
              : null}
            {value.travelPreviewDistanceKm != null && value.travelPreviewMinutes != null
              ? t("web.provider.atHomeAddress.separator")
              : null}
            {value.travelPreviewMinutes != null
              ? t("web.provider.atHomeAddress.driveMin", { minutes: value.travelPreviewMinutes })
              : null}
            {hasValidCoordinates(value)
              ? t("web.provider.atHomeAddress.separator") + t("web.provider.atHomeAddress.geocoded")
              : null}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{t("web.provider.atHomeAddress.overrideTitle")}</p>
          <p className="text-xs text-gray-500">{t("web.provider.atHomeAddress.overrideHint")}</p>
        </div>
        <Switch
          checked={value.useTravelOverride}
          onCheckedChange={(checked) =>
            patch({
              useTravelOverride: checked,
              travelFeeOverride: checked ? value.travelFeeOverride ?? value.travelFee : null,
            })
          }
        />
      </div>
      {value.useTravelOverride ? (
        <Input
          type="number"
          min={0}
          step="0.01"
          value={value.travelFeeOverride ?? ""}
          onChange={(e) =>
            patch({
              travelFeeOverride: e.target.value ? Math.max(0, Number(e.target.value)) : null,
            })
          }
          placeholder={t("web.provider.atHomeAddress.customFeePlaceholder")}
          className="rounded-xl min-h-[44px] mt-2"
        />
      ) : null}

      <LocationMapPickerDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        initialLatitude={value.addressLatitude ?? undefined}
        initialLongitude={value.addressLongitude ?? undefined}
        defaultCountryName="South Africa"
        onLocationPicked={applyPickedAddress}
      />
    </BookingSectionCard>
  );
}
